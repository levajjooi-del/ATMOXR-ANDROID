import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '../lib/engine';
import { HandTracker } from '../lib/hands';

/* ============================================================
   ATMOXR Launcher (React)
   - Estado da UI inteiro no React; o Engine (Three/CSS3D) só
     posiciona os dois elementos de painel (um por olho).
   - Abrir app = recentraliza na frente do jogador (só na abertura).
   - Side-by-Side (Cardboard 2015) ligado de fábrica.
   ============================================================ */

const APPS = [
  { id: 'home-ar', name: 'Início AR', icon: '🏠', cls: 'tile-gray', desc: 'Câmera, sem ambiente', fixed: true },
  { id: 'browser', name: 'Google', icon: '🌐', cls: 'tile-blue', desc: 'Navegador web' },
  { id: 'youtube', name: 'YouTube', icon: '▶️', cls: 'tile-red', desc: 'Vídeos' },
  { id: 'shoot', name: 'ShootTheDie', icon: '🎲', cls: 'tile-purple', desc: 'Jogo de tiro VR' },
  { id: 'ilha', name: 'Ilha Tropical', icon: '🏝️', cls: 'tile-teal', desc: 'Praia relaxante' },
  { id: 'dreamcore', name: 'Dreamcore', icon: '☁️', cls: 'tile-pink', desc: 'Mundo dos sonhos' },
  { id: 'cozinha', name: 'Cozinha', icon: '🍳', cls: 'tile-orange', desc: 'Ambiente cozinha' },
  { id: 'minecraft', name: 'Minecraft', icon: '⛏️', cls: 'tile-green', desc: 'Abrir o app' },
  { id: 'roblox', name: 'Roblox', icon: '🟥', cls: 'tile-gray', desc: 'Abrir o app' },
];
const DEFAULT_INSTALLED = ['browser', 'youtube', 'shoot', 'ilha'];
const SHORTCUTS = [
  { name: 'YouTube', icon: '▶️', url: 'https://www.youtube.com' },
  { name: 'Spotify', icon: '🎧', url: 'https://open.spotify.com' },
  { name: 'Instagram', icon: '📸', url: 'https://www.instagram.com' },
  { name: 'X', icon: '𝕏', url: 'https://x.com' },
  { name: 'Twitch', icon: '🎮', url: 'https://www.twitch.tv' },
  { name: 'TikTok', icon: '🎵', url: 'https://www.tiktok.com' },
  { name: 'Netflix', icon: '🎬', url: 'https://www.netflix.com' },
  { name: 'WhatsApp', icon: '💬', url: 'https://web.whatsapp.com' },
];
const YT_CHIPS = ['Música', 'Games', 'Notícias', 'Lo-fi', 'Futebol'];
const KB_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm.,'];
const INSTALLED_KEY = 'atmoxr_installed_apps';
const HAND_STYLE_KEY = 'atmoxr_hand_style';

function ytEmbed(q) {
  return 'https://www.youtube-nocookie.com/embed?listType=search&list=' + encodeURIComponent(q);
}
function loadInstalled() {
  try {
    const v = JSON.parse(localStorage.getItem(INSTALLED_KEY));
    if (Array.isArray(v)) {
      const ok = v.filter((id) => APPS.some((a) => a.id === id && !a.fixed));
      if (ok.length) return ok;
    }
  } catch (e) {}
  return DEFAULT_INSTALLED;
}

