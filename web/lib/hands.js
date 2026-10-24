/* ============================================================
   ATMOXR HandTracker
   - MediaPipe Hands com entrada de câmera traseira (sem espelhar)
   - Corrige a convenção selfie Left/Right do MediaPipe
   - Pinça natural: encosta para segurar, solta para clicar; sem raio
   - Arraste/rolagem por pinça sustentada; hit-test cacheado
   - Inferência e desenho adaptativos para poupar CPU/FPS
   ============================================================ */

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const GAIN_X = 1.12;
const GAIN_Y = 1.08;
const PINCH_ON = 0.34;
const PINCH_OFF = 0.43;
const TAP_MAX_MS = 600;
const TAP_MAX_MOVE = 24;
const DRAG_MIN_MOVE = 12;
const DWELL_MS = 900;
const CACHE_MS = 140;
const MEDIAPIPE_VER = '0.4.1675469240';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function convexHull(points) {
  const sorted = points.map(({ x, y }) => ({ x, y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const swapLabel = (label) => {
  if (label === 'Left') return 'Right';
  if (label === 'Right') return 'Left';
  return label;
};

function handednessLabel(entry) {
  if (!entry) return '';
  if (entry.label) return entry.label;
  if (entry.categoryName) return entry.categoryName;
  if (entry.classification && entry.classification[0]) return entry.classification[0].label || '';
  if (entry.categories && entry.categories[0]) return entry.categories[0].categoryName || entry.categories[0].label || '';
  return '';
}

function normalizeHandednessEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if (out.label) out.label = swapLabel(out.label);
  if (out.categoryName) out.categoryName = swapLabel(out.categoryName);
  if (Array.isArray(out.classification)) {
    out.classification = out.classification.map((c) => ({ ...c, label: swapLabel(c.label) }));
  }
  if (Array.isArray(out.categories)) {
    out.categories = out.categories.map((c) => ({
      ...c,
      label: c.label ? swapLabel(c.label) : c.label,
      categoryName: c.categoryName ? swapLabel(c.categoryName) : c.categoryName,
    }));
  }
  // Compatibilidade com o protocolo antigo do ShootTheDie, que lê .label.
  if (!out.label) {
    const label = handednessLabel(out);
    if (label) out.label = label;
  }
  return out;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && window.Hands) return resolve();
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = src;
      document.head.appendChild(script);
    }
    script.onload = resolve;
    script.onerror = reject;
  });
}

export class HandTracker {
  constructor(video, canvasL, canvasR, opts = {}) {
    this.video = video;
    this.canvasL = canvasL;
    this.canvasR = canvasR;
    this.opts = opts;
    this.ctxL = canvasL.getContext('2d', { alpha: true, desynchronized: true });
    this.ctxR = canvasR ? canvasR.getContext('2d', { alpha: true, desynchronized: true }) : null;

    this.hands = null;
    this._running = false;
    this._sending = false;
    this._frame = 0;
    this._skipEvery = 1;
    this._emaMs = 32;
    this._lastVideoTime = -1;

    this._landmarks = [];
    this._handLabels = [];
    this._activeLabel = '';
    this._activeIndex = 0;
    this.cursor = { x: -100, y: -100, seen: false };
    this.pinch = false;
    this.pinchProgress = 0;
    this._pinchStart = null;
    this._dragging = false;
    this._scrollTarget = null;
    this._panelHandle = null;
    this._lastPos = null;
    this._dwellEl = null;
    this._dwellStart = 0;
    this._dwellFired = false;
    this._dwellAnchor = { x: 0, y: 0 };
    this._dwellProgress = 0;

    this._cache = [];
    this._cacheAt = 0;
    this._lastTs = 0;
    this._needsDraw = true;
    this._loop = this._loop.bind(this);
  }

