import * as THREE from 'three';

/* Ambientes 3D procedurais (low-poly, leves).
   Convenção: a câmera fica na origem (olho do usuário), então o
   "chão" de cada ambiente fica em y = -1.6. */

const std = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...opts });

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, opts));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 12, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), std(color, opts));
  m.position.set(x, y, z);
  return m;
}
function sph(r, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), std(color, opts));
  m.position.set(x, y, z);
  return m;
}
function plane(w, h, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(color, opts));
  m.position.set(x, y, z);
  return m;
}
function sky(color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(85, 18, 12),
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  );
}

/* ---------------- Ilha tropical ---------------- */
function palm(x, z, tilt = 0.16, rotY = 0) {
  const g = new THREE.Group();
  const trunk = cyl(0.09, 0.14, 2.6, 0x8a5a33, 0, 1.3, 0, 7);
  trunk.rotation.z = tilt;
  g.add(trunk);
  const topX = -Math.sin(tilt) * 2.6;
  for (let i = 0; i < 6; i++) {
    const leaf = box(1.7, 0.04, 0.34, 0x2f9e44, topX, 2.62, 0);
    leaf.geometry.translate(0.85, 0, 0);
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.rotation.z = -0.5;
    g.add(leaf);
  }
  g.add(sph(0.11, 0x6b4226, topX + 0.12, 2.45, 0.08));
  g.add(sph(0.11, 0x6b4226, topX - 0.1, 2.42, -0.1));
  g.position.set(x, -1.6, z);
  g.rotation.y = rotY;
  return g;
}

function buildIlha() {
  const g = new THREE.Group();
  g.add(sky(0x7ec8f7));

  const water = cyl(80, 80, 0.1, 0x1593d6, 0, -1.98, 0, 40, { roughness: 0.55 });
  g.add(water);

  // Ilha de areia (topo em y=-1.6)
  g.add(cyl(8.5, 10.5, 0.9, 0xeed9a0, 0, -2.05, 0, 28));
  g.add(cyl(6.2, 6.8, 0.35, 0xf4e3ae, 0, -1.75, 0, 28));
  // Gramado central
  g.add(cyl(3.4, 3.8, 0.22, 0x58b368, 0, -1.68, 0, 24));

  g.add(palm(2.6, -2.2, 0.18, 0.6));
  g.add(palm(-3.1, -1.4, 0.22, 2.4));
  g.add(palm(-1.8, 2.8, 0.13, 4.2));
  g.add(palm(3.4, 1.8, 0.26, 5.3));

  const rockGeo = new THREE.DodecahedronGeometry(0.4);
  [[4.6, -0.6], [-4.9, 1.2], [1.2, 4.9], [-2.4, -4.6]].forEach(([x, z], i) => {
    const r = new THREE.Mesh(rockGeo, std(0x8d949c));
    r.position.set(x, -1.45, z);
    r.rotation.set(i, i * 2, i * 0.7);
    r.scale.setScalar(0.8 + i * 0.22);
    g.add(r);
  });

  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [[0, 0, 0, 1.5], [1.4, -0.2, 0.3, 1], [-1.3, -0.25, -0.2, 0.9]].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cm);
      s.position.set(x, y, z);
      s.scale.y = 0.55;
      c.add(s);
    });
    const a = (i / 6) * Math.PI * 2;
    c.position.set(Math.cos(a) * 34, 8 + (i % 3) * 2.4, Math.sin(a) * 34);
    clouds.push(c);
    g.add(c);
  }

  return {
    group: g,
    update(dt, t) {
      water.position.y = -1.98 + Math.sin(t * 0.8) * 0.045;
      for (const c of clouds) {
        c.position.x += dt * 0.35;
        if (c.position.x > 48) c.position.x = -48;
      }
    },
  };
}

