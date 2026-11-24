// Synchronisation avec le relais de nuit (côté page).
// La page reste le maître du village tant qu'elle est ouverte ; quand elle part, le serveur prend le relais
// (api/veille) avec les clés que le joueur a choisi de lui confier, puis lui rend un village plus vieux à son retour.

const CLE_CODE = 'ile-vivante:code';
const CLE_VEILLE = 'ile-vivante:veille';
const CLE_PARTIE = 'ile-vivante:partie';

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

export async function compresser(texte) {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

const identifiant = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function dureeFrancaise(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (m < 1440) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const j = Math.floor(m / 1440), reste = Math.floor((m % 1440) / 60);
  return `${j} jour${j > 1 ? 's' : ''}${reste ? ` et ${reste} h` : ''}`;
}

export class Relais {
  constructor() {
    this.code = lire(CLE_CODE) || '';
    this.veille = lire(CLE_VEILLE) === 'oui';
    this.partie = lire(CLE_PARTIE) || '';
    this.client = identifiant(); // propre à cette page ouverte
    this.statut = null; // dernier état connu du serveur (sans les clés)
    this.statutA = 0;
    this.bloque = false; // une autre page tient le village : celle-ci ne synchronise pas
    this.partieEnLigne = false;
  }

  get actif() { return this.code.length >= 8; }

  definirCode(code) { this.code = code; ecrire(CLE_CODE, code || null); }
  definirVeille(oui) { this.veille = oui; ecrire(CLE_VEILLE, oui ? 'oui' : null); }
  nouvellePartie() { this.partie = identifiant(); ecrire(CLE_PARTIE, this.partie); return this.partie; }
  adopterPartie(id) { if (id) { this.partie = id; ecrire(CLE_PARTIE, id); } }

  async appeler(action, { reglages = {}, corps = null, keepalive = false, delaiMs = 8000 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), delaiMs);
    try {
      const r = await fetch('api/etat', {
        method: 'POST', signal: ctl.signal, keepalive,
        headers: { 'x-code': this.code, 'x-action': action, 'x-client': this.client, 'x-reglages': JSON.stringify(reglages), ...(corps ? { 'content-type': 'application/octet-stream' } : {}) },
        body: corps,
      });
      const json = await r.json().catch(() => ({}));
      if (r.ok && action !== 'deposer') { this.statut = json; this.statutA = Date.now(); }
      return { status: r.status, json };
    } catch {
      return { status: 0, json: {} };
    } finally { clearTimeout(t); }
  }

  // Au démarrage et au retour : prend la main et dit si le serveur a un village plus avancé que celui de la page.
  async prendre({ force = false } = {}) {
    const r = await this.appeler('prendre', { reglages: { force } });
    if (r.status === 409) { this.bloque = true; return { bloque: true, ...r.json }; }
    if (r.status === 200) this.bloque = false;
    return { statut: r.status, ...r.json };
  }

  // Dépose l'état de la page. `liberer` : la page s'en va, le relais peut prendre le relais.
  async deposer(sim, { liberer = false, cles = null, heures = 10, keepalive = false } = {}) {
    if (this.bloque || !this.actif) return { status: 0, json: {} };
    if (!this.partie) this.nouvellePartie();
    const gz = await compresser(sim.serialiser());
    const reglages = { idPartie: this.partie, liberer, veille: this.veille, heures, ...(this.veille && cles ? { cles } : {}) };
    return this.appeler('deposer', { reglages, corps: gz, keepalive: keepalive && gz.length < 60000, delaiMs: keepalive ? 6000 : 20000 });
  }

  async reglages(reglages) { return this.appeler('reglages', { reglages }); }
  async rafraichir(maxAgeMs = 30000) { if (this.actif && Date.now() - this.statutA > maxAgeMs) await this.appeler('statut'); return this.statut; }
}
