// Ciel, lumière du soleil et de la lune, mer animée, étoiles, cycle jour/nuit.

import * as THREE from 'three';

const C = (h) => new THREE.Color(h);

// Palette du ciel selon l'heure : [heure, zénith, horizon, soleil, intensité soleil, ambiance]
const CLES = [
  [0, C(0x0b1530), C(0x1b2a4a), C(0x8090c0), 0.0, 0.25],
  [5, C(0x13203f), C(0x3a3d5c), C(0x8090c0), 0.0, 0.28],
  [6, C(0x4a6a9a), C(0xf2a76b), C(0xffb27a), 0.9, 0.45],
  [8, C(0x5b9bd5), C(0xcfe3ef), C(0xfff0d8), 2.4, 0.7],
  [13, C(0x3f8ad6), C(0xd8ecf6), C(0xfffaf0), 2.9, 0.8],
  [17.5, C(0x5a92cf), C(0xf0d9b5), C(0xffe2b0), 2.3, 0.7],
  [19.3, C(0x4a5a8f), C(0xf08a5a), C(0xff9050), 1.0, 0.5],
  [20.3, C(0x1d2850), C(0x6b4a6a), C(0x9080b0), 0.05, 0.32],
  [24, C(0x0b1530), C(0x1b2a4a), C(0x8090c0), 0.0, 0.25],
];

function echantillon(h) {
  for (let i = 0; i < CLES.length - 1; i++) {
    const [h0, z0, o0, s0, i0, a0] = CLES[i];
    const [h1, z1, o1, s1, i1, a1] = CLES[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return {
        zenith: z0.clone().lerp(z1, t), horizon: o0.clone().lerp(o1, t), soleil: s0.clone().lerp(s1, t),
        intensite: i0 + (i1 - i0) * t, ambiance: a0 + (a1 - a0) * t,
      };
    }
  }
  return echantillon(0);
}