/* ---------------- Dreamcore ---------------- */
function buildDreamcore() {
  const g = new THREE.Group();
  g.add(sky(0xffd9ec));

  const ground = plane(90, 90, 0xfce7f3, 0, -1.6, 0);
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);

  const floaters = [];
  const pastels = [0xf9a8d4, 0xa5b4fc, 0x93c5fd, 0xfde68a, 0x86efac, 0xfbcfe8];
  const addFloater = (mesh, speed = 0.6) => {
    mesh.userData.baseY = mesh.position.y;
    mesh.userData.speed = speed;
    floaters.push(mesh);
    g.add(mesh);
  };

  const torus = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.42, 12, 28), std(0xa78bfa));
  torus.position.set(0, 1.6, -7);
  addFloater(torus, 0.4);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.3;
    const r = 5 + (i % 4) * 1.7;
    const kind = i % 3;
    let m;
    if (kind === 0) m = sph(0.45 + (i % 3) * 0.16, pastels[i % pastels.length]);
    else if (kind === 1) m = box(0.8, 0.8, 0.8, pastels[i % pastels.length]);
    else m = cyl(0.34, 0.34, 0.9, pastels[i % pastels.length], 0, 0, 0, 14);
    m.position.set(Math.cos(a) * r, -0.4 + (i % 5) * 0.55, Math.sin(a) * r);
    m.rotation.set(i * 0.4, i * 0.7, 0);
    addFloater(m, 0.5 + (i % 4) * 0.18);
  }

  // Escada para o nada
  for (let i = 0; i < 6; i++) {
    g.add(box(1.4, 0.22, 0.6, 0xffffff, 3.6, -1.5 + i * 0.42, -3.5 + i * 0.55));
  }
  // Porta flutuante
  const door = new THREE.Group();
  door.add(box(0.16, 2.4, 0.16, 0xffffff, -0.65, 0, 0));
  door.add(box(0.16, 2.4, 0.16, 0xffffff, 0.65, 0, 0));
  door.add(box(1.46, 0.16, 0.16, 0xffffff, 0, 1.2, 0));
  const glow = plane(1.14, 2.3, 0xfff7cc, 0, 0, -0.04, {
    emissive: 0xffe9a3, emissiveIntensity: 0.9,
  });
  door.add(glow);
  door.position.set(-4.4, -0.1, -4.6);
  door.rotation.y = 0.7;
  g.add(door);

  // Janelas flutuantes
  [[-5.5, 0.6, 2.5, 1.2], [5.8, 1.1, 3.4, -0.8], [4.8, 0.2, -5.6, 2.6]].forEach(([x, y, z, ry]) => {
    const w = new THREE.Group();
    w.add(box(1.3, 1.3, 0.08, 0xffffff, 0, 0, 0));
    w.add(plane(1.06, 1.06, 0xbfe3ff, 0, 0, 0.05, { emissive: 0x9fd3ff, emissiveIntensity: 0.65 }));
    w.position.set(x, y, z);
    w.rotation.y = ry;
    addFloater(w, 0.45);
  });

  return {
    group: g,
    fog: { color: 0xffd9ec, near: 9, far: 48 },
    update(dt, t) {
      torus.rotation.z += dt * 0.25;
      torus.rotation.x = Math.sin(t * 0.3) * 0.3;
      for (const f of floaters) {
        f.position.y = f.userData.baseY + Math.sin(t * f.userData.speed + f.position.x) * 0.16;
      }
    },
  };
}

