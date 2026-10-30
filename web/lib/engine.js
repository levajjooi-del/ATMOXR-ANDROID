import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { buildEnvironment, disposeGroup } from './environments';

/* ============================================================
   Engine VR do ATMOXR
   - Cena Three.js + painel DOM via CSS3DRenderer (um por olho)
   - SBS Cardboard 2015 (FOV 90, perfil IPD 64mm; imagem duplicada nos olhos)
   - Giroscópio suavizado na taxa da tela (nada de olhar "duro")
   - Painel desliza atrás do olhar com amortecimento (estilo Quest);
     World Lock congela o painel no mundo quando ligado.
   ============================================================ */

const PANEL_SCALE = 0.0028;   // 960px -> ~2,69m; escala grande conforme a referência
const PANEL_DIST = 1.75;      // metros à frente
const IPD = 0.064;            // Cardboard 2015
const FOV = 90;               // Cardboard 2015

export class Engine {
  constructor(mount, panelElL, panelElR, opts = {}) {
    this.opts = opts;
    this.mount = mount;
    this.sbs = false;
    this.cardboardProfile = Object.freeze({ fov: FOV, ipd: IPD });
    this.panelElL = panelElL;
    this.panelElR = panelElR;
    this.worldLock = false;
    this.paused = false;
    this._running = false;
    this.env = null;
    this._w = 1; this._h = 1;

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(3, 6, 2);
    this.scene.add(dir);

    // Rig da cabeça + câmeras dos olhos
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.camL = new THREE.PerspectiveCamera(FOV, 1, 0.05, 250);
    this.camR = new THREE.PerspectiveCamera(FOV, 1, 0.05, 250);
    this.rig.add(this.camL, this.camR);

    // Painel (o MESMO conteúdo é renderizado pelo React nos dois elementos)
    this.panelRig = new THREE.Group();
    this.scene.add(this.panelRig);
    this.panelObjL = new CSS3DObject(panelElL);
    this.panelObjR = new CSS3DObject(panelElR);
    this.panelObjL.scale.setScalar(PANEL_SCALE);
    this.panelObjR.scale.setScalar(PANEL_SCALE);
    this.panelRig.add(this.panelObjL, this.panelObjR);
    this.panelPos = new THREE.Vector3(0, -0.05, -PANEL_DIST);
    this.drag = { x: 0, y: 0 };
    this.dockDrag = { x: 0, y: 0 };

    // Renderizadores
    this.gl = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' });
    this.gl.setClearColor(0x000000, 0);
    Object.assign(this.gl.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    mount.appendChild(this.gl.domElement);

    this.cssL = new CSS3DRenderer();
    this.cssR = new CSS3DRenderer();
    Object.assign(this.cssL.domElement.style, { position: 'absolute', top: '0', left: '0', overflow: 'hidden', pointerEvents: 'auto' });
    Object.assign(this.cssR.domElement.style, { position: 'absolute', top: '0', left: '50%', overflow: 'hidden', pointerEvents: 'none', display: 'none' });
    mount.appendChild(this.cssL.domElement);
    mount.appendChild(this.cssR.domElement);

    // Giroscópio
    this.headQuat = new THREE.Quaternion();
    this.targetQuat = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    this._q0 = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._zee = new THREE.Vector3(0, 0, 1);
    this._onOrient = (e) => this._handleOrient(e);
    window.addEventListener('deviceorientation', this._onOrient);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    // Temporários (sem alocar por frame)
    this._tmpP = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpR = new THREE.Vector3();
    this._tmpU = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._dummy = new THREE.Object3D();

    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);

    this.resize();
    this.recenter();
  }