  async start() {
    if (this._running) return;
    this._running = true;
    requestAnimationFrame(this._loop);
    try {
      await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_VER}/hands.js`);
      if (!this._running || !window.Hands) return;
      const hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_VER}/${file}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.48,
        minTrackingConfidence: 0.48,
      });
      hands.onResults((results) => this._onResults(results));
      this.hands = hands;
    } catch (error) {
      // Sem internet/CDN, o app continua utilizável por toque.
      console.warn('[ATMOXR] MediaPipe indisponível:', error);
    }
  }

  stop() {
    this._running = false;
    if (this.hands && this.hands.close) {
      try { Promise.resolve(this.hands.close()).catch(() => {}); } catch (error) {}
    }
    this.hands = null;
  }

  invalidate() {
    this._cacheAt = 0;
    this._needsDraw = true;
  }

  _loop(ts) {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    this._lastTs = ts;
    this._resizeCanvases();
    this._maybeSend();
    if (this._needsDraw) this._draw();
  }

  async _maybeSend() {
    if (!this.hands || this._sending) return;
    const video = this.video;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    // O RAF do telefone pode rodar a 60 Hz, mas a câmera entrega ~30 quadros.
    // Evita mandar o mesmo frame duas vezes para o modelo.
    if (video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = video.currentTime;
    this._frame++;
    if (this._frame % this._skipEvery !== 0) return;

    this._sending = true;
    const startedAt = performance.now();
    try {
      await this.hands.send({ image: video });
    } catch (error) {
      // Um quadro perdido não deve interromper o loop de renderização.
    } finally {
      const elapsed = performance.now() - startedAt;
      this._emaMs = this._emaMs * 0.82 + elapsed * 0.18;
      // 30 fps quando leve; reduz inferência só em aparelhos que precisam.
      this._skipEvery = this._emaMs > 92 ? 3 : this._emaMs > 56 ? 2 : 1;
      this._sending = false;
    }
  }

  _onResults(results) {
    // A solução MediaPipe assume selfie espelhada. A câmera traseira do app
    // não é espelhada, então os nomes Left/Right precisam ser invertidos uma vez.
    const normalized = {
      ...results,
      multiHandedness: (results.multiHandedness || []).map(normalizeHandednessEntry),
    };
    if (this.opts.onResults) this.opts.onResults(normalized);

    const uiActive = this.opts.isUiActive ? this.opts.isUiActive() : true;
    if (!uiActive) {
      this._landmarks = [];
      this._handLabels = [];
      this._activeLabel = '';
      this.cursor.seen = false;
      this.pinch = false;
      this._dragging = false;
      this._needsDraw = true;
      return;
    }

    this._landmarks = normalized.multiHandLandmarks || [];
    this._handLabels = normalized.multiHandedness.map(handednessLabel);
    if (this._landmarks.length) {
      const nextIndex = this._pickActiveHand(this._landmarks, this._handLabels);
      const nextLabel = this._handLabels[nextIndex] || `hand-${nextIndex}`;
      if (nextLabel !== this._activeLabel) this.cursor.seen = false;
      this._activeIndex = nextIndex;
      this._activeLabel = nextLabel;
      this._processHand(this._landmarks[nextIndex], performance.now());
    } else {
      this._landmarks = [];
      this._handLabels = [];
      this._activeLabel = '';
      this.cursor.seen = false;
      this.pinchProgress = 0;
      if (this.pinch) {
        this.pinch = false;
        this._dragging = false;
        this._scrollTarget = null;
        this._panelHandle = null;
        this._pinchStart = null;
      }
      this._needsDraw = true;
    }
  }

  _pickActiveHand(landmarks, labels) {
    const labelsPresent = labels.slice(0, landmarks.length);
    const current = labelsPresent.indexOf(this._activeLabel);
    const pinchCandidates = [];
    for (let i = 0; i < landmarks.length; i++) {
      const hand = landmarks[i];
      const size = dist2d(hand[0], hand[9]) || 0.0001;
      const pinchRatio = dist2d(hand[4], hand[8]) / size;
      if (pinchRatio < PINCH_ON + 0.1) pinchCandidates.push(i);
    }

    // Mantém a mão que iniciou a pinça; se a outra mão fizer pinça, permite
    // trocar para ela sem o cursor saltar entre mãos a cada frame.
    if (this.pinch && current >= 0) return current;
    if (pinchCandidates.length) {
      const sameHand = pinchCandidates.find((i) => labelsPresent[i] === this._activeLabel);
      return sameHand ?? pinchCandidates[0];
    }
    if (current >= 0) return current;
    const right = labelsPresent.indexOf('Right');
    return right >= 0 ? right : 0;
  }

  _toScreen(lm) {
    const width = this.canvasL.clientWidth || 1;
    const height = this.canvasL.clientHeight || 1;
    const sourceWidth = this.video?.videoWidth || width;
    const sourceHeight = this.video?.videoHeight || height;
    const sourceRatio = sourceWidth / sourceHeight;
    const viewRatio = width / height;
    let nx = lm.x;
    let ny = lm.y;

    // Alinha os landmarks com o crop central de object-fit: cover do preview.
    if (sourceRatio > viewRatio) {
      const visible = viewRatio / sourceRatio;
      nx = (nx - (1 - visible) / 2) / visible;
    } else if (sourceRatio < viewRatio) {
      const visible = sourceRatio / viewRatio;
      ny = (ny - (1 - visible) / 2) / visible;
    }

    // A câmera é traseira e o vídeo está sem espelhamento: não inverter X.
    const gx = clamp01(0.5 + (clamp01(nx) - 0.5) * GAIN_X);
    const gy = clamp01(0.5 + (clamp01(ny) - 0.5) * GAIN_Y);
    return { x: gx * width, y: gy * height };
  }

  _processHand(landmarks, now) {
    const handSize = dist2d(landmarks[0], landmarks[9]) || 0.0001;
    const pinchRatio = dist2d(landmarks[4], landmarks[8]) / handSize;
    const releasing = this.pinch && pinchRatio > PINCH_OFF;
    const thumbTip = this._toScreen(landmarks[4]);
    const indexTip = this._toScreen(landmarks[8]);
    let target = indexTip;

    // Quando os dedos se aproximam, o ponto de toque é o meio da pinça.
    // Na soltura, congela-se o último ponto fechado para o clique não escapar.
    if (pinchRatio < 0.55 || this.pinch) {
      target = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
    }
    if (releasing && this.cursor.seen) target = { x: this.cursor.x, y: this.cursor.y };

    if (!this.cursor.seen) {
      this.cursor.x = target.x;
      this.cursor.y = target.y;
      this.cursor.seen = true;
    } else {
      const smooth = this.pinch ? 0.78 : 0.68;
      this.cursor.x += (target.x - this.cursor.x) * smooth;
      this.cursor.y += (target.y - this.cursor.y) * smooth;
    }
    const x = this.cursor.x;
    const y = this.cursor.y;
    this.pinchProgress = clamp01((0.62 - pinchRatio) / 0.38);

    if (!this.pinch && pinchRatio < PINCH_ON) {
      this.pinch = true;
      this._dragging = false;
      this._pinchStart = { t: now, x, y };
      this._lastPos = { x, y };
      const hit = this._findAt(x, y, now);
      this._panelHandle = hit?.closest ? hit.closest('[data-drag-handle]') : null;
      this._scrollTarget = hit?.closest ? hit.closest('[data-scroll]') : null;
      this._dwellEl = null;
      this._dwellProgress = 0;
    } else if (this.pinch && pinchRatio > PINCH_OFF) {
      // O clique acontece quando o usuário levanta os dedos, como no Quest.
      const duration = now - (this._pinchStart ? this._pinchStart.t : now);
      const moved = this._pinchStart ? Math.hypot(x - this._pinchStart.x, y - this._pinchStart.y) : Infinity;
      const wasDragging = this._dragging;
      this.pinch = false;
      this._dragging = false;
      this._scrollTarget = null;
      this._panelHandle = null;
      if (!wasDragging && duration <= TAP_MAX_MS && moved <= TAP_MAX_MOVE) {
        this._clickAt(x, y, now);
      }
    } else if (this.pinch) {
      const movedTotal = this._pinchStart ? Math.hypot(x - this._pinchStart.x, y - this._pinchStart.y) : 0;
      if (!this._dragging && movedTotal > DRAG_MIN_MOVE && (this._scrollTarget || this._panelHandle)) {
        this._dragging = true;
      }
      if (this._dragging && this._lastPos) {
        const dx = x - this._lastPos.x;
        const dy = y - this._lastPos.y;
        if (this._panelHandle) {
          this.opts.onPanelDrag?.(dx, dy);
        } else if (this._scrollTarget) {
          this._scrollTarget.scrollTop -= dy;
          this._scrollTarget.scrollLeft -= dx;
          this.opts.onScrollSync?.(this._scrollTarget);
        }
      }
      this._lastPos = { x, y };
    }

    if (!this.pinch) {
      const element = this._findAt(x, y, now);
      const moved = Math.hypot(x - this._dwellAnchor.x, y - this._dwellAnchor.y) > 8;
      if (!element || element !== this._dwellEl || moved) {
        this._dwellEl = element;
        this._dwellStart = now;
        this._dwellFired = false;
        this._dwellAnchor = { x, y };
        this._dwellProgress = 0;
      } else if (!this._dwellFired) {
        this._dwellProgress = clamp01((now - this._dwellStart) / DWELL_MS);
        if (this._dwellProgress >= 1) {
          this._dwellFired = true;
          this._activate(element);
        }
      }
    }
    this._needsDraw = true;
  }

  _clickAt(x, y, now) {
    const element = this._findAt(x, y, now);
    if (element) this._activate(element);
  }

  _activate(element) {
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || element.dataset.kb) {
      this.opts.onInputFocus?.(element.dataset.kb || null);
      return;
    }
    try { element.click(); } catch (error) {}
    this.invalidate();
  }

  _refreshCache(now) {
    this._cacheAt = now;
    this._cache = [];
    const root = this.opts.getRootEl ? this.opts.getRootEl() : null;
    if (!root) return;
    const elements = root.querySelectorAll('button, a, input, textarea, [data-hit], [data-drag-handle]');
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) this._cache.push({ el: element, r: rect });
    }
  }

  _findAt(x, y, now) {
    if (now - this._cacheAt > CACHE_MS) this._refreshCache(now);
    for (let i = this._cache.length - 1; i >= 0; i--) {
      const { el, r } = this._cache[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  }

  _resizeCanvases() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    for (const [canvas, context] of [[this.canvasL, this.ctxL], [this.canvasR, this.ctxR]]) {
      if (!canvas || !context) continue;
      const width = Math.round((canvas.clientWidth || 0) * dpr);
      const height = Math.round((canvas.clientHeight || 0) * dpr);
      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._needsDraw = true;
      }
    }
  }

  _draw() {
    const context = this.ctxL;
    const width = this.canvasL.clientWidth;
    const height = this.canvasL.clientHeight;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);

    const style = this.opts.getStyle ? this.opts.getStyle() : 'ghost';
    const hands = this._landmarks;
    for (let handIndex = 0; handIndex < hands.length; handIndex++) {
      const landmarks = hands[handIndex];
      const points = landmarks.map((landmark) => this._toScreen(landmark));
      const label = this._handLabels[handIndex];
      const accent = label === 'Left' ? 'rgba(129, 247, 222, .95)' : 'rgba(213, 202, 255, .95)';

      if (style === 'points') {
        context.fillStyle = accent;
        for (const point of points) {
          context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.fill();
        }
      } else {
        const neon = style === 'neon';
        const hull = convexHull(points);
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        if (hull.length > 2) {
          // Silhueta translúcida mais próxima das mãos-contorno do Quest.
          context.beginPath();
          const last = hull[hull.length - 1];
          const first = hull[0];
          context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
          for (let i = 0; i < hull.length; i++) {
            const point = hull[i];
            const next = hull[(i + 1) % hull.length];
            context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
          }
          context.closePath();
          context.fillStyle = neon ? 'rgba(74, 207, 235, .09)' : 'rgba(230, 242, 255, .075)';
          context.fill();
          context.shadowColor = neon ? 'rgba(104, 234, 255, .78)' : accent;
          context.shadowBlur = neon ? 12 : 8;
          context.strokeStyle = neon ? 'rgba(116, 241, 255, .92)' : 'rgba(247, 250, 255, .82)';
          context.lineWidth = 2.4;
          context.stroke();
        }
        // Linhas internas discretas preservam a leitura dos dedos sem raio.
        context.shadowBlur = 0;
        context.strokeStyle = neon ? 'rgba(125, 232, 255, .55)' : 'rgba(241, 246, 255, .43)';
        context.lineWidth = neon ? 2.1 : 1.7;
        context.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          context.moveTo(points[a].x, points[a].y);
          context.lineTo(points[b].x, points[b].y);
        }
        context.stroke();
        context.fillStyle = neon ? 'rgba(187, 251, 255, .95)' : 'rgba(247, 250, 255, .85)';
        for (const joint of [0, 4, 8, 12, 16, 20]) {
          context.beginPath(); context.arc(points[joint].x, points[joint].y, joint === 0 ? 2.4 : 1.9, 0, Math.PI * 2); context.fill();
        }
        context.restore();
      }
    }

    // Sem feixe/laser: apenas um pequeno marcador no ponto real da pinça.
    if (this.cursor.seen && hands.length) {
      const { x, y } = this.cursor;
      const radius = this.pinch ? 10 : 4;
      context.save();
      if (this.pinch) {
        context.fillStyle = 'rgba(215, 250, 245, .24)';
        context.strokeStyle = 'rgba(255, 255, 255, .98)';
        context.lineWidth = 2;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
      } else {
        context.fillStyle = 'rgba(255, 255, 255, .96)';
        context.shadowColor = 'rgba(155, 238, 255, .85)';
        context.shadowBlur = 8;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      }
      if (!this.pinch && this._dwellEl && !this._dwellFired && this._dwellProgress > 0) {
        context.shadowBlur = 0;
        context.strokeStyle = 'rgba(95, 226, 235, .98)';
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(x, y, radius + 7, -Math.PI / 2, -Math.PI / 2 + this._dwellProgress * Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    // Mesmo traço em ambos os olhos Cardboard; nenhuma segunda inferência.
    if (this.ctxR && this.canvasR && this.opts.isSBS?.()) {
      const rightWidth = this.canvasR.clientWidth;
      const rightHeight = this.canvasR.clientHeight;
      if (rightWidth && rightHeight) {
        this.ctxR.clearRect(0, 0, rightWidth, rightHeight);
        this.ctxR.drawImage(this.canvasL, 0, 0, rightWidth, rightHeight);
      }
    }
    this._needsDraw = false;
  }
}
