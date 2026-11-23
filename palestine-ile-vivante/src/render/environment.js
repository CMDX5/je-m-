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

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
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

  update(heure, temps, meteo) {
    const s = echantillon(heure);
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

    let orage = meteo === 'tempete' ? 1 : 0;
    const zen = s.zenith.clone().lerp(C(0x4a5560), orage * 0.6);
    const hor = s.horizon.clone().lerp(C(0x8a9098), orage * 0.6);
    this.skyUniforms.zenith.value.copy(zen);
    this.skyUniforms.horizon.value.copy(hor);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = orage ? 90 : 220;
    this.scene.fog.far = orage ? 380 : 700;

    this.sun.color.copy(s.soleil);
    this.sun.intensity = s.intensite * (orage ? 0.4 : 1);
    this.hemi.intensity = s.ambiance * (orage ? 0.8 : 1);
    this.hemi.color.copy(hor).lerp(C(0xffffff), 0.4);
    this.nuit = 1 - Math.min(1, Math.max(0, s.intensite / 0.9));
    this.moon.intensity = this.nuit * 0.45;
    this.stars.material.opacity = Math.max(0, this.nuit - 0.3) * (orage ? 0.1 : 1);
    this.waterUniforms.uTime.value = temps;
    this.water.material.color.set(0x1c6e8c).lerp(C(0x0a2236), this.nuit * 0.7).lerp(C(0x3a5560), orage * 0.5);
  }
}