  _handleOrient(e) {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    const alpha = THREE.MathUtils.degToRad(e.alpha || 0);
    const beta = THREE.MathUtils.degToRad(e.beta || 0);
    const gamma = THREE.MathUtils.degToRad(e.gamma || 0);
    const orientDeg = (window.screen && window.screen.orientation && window.screen.orientation.angle) ?? window.orientation ?? 0;
    const orient = THREE.MathUtils.degToRad(orientDeg || 0);

    this._euler.set(beta, alpha, -gamma, 'YXZ');
    this.targetQuat.setFromEuler(this._euler);
    this.targetQuat.multiply(this._q1);
    this.targetQuat.multiply(this._q0.setFromAxisAngle(this._zee, -orient));

    // Durante o ShootTheDie o loop de render pausa; o jogo recebe o
    // giroscópio direto daqui (mesma ponte do launcher antigo).
    if (this.opts.onGyro) {
      const q = this.targetQuat;
      this.opts.onGyro({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    requestAnimationFrame(this._loop);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.paused) this._clock.getDelta(); // descarta o salto de tempo
  }

  setSBS(v) {
    this.sbs = !!v;
    // Preferência visual do ATMOXR: duplicar a mesma imagem nos dois olhos.
    // O perfil Cardboard 2015 (FOV 90°, IPD 64 mm) continua registrado, mas
    // a separação física fica zerada para que as lentes sejam idênticas.
    this.camL.position.set(0, 0, 0);
    this.camR.position.set(0, 0, 0);
    this.cssR.domElement.style.display = this.sbs ? 'block' : 'none';
    this.resize();
  }

  setWorldLock(v) { this.worldLock = !!v; }

  resize() {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this._w = w; this._h = h;
    const eyeW = this.sbs ? Math.floor(w / 2) : w;
    this.gl.setSize(w, h, false);
    this.gl.domElement.style.width = '100%';
    this.gl.domElement.style.height = '100%';
    this.cssL.setSize(eyeW, h);
    this.cssR.setSize(eyeW, h);
    this.camL.aspect = eyeW / h;
    this.camR.aspect = eyeW / h;
    this.camL.updateProjectionMatrix();
    this.camR.updateProjectionMatrix();
  }

  _desired(outPos, outQuat) {
    this._fwd.set(0, 0, -1).applyQuaternion(this.headQuat);
    outPos.copy(this._fwd).multiplyScalar(PANEL_DIST);
    // Menos viagem vertical: painel não some p/ cima/baixo
    outPos.y = this._fwd.y * PANEL_DIST * 0.55 - 0.05;
    this._dummy.position.copy(outPos);
    this._dummy.lookAt(0, outPos.y, 0); // yaw apenas (sempre "em pé")
    outQuat.copy(this._dummy.quaternion);
  }

  recenter() {
    this._desired(this._tmpP, this._tmpQ);
    this.panelPos.copy(this._tmpP);
    this.panelRig.quaternion.copy(this._tmpQ);
    this.drag.x = 0; this.drag.y = 0;
    this._applyPanel();
  }

  addPanelDrag(dxPx, dyPx) {
    this.drag.x = THREE.MathUtils.clamp(this.drag.x + dxPx * PANEL_SCALE, -0.9, 0.9);
    this.drag.y = THREE.MathUtils.clamp(this.drag.y - dyPx * PANEL_SCALE, -0.6, 0.6);
    this._applyPanel();
  }

  addDockDrag(dxPx, dyPx) {
    // CSS3D reduz o deslocamento aparente; compensamos a escala do painel
    // para a barra branca acompanhar a pinça em pixels de tela.
    this.dockDrag.x = THREE.MathUtils.clamp(this.dockDrag.x + dxPx * 2.2, -220, 220);
    this.dockDrag.y = THREE.MathUtils.clamp(this.dockDrag.y - dyPx * 2.2, -130, 130);
    this._applyDockDrag();
  }

  _applyDockDrag() {
    const x = `${this.dockDrag.x}px`;
    const y = `${this.dockDrag.y}px`;
    for (const panel of [this.panelElL, this.panelElR]) {
      if (!panel) continue;
      panel.style.setProperty('--dock-offset-x', x);
      panel.style.setProperty('--dock-offset-y', y);
    }
  }

  _applyPanel() {
    this._tmpR.set(1, 0, 0).applyQuaternion(this.panelRig.quaternion);
    this._tmpU.set(0, 1, 0).applyQuaternion(this.panelRig.quaternion);
    this.panelRig.position.copy(this.panelPos)
      .addScaledVector(this._tmpR, this.drag.x)
      .addScaledVector(this._tmpU, this.drag.y);
  }

  setEnvironment(name) {
    if (this.env) {
      this.scene.remove(this.env.group);
      disposeGroup(this.env.group);
      this.env = null;
      this.scene.fog = null;
    }
    if (name) {
      const env = buildEnvironment(name);
      if (env) {
        this.env = env;
        this.scene.add(env.group);
        if (env.fog) this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
      }
    }
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    if (this.paused) return;

    const dt = Math.min(this._clock.getDelta(), 0.05);
    const t = this._clock.elapsedTime;

    // Cabeça: suavização na taxa da tela (fim do olhar "duro"/travado)
    this.headQuat.slerp(this.targetQuat, 1 - Math.exp(-dt * 22));
    this.rig.quaternion.copy(this.headQuat);

    // Painel desliza atrás do olhar (a menos que travado no mundo)
    if (!this.worldLock) {
      this._desired(this._tmpP, this._tmpQ);
      this.panelPos.lerp(this._tmpP, 1 - Math.exp(-dt * 5.5));
      this.panelRig.quaternion.slerp(this._tmpQ, 1 - Math.exp(-dt * 6));
      this._applyPanel();
    }

    if (this.env && this.env.update) this.env.update(dt, t);

    this.scene.updateMatrixWorld();
    const w = this._w, h = this._h;

    if (this.sbs) {
      const ew = Math.floor(w / 2);
      this.gl.setScissorTest(true);

      this.panelObjL.visible = true; this.panelObjR.visible = false;
      this.gl.setViewport(0, 0, ew, h); this.gl.setScissor(0, 0, ew, h);
      this.gl.render(this.scene, this.camL);
      this.cssL.render(this.scene, this.camL);

      this.panelObjL.visible = false; this.panelObjR.visible = true;
      this.gl.setViewport(ew, 0, ew, h); this.gl.setScissor(ew, 0, ew, h);
      this.gl.render(this.scene, this.camR);
      this.cssR.render(this.scene, this.camR);

      this.gl.setScissorTest(false);
      this.panelObjL.visible = true;
    } else {
      this.panelObjL.visible = true; this.panelObjR.visible = false;
      this.gl.setViewport(0, 0, w, h);
      this.gl.render(this.scene, this.camL);
      this.cssL.render(this.scene, this.camL);
    }
  }

  destroy() {
    this._running = false;
    window.removeEventListener('deviceorientation', this._onOrient);
    window.removeEventListener('resize', this._onResize);
    if (this.env) disposeGroup(this.env.group);
    this.gl.dispose();
  }
}
