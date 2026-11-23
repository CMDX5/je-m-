// Relief procédural de l'île. Module pur (sans Three.js) : utilisé à la fois
// par le rendu 3D et par la simulation (navigation, placement des bâtiments).

export const WORLD = {
  half: 130, // demi-étendue de la carte (unités ≈ mètres)
  sea: 0, // niveau de la mer
  seed: 7,
};

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, seed = WORLD.seed, oct = 4) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, z * f, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// Rayon du rivage selon l'angle : côte découpée + baie du port au sud (+z).
function coastRadius(x, z) {
  const th = Math.atan2(z, x);
  let r = 96 + 9 * Math.sin(3 * th + 1.2) + 5 * Math.sin(5 * th + 0.4) + 7 * (fbm(x / 35, z / 35, 99, 3) - 0.5);
  // Baie du port (angle +PI/2 → sud de l'écran)
  let dth = th - Math.PI / 2;
  dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  r -= 30 * Math.exp(-(dth * dth) / 0.06);
  return r;
}

const heightCache = new Map();

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const R = coastRadius(x, z);
  const t = d / R;
  const land = 1 - smoothstep(0.82, 1.04, t);

  // Collines au nord (z négatif), plus douces au sud.
  const n = fbm(x / 42 + 10, z / 42 - 4, WORLD.seed, 5);
  const north = smoothstep(10, -70, z);
  let h = 2.2 + n * 5 + north * 13 * fbm(x / 28, z / 28, 3, 3);

  // Le cœur du village est un plateau doux.
  const vd = Math.hypot(x - 0, z - 5);
  const flat = Math.exp(-(vd * vd) / (2 * 34 * 34));
  h = h * (1 - flat * 0.85) + (2.6 + n * 0.8) * flat * 0.85;

  // Fond marin
  const seabed = -7 + 3 * fbm(x / 20, z / 20, 5, 2);
  return seabed + (h - seabed) * land;
}

// Version avec cache grossier pour les requêtes intensives de la navigation.
export function heightCached(x, z) {
  const key = (Math.round(x * 2) << 16) ^ Math.round(z * 2);
  let h = heightCache.get(key);
  if (h === undefined) {
    h = heightAt(x, z);
    heightCache.set(key, h);
  }
  return h;
}

export function isLand(x, z, margin = 0.35) {
  return heightAt(x, z) > WORLD.sea + margin;
}
