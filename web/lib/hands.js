/* ============================================================
   ATMOXR HandTracker
   - MediaPipe Hands com entrada de câmera traseira (sem espelhar)
   - Corrige a convenção selfie Left/Right do MediaPipe
   - Pinça natural: encosta para segurar, solta para clicar; sem raio
   - Arraste/rolagem por pinça sustentada; hit-test cacheado
   - Inferência e desenho adaptativos para poupar CPU/FPS
   ============================================================ */

const FINGER_LANDMARKS = [
  [1, 2, 3, 4],       // polegar
  [5, 6, 7, 8],       // indicador
  [9, 10, 11, 12],    // médio
  [13, 14, 15, 16],   // anelar
  [17, 18, 19, 20],   // mindinho
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

function normal2d(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}

// Constrói duas bordas para cada dedo; assim a silhueta acompanha os dedos
// individualmente, em vez de envolver a mão num casco convexo arredondado.
function fingerSides(points) {
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i++) {
    let normal;
    if (i === 0) {
      normal = normal2d(points[0], points[1]);
    } else if (i === points.length - 1) {
      normal = normal2d(points[i - 1], points[i]);
    } else {
      const n1 = normal2d(points[i - 1], points[i]);
      const n2 = normal2d(points[i], points[i + 1]);
      normal = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
      const length = Math.hypot(normal.x, normal.y) || 1;
      normal.x /= length;
      normal.y /= length;
    }
    const next = points[Math.min(i + 1, points.length - 1)];
    const width = i === points.length - 1 ? 5 : Math.max(7, dist2d(points[i], next) * 0.32);
    left.push({ x: points[i].x + normal.x * width, y: points[i].y + normal.y * width });
    right.push({ x: points[i].x - normal.x * width, y: points[i].y - normal.y * width });
  }
  return { left, right };
}

function buildHandContour(points) {
  if (!points || points.length < 21) return [];
  const fingers = FINGER_LANDMARKS.map((ids) => fingerSides(ids.map((index) => points[index])));
  const sidePairs = fingers.map((sides) => {
    const averageX = (side) => side.reduce((sum, point) => sum + point.x, 0) / side.length;
    return averageX(sides.left) < averageX(sides.right)
      ? { left: sides.left, right: sides.right }
      : { left: sides.right, right: sides.left };
  });

  const path = [];
  const add = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const last = path[path.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1.5) path.push(point);
  };
  const addList = (side, reverse = false) => {
    const list = reverse ? [...side].reverse() : side;
    list.forEach(add);
  };

  add(points[0]);
  addList(sidePairs[0].left);
  addList(sidePairs[0].right, true);
  for (let i = 1; i < sidePairs.length; i++) {
    const current = sidePairs[i];
    add(current.left[0]);
    addList(current.left);
    addList(current.right, true);
  }
  add(points[0]);
  return path;
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
    this._dockHandle = null;
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
    normalized.atmoxrHandOverlay = this._createGameOverlay(normalized.multiHandLandmarks || []);
    if (this.opts.onResults) this.opts.onResults(normalized);

    const uiActive = this.opts.isUiActive ? this.opts.isUiActive() : true;
    if (!uiActive) {
      this._landmarks = [];
      this._handLabels = [];
      this._activeLabel = '';
      this.cursor.seen = false;
      this.pinch = false;
      this._dragging = false;
      this._scrollTarget = null;
      this._panelHandle = null;
      this._dockHandle = null;
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
        this._dockHandle = null;
        this._pinchStart = null;
      }
      this._needsDraw = true;
    }
  }

  _createGameOverlay(landmarks) {
    const width = this.canvasL.clientWidth || window.innerWidth || 1;
    const height = this.canvasL.clientHeight || window.innerHeight || 1;
    const sbs = !!this.opts.isSBS?.();
    const rightOffset = sbs
      ? (this.canvasR?.getBoundingClientRect().left || width)
      : 0;
    return {
      sbs,
      width,
      height,
      rightOffset,
      hands: landmarks.map((hand) => {
        const points = hand.map((landmark) => this._toScreen(landmark));
        const handSize = dist2d(hand[0], hand[9]) || 0.0001;
        const pinchRatio = dist2d(hand[4], hand[8]) / handSize;
        return {
          points,
          pinch: pinchRatio < PINCH_ON,
          cursor: {
            x: (points[4].x + points[8].x) / 2,
            y: (points[4].y + points[8].y) / 2,
          },
        };
      }),
    };
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
      this._dockHandle = hit?.closest ? hit.closest('[data-dock-handle]') : null;
      this._panelHandle = this._dockHandle ? null : (hit?.closest ? hit.closest('[data-drag-handle]') : null);
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
      this._dockHandle = null;
      if (!wasDragging && duration <= TAP_MAX_MS && moved <= TAP_MAX_MOVE) {
        this._clickAt(x, y, now);
      }
    } else if (this.pinch) {
      const movedTotal = this._pinchStart ? Math.hypot(x - this._pinchStart.x, y - this._pinchStart.y) : 0;
      if (!this._dragging && movedTotal > DRAG_MIN_MOVE && (this._scrollTarget || this._panelHandle || this._dockHandle)) {
        this._dragging = true;
      }
      if (this._dragging && this._lastPos) {
        const dx = x - this._lastPos.x;
        const dy = y - this._lastPos.y;
        if (this._dockHandle) {
          this.opts.onDockDrag?.(dx, dy);
        } else if (this._panelHandle) {
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
    const elements = root.querySelectorAll('button, a, input, textarea, [data-hit], [data-drag-handle], [data-dock-handle]');
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
    for (const landmarks of hands) {
      const points = landmarks.map((landmark) => this._toScreen(landmark));
      if (style === 'points') {
        context.fillStyle = '#27e8ff';
        for (const point of points) {
          context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.fill();
        }
        continue;
      }

      const contour = buildHandContour(points);
      if (contour.length < 3) continue;
      context.save();
      context.beginPath();
      context.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i++) {
        const previous = contour[i - 1];
        const current = contour[i];
        context.quadraticCurveTo(
          previous.x,
          previous.y,
          (previous.x + current.x) / 2,
          (previous.y + current.y) / 2,
        );
      }
      const last = contour[contour.length - 1];
      context.lineTo(last.x, last.y);
      context.closePath();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#27e8ff';
      context.lineWidth = Math.max(2.2, Math.min(3.2, width / 260));
      context.shadowColor = '#00dfff';
      context.shadowBlur = style === 'neon' ? 8 : 5;
      context.stroke();
      context.restore();
    }

    // Sem feixe/laser: apenas um pequeno marcador no ponto real da pinça.
    if (this.cursor.seen && hands.length) {
      const { x, y } = this.cursor;
      const radius = this.pinch ? 8.5 : 4;
      context.save();
      if (this.pinch) {
        context.fillStyle = '#3478ff';
        context.shadowColor = '#1764ff';
        context.shadowBlur = 14;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = 'rgba(220, 232, 255, .95)';
        context.lineWidth = 1.4;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
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
