import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '../lib/engine';
import { HandTracker } from '../lib/hands';
import AuraIcon from './AuraIcon';

/* ============================================================
   ATMOXR Launcher (React)
   - Painel e dock flutuantes com referência visual Aura / Quest.
   - Abrir app = recentraliza na frente do jogador (só na abertura).
   - Cardboard SBS ligado de fábrica; controles avançados em Ajustes.
   ============================================================ */

const APPS = [
  { id: 'home-ar', name: 'Câmera', icon: 'camera', tone: 'camera', cls: 'tile-gray', desc: 'Visão do ambiente', fixed: true },
  { id: 'browser', name: 'Navegador', icon: 'browser', tone: 'browser', cls: 'tile-blue', desc: 'Google e web' },
  { id: 'youtube', name: 'YouTube', icon: 'youtube', tone: 'tv', cls: 'tile-red', desc: 'Vídeos e música' },
  { id: 'shoot', name: 'ShootTheDie', icon: 'game', tone: 'threads', cls: 'tile-purple', desc: 'Jogo de tiro VR' },
  { id: 'ilha', name: 'Ilha Tropical', icon: 'beach', tone: 'calendar', cls: 'tile-teal', desc: 'Praia relaxante' },
  { id: 'dreamcore', name: 'Dreamcore', icon: 'gallery', tone: 'gallery', cls: 'tile-pink', desc: 'Mundo dos sonhos' },
  { id: 'cozinha', name: 'Cozinha', icon: 'calculator', tone: 'calc', cls: 'tile-orange', desc: 'Ambiente cozinha' },
  { id: 'minecraft', name: 'Minecraft', icon: 'game', tone: 'files', cls: 'tile-green', desc: 'Abrir o app' },
  { id: 'roblox', name: 'Roblox', icon: 'game', tone: 'settings', cls: 'tile-gray', desc: 'Abrir o app' },
];
const DEFAULT_INSTALLED = APPS.filter((app) => !app.fixed).map((app) => app.id);
const SHORTCUTS = [
  { name: 'Google', icon: 'browser', tone: 'browser', url: 'https://www.google.com' },
  { name: 'YouTube', icon: 'youtube', tone: 'tv', url: 'https://youtube.com' },
  { name: 'Instagram', icon: 'instagram', tone: 'instagram', url: 'https://www.instagram.com' },
  { name: 'Facebook', icon: 'facebook', tone: 'facebook', url: 'https://www.facebook.com' },
  { name: 'Threads', icon: 'threads', tone: 'threads', url: 'https://www.threads.net' },
  { name: 'WhatsApp', icon: 'whatsapp', tone: 'whatsapp', url: 'https://web.whatsapp.com' },
  { name: 'Twitch', icon: 'twitch', tone: 'messages', url: 'https://www.twitch.tv' },
  { name: 'Netflix', icon: 'netflix', tone: 'tv', url: 'https://www.netflix.com' },
  { name: 'Spotify', icon: 'spotify', tone: 'help', url: 'https://open.spotify.com' },
];
const DOCK_APPS = [
  { id: 'browser', label: 'Navegador', icon: 'browser', tone: 'browser', window: 'browser' },
  { id: 'calculator', label: 'Calculadora', icon: 'calculator', tone: 'calc', url: 'https://www.google.com/search?q=calculadora' },
  { id: 'calendar', label: 'Calendário', icon: 'calendar', tone: 'calendar', url: 'https://calendar.google.com' },
  { id: 'camera', label: 'Câmera', icon: 'camera', tone: 'camera', action: 'camera' },
  { id: 'clock', label: 'Relógio', icon: 'clock', tone: 'clock', window: 'clock' },
  { id: 'threads', label: 'Threads', icon: 'threads', tone: 'threads', url: 'https://www.threads.net' },
  { id: 'facebook', label: 'Facebook', icon: 'facebook', tone: 'facebook', url: 'https://www.facebook.com' },
  { id: 'files', label: 'Arquivos', icon: 'files', tone: 'files', url: 'https://drive.google.com' },
  { id: 'gallery', label: 'Galeria', icon: 'gallery', tone: 'gallery', url: 'https://photos.google.com' },
  { id: 'help', label: 'Ajuda', icon: 'help', tone: 'help', url: 'https://support.google.com/?hl=pt-BR' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram', tone: 'instagram', url: 'https://www.instagram.com' },
  { id: 'remote', label: 'Área de trabalho remota', icon: 'remote', tone: 'remote', url: 'https://remotedesktop.google.com' },
  { id: 'settings', label: 'Ajustes', icon: 'settings', tone: 'settings', window: 'settings' },
  { id: 'store', label: 'Loja dixVR', icon: 'store', tone: 'store', window: 'store' },
  { id: 'messages', label: 'Mensagens', icon: 'messages', tone: 'messages', url: 'https://messages.google.com/web' },
  { id: 'tv', label: 'TV / YouTube', icon: 'tv', tone: 'tv', window: 'youtube' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', tone: 'whatsapp', url: 'https://web.whatsapp.com' },
];
const YT_CHIPS = ['Música', 'Games', 'Notícias', 'Lo-fi', 'Futebol'];
const KB_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm.,'];
const INSTALLED_KEY = 'atmoxr_installed_apps';
const HAND_STYLE_KEY = 'atmoxr_hand_style';

function ytEmbed(q) {
  return 'https://www.youtube.com/embed?listType=search&list=' + encodeURIComponent(q);
}
function loadInstalled() {
  try {
    const saved = JSON.parse(localStorage.getItem(INSTALLED_KEY));
    if (Array.isArray(saved)) {
      const valid = saved.filter((id) => APPS.some((app) => app.id === id && !app.fixed));
      // As experiências que já existiam na build anterior entram na biblioteca
      // sem obrigar o usuário a reinstalá-las depois da atualização.
      return Array.from(new Set([...DEFAULT_INSTALLED, ...valid]));
    }
  } catch (e) {}
  return DEFAULT_INSTALLED;
}

export default function Launcher() {
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [win, setWin] = useState('library');
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
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState('all');
  const [recentApps, setRecentApps] = useState(['browser', 'youtube', 'shoot', 'ilha']);
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
  const browserHistoryRef = useRef([]);
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
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640, max: 960 },
          height: { ideal: 480, max: 540 },
          frameRate: { ideal: 30, max: 30 },
        },
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
            results: {
              multiHandLandmarks: r.multiHandLandmarks || [],
              multiHandedness: r.multiHandedness || [],
              atmoxrHandOverlay: r.atmoxrHandOverlay,
            },
          });
        }
      },
      onPanelDrag: (dx, dy) => engine.addPanelDrag(dx, dy),
      onDockDrag: (dx, dy) => engine.addDockDrag(dx, dy),
      onScrollSync: (el) => syncScroll(el),
      onInputFocus: (kb) => { setKbTarget(kb); afterUiChange(); },
    });
    handsRef.current = hands;
    hands.start();

    return () => {
      hands.stop();
      engine.destroy();
      const stream = videoLRef.current?.srcObject;
      stream?.getTracks?.().forEach((track) => track.stop());
      handsRef.current = null;
      engineRef.current = null;
    };
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
    if (app && !app.fixed) setRecentApps((current) => [app.id, ...current.filter((id) => id !== app.id)].slice(0, 6));
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
    afterUiChange();
  };

  const navigate = (raw) => {
    let url = (raw || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = url.includes('.') && !url.includes(' ') ? 'https://' + url : 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
    const history = browserHistoryRef.current;
    if (history[history.length - 1] !== url) browserHistoryRef.current = [...history.slice(-19), url];
    setBrowserSrc(url);
    setAddr(url);
    afterUiChange();
  };

  const browserBack = () => {
    const history = browserHistoryRef.current;
    if (history.length > 1) {
      history.pop();
      const previous = history[history.length - 1];
      setBrowserSrc(previous);
      setAddr(previous);
    } else {
      browserHistoryRef.current = [];
      setBrowserSrc('');
      setAddr('');
    }
    afterUiChange();
  };

  const onKey = (key) => {
    if (!kbTarget) return;
    const target = kbTarget;
    const value = target === 'browser' ? addr : target === 'library' ? libraryQuery : ytQuery;
    const setValue = target === 'browser' ? setAddr : target === 'library' ? setLibraryQuery : setYtQuery;
    if (key === '⌫') setValue(value.slice(0, -1));
    else if (key === '␣') setValue(value + ' ');
    else if (key === '✕') setKbTarget(null);
    else if (key === '⏎') {
      if (target === 'browser') navigate(addr);
      else if (target === 'yt') setYtSrc(ytEmbed(ytQuery || 'música'));
      setKbTarget(null);
    } else setValue(value + key);
    afterUiChange();
  };

  const openDockApp = (app) => {
    if (app.url) {
      openWindow('browser');
      navigate(app.url);
      return;
    }
    if (app.window) {
      toggleWin(app.window);
      return;
    }
    if (app.action === 'camera') {
      openApp(APPS.find((entry) => entry.id === 'home-ar'));
    }
  };

  /* ---------- janelas ---------- */
  const libraryApps = APPS.filter((app) => app.fixed || installed.includes(app.id));
  const visibleLibraryApps = libraryApps
    .filter((app) => app.name.toLowerCase().includes(libraryQuery.trim().toLowerCase()))
    .filter((app) => libraryTab === 'all' || recentApps.includes(app.id))
    .sort((a, b) => libraryTab === 'recent' ? recentApps.indexOf(a.id) - recentApps.indexOf(b.id) : 0);

  const renderLibrary = () => (
    <div className="win library-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-grid"><AuraIcon name="grid" size={24} /></span>
          <div>
            <div className="win-title">Biblioteca de apps</div>
            <div className="win-subtitle">Seus espaços e aplicativos</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar janela" onClick={() => { setWin(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="library-toolbar">
        <div className="library-search">
          <AuraIcon name="search" size={20} />
          <input
            className="library-input"
            data-kb="library"
            readOnly
            value={libraryQuery}
            placeholder="Pesquisar apps"
            onClick={() => setKbTarget('library')}
          />
        </div>
        <div className="library-filters">
          <button className={libraryTab === 'all' ? 'selected' : ''} onClick={() => setLibraryTab('all')}>Todos <span>{libraryApps.length}</span></button>
          <button className={libraryTab === 'recent' ? 'selected' : ''} onClick={() => setLibraryTab('recent')}>Recentes</button>
        </div>
      </div>
      <div className="win-body">
        <div className="apps-grid" data-scroll="" data-scroll-key="lib">
          {visibleLibraryApps.map((app) => (
            <button key={app.id} className={`tile ${app.cls}`} onClick={() => openApp(app)}>
              <span className={`tile-icon aura-app-icon aura-${app.tone}`}><AuraIcon name={app.icon} size={34} /></span>
              <span className="tile-name">{app.name}</span>
              <span className="tile-desc">{app.desc}</span>
            </button>
          ))}
          {visibleLibraryApps.length === 0 && (
            <div className="empty-note">Nenhum app encontrado. Experimente outra busca ou abra a Loja.</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStore = () => (
    <div className="win store-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-store"><AuraIcon name="store" size={23} /></span>
          <div>
            <div className="win-title">Loja dixVR</div>
            <div className="win-subtitle">Instale e abra seus apps</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar janela" onClick={() => { setWin(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="win-body">
        <div className="store-list" data-scroll="" data-scroll-key="store">
          {APPS.filter((a) => !a.fixed).map((app) => {
            const has = installed.includes(app.id);
            return (
              <div key={app.id} className="store-row">
                <div className={`store-icon aura-app-icon aura-${app.tone}`}><AuraIcon name={app.icon} size={29} /></div>
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
    <div className="win browser-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-browser"><AuraIcon name="browser" size={23} /></span>
          <div>
            <div className="win-title">Navegador</div>
            <div className="win-subtitle">dixVR Web</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar navegador" onClick={() => { setWin(null); setKbTarget(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="browser-bar">
        <button className="browser-back" title="Voltar" onClick={browserBack}><AuraIcon name="back" size={24} /></button>
        <div className="browser-searchbox">
          <AuraIcon name="search" size={22} />
          <input
            className="addr-input"
            data-kb="browser"
            readOnly
            value={addr}
            placeholder="Pesquisar ou digitar endereço"
            onClick={() => setKbTarget('browser')}
          />
          <button className="browser-go" onClick={() => navigate(addr)}>Procurar</button>
        </div>
        <button
          className="browser-refresh"
          title="Recarregar página"
          onClick={() => {
            if (!browserSrc) return;
            const current = browserSrc;
            setBrowserSrc('');
            requestAnimationFrame(() => setBrowserSrc(current));
          }}
        ><AuraIcon name="refresh" size={21} /></button>
      </div>
      <div className="browser-body">
        {browserSrc ? (
          <iframe className="browser-frame" src={browserSrc} title="Navegador dixVR" />
        ) : (
          <div className="browser-home">
            <div className="browser-home-head">
              <div>
                <div className="browser-eyebrow">dixVR WEB</div>
                <div className="browser-home-title">O que você quer explorar?</div>
                <div className="browser-tag">Pesquise na barra ou abra um favorito</div>
              </div>
              <div className="browser-home-mark aura-icon-wrap aura-browser"><AuraIcon name="browser" size={34} /></div>
            </div>
            <div className="browser-section-title">Favoritos</div>
            <div className="shortcut-grid">
              {SHORTCUTS.map((shortcut) => (
                <button key={shortcut.name} className="shortcut" onClick={() => navigate(shortcut.url)}>
                  <span className={`shortcut-icon aura-app-icon aura-${shortcut.tone}`}><AuraIcon name={shortcut.icon} size={27} /></span>
                  <span>{shortcut.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderYoutube = () => (
    <div className="win youtube-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-tv"><AuraIcon name="youtube" size={22} /></span>
          <div>
            <div className="win-title">YouTube</div>
            <div className="win-subtitle">Vídeos e música</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar YouTube" onClick={() => { setWin(null); setKbTarget(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="browser-bar yt-browser-bar">
        <div className="browser-searchbox yt-searchbox">
          <AuraIcon name="search" size={21} />
          <input className="addr-input" data-kb="yt" readOnly value={ytQuery} placeholder="Pesquisar no YouTube" onClick={() => setKbTarget('yt')} />
          <button className="browser-go icon-go" aria-label="Pesquisar no YouTube" onClick={() => setYtSrc(ytEmbed(ytQuery || 'música'))}><AuraIcon name="search" size={20} /></button>
        </div>
      </div>
      <div className="yt-chips">
        {YT_CHIPS.map((chip) => (
          <button key={chip} className="yt-chip" onClick={() => { setYtQuery(chip); setYtSrc(ytEmbed(chip)); afterUiChange(); }}>{chip}</button>
        ))}
      </div>
      <iframe className="yt-frame" src={ytSrc} title="YouTube" allow="autoplay; encrypted-media" />
    </div>
  );

  const renderSettings = () => (
    <div className="win settings-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-settings"><AuraIcon name="settings" size={23} /></span>
          <div>
            <div className="win-title">Ajustes rápidos</div>
            <div className="win-subtitle">Controles do dixVR</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar ajustes" onClick={() => { setWin(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="settings-list" data-scroll="" data-scroll-key="settings">
        <button className="setting-row" onClick={toggleSbs}>
          <span className="setting-icon aura-icon-wrap aura-browser"><AuraIcon name="headset" size={24} /></span>
          <span className="setting-copy"><strong>Cardboard 2015</strong><small>Mesma imagem duplicada nas duas lentes</small></span>
          <span className={`setting-toggle ${sbs ? 'on' : ''}`}><span /></span>
        </button>
        <button className="setting-row" onClick={toggleLock}>
          <span className="setting-icon aura-icon-wrap aura-settings"><AuraIcon name="lock" size={24} /></span>
          <span className="setting-copy"><strong>World Lock</strong><small>{worldLock ? 'Painel fixo no ambiente' : 'Painel acompanha o olhar suavemente'}</small></span>
          <span className={`setting-toggle ${worldLock ? 'on' : ''}`}><span /></span>
        </button>
        <button className="setting-row" onClick={cycleHand}>
          <span className="setting-icon aura-icon-wrap aura-gallery"><AuraIcon name="profile" size={24} /></span>
          <span className="setting-copy"><strong>Visual das mãos</strong><small>{handStyle === 'ghost' ? 'Aura Ghost' : handStyle === 'neon' ? 'Aura Neon' : 'Pontos'}</small></span>
          <span className="setting-action">Alterar</span>
        </button>
        <button className="setting-row" onClick={() => engineRef.current?.recenter()}>
          <span className="setting-icon aura-icon-wrap aura-clock"><AuraIcon name="recenter" size={24} /></span>
          <span className="setting-copy"><strong>Recentralizar painel</strong><small>Posicionar a janela à sua frente</small></span>
          <span className="setting-action">Recentralizar</span>
        </button>
      </div>
    </div>
  );

  const renderClock = () => (
    <div className="win clock-window">
      <div className="win-header" data-drag-handle="">
        <div className="win-heading">
          <span className="win-app-badge aura-icon-wrap aura-clock"><AuraIcon name="clock" size={23} /></span>
          <div>
            <div className="win-title">Relógio</div>
            <div className="win-subtitle">Horário local</div>
          </div>
        </div>
        <button className="win-close" aria-label="Fechar relógio" onClick={() => { setWin(null); afterUiChange(); }}><AuraIcon name="close" size={20} /></button>
      </div>
      <div className="clock-face">
        <div className="clock-glow"><AuraIcon name="clock" size={64} /></div>
        <strong>{clock}</strong>
        <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <small>dixVR · Cardboard 2015</small>
      </div>
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
    <div className="dock" aria-label="Dock dixVR">
      <button className="dock-avatar" title="Câmera / Início AR" onClick={() => openApp(APPS.find((app) => app.id === 'home-ar'))}>
        <AuraIcon name="atmoxr" size={23} />
      </button>
      <div className="dock-system-meta">
        <span className="dock-clock">{clock}</span>
        <span className="dock-status"><i className={sbs ? 'online' : 'offline'} />{sbs ? 'Cardboard 2015' : 'Modo plano'}</span>
      </div>
      <div className="dock-sep" />
      <div className="dock-apps" data-scroll="" data-scroll-key="dock">
        {DOCK_APPS.map((app) => (
          <button
            key={app.id}
            className={`dock-btn ${app.window && win === app.window ? 'active' : ''}`}
            title={app.label}
            aria-label={app.label}
            onClick={() => openDockApp(app)}
          >
            <span className={`dock-icon aura-app-icon aura-${app.tone}`}><AuraIcon name={app.icon} size={21} /></span>
          </button>
        ))}
      </div>
      <div className="dock-sep dock-sep-end" />
      <button className={`dock-launcher ${win === 'library' ? 'active' : ''}`} title="Biblioteca de apps" aria-label="Biblioteca de apps" onClick={() => toggleWin('library')}>
        <AuraIcon name="grid" size={22} />
      </button>
    </div>
  );

  const renderGroup = (eye) => (
    <div
      className={`window-group window-group-${eye.toLowerCase()}`}
      key={eye}
      ref={eye === 'L' ? panelLRef : panelRRef}
      aria-hidden={eye === 'R'}
      onScrollCapture={eye === 'L' ? (e) => syncScroll(e.target) : undefined}
    >
      {win === 'library' && renderLibrary()}
      {win === 'store' && renderStore()}
      {win === 'browser' && renderBrowser()}
      {win === 'youtube' && renderYoutube()}
      {win === 'settings' && renderSettings()}
      {win === 'clock' && renderClock()}
      {kbTarget && renderKeyboard()}
      <div className="move-handle" data-dock-handle="" title="Arraste para mover a dock"><span /></div>
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
      <div className="cardboard-optics" aria-hidden="true">
        <span className="cardboard-lens cardboard-lens-left" />
        <span className="cardboard-lens cardboard-lens-right" />
        <span className="cardboard-divider" />
      </div>

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
          <img className="start-logo" src="/logo.jpg" alt="dixVR" />
          <p>
            Mostre as mãos para a câmera e controle tudo com gestos: aponte para mirar,{' '}
            <strong>pinça rápida para escolher apps e opções</strong> (a bolinha fica azul);
            mantenha a pinça na barra branca para mover a dock. O modo Cardboard já entra ativado.
          </p>
          {startError && <p className="start-error">{startError}</p>}
          <button className="start-btn" disabled={starting}>
            {starting ? 'Abrindo a câmera…' : 'Entrar no dixVR'}
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