// ---------- Pluie : des traits qui tombent autour de la caméra ----------
const NB_GOUTTES = 3200, BOITE = 70, HAUT = 55;
function creerPluie(scene) {
  const pos = new Float32Array(NB_GOUTTES * 6);
  const base = [];
  for (let i = 0; i < NB_GOUTTES; i++) base.push({ x: (Math.random() - 0.5) * 2 * BOITE, y: Math.random() * HAUT, z: (Math.random() - 0.5) * 2 * BOITE, v: 38 + Math.random() * 18 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xbcd0e0, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const lignes = new THREE.LineSegments(geo, mat);
  lignes.frustumCulled = false;
  lignes.visible = false;
  lignes.renderOrder = 5;
  scene.add(lignes);
  return { lignes, base, pos, geo, mat };
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.pluie = creerPluie(scene);
    this.dernierT = 0;
    this.cleSaison = '';
    this.terrain = null;
    this.vegetation = [];
    // Ciel : dôme avec dégradé
    this.skyUniforms = { zenith: { value: C(0x3f8ad6) }, horizon: { value: C(0xd8ecf6) } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vP;
          void main(){ float t = pow(clamp(vP.y*1.4+0.05,0.0,1.0), 0.6); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }`,
      })
    );
    sky.renderOrder = -1;
    scene.add(sky);
    this.sky = sky;

    // Étoiles
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      pts.push(Math.cos(th) * Math.sin(ph) * 800, Math.cos(ph) * 800, Math.sin(th) * Math.sin(ph) * 800);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // Lumières
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a5a, 0.7);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
    this.moon.position.set(-80, 120, 60);
    scene.add(this.moon);

    // Disque solaire
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
    scene.add(this.sunDisc);

    scene.fog = new THREE.Fog(0xd8ecf6, 220, 700);

    // Mer
    this.waterUniforms = { uTime: { value: 0 } };
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1c6e8c, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.86,
    });
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.waterUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWave;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float w = sin(wp.x*0.09 + uTime*0.9)*0.18 + sin(wp.z*0.12 + uTime*1.3)*0.14 + sin((wp.x+wp.z)*0.21 + uTime*1.9)*0.06;
          transformed.z += w; vWave = w;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec4 wpn = modelMatrix * vec4(position, 1.0);
          float dx = cos(wpn.x*0.09 + uTime*0.9)*0.18*0.09 + cos((wpn.x+wpn.z)*0.21 + uTime*1.9)*0.06*0.21;
          float dz = cos(wpn.z*0.12 + uTime*1.3)*0.14*0.12 + cos((wpn.x+wpn.z)*0.21 + uTime*1.9)*0.06*0.21;
          objectNormal = normalize(vec3(-dx*4.0, dz*4.0, 1.0));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWave;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb += vec3(0.05,0.09,0.1) * smoothstep(0.15, 0.35, vWave);');
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 160, 160), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.receiveShadow = true;
    scene.add(water);
    this.water = water;

    this.renderer = renderer;
    this.nuit = 0;
  }

  // Le terrain et la végétation à colorer selon la saison (appelé une fois, au chargement)
  brancher(terrain, vegetation) { this.terrain = terrain; this.vegetation = vegetation || []; }

  // Vert après la pluie, jaune à la saison sèche : une teinte, sans toucher aux couleurs de base.
  appliquerSaison(sec, verdure) {
    const cle = `${Math.round(sec * 40)}-${Math.round(verdure * 40)}`;
    if (cle === this.cleSaison) return;
    this.cleSaison = cle;
    const SEC = C(0xb59a58), LUXURIANT = C(0x6fbf4a);
    for (const { mat, base } of this.vegetation) mat.color.copy(base).lerp(SEC, 0.7 * sec).lerp(LUXURIANT, 0.28 * verdure);
    if (this.terrain) this.terrain.material.color.setRGB(1 + 0.14 * sec - 0.06 * verdure, 1 - 0.03 * sec + 0.05 * verdure, 1 - 0.24 * sec - 0.06 * verdure);
  }

  majPluie(intensite, temps, camera) {
    const P = this.pluie;
    const visible = intensite > 0.01;
    P.lignes.visible = visible;
    if (!visible) return;
    const dt = Math.min(0.1, Math.max(0, temps - this.dernierT));
    const cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
    const cy = camera ? Math.max(0, camera.position.y - 30) : 0;
    const n = Math.floor(NB_GOUTTES * (0.25 + 0.75 * intensite));
    for (let i = 0; i < NB_GOUTTES; i++) {
      const g = P.base[i];
      g.y -= g.v * dt;
      if (g.y < 0) g.y += HAUT;
      const j = i * 6;
      if (i >= n) { P.pos[j] = P.pos[j + 3] = P.pos[j + 1] = P.pos[j + 4] = P.pos[j + 2] = P.pos[j + 5] = 0; continue; }
      const x = cx + ((g.x + BOITE) % (2 * BOITE)) - BOITE, z = cz + ((g.z + BOITE) % (2 * BOITE)) - BOITE, y = cy + g.y;
      P.pos[j] = x; P.pos[j + 1] = y; P.pos[j + 2] = z;
      P.pos[j + 3] = x + 0.18; P.pos[j + 4] = y + 1.7; P.pos[j + 5] = z + 0.06;
    }
    P.geo.attributes.position.needsUpdate = true;
    P.mat.opacity = 0.42 * intensite;
  }

  update(heure, temps, meteo, camera = null) {
    const s = echantillon(heure);
    const m = typeof meteo === 'object' && meteo ? meteo : { tempete: meteo === 'tempete' };
    const pluie = m.intensitePluie ?? m.pluie ?? 0, chaud = m.chaleur || 0;
    // Trajectoire du soleil (lever 6h, coucher ~19h45)
    const jourT = (heure - 6) / 13.75;
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, jourT)));
    const azim = Math.PI * jourT;
    const dist = 300;
    const sp = new THREE.Vector3(Math.cos(azim) * dist, Math.max(0.05, elev) * dist * 0.9 + 15, -Math.sin(azim) * dist * 0.35 - 60);
    this.sun.position.copy(sp);
    this.sun.target.position.set(0, 0, 0);
    this.sunDisc.position.copy(sp.clone().normalize().multiplyScalar(820));
    this.sunDisc.visible = jourT > -0.02 && jourT < 1.02;
    this.sunDisc.material.color.copy(s.soleil).lerp(C(0xffffff), 0.3);

    // gris : l'orage et la pluie couvrent le ciel
    const orage = Math.max(m.tempete ? 1 : 0, pluie * 0.9);
    const jour = Math.min(1, Math.max(0, s.intensite / 0.9));
    const zen = s.zenith.clone().lerp(C(0x4a5560), orage * 0.6).lerp(C(0x7fa0c0), chaud * 0.22 * jour * (1 - orage));
    const hor = s.horizon.clone().lerp(C(0x8a9098), orage * 0.6).lerp(C(0xf2d9a0), chaud * 0.4 * jour * (1 - orage));
    this.skyUniforms.zenith.value.copy(zen);
    this.skyUniforms.horizon.value.copy(hor);
    this.scene.fog.color.copy(hor);
    // la brume de chaleur raccourcit un peu l'horizon
    this.scene.fog.near = orage ? 90 : 220 - 70 * chaud * jour;
    this.scene.fog.far = orage ? 380 : 700 - 190 * chaud * jour;

    this.sun.color.copy(s.soleil);
    this.sun.intensity = s.intensite * (orage ? 1 - 0.6 * orage : 1 + 0.1 * chaud);
    this.hemi.intensity = s.ambiance * (1 - 0.2 * orage);
    this.hemi.color.copy(hor).lerp(C(0xffffff), 0.4);
    this.nuit = 1 - Math.min(1, Math.max(0, s.intensite / 0.9));
    this.moon.intensity = this.nuit * 0.45;
    this.stars.material.opacity = Math.max(0, this.nuit - 0.3) * (1 - 0.9 * orage);
    this.waterUniforms.uTime.value = temps;
    this.water.material.color.set(0x1c6e8c).lerp(C(0x0a2236), this.nuit * 0.7).lerp(C(0x3a5560), orage * 0.5);
    this.appliquerSaison(m.seche || 0, m.verdure ?? 0.5);
    this.majPluie(pluie, temps, camera);
    this.dernierT = temps;
  }
}
