/* ============================================================
   HandTracker — rastreamento de mãos estilo Meta Quest 3S
   - MediaPipe Hands (CDN), taxa adaptativa p/ celular fraco
   - Cursor com laser saindo da palma, anel que "aperta" na pinça
   - Clique = pinça rápida (soltou, clicou); segurar + mover = rolar/arrastar
   - Hit-test com retângulos cacheados (sem varrer o DOM por frame)
   ============================================================ */

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const GAIN_X = 1.3;            // expansão do alcance ao redor do centro
const GAIN_Y = 1.25;
const PINCH_ON = 0.34;         // razão dist(4,8)/dist(0,9) p/ apertar
const PINCH_OFF = 0.42;        // ... e p/ soltar (histerese)
const TAP_MAX_MS = 380;        // pinça rápida = clique
const TAP_MAX_MOVE = 16;       // px
const DRAG_MIN_MOVE = 10;      // px p/ virar arrastar/rolar
const DWELL_MS = 800;          // olhar/apontar parado = clique
const CACHE_MS = 180;          // validade do cache de retângulos
const MEDIAPIPE_VER = '0.4.1675469240';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

export class HandTracker {
  constructor(video, canvasL, canvasR, opts = {}) {
    this.video = video;
    this.canvasL = canvasL;
    this.canvasR = canvasR;
    this.opts = opts;
    this.ctxL = canvasL.getContext('2d');
    this.ctxR = canvasR ? canvasR.getContext('2d') : null;

    this.hands = null;
    this._running = false;
    this._sending = false;
    this._frame = 0;
    this._skipEvery = 1;
    this._emaMs = 16;

    this._landmarks = [];           // últimas mãos detectadas
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
    this._loop = this._loop.bind(this);
  }