export default function Launcher() {
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [win, setWin] = useState(null);
  const [installed, setInstalled] = useState(loadInstalled);
  const [sbs, setSbs] = useState(true);
  const [worldLock, setWorldLock] = useState(false);
  const [handStyle, setHandStyle] = useState(() => {
    try { return localStorage.getItem(HAND_STYLE_KEY) || 'ghost'; } catch (e) { return 'ghost'; }
  });
  const [game, setGame] = useState(false);
  const [envName, setEnvName] = useState(null);
  const [clock, setClock] = useState('--:--');
  const [addr, setAddr] = useState('');
  const [browserSrc, setBrowserSrc] = useState('');
  const [ytQuery, setYtQuery] = useState('');
  const [ytSrc, setYtSrc] = useState(() => ytEmbed('música lofi'));
  const [kbTarget, setKbTarget] = useState(null);

  const videoLRef = useRef(null);
  const videoRRef = useRef(null);
  const glMountRef = useRef(null);
  const panelLRef = useRef(null);
  const panelRRef = useRef(null);
  const canvasLRef = useRef(null);
  const canvasRRef = useRef(null);
  const gameFrameRef = useRef(null);
  const engineRef = useRef(null);
  const handsRef = useRef(null);
  const startLockRef = useRef(false);

  const gameRef = useRef(false); gameRef.current = game;
  const sbsRef = useRef(true); sbsRef.current = sbs;
  const handStyleRef = useRef(handStyle); handStyleRef.current = handStyle;

  useEffect(() => { try { localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed)); } catch (e) {} }, [installed]);
  useEffect(() => { try { localStorage.setItem(HAND_STYLE_KEY, handStyle); } catch (e) {} }, [handStyle]);
  useEffect(() => {
    const f = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);

  const postGame = useCallback((msg) => {
    try { gameFrameRef.current?.contentWindow?.postMessage(msg, '*'); } catch (e) {}
  }, []);

  const syncScroll = useCallback((fromEl) => {
    const key = fromEl && fromEl.dataset ? fromEl.dataset.scrollKey : null;
    if (!key) return;
    const right = panelRRef.current?.querySelector(`[data-scroll-key="${key}"]`);
    if (right && right !== fromEl) {
      right.scrollTop = fromEl.scrollTop;
      right.scrollLeft = fromEl.scrollLeft;
    }
  }, []);

  const afterUiChange = useCallback(() => {
    requestAnimationFrame(() => handsRef.current?.invalidate());
  }, []);

  /* ---------- início (câmera + permissões) ---------- */
  const handleStart = async () => {
    if (startLockRef.current || started) return;
    startLockRef.current = true;
    setStarting(true);
    setStartError('');
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      for (const v of [videoLRef.current, videoRRef.current]) {
        if (v) { v.srcObject = stream; const p = v.play && v.play(); if (p) p.catch(() => {}); }
      }
    } catch (e) {
      setStartError('Não consegui acessar a câmera (' + ((e && e.name) || e) + '). Verifique a permissão e tente de novo.');
      setStarting(false);
      startLockRef.current = false;
      return;
    }
    setStarting(false);
    setStarted(true);
  };

  /* ---------- engine + mãos (uma vez, após entrar) ---------- */
  useEffect(() => {
    if (!started || engineRef.current) return;
    const engine = new Engine(glMountRef.current, panelLRef.current, panelRRef.current, {
      onGyro: (q) => { if (gameRef.current) postGame({ type: 'atmoxr-shoot-gyro', q }); },
    });
    engineRef.current = engine;
    engine.setSBS(true); // SBS de fábrica
    engine.start();

    const hands = new HandTracker(videoLRef.current, canvasLRef.current, canvasRRef.current, {
      getRootEl: () => panelLRef.current,
      isSBS: () => sbsRef.current,
      isUiActive: () => !gameRef.current,
      getStyle: () => handStyleRef.current,
      onResults: (r) => {
        if (gameRef.current) {
          postGame({
            type: 'atmoxr-shoot-hand',
            results: { multiHandLandmarks: r.multiHandLandmarks || [], multiHandedness: r.multiHandedness || [] },
          });
        }
      },
      onPanelDrag: (dx, dy) => engine.addPanelDrag(dx, dy),
      onScrollSync: (el) => syncScroll(el),
      onInputFocus: (kb) => { setKbTarget(kb); afterUiChange(); },
    });
    handsRef.current = hands;
    hands.start();
  }, [started, postGame, syncScroll, afterUiChange]);

  /* ---------- ações ---------- */
  const openWindow = (name) => {
    setWin(name);
    setKbTarget(null);
    // Recentrar SÓ ao abrir o app (pedido do usuário)
    requestAnimationFrame(() => {
      engineRef.current?.recenter();
      handsRef.current?.invalidate();
    });
  };

  const toggleWin = (name) => { if (win === name) { setWin(null); setKbTarget(null); afterUiChange(); } else openWindow(name); };

  const launchGame = () => {
    setGame(true);
    engineRef.current?.setPaused(true);
  };
  const onGameLoad = () => {
    postGame({ type: 'atmoxr-shoot-vr', enabled: sbsRef.current });
    postGame({ type: 'atmoxr-shoot-recenter' });
  };
  const closeGame = () => {
    setGame(false);
    engineRef.current?.setPaused(false);
    requestAnimationFrame(() => engineRef.current?.recenter());
  };

  const openNative = (pkg) => {
    try {
      window.location.href = `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};end`;
    } catch (e) {}
  };

  const openApp = (app) => {
    switch (app.id) {
      case 'browser': case 'youtube': openWindow(app.id); break;
      case 'shoot': setWin(null); launchGame(); break;
      case 'ilha': case 'dreamcore': case 'cozinha':
        engineRef.current?.setEnvironment(app.id);
        setEnvName(app.id);
        setWin(null);
        requestAnimationFrame(() => engineRef.current?.recenter());
        break;
      case 'home-ar':
        engineRef.current?.setEnvironment(null);
        setEnvName(null);
        setWin(null);
        afterUiChange();
        break;
      case 'minecraft': openNative('com.mojang.minecraftpe'); break;
      case 'roblox': openNative('com.roblox.client'); break;
      default: break;
    }
  };

  const toggleSbs = () => {
    const v = !sbs;
    setSbs(v);
    engineRef.current?.setSBS(v);
    afterUiChange();
  };
  const toggleLock = () => {
    const v = !worldLock;
    setWorldLock(v);
    engineRef.current?.setWorldLock(v);
  };
  const cycleHand = () => {
    const order = ['ghost', 'neon', 'points'];
    setHandStyle(order[(order.indexOf(handStyle) + 1) % order.length]);
  };

  const navigate = (raw) => {
    let u = (raw || '').trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      u = u.includes('.') && !u.includes(' ') ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u);
    }
    setBrowserSrc(u);
    setAddr(u);
    afterUiChange();
  };

  const onKey = (k) => {
    if (!kbTarget) return;
    const isBrowser = kbTarget === 'browser';
    const value = isBrowser ? addr : ytQuery;
    const setValue = isBrowser ? setAddr : setYtQuery;
    if (k === '⌫') setValue(value.slice(0, -1));
    else if (k === '␣') setValue(value + ' ');
    else if (k === '✕') setKbTarget(null);
    else if (k === '⏎') {
      if (isBrowser) navigate(addr); else setYtSrc(ytEmbed(ytQuery || 'música'));
      setKbTarget(null);
    } else setValue(value + k);
    afterUiChange();
  };

  /* ---------- janelas ---------- */
  const libraryApps = APPS.filter((a) => a.fixed || installed.includes(a.id));

  const renderLibrary = () => (
    <div className="win">
      <div className="win-header" data-drag-handle="">
        <div className="win-title">📚 Biblioteca · <span className="grad">ATMOXR</span></div>
        <button className="win-close" onClick={() => { setWin(null); afterUiChange(); }}>✕</button>
      </div>
      <div className="win-body">
        <div className="apps-grid" data-scroll="" data-scroll-key="lib">
          {libraryApps.map((app) => (
            <button key={app.id} className={`tile ${app.cls}`} onClick={() => openApp(app)}>
              <span className="tile-icon">{app.icon}</span>
              <span className="tile-name">{app.name}</span>
              <span className="tile-desc">{app.desc}</span>
            </button>
          ))}
          {libraryApps.length <= 1 && (
            <div className="empty-note">Nenhum app instalado ainda. Abra a Loja 🛍 na dock!</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStore = () => (
    <div className="win">
      <div className="win-header" data-drag-handle="">
        <div className="win-title">🛍 Loja · <span className="grad">ATMOXR</span></div>
        <button className="win-close" onClick={() => { setWin(null); afterUiChange(); }}>✕</button>
      </div>
      <div className="win-body">
        <div className="store-list" data-scroll="" data-scroll-key="store">
          {APPS.filter((a) => !a.fixed).map((app) => {
            const has = installed.includes(app.id);
            return (
              <div key={app.id} className="store-row">
                <div className={`store-icon ${app.cls}`}>{app.icon}</div>
                <div className="store-meta">
                  <div className="store-name">{app.name}</div>
                  <div className="store-desc">{app.desc}</div>
                </div>
                {has ? (
                  <>
                    <button className="store-btn" onClick={() => openApp(app)}>Abrir</button>
                    <button className="store-btn remove" onClick={() => { setInstalled(installed.filter((i) => i !== app.id)); afterUiChange(); }}>Remover</button>
                  </>
                ) : (
                  <button className="store-btn" onClick={() => { setInstalled([...installed, app.id]); afterUiChange(); }}>Instalar</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderBrowser = () => (
    <div className="win">
      <div className="win-header" data-drag-handle="">
        <div className="win-title">🌐 Navegador</div>
        <button className="win-close" onClick={() => { setWin(null); setKbTarget(null); afterUiChange(); }}>✕</button>
      </div>
      <div className="browser-bar">
        <button className="bar-btn" onClick={() => { setBrowserSrc(''); setAddr(''); afterUiChange(); }}>⌂</button>
        <button className="bar-btn" onClick={() => { if (browserSrc) { const s0 = browserSrc; setBrowserSrc(''); requestAnimationFrame(() => setBrowserSrc(s0)); } }}>⟳</button>
        <input className="addr-input" data-kb="browser" readOnly value={addr} placeholder="Pesquisar ou digitar endereço" onClick={() => setKbTarget('browser')} />
        <button className="bar-btn" onClick={() => navigate(addr)}>➜</button>
      </div>
      <div className="browser-body">
        {browserSrc ? (
          <iframe className="browser-frame" src={browserSrc} title="Navegador" />
        ) : (
          <div className="browser-home">
            <div className="browser-logo">ATMOXR</div>
            <div className="browser-tag">Toque em um atalho ou pesquise na barra acima</div>
            <div className="shortcut-grid">
              {SHORTCUTS.map((s) => (
                <button key={s.name} className="shortcut" onClick={() => navigate(s.url)}>
                  <span className="shortcut-icon">{s.icon}</span>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderYoutube = () => (
    <div className="win">
      <div className="win-header" data-drag-handle="">
        <div className="win-title">▶️ YouTube</div>
        <button className="win-close" onClick={() => { setWin(null); setKbTarget(null); afterUiChange(); }}>✕</button>
      </div>
      <div className="browser-bar">
        <input className="addr-input" data-kb="yt" readOnly value={ytQuery} placeholder="Pesquisar no YouTube" onClick={() => setKbTarget('yt')} />
        <button className="bar-btn" onClick={() => setYtSrc(ytEmbed(ytQuery || 'música'))}>🔍</button>
      </div>
      <div className="yt-chips">
        {YT_CHIPS.map((c) => (
          <button key={c} className="yt-chip" onClick={() => { setYtQuery(c); setYtSrc(ytEmbed(c)); afterUiChange(); }}>{c}</button>
        ))}
      </div>
      <iframe className="yt-frame" src={ytSrc} title="YouTube" allow="autoplay; encrypted-media" />
    </div>
  );

  const renderKeyboard = () => (
    <div className="keyboard">
      {KB_ROWS.map((row) => (
        <div className="kb-row" key={row}>
          {row.split('').map((ch) => (
            <button key={ch} className="kb-key" onClick={() => onKey(ch)}>{ch}</button>
          ))}
        </div>
      ))}
      <div className="kb-row">
        <button className="kb-key wide" onClick={() => onKey('⌫')}>⌫</button>
        <button className="kb-key xwide" onClick={() => onKey('␣')}>espaço</button>
        <button className="kb-key wide" onClick={() => onKey('✕')}>✕</button>
        <button className="kb-key enter" onClick={() => onKey('⏎')}>⏎ Ir</button>
      </div>
    </div>
  );

  const renderDock = () => (
    <div className="dock">
      <span className="dock-clock">{clock}</span>
      <button className={`dock-btn ${win === 'library' ? 'active' : ''}`} title="Biblioteca" onClick={() => toggleWin('library')}>▦</button>
      <button className={`dock-btn ${win === 'store' ? 'active' : ''}`} title="Loja" onClick={() => toggleWin('store')}>🛍</button>
      <button className={`dock-btn ${win === 'browser' ? 'active' : ''}`} title="Google" onClick={() => toggleWin('browser')}>🌐</button>
      <button className={`dock-btn ${win === 'youtube' ? 'active' : ''}`} title="YouTube" onClick={() => toggleWin('youtube')}>▶</button>
      <div className="dock-sep" />
      <button className={`dock-btn ${sbs ? 'active' : ''}`} title="Modo Cardboard (side-by-side)" onClick={toggleSbs}>🥽</button>
      <button className="dock-btn" title="Recentrar" onClick={() => engineRef.current?.recenter()}>◎</button>
      <button className={`dock-btn ${worldLock ? 'active' : ''}`} title="Travar painel no mundo" onClick={toggleLock}>{worldLock ? '🔒' : '🔓'}</button>
      <button className="dock-btn" title="Estilo da mão" onClick={cycleHand}>✋</button>
      <div className="dock-spacer" />
      {envName && (
        <button className="dock-btn" title="Sair do ambiente" onClick={() => openApp({ id: 'home-ar' })}>🏠</button>
      )}
    </div>
  );

  const renderGroup = (eye) => (
    <div
      className="window-group"
      key={eye}
      ref={eye === 'L' ? panelLRef : panelRRef}
      aria-hidden={eye === 'R'}
      onScrollCapture={eye === 'L' ? (e) => syncScroll(e.target) : undefined}
    >
      {win === 'library' && renderLibrary()}
      {win === 'store' && renderStore()}
      {win === 'browser' && renderBrowser()}
      {win === 'youtube' && renderYoutube()}
      {kbTarget && renderKeyboard()}
      <div className="move-handle" data-drag-handle="">⠿ ⠿ ⠿</div>
      {renderDock()}
    </div>
  );

  return (
    <div className={`xr-root ${sbs ? 'sbs' : ''}`}>
      <video ref={videoLRef} className="eye-video video-l" autoPlay muted playsInline />
      <video ref={videoRRef} className="eye-video video-r" autoPlay muted playsInline />
      <div ref={glMountRef} className="gl-mount" />
      <div className="panel-stage">{renderGroup('L')}{renderGroup('R')}</div>
      <canvas ref={canvasLRef} className="hands-canvas hands-l" />
      <canvas ref={canvasRRef} className="hands-canvas hands-r" />

      {game && (
        <div className="game-overlay">
          <iframe
            ref={gameFrameRef}
            className="game-frame"
            src="/shoot-the-die.html"
            onLoad={onGameLoad}
            title="ShootTheDie"
            allow="autoplay; fullscreen"
          />
          <button className="game-close" onClick={closeGame}>✕</button>
        </div>
      )}

      {!started && (
        <div className="start-overlay" onClick={() => handleStart()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="start-logo" src="/logo.jpg" alt="ATMOXR" />
          <p>
            Mostre as mãos para a câmera e controle tudo com gestos: aponte para mirar,{' '}
            <strong>pinça rápida para clicar</strong>, pinça segurando para rolar e arrastar.
            O modo Cardboard (side-by-side) já entra ativado.
          </p>
          {startError && <p className="start-error">{startError}</p>}
          <button className="start-btn" disabled={starting}>
            {starting ? 'Abrindo a câmera…' : 'Entrar no ATMOXR'}
          </button>
          {startError && (
            <button className="start-skip" onClick={(e) => { e.stopPropagation(); setStarted(true); }}>
              Entrar mesmo assim (sem câmera)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