/* ---------------- Cozinha ---------------- */
function buildCozinha() {
  const g = new THREE.Group();
  const FLOOR = -1.6;

  const floor = plane(11, 11, 0xb9c0cc, 0, FLOOR, 0);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  // Tapete
  const rug = plane(2.6, 1.6, 0xc0563f, 0, FLOOR + 0.01, 0.4);
  rug.rotation.x = -Math.PI / 2;
  g.add(rug);

  // Paredes (quarto de 8m, porta aberta atrás)
  g.add(box(8, 3.4, 0.15, 0xe9e3d5, 0, 0.1, -3.4));   // fundo
  g.add(box(0.15, 3.4, 7, 0xe9e3d5, -3.6, 0.1, 0));   // esquerda
  g.add(box(0.15, 3.4, 7, 0xded4c2, 3.6, 0.1, 0));    // direita
  g.add(box(8, 0.15, 7.2, 0xf2ede1, 0, 1.85, 0));     // teto

  // Bancada + armários
  g.add(box(5.6, 0.92, 0.72, 0x7a4a26, -0.4, FLOOR + 0.46, -2.95));
  g.add(box(5.8, 0.08, 0.84, 0x3f3a34, -0.4, FLOOR + 0.96, -2.95));
  for (let i = 0; i < 4; i++) {
    g.add(box(1.2, 0.78, 0.4, 0x8a5a33, -2.5 + i * 1.4, 0.95, -3.1));
  }
  // Fogão (cooktop + bocas)
  g.add(box(0.85, 0.05, 0.6, 0x15151a, -1.6, FLOOR + 1.02, -2.95, { roughness: 0.4 }));
  [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]].forEach(([dx, dz]) => {
    g.add(cyl(0.1, 0.1, 0.02, 0x2c2c33, -1.6 + dx, FLOOR + 1.05, -2.95 + dz, 16));
  });
  // Panela
  g.add(cyl(0.17, 0.15, 0.16, 0xb9c2cc, -1.4, FLOOR + 1.13, -2.95, 18, { metalness: 0.55, roughness: 0.35 }));
  // Pia + torneira
  g.add(box(0.8, 0.1, 0.55, 0x9aa5b1, 0.7, FLOOR + 0.97, -2.95, { metalness: 0.4, roughness: 0.4 }));
  g.add(cyl(0.03, 0.03, 0.34, 0xc7d0da, 0.7, FLOOR + 1.2, -3.2, 10, { metalness: 0.6, roughness: 0.3 }));

  // Geladeira
  g.add(box(0.95, 2.0, 0.8, 0xd4dbe0, 2.9, FLOOR + 1.0, -2.9, { roughness: 0.5 }));
  g.add(box(0.05, 0.5, 0.05, 0x8d99a5, 2.5, FLOOR + 1.35, -2.48));

  // Mesa + cadeiras
  const table = new THREE.Group();
  table.add(box(1.7, 0.07, 0.95, 0x9a6735, 0, 0.72, 0));
  [[-0.75, -0.38], [0.75, -0.38], [-0.75, 0.38], [0.75, 0.38]].forEach(([x, z]) => {
    table.add(cyl(0.035, 0.035, 0.72, 0x5f3c1c, x, 0.36, z, 8));
  });
  table.position.set(0.3, FLOOR, 0.6);
  g.add(table);
  const chair = (x, z, ry) => {
    const c = new THREE.Group();
    c.add(box(0.45, 0.05, 0.45, 0x9a6735, 0, 0.46, 0));
    c.add(box(0.45, 0.55, 0.05, 0x9a6735, 0, 0.76, -0.2));
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => {
      c.add(cyl(0.025, 0.025, 0.46, 0x5f3c1c, lx, 0.23, lz, 8));
    });
    c.position.set(x, FLOOR, z);
    c.rotation.y = ry;
    return c;
  };
  g.add(chair(0.3, 1.55, Math.PI));
  g.add(chair(0.3, -0.35, 0));
  // Fruteira na mesa
  g.add(cyl(0.3, 0.16, 0.12, 0xd97706, 0.3, FLOOR + 0.82, 0.6, 14));
  g.add(sph(0.08, 0xef4444, 0.18, FLOOR + 0.92, 0.52));
  g.add(sph(0.08, 0xf59e0b, 0.42, FLOOR + 0.92, 0.66));
  g.add(sph(0.08, 0x84cc16, 0.3, FLOOR + 0.98, 0.6));

  // Janela com luz do dia (parede esquerda)
  const win = new THREE.Group();
  win.add(box(1.5, 1.2, 0.08, 0xffffff));
  win.add(plane(1.3, 1.0, 0xbfe3ff, 0, 0, 0.05, { emissive: 0xa5d8ff, emissiveIntensity: 0.8 }));
  win.position.set(-3.5, 0.45, -1.2);
  win.rotation.y = Math.PI / 2;
  g.add(win);

  // Luminária
  g.add(cyl(0.02, 0.02, 0.3, 0x555560, 0.3, 1.66, 0.6, 8));
  g.add(sph(0.17, 0xfff2c4, 0.3, 1.45, 0.6, { emissive: 0xffdf8a, emissiveIntensity: 1.4 }));

  return { group: g, update: null };
}

/* ---------------- API ---------------- */
export function buildEnvironment(name) {
  switch (name) {
    case 'ilha': return buildIlha();
    case 'dreamcore': return buildDreamcore();
    case 'cozinha': return buildCozinha();
    default: return null;
  }
}

export function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
    }
  });
}