  async start() {
    if (this._running) return;
    this._running = true;
    requestAnimationFrame(this._loop);
    try {
      await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_VER}/hands.js`);
      const hands = new window.Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MEDIAPIPE_VER}/${f}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults((r) => this._onResults(r));
      this.hands = hands;
    } catch (e) {
      // Sem internet/CDN: o app continua por toque.
      console.warn('[ATMOXR] MediaPipe indisponível:', e);
    }
  }

  stop() { this._running = false; }

  invalidate() { this._cacheAt = 0; }

  _loop(ts) {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    const dt = this._lastTs ? Math.min(ts - this._lastTs, 50) : 16;
    this._lastTs = ts;
    this._resizeCanvases();
    this._maybeSend();
    this._draw(dt);
  }

  async _maybeSend() {
    if (!this.hands || this._sending) return;
    const v = this.video;
    if (!v || v.readyState < 2 || v.videoWidth === 0) return;
    this._frame++;
    if (this._frame % this._skipEvery !== 0) return;
    this._sending = true;
    const t0 = performance.now();
    try {
      await this.hands.send({ image: v });
    } catch (e) { /* frame perdido, segue o jogo */ }
    const ms = performance.now() - t0;
    this._emaMs = this._emaMs * 0.85 + ms * 0.15;
    // Adapta a taxa: mão pesada => processa menos frames (mais FPS p/ render)
    this._skipEvery = this._emaMs > 80 ? 3 : this._emaMs > 45 ? 2 : 1;
    this._sending = false;
  }

  _onResults(results) {
    // Sempre encaminha (o ShootTheDie recebe as mãos por esta ponte).
    if (this.opts.onResults) this.opts.onResults(results);

    const uiActive = this.opts.isUiActive ? this.opts.isUiActive() : true;
    if (!uiActive) {
      this._landmarks = [];
      this.pinch = false;
      this._dragging = false;
      return;
    }

    this._landmarks = results.multiHandLandmarks || [];
    if (this._landmarks.length > 0) {
      this._processHand(this._landmarks[0], performance.now());
    } else {
      this.cursor.seen = false;
      if (this.pinch) { this.pinch = false; this._dragging = false; }
    }
  }

  _toScreen(lm) {
    const w = this.canvasL.clientWidth || 1;
    const h = this.canvasL.clientHeight || 1;
    const nx = 1 - lm.x; // espelha (câmera frontal de trás p/ AR usa traseira; mantém comportamento do launcher)
    const gx = clamp01(0.5 + (nx - 0.5) * GAIN_X);
    const gy = clamp01(0.5 + (lm.y - 0.5) * GAIN_Y);
    return { x: gx * w, y: gy * h };
  }

  _processHand(lms, now) {
    const tip = this._toScreen(lms[8]);

    // Suavização exponencial do cursor
    if (!this.cursor.seen) {
      this.cursor.x = tip.x; this.cursor.y = tip.y; this.cursor.seen = true;
    } else {
      const k = this.pinch ? 0.55 : 0.4;
      this.cursor.x += (tip.x - this.cursor.x) * k;
      this.cursor.y += (tip.y - this.cursor.y) * k;
    }
    const x = this.cursor.x, y = this.cursor.y;

    const handSize = dist2d(lms[0], lms[9]) || 0.0001;
    const ratio = dist2d(lms[4], lms[8]) / handSize;
    this.pinchProgress = clamp01((0.6 - ratio) / 0.35);

    if (!this.pinch && ratio < PINCH_ON) {
      // Apertou a pinça
      this.pinch = true;
      this._dragging = false;
      this._pinchStart = { t: now, x, y };
      this._lastPos = { x, y };
      const hit = this._findAt(x, y, now);
      this._panelHandle = hit && hit.closest ? hit.closest('[data-drag-handle]') : null;
      this._scrollTarget = hit && hit.closest ? hit.closest('[data-scroll]') : null;
      this._dwellEl = null;
      this._dwellProgress = 0;
    } else if (this.pinch && ratio > PINCH_OFF) {
      // Soltou a pinça
      const dur = now - (this._pinchStart ? this._pinchStart.t : now);
      const moved = this._pinchStart ? Math.hypot(x - this._pinchStart.x, y - this._pinchStart.y) : 999;
      const wasDragging = this._dragging;
      this.pinch = false;
      this._dragging = false;
      this._scrollTarget = null;
      this._panelHandle = null;
      if (!wasDragging && dur < TAP_MAX_MS && moved < TAP_MAX_MOVE) {
        this._clickAt(x, y, now); // pinça rápida = clique (estilo Quest)
      }
    } else if (this.pinch) {
      // Segurando: talvez vire arrastar/rolar
      const movedTotal = this._pinchStart ? Math.hypot(x - this._pinchStart.x, y - this._pinchStart.y) : 0;
      if (!this._dragging && movedTotal > DRAG_MIN_MOVE && (this._scrollTarget || this._panelHandle)) {
        this._dragging = true;
      }
      if (this._dragging && this._lastPos) {
        const dx = x - this._lastPos.x;
        const dy = y - this._lastPos.y;
        if (this._panelHandle) {
          if (this.opts.onPanelDrag) this.opts.onPanelDrag(dx, dy);
        } else if (this._scrollTarget) {
          this._scrollTarget.scrollTop -= dy;
          this._scrollTarget.scrollLeft -= dx;
          if (this.opts.onScrollSync) this.opts.onScrollSync(this._scrollTarget);
        }
      }
      this._lastPos = { x, y };
    }

    // Dwell: apontar parado sobre um botão clica sozinho
    if (!this.pinch) {
      const el = this._findAt(x, y, now);
      const anchorMoved = Math.hypot(x - this._dwellAnchor.x, y - this._dwellAnchor.y) > 8;
      if (!el || el !== this._dwellEl || anchorMoved) {
        this._dwellEl = el;
        this._dwellStart = now;
        this._dwellFired = false;
        this._dwellAnchor = { x, y };
        this._dwellProgress = 0;
      } else if (el && !this._dwellFired) {
        this._dwellProgress = clamp01((now - this._dwellStart) / DWELL_MS);
        if (this._dwellProgress >= 1) {
          this._dwellFired = true;
          this._activate(el);
        }
      }
    }
  }

  _clickAt(x, y, now) {
    const el = this._findAt(x, y, now);
    if (el) this._activate(el);
  }

  _activate(el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.dataset.kb) {
      if (this.opts.onInputFocus) this.opts.onInputFocus(el.dataset.kb || null);
      return;
    }
    try { el.click(); } catch (e) {}
    this.invalidate();
  }

  _refreshCache(now) {
    this._cacheAt = now;
    this._cache = [];
    const root = this.opts.getRootEl ? this.opts.getRootEl() : null;
    if (!root) return;
    const els = root.querySelectorAll('button, a, input, textarea, [data-hit], [data-drag-handle]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this._cache.push({ el, r });
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    for (const [cv, ctx] of [[this.canvasL, this.ctxL], [this.canvasR, this.ctxR]]) {
      if (!cv || !ctx) continue;
      const w = Math.round((cv.clientWidth || 0) * dpr);
      const h = Math.round((cv.clientHeight || 0) * dpr);
      if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) {
        cv.width = w; cv.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _draw() {
    const ctx = this.ctxL;
    const w = this.canvasL.clientWidth, h = this.canvasL.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    const style = this.opts.getStyle ? this.opts.getStyle() : 'ghost';
    const hands = this._landmarks;

    hands.forEach((lms, hi) => {
      const pts = lms.map((lm) => this._toScreen(lm));

      if (style === 'points') {
        ctx.fillStyle = 'rgba(34,211,238,0.95)';
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const neon = style === 'neon';
        ctx.lineCap = 'round';
        if (neon) {
          ctx.strokeStyle = 'rgba(217,70,239,0.35)';
          ctx.lineWidth = 7;
          ctx.beginPath();
          for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
          ctx.stroke();
        }
        ctx.strokeStyle = neon ? 'rgba(34,211,238,0.95)' : 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
        ctx.stroke();
        ctx.fillStyle = neon ? 'rgba(165,243,252,0.95)' : 'rgba(255,255,255,0.9)';
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Laser da palma (só mão principal)
      if (hi === 0) {
        const palm = { x: (pts[0].x + pts[9].x) / 2, y: (pts[0].y + pts[9].y) / 2 };
        const tip = pts[8];
        const end = { x: tip.x + (tip.x - palm.x) * 1.6, y: tip.y + (tip.y - palm.y) * 1.6 };
        const grad = ctx.createLinearGradient(palm.x, palm.y, end.x, end.y);
        grad.addColorStop(0, 'rgba(255,255,255,0.05)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });

    // Cursor (anel que aperta com a pinça + arco de dwell)
    if (this.cursor.seen && hands.length > 0) {
      const { x, y } = this.cursor;
      const r = 15 - 7 * this.pinchProgress;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (this.pinch) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      if (!this.pinch && this._dwellEl && !this._dwellFired && this._dwellProgress > 0) {
        ctx.strokeStyle = 'rgba(34,211,238,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + this._dwellProgress * Math.PI * 2);
        ctx.stroke();
      }
    }

    // Espelha no olho direito
    if (this.ctxR && this.canvasR && this.opts.isSBS && this.opts.isSBS()) {
      const rw = this.canvasR.clientWidth, rh = this.canvasR.clientHeight;
      if (rw && rh) {
        this.ctxR.clearRect(0, 0, rw, rh);
        this.ctxR.drawImage(this.canvasL, 0, 0, rw, rh);
      }
    }
  }
}
