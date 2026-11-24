// Interface du conseil : ressources, onglets, fiche habitant, notifications.
// Le joueur observe, parle, aide, finance, tranche. Il ne commande personne :
// ce que pense et fait chaque habitant vient de lui.

import { METIERS, METIERS_ADULTES, PROJETS, NOMS_OBJETS } from '../sim/data.js';
import { nomComplet, libelleMetier } from '../sim/villager.js';
import { moisDepuis, depuis } from '../sim/vie.js';
import { NOMS_SAISON, dateDuVillage } from '../sim/saison.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Une clé Google commence par « AIza » ; sinon, c'est une clé Groq.
const fournisseurDeCle = (cle) => (/^AIza/.test(cle) ? 'gemini' : 'groq');
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const $ = (s) => document.querySelector(s);
const arrondi = (x) => Math.round(x * 10) / 10;

const TONS = { chaleureux: 'chaleureux', tendu: 'tendu', colere: 'en colère', triste: 'triste', joyeux: 'joyeux' };

function barre(val, max = 100, neutre = false) {
  const p = Math.max(0, Math.min(100, (val / max) * 100));
  const cls = neutre ? 'neutre' : p < 30 ? 'bas' : p < 55 ? 'moyen' : '';
  return `<div class="barre ${cls}"><i style="width:${p.toFixed(0)}%"></i></div>`;
}

export class Interface {
  constructor(sim, actions) {
    this.sim = sim;
    this.actions = actions; // { selectionner, suivre, vitesse, voir, sauvegarder, charger, recommencer }
    this.onglet = 'village';
    this.selection = null;
    this.filtre = { texte: '', metier: '', tri: 'nom' };
    this.dernierRendu = 0;
    this.penseur = null;
    this.nbRequetesVues = 0;

    document.querySelectorAll('#onglets button').forEach((b) => b.addEventListener('click', () => this.changerOnglet(b.dataset.onglet)));
    document.querySelectorAll('#nav-mobile button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.ongletM) { this.changerOnglet(b.dataset.ongletM); this.vue('panneau'); }
      else this.vue(b.dataset.vue);
    }));
    document.querySelectorAll('#vitesses button').forEach((b) => b.addEventListener('click', () => this.actions.vitesse(Number(b.dataset.v))));
    $('#contenu').addEventListener('click', (e) => this.clicContenu(e));
    $('#contenu').addEventListener('input', (e) => this.saisieContenu(e));
    $('#contenu').addEventListener('change', (e) => this.saisieContenu(e));
    $('#contenu').addEventListener('submit', (e) => this.envoiContenu(e));
    $('#fiche').addEventListener('click', (e) => this.clicFiche(e));
    $('#fiche').addEventListener('change', (e) => {
      if (e.target.id === 'choix-metier' && e.target.value) {
        this.sim.confierMetier(this.selection, e.target.value);
        this.rendreFiche(true);
      }
    });
    $('#fiche').addEventListener('submit', (e) => {
      e.preventDefault();
      const champ = $('#parole');
      const msg = champ?.value.trim();
      if (!msg) return;
      champ.value = '';
      this.sim.dire(this.selection, msg);
      this.rendreFiche(true);
    });

    sim.on('requete', (r) => { this.toast(`${sim.habitant(r.de).prenom} s'adresse au conseil : « ${r.texte.slice(0, 90)} »`, 'conseil'); this.majBadges(); });
    sim.on('deces', (v) => this.toast(`${nomComplet(v)} est mort${v.genre === 'F' ? 'e' : ''} ${v.mort.cause}.`, 'mal'));
    sim.on('naissance', (v) => this.toast(`${nomComplet(v)} est né${v.genre === 'F' ? 'e' : ''}.`, 'bien'));
    sim.on('journal', (e) => { if (e.type === 'evenement' || /Chantier terminé|a été vu/.test(e.texte)) this.toast(e.texte, e.type); });
    this.majBadges();
    this.rendreContenu();
  }

  toast(texte, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = texte;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 5500);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }

  tick(maintenant, vitesse, enPause) {
    this.majBarre(vitesse, enPause);
    if (maintenant - this.dernierRendu > 900) {
      this.dernierRendu = maintenant;
      if (!this.interactionEnCours()) this.rendreContenu();
      this.rendreFiche();
    }
  }

  interactionEnCours() {
    const a = document.activeElement;
    return a && $('#contenu').contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
  }

  majBarre(vitesse, enPause) {
    const s = this.sim;
    const h = s.heure();
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const phase = h >= 5.5 && h < 7 ? 'aube' : h >= 7 && h < 18.5 ? 'jour' : h >= 18.5 && h < 20.5 ? 'crépuscule' : 'nuit';
    $('#horloge').textContent = `Jour ${s.jour} · ${hh}h${String(mm).padStart(2, '0')} · ${phase}`;
    const dateEl = $('#date-village');
    if (dateEl) dateEl.textContent = dateDuVillage(s.temps).texte;
    const m = [];
    const E = s.etatSaison;
    m.push({ pluie: '🌧 Pluie', beau: '☀ Beau temps', chaleur: '🔥 Chaleur', seche: '🏜 Saison sèche' }[E.nom]);
    if (s.meteo.tempete > s.temps) m.push('Tempête');
    if (s.meteo.secheresse > s.temps) m.push('Vague de chaleur');
    if (s.navire) m.push('Navire au port');
    $('#meteo').textContent = m.join(' · ');
    document.querySelectorAll('#vitesses button').forEach((b) => b.classList.toggle('actif', Number(b.dataset.v) === vitesse));
    const pieces = (x) => Math.floor(x);
    $('#ressources').innerHTML = [
      ['Caisse', pieces(s.res.pieces), '#e6b450', s.joursDeCaisse() === null ? 'Pièces du conseil : paient les salaires' : `Pièces du conseil : ${s.joursDeCaisse().toFixed(1)} jour(s) de salaires`],
      ['Marché', pieces(s.res.nourriture), '#8fb85a', 'Rations à vendre'],
      ['Maisons', pieces(s.nourritureFoyers()), '#6f9a45', 'Rations dans les maisons'],
      ['Huile', pieces(s.res.huile), '#c9b04a', ''], ['Pierre', pieces(s.res.pierre), '#c8bba3', ''], ['Bois', pieces(s.res.bois), '#9c7a52', ''], ['Remèdes', pieces(s.res.remedes), '#7ac0b0', ''],
    ].map(([n, v, c, t]) => `<span class="res" title="${t}"><i class="ico" style="background:${c}"></i>${n} <b>${v}</b></span>`).join('');
    const humeur = s.moyenne('humeur');
    $('#jauges').innerHTML = `<span class="jauge" title="Humeur moyenne, telle que les habitants la déclarent eux-mêmes">Humeur ${barre(humeur)} ${Math.round(humeur)}</span>`;

    // bandeau d'état de la pensée
    const b = $('#bandeau');
    const p = this.penseur;
    let html = '', cls = '';
    if (p?.mode === 'claude') {
      const n = s.demandes().length;
      if (!p.pret) html = 'Connexion à Claude…';
      else if (!p.disponible) { cls = 'alerte'; html = `<b>Les habitants ne peuvent pas penser.</b> ${esc(p.derniereErreur)}`; }
      else if (p.actifs) html = `⏳ ${p.groupe.length} habitant${p.groupe.length > 1 ? 's' : ''} réfléchi${p.groupe.length > 1 ? 'ssent' : 't'} avec Claude…`;
      else if (n) {
        cls = enPause ? 'attente' : '';
        html = `<span>${enPause ? 'Le temps attend : ' : ''}${n} habitant${n > 1 ? 's' : ''} doi${n > 1 ? 'vent' : 't'} décider.</span><button class="btn principal" data-reflechir type="button">Laisser réfléchir</button>${p.derniereErreur ? `<small>${esc(p.derniereErreur)}</small>` : ''}`;
      } else if (p.derniereErreur) html = esc(p.derniereErreur);
    } else if (p?.mode === 'groq') {
      if (!p.pret) html = 'Connexion aux modèles…';
      else if (!p.disponible && !p.cle) {
        cls = 'alerte';
        html = `<form data-cle-groq><b>Pour que les habitants pensent seuls, il faut une clé gratuite : Groq ou Google Gemini (les deux, c'est encore mieux).</b>
          <small><b>Groq</b> : ouvrez <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>, touchez « Create API Key », copiez la clé (gsk_…).<br><b>Gemini</b> : ouvrez <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>, touchez « Create API key », copiez la clé (AIza…).<br>Collez-la ici. Elle reste sur votre téléphone.</small>
          <input id="cle-groq" type="password" autocomplete="off" placeholder="gsk_… ou AIza…" aria-label="Clé Groq ou Gemini"><button class="btn principal" type="submit">Enregistrer</button>
          ${p.derniereErreur ? `<small class="neg">${esc(p.derniereErreur)}</small>` : ''}</form>`;
      } else if (!p.disponible) { cls = 'alerte'; html = `${esc(p.derniereErreur || 'Modèles indisponibles.')} <button class="btn" data-oublier-cle type="button">Changer de clé</button>`; }
      else if (p.derniereErreur) html = esc(p.derniereErreur);
      else if (enPause) html = `⏳ Les habitants réfléchissent (${s.nbAttente()} en attente)…`;
    } else if (p && !p.disponible) {
      cls = 'alerte';
      html = `<b>Les habitants ne peuvent pas penser.</b> ${esc(p.derniereErreur || 'Aucun modèle de langage connecté.')}<br><small>Gratuit : installez <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a>, puis <code>ollama pull qwen2.5:3b</code>, et relancez <code>npm start</code>.</small>`;
    } else if (enPause) {
      html = `⏳ Le temps attend que ${s.nbAttente()} habitant(s) aient fini de réfléchir (${p?.stats.appels ? `${Math.round((p.stats.ms || 0) / 100) / 10} s par pensée` : '…'}).`;
    }
    b.hidden = !html;
    if (b.dataset.cache !== cls + html && !(b.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) { b.dataset.cache = cls + html; b.className = cls; b.innerHTML = html; }
    if (!b.dataset.ecoute) {
      b.dataset.ecoute = '1';
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-reflechir]')) this.penseur?.reflechir?.();
        if (e.target.closest('[data-oublier-cle]')) { for (const f of ['groq', 'gemini']) this.penseur?.oublierCle?.(f); b.dataset.cache = ''; }
      });
      b.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = b.querySelector('#cle-groq')?.value.trim();
        if (!v) return;
        b.dataset.cache = '';
        const f = fournisseurDeCle(v);
        const ok = await this.penseur?.enregistrerCle?.(v, f);
        b.dataset.cache = '';
        this.toast(ok ? `Clé ${f === 'gemini' ? 'Gemini' : 'Groq'} acceptée. Les habitants pensent seuls.` : (this.penseur?.derniereErreur || 'Clé refusée.'), ok ? 'bien' : 'mal');
      });
    }
  }

  majBadges() {
    const n = this.sim.requetes.filter((r) => !r.repondue).length;
    $('#badge-requetes').textContent = n || '';
    const m = $('#badge-requetes-m');
    if (m) m.textContent = n || '';
  }

  changerOnglet(o) {
    this.onglet = o;
    document.querySelectorAll('#onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === o));
    this.rendreContenu(true);
  }

  rendreContenu(force = false) {
    const html = { village: () => this.vueVillage(), habitants: () => this.vueHabitants(), requetes: () => this.vueRequetes(), paroles: () => this.vueParoles(), journal: () => this.vueJournal() }[this.onglet]();
    const c = $('#contenu');
    if (force || c.dataset.cache !== html) {
      const scroll = c.scrollTop;
      c.innerHTML = html;
      c.dataset.cache = html;
      if (!force) c.scrollTop = scroll;
      if (this.onglet === 'habitants') { const inp = $('#recherche'); if (inp) inp.value = this.filtre.texte; }
    }
    this.majBadges();
  }

  // ---------- Village ----------
  vueVillage() {
    const s = this.sim;
    const malades = s.habitants.filter((v) => v.malade).length;
    const rep = s.repartitionMetiers();
    const max = Math.max(...Object.values(rep));
    const ordre = ['agriculteur', 'pecheur', 'oleiculteur', 'marchand', 'batisseur', 'charpentier', 'artisan', 'soignant', 'enseignant', 'imam', 'sansmetier', 'eleve', 'enfant', 'ancien'];
    const fin = s.nourritureFoyers();
    const dettes = s.dettes.reduce((t, d) => t + d.montant, 0);
    const p = this.penseur;
    let out = `<h3>Le village</h3>
      <div class="grille2">
        <div class="stat"><b>${s.habitants.length}</b><span>habitants · ${s.batiments.filter((b) => b.type === 'maison').length} maisons</span></div>
        <div class="stat"><b>${NOMS_SAISON[s.etatSaison.nom]}</b><span>mois ${s.etatSaison.mois} sur 12 · ${s.etatSaison.pluie ? `la pluie dure encore ${Math.max(1, Math.ceil(s.etatSaison.resteDePluie / 60))} min (à ×1)` : `prochaine pluie dans ${Math.ceil(s.etatSaison.jusquaPluie / 60)} min (à ×1)`}</span></div>
        <div class="stat"><b>${dateDuVillage(s.temps).texte}</b><span>une année = 2 jours · ${s.stats.naissances || 0} naissance${(s.stats.naissances || 0) > 1 ? 's' : ''}, ${s.stats.deces || 0} décès</span></div>
        <div class="stat"><b>${malades}</b><span>malade${malades > 1 ? 's' : ''}</span></div>
        <div class="stat"><b>${Math.round(fin)}</b><span>rations dans les maisons</span></div>
        <div class="stat ${(s.joursDeCaisse() ?? 9) < 1 ? 'alerte-stat' : ''}"><b>${s.joursDeCaisse() === null ? '—' : `${s.joursDeCaisse() < 10 ? s.joursDeCaisse().toFixed(1) : Math.round(s.joursDeCaisse())} j`}</b><span>de salaires en caisse (${Math.round(s.res.pieces)} pièces${s.historique.at(-1)?.salaires ? `, ${s.historique.at(-1).salaires} versées hier` : ''})</span></div>
        <div class="stat"><b>${Math.round(dettes)}</b><span>pièces de dettes entre habitants</span></div>
      </div>
      ${s.defunts.length ? `<h3>Disparus du village</h3>${[...s.defunts].reverse().slice(0, 20).map((d) => `<div class="relation"><span class="lien" data-hab="${d.id}">${esc(nomComplet(d))}</span><span class="note">${d.age} an${d.age > 1 ? 's' : ''} · ${esc(d.mort.cause)} · ${esc(depuis(d.mort.t, s.temps))}</span></div>`).join('')}` : ''}
      <h3>Économie</h3>
      <form class="inline" data-form="economie">
        <label>Salaire <input name="salaire" type="number" step="0.1" min="0" max="10" value="${s.salaire}"> pièce/h</label>
        <label>Ration <input name="prix" type="number" step="0.1" min="0" max="10" value="${s.prix}"> pièce</label>
        <button class="btn" type="submit">Annoncer</button>
      </form>
      <p class="note">Le conseil paie les travailleurs sur sa caisse ; les habitants achètent leurs rations au marché. Un changement est annoncé à tous.</p>
      <div class="boutons"><button class="btn" data-action="distribuer" ${s.res.nourriture < 2 ? 'disabled' : ''}>Distribuer des rations du marché aux maisons</button></div>
      <h3>Annonce au village</h3>
      <form class="parole" data-form="annonce"><input name="texte" type="text" maxlength="300" placeholder="Que dire à tout le village ?" autocomplete="off"><button class="btn" type="submit">Annoncer</button></form>
      <h3>La nature</h3>
      <div class="ligne"><span class="lib">Poisson</span>${barre(s.monde.poisson * 100)}<span class="val">${Math.round(s.monde.poisson * 100)}</span></div>
      <div class="ligne"><span class="lib">Pinède</span>${barre(s.monde.foret * 100)}<span class="val">${Math.round(s.monde.foret * 100)}</span></div>
      <div class="ligne"><span class="lib">Fertilité</span>${barre(s.monde.fertilite * 100)}<span class="val">${Math.round(s.monde.fertilite * 100)}</span></div>
      <h3>Métiers confiés</h3>`;
    for (const m of ordre) {
      if (!rep[m]) continue;
      out += `<div class="ligne"><span class="lib"><i class="ico" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hex(METIERS[m].couleur)}"></i> ${METIERS[m].nom}${rep[m] > 1 && m !== 'imam' ? 's' : ''}</span><div class="barre"><i style="width:${(rep[m] / max) * 100}%;background:${hex(METIERS[m].couleur)}"></i></div><span class="val">${rep[m]}</span></div>`;
    }
    out += `<p class="note">Le métier est une étiquette et un lieu de travail habituel. Chacun reste libre de s'y rendre ou non.</p><h3>Chantiers</h3>`;
    if (s.projet) {
      const q = s.projet;
      const vol = s.habitants.filter((v) => v.activite?.lieuCle === 'chantier' && v.statut === 'agit').length;
      out += `<div class="carte-bloc"><b>${esc(q.nom)}</b> — ${q.enAttente ? 'en attente de matériaux' : `${Math.floor((q.progres / q.travail) * 100)} %`}${barre(q.progres, q.travail, true)}<p class="note">${PROJETS[q.cle].effet}. ${vol} habitant(s) y travaillent. Ils décident d'y aller ou non.</p><div class="boutons"><button class="btn" data-action="voir-chantier">Voir le chantier</button></div></div>`;
    } else {
      for (const [k, q] of Object.entries(PROJETS)) {
        const fait = s.bonus[k] && k !== 'maison';
        out += `<div class="ligne" style="justify-content:space-between"><span><b>${q.nom}</b><br><small class="note">${Object.entries(q.cout).map(([r, n]) => `${n} ${r}`).join(', ')} · ${q.effet}</small></span><button class="btn" data-action="projet" data-cle="${k}" ${fait ? 'disabled' : ''}>${fait ? 'Fait' : s.peutPayer(q.cout) ? 'Ouvrir' : 'Réserver'}</button></div>`;
      }
    }
    out += `<h3>Commerce au port</h3>`;
    if (s.navire) {
      out += `<div class="boutons">
        <button class="btn" data-commerce="vendreHuile" ${s.res.huile < 10 ? 'disabled' : ''}>Vendre 10 huile → 32 pièces</button>
        <button class="btn" data-commerce="vendreNourriture" ${s.res.nourriture < 40 ? 'disabled' : ''}>Vendre 40 rations → 45 pièces</button>
        <button class="btn" data-commerce="acheterNourriture" ${s.res.pieces < 30 ? 'disabled' : ''}>45 rations ← 30 pièces</button>
        <button class="btn" data-commerce="acheterBois" ${s.res.pieces < 25 ? 'disabled' : ''}>12 bois ← 25 pièces</button>
        <button class="btn" data-commerce="acheterPierre" ${s.res.pieces < 20 ? 'disabled' : ''}>12 pierre ← 20 pièces</button>
        <button class="btn" data-commerce="acheterRemedes" ${s.res.pieces < 30 ? 'disabled' : ''}>8 remèdes ← 30 pièces</button></div>`;
    } else out += `<p class="note">Aucun navire à quai.</p>`;
    if (p?.mode === 'groq') {
      out += `<h3>Pensée des habitants</h3><p class="note">${p.disponible ? `Dernier modèle : ${esc(p.fournisseurActuel === 'gemini' ? 'Gemini' : 'Groq')} ${esc(p.modele)} · ${p.stats.appels} appel(s), ${p.stats.ok} décisions reçues, ${p.stats.echecs} sans réponse, ${(p.stats.ms / 1000).toFixed(1)} s par groupe.` : 'Aucune clé valide.'}</p>`;
      for (const [f, nom, lien, ph] of [['groq', 'Groq', 'https://console.groq.com/keys', 'gsk_…'], ['gemini', 'Google Gemini', 'https://aistudio.google.com/apikey', 'AIza…']]) {
        if (p.aCle?.(f)) {
          out += `<p class="note">${nom} : ${p.actif(f) ? `<span class="pos">actif</span> · ${p.parFournisseur?.[f] || 0} décisions` : `<span class="neg">${esc(p.erreurs?.[f] || 'indisponible')}</span>`} <button class="btn" data-action="oublier-cle" data-fournisseur="${f}" type="button">Retirer la clé</button></p>`;
        } else {
          out += `<form data-form="cle" data-fournisseur="${f}" class="boutons"><small>Ajouter une clé ${nom} gratuite (<a href="${lien}" target="_blank" rel="noopener">obtenir une clé</a>). Quand un modèle atteint sa limite, les habitants continuent avec l'autre.</small>
            <input name="cle" type="password" autocomplete="off" placeholder="${ph}" aria-label="Clé ${nom}"><button class="btn" type="submit">Enregistrer</button></form>`;
        }
      }
    } else if (p?.mode === 'claude') {
      out += `<h3>Pensée des habitants</h3><p class="note">${p.disponible ? `Claude, sur votre compte : ${p.stats.appels} appel(s), ${p.stats.ok} décisions reçues, ${p.stats.echecs} sans réponse. Chaque toucher sur « Laisser réfléchir » fait penser jusqu'à 16 habitants, chacun d'après sa propre perception.` : esc(p.derniereErreur)}</p>`;
    } else if (p) {
      out += `<h3>Pensée des habitants</h3><p class="note">${p.disponible ? `Fournisseur : <b>${esc(p.fournisseur)}</b> (${esc(p.modele)}) · ${p.stats.ok} pensées reçues, ${p.stats.echecs} échecs · ${(p.stats.ms / 1000).toFixed(1)} s en moyenne · ${p.actifs} en cours.` : 'Aucun modèle connecté.'}</p>`;
    }
    out += `<h3>Partie</h3><div class="boutons"><button class="btn" data-action="sauver">Sauvegarder</button><button class="btn" data-action="charger">Charger</button><button class="btn danger" data-action="recommencer">Nouvelle île</button></div>`;
    return out;
  }

  // ---------- Habitants ----------
  vueHabitants() {
    const s = this.sim;
    const f = this.filtre;
    const liste = s.habitants.filter((v) => (!f.metier || v.metier === f.metier) && (!f.texte || nomComplet(v).toLowerCase().includes(f.texte.toLowerCase())));
    const tri = {
      nom: (a, b) => a.prenom.localeCompare(b.prenom),
      humeur: (a, b) => a.humeur - b.humeur,
      faim: (a, b) => a.besoins.faim - b.besoins.faim,
      famille: (a, b) => a.nom.localeCompare(b.nom) || b.age - a.age,
    }[f.tri];
    liste.sort(tri);
    const metiers = Object.keys(s.repartitionMetiers());
    let out = `<div class="filtres"><input type="search" id="recherche" placeholder="Rechercher un nom…" aria-label="Rechercher">
      <select id="filtre-metier" aria-label="Filtrer par métier"><option value="">Tous</option>${metiers.map((m) => `<option value="${m}" ${f.metier === m ? 'selected' : ''}>${METIERS[m].nom}</option>`).join('')}</select>
      <select id="tri" aria-label="Trier">${[['nom', 'Nom'], ['famille', 'Famille'], ['humeur', 'Humeur ↑'], ['faim', 'Faim ↑']].map(([k, l]) => `<option value="${k}" ${f.tri === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="note">${liste.length} habitant${liste.length > 1 ? 's' : ''} · barre = humeur déclarée</p><div class="liste-hab">`;
    for (const v of liste) {
      out += `<div class="hab ${this.selection === v.id ? 'sel' : ''}" data-hab="${v.id}">
        <span class="pt" style="background:${hex(METIERS[v.metier]?.couleur ?? 0x888888)}"></span>
        <span><span class="nom">${esc(nomComplet(v))}</span> <small class="note">${this.agePhrase(v)} · ${esc(libelleMetier(v))}${v.malade ? ' · malade' : ''}</small><span class="etat">${esc(this.etat(v))}</span></span>
        <span class="mini">${barre(v.humeur)}</span></div>`;
    }
    return out + '</div>';
  }

  agePhrase(v) {
    if (v.age >= 2) return `${v.age} ans`;
    const mois = moisDepuis(v.naissance, this.sim.temps);
    return v.age === 1 ? `1 an et ${mois - 12} mois` : `${mois} mois`;
  }

  etat(v) {
    const s = this.sim;
    if (v.mort) return `Mort${v.genre === 'F' ? 'e' : ''} ${v.mort.cause}`;
    if (v.nourrisson) return 'Nourrisson, dans les bras de sa famille';
    if (v.statut === 'reflechit') return 'Réfléchit…';
    if (v.statut === 'attend') return v.nbDecisions ? 'Hésite, attend de décider' : 'Se réveille';
    if (v.conversation) {
      const autre = s.habitant(v.conversation.a === v.id ? v.conversation.b : v.conversation.a);
      return v.conversation.dispute ? `Se dispute avec ${autre.prenom}` : `Discute avec ${autre.prenom}`;
    }
    if (v.path) return `En route : ${v.activite?.etat?.toLowerCase() || '…'}`;
    return v.activite?.etat || '—';
  }

  // ---------- Requêtes ----------
  vueRequetes() {
    const s = this.sim;
    const ouvertes = s.requetes.filter((r) => !r.repondue);
    let out = `<h3>Demandes au conseil</h3><p class="note">Ce sont les habitants eux-mêmes qui écrivent au conseil, quand ils le décident.</p>`;
    if (!ouvertes.length) out += `<p class="note">Aucune demande en attente.</p>`;
    for (const r of ouvertes) {
      const v = s.habitant(r.de);
      out += `<div class="carte-bloc conflit"><div><span class="lien" data-hab="${v.id}">${esc(nomComplet(v))}</span> <small class="note">${esc(s.horodatage(r.t))}</small></div>
        <p>« ${esc(r.texte)} »</p>
        <form class="parole" data-form="reponse" data-rid="${r.id}"><input name="texte" type="text" maxlength="300" placeholder="Votre réponse…" autocomplete="off"><button class="btn principal" type="submit">Répondre</button><button class="btn" type="button" data-ignorer="${r.id}">Ignorer</button></form></div>`;
    }
    // textes entiers : ni la demande ni la réponse ne sont coupées
    const closes = s.requetes.filter((r) => r.repondue).slice(-8).reverse();
    if (closes.length) out += `<h3>Déjà traitées</h3>${closes.map((r) => `<div class="carte-bloc"><div><span class="lien" data-hab="${r.de}">${esc(s.habitant(r.de).prenom)}</span> <small class="note">${esc(s.horodatage(r.t))}</small></div><p>« ${esc(r.texte)} »</p><p class="note">${r.reponse ? `<b>Votre réponse :</b> « ${esc(r.reponse)} »` : 'Sans réponse du conseil.'}</p></div>`).join('')}`;
    return out;
  }

  // ---------- Paroles ----------
  // Paroles : tout ce qui sort des habitants — ce qui se dit au village, et leur vie intérieure
  // (souvenirs, avis sur les autres, qui ils sont, ce qu'ils comprennent), écrits par eux.
  vueParoles() {
    const s = this.sim;
    const f = this.filtreParoles || 'flux';
    const filtres = [['flux', 'Ce qui se dit'], ['fluxtout', 'Tout, même la routine'], ['tout', 'Vie intérieure'], ['souvenir', 'Souvenirs'], ['avis', 'Avis sur les autres'], ['identite', 'Qui je suis'], ['lecons', 'Ce qu\'ils comprennent'], ['questions', 'Ce qu\'ils se demandent']];
    let out = `<h3>Paroles</h3><div class="filtres-journal">${filtres.map(([k, n]) => `<button class="btn ${k === f ? 'actif' : ''}" data-paroles="${k}" type="button">${n}</button>`).join('')}</div>`;
    if (f === 'flux' || f === 'fluxtout') {
    out += `<p class="note">${f === 'flux' ? 'Seulement ce qui est dit à voix haute.' : 'Tout ce qu\'ils disent et pensent, y compris les pensées de simple routine.'}</p>`;
    const dits = s.flux.filter((x) => f === 'fluxtout' || x.type !== 'pensee').slice(-90).reverse();
    if (!dits.length) out += `<p class="note">Personne n'a encore parlé.</p>`;
    for (const x of dits) {
      const v = x.id >= 0 ? s.habitant(x.id) : null;
      const a = x.a != null ? s.habitant(x.a) : null;
      const qui = x.type === 'conseil' ? 'Le conseil' : v ? `<span class="lien" data-hab="${v.id}">${esc(v.prenom)}</span>` : '';
      const vers = x.type === 'conseil' ? (a ? ` à ${esc(a.prenom)}` : ' à tout le village') : a ? ` à <span class="lien" data-hab="${a.id}">${esc(a.prenom)}</span>` : '';
      const ton = x.ton && x.ton !== 'calme' ? ` <small class="note">(${esc(TONS[x.ton] || x.ton)})</small>` : '';
      out += `<div class="journal-e ${x.type === 'pensee' ? 'pensee-e' : /^col[eè]re/.test(x.ton || '') ? 'mal' : x.type === 'conseil' ? 'conseil' : ''}"><time>${esc(s.horodatage(x.t))}${x.lieu ? ` · ${esc(x.lieu)}` : ''}</time>${qui}${x.type === 'pensee' ? ' pense' : vers + ' :'} « ${esc(x.texte)} »${ton}</div>`;
    }

      return out;
    }
    out += `<p class="note">Rien ici n'est écrit par le jeu : ce sont leurs propres mots — ce qu'ils retiennent, pensent des autres, disent d'eux-mêmes, comprennent de leur vie. Les phrases de simple routine restent dans « Ce qui se dit ».</p>`;
    const garder = { tout: () => true, souvenir: (e) => e.type === 'souvenir' || e.type === 'bilan', avis: (e) => e.type === 'avis', identite: (e) => e.type === 'identite', lecons: (e) => e.type === 'lecons', questions: (e) => e.type === 'questions' }[f] || (() => true);
    const liste = (s.interieur || []).filter(garder).slice(-150).reverse();
    if (!liste.length) out += `<p class="note">Rien encore. ${f === 'lecons' || f === 'identite' || f === 'questions' ? 'Cela s\'écrit le soir, quand ils font le point avant de dormir.' : 'Laissez vivre le village.'}</p>`;
    const nom = (id) => s.habitant(id)?.prenom || '?';
    for (const e of liste) {
      const qui = `<b class="lien">${esc(nom(e.id))}</b>`;
      const sur = e.sur != null ? esc(nom(e.sur)) : '';
      const avant = e.avant ? `<small class="note">Avant : « ${esc(e.avant)} »</small>` : '';
      const ton = e.ton && e.ton !== 'calme' ? ` <small class="note">(${esc(TONS[e.ton] || e.ton)})</small>` : '';
      const phrase = {
        pensee: `${qui} pense : « ${esc(e.texte)} »`,
        parole: `${qui} dit${sur ? ` à ${sur}` : ''} : « ${esc(e.texte)} »${ton}`,
        souvenir: `${qui} retient : « ${esc(e.texte)} »`,
        avis: `${qui}, à propos de ${sur} : « ${esc(e.texte)} »${avant}`,
        identite: `${qui} se décrit : « ${esc(e.texte)} »${avant}`,
        lecons: `${qui} a compris : « ${esc(e.texte)} »${avant}`,
        questions: `${qui} se demande : « ${esc(e.texte)} »${avant}`,
        bilan: `${qui}, avant de dormir : « ${esc(e.texte)} »`,
        requete: `${qui} écrit au conseil : « ${esc(e.texte)} »`,
      }[e.type] || `${qui} : « ${esc(e.texte)} »`;
      out += `<div class="journal-e interieur-${e.type}" data-sujet="${e.id}"><time>${esc(s.horodatage(e.t))}</time>${phrase}</div>`;
    }

    return out;
  }

  // Journal : la chronique du village, les événements.
  vueJournal() {
    const s = this.sim;
    let out = `<h3>Chronique du village</h3>`;
    for (const e of [...s.journal].reverse().slice(0, 150)) {
      out += `<div class="journal-e ${e.type}" ${e.sujets?.length ? `data-sujet="${e.sujets[0]}"` : ''}><time>${esc(s.horodatage(e.t))}</time>${esc(e.texte)}</div>`;
    }
    return out;
  }

  // ---------- Événements ----------
  clicContenu(e) {
    const t = e.target.closest('[data-hab],[data-action],[data-commerce],[data-sujet],[data-ignorer],[data-paroles]');
    if (!t) return;
    const s = this.sim;
    if (t.dataset.paroles) { this.filtreParoles = t.dataset.paroles; return this.rendreContenu(true); }
    if (t.dataset.hab !== undefined) return this.actions.selectionner(Number(t.dataset.hab), true);
    if (t.dataset.sujet !== undefined) return this.actions.selectionner(Number(t.dataset.sujet), true);
    if (t.dataset.ignorer) s.ignorerRequete(Number(t.dataset.ignorer));
    else if (t.dataset.commerce) {
      const r = s.commercer(t.dataset.commerce);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'bien' : 'mal');
    } else if (t.dataset.action === 'projet') {
      const r = s.lancerProjet(t.dataset.cle);
      if (!r.ok) this.toast(r.raison, 'mal');
    } else if (t.dataset.action === 'distribuer') {
      const r = s.distribuer(0.6);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'conseil' : 'mal');
    } else if (t.dataset.action === 'voir-chantier') this.actions.voir(s.projet?.site);
    else if (t.dataset.action === 'sauver') this.actions.sauvegarder();
    else if (t.dataset.action === 'charger') this.actions.charger();
    else if (t.dataset.action === 'recommencer') this.actions.recommencer();
    else if (t.dataset.action === 'oublier-cle') this.penseur?.oublierCle?.(t.dataset.fournisseur);
    this.rendreContenu(true);
    this.rendreFiche(true);
  }

  envoiContenu(e) {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const d = new FormData(f);
    const s = this.sim;
    if (f.dataset.form === 'economie') {
      const sal = Number(d.get('salaire')), prix = Number(d.get('prix'));
      if (Number.isFinite(sal) && sal !== s.salaire) s.fixerSalaire(sal);
      if (Number.isFinite(prix) && prix !== s.prix) s.fixerPrix(prix);
      this.toast('Annoncé au village.', 'conseil');
    } else if (f.dataset.form === 'annonce') {
      const t = String(d.get('texte') || '').trim();
      if (t) { s.annoncer(t); this.toast('Annonce faite. Chacun l\'entendra à sa prochaine décision.', 'conseil'); }
    } else if (f.dataset.form === 'cle') {
      const v = String(d.get('cle') || '').trim();
      const four = f.dataset.fournisseur;
      if (v) {
        this.toast('Vérification de la clé…', 'conseil');
        this.penseur?.enregistrerCle?.(v, four).then((ok) => {
          this.toast(ok ? 'Clé acceptée.' : (this.penseur?.derniereErreur || 'Clé refusée.'), ok ? 'bien' : 'mal');
          this.rendreContenu(true);
        });
      }
    } else if (f.dataset.form === 'reponse') {
      const t = String(d.get('texte') || '').trim();
      if (t) s.repondreRequete(Number(f.dataset.rid), t);
    }
    this.rendreContenu(true);
  }

  saisieContenu(e) {
    const id = e.target.id;
    if (id === 'recherche') { this.filtre.texte = e.target.value; this.rafraichirListe(); }
    else if (id === 'filtre-metier') { this.filtre.metier = e.target.value; this.rafraichirListe(); }
    else if (id === 'tri') { this.filtre.tri = e.target.value; this.rafraichirListe(); }
  }

  rafraichirListe() {
    const tmp = document.createElement('div');
    tmp.innerHTML = this.vueHabitants();
    const nouvelle = tmp.querySelector('.liste-hab');
    const ancienne = document.querySelector('#contenu .liste-hab');
    if (ancienne && nouvelle) ancienne.replaceWith(nouvelle);
    const n = tmp.querySelector('p.note');
    const an = document.querySelector('#contenu p.note');
    if (n && an) an.replaceWith(n);
  }

  // ---------- Fiche habitant ----------
  selectionner(id) {
    this.selection = id;
    this.rendreFiche(true);
    if (this.onglet === 'habitants') this.rendreContenu(true);
    const nf = $('#nav-fiche');
    if (nf) { nf.hidden = id == null; if (id != null) nf.textContent = this.sim.habitant(id).prenom; }
    this.vue(id != null ? 'fiche' : 'ile');
  }

  // Sur téléphone, un seul panneau à la fois : l'île, la fiche d'un habitant ou un onglet.
  vue(v) {
    document.body.dataset.vue = v;
    document.querySelectorAll('#nav-mobile button').forEach((b) => {
      const actif = b.dataset.vue ? b.dataset.vue === v : v === 'panneau' && b.dataset.ongletM === this.onglet;
      b.classList.toggle('actif', actif);
    });
  }

  clicFiche(e) {
    const t = e.target.closest('[data-don],[data-hab],.fermer,[data-suivre],[data-amende],[data-repos]');
    if (!t) return;
    const s = this.sim;
    if (t.classList.contains('fermer')) return this.actions.selectionner(null);
    if (t.dataset.hab !== undefined) return this.actions.selectionner(Number(t.dataset.hab), true);
    if (t.dataset.suivre !== undefined) return this.actions.suivre(this.selection);
    let r = null;
    if (t.dataset.don) { const [obj, q] = t.dataset.don.split(':'); r = s.donnerAuHabitant(this.selection, obj, Number(q)); }
    else if (t.dataset.amende) r = s.amender(this.selection, Number(t.dataset.amende));
    else if (t.dataset.repos !== undefined) { s.accorderRepos(this.selection); r = { ok: true, message: 'Jour de repos accordé.' }; }
    if (r) this.toast(r.ok ? r.message : r.raison, r.ok ? 'conseil' : 'mal');
    this.rendreFiche(true);
  }

  rendreFiche(force = false) {
    const el = $('#fiche');
    if (this.selection == null) { el.hidden = true; return; }
    const actif = document.activeElement;
    if (!force && el.contains(actif) && (actif.tagName === 'SELECT' || actif.tagName === 'INPUT')) return;
    const s = this.sim;
    const v = s.habitant(this.selection);
    el.hidden = false;
    const scroll = el.scrollTop;
    const F = v.genre === 'F';
    const foyer = s.batiment(v.foyer);
    const stock = s.foyers[v.foyer];
    const famille = v.famille.map((id) => s.habitant(id));
    const dettes = s.dettes.filter((d) => d.de === v.id || d.a === v.id).map((d) => (d.de === v.id ? `doit ${Math.round(d.montant)} pièces à ${esc(s.habitant(d.a).prenom)}` : `${esc(s.habitant(d.de).prenom)} lui doit ${Math.round(d.montant)} pièces`));
    const p = v.poche;
    const avis = Object.entries(v.avis).sort((a, b) => b[1].t - a[1].t).slice(0, 6);
    const souvenirs = [...v.souvenirs].reverse().slice(0, 10);
    const evts = v.evenements.slice(-5);
    const dlg = (v.dialogue || []).slice(-6);

    let html = `<div class="entete"><div><h2>${esc(nomComplet(v))}</h2>
      <div class="sous">${this.agePhrase(v)} · ${esc(libelleMetier(v))} · ${esc(foyer?.nom || '')}</div>
      ${v.mort ? `<div class="sous neg">Mort${F ? 'e' : ''} ${esc(v.mort.cause)}, ${esc(depuis(v.mort.t, s.temps))} (jour ${v.mort.jour}). Sa mémoire reste lisible ci-dessous.</div>` : ''}
      ${v.enceinte && !v.enceinte.accouche ? `<div class="sous">Attend un enfant (${moisDepuis(v.enceinte.debut, s.temps)} mois sur 9)</div>` : ''}</div>
      <button class="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></div>
      <div class="pensee">${v.pensee ? `« ${esc(v.pensee)} »` : `<i>${v.statut === 'reflechit' ? 'Réfléchit…' : 'Pas encore de pensée.'}</i>`}${v.identite ? `<small>Se décrit : ${esc(v.identite)}</small>` : ''}</div>
      <div class="etat-actuel"><b>${esc(this.etat(v))}</b>${v.malade ? ' · <span class="neg">malade</span>' : ''}${v.urgence ? ` · ${esc(v.urgence)}` : ''}</div>

      ${v.mort || v.nourrisson ? `<p class="note">${v.mort ? 'Cet habitant n\'est plus.' : 'Un nourrisson ne décide pas encore : sa famille s\'en occupe.'}</p>` : `<h3>Parler à ${esc(v.prenom)}</h3>
      <div class="dialogue">${(v.conversation || dlg.length) ? '' : `<p class="note">${F ? 'Elle' : 'Il'} vous entendra à sa prochaine décision ; ${F ? 'elle' : 'il'} répondra comme ${F ? 'elle' : 'il'} le veut.</p>`}
        ${dlg.map((d) => `<p class="${d.de === 'conseil' ? 'moi' : 'lui'}"><b>${d.de === 'conseil' ? 'Conseil' : esc(d.de)}</b> ${esc(d.texte)}</p>`).join('')}</div>
      <form class="parole"><input id="parole" type="text" maxlength="300" placeholder="Que voulez-vous lui dire ?" autocomplete="off"><button class="btn" type="submit">Dire</button></form>

      <h3>Aider, financer, sanctionner</h3>
      <div class="boutons">
        <button class="btn" data-don="pieces:10" title="10 pièces de la caisse">+10 pièces</button>
        <button class="btn" data-don="nourriture:4" title="4 rations du marché">+4 rations</button>
        <button class="btn" data-don="remedes:1">+1 remède</button>
        <button class="btn" data-repos title="Pas attendu au travail aujourd'hui">Jour de repos</button>
        <button class="btn danger" data-amende="5" title="5 pièces d'amende">Amende 5</button>
        <button class="btn" data-suivre>Suivre</button></div>
      ${v.age >= 17 && v.age < 64 ? `<div class="metier-sel"><label class="note" for="choix-metier">Confier le métier de</label><select id="choix-metier"><option value="">—</option>${METIERS_ADULTES.map((m) => `<option value="${m}" ${v.metier === m ? 'selected' : ''}>${METIERS[m][F ? 'nomF' : 'nom']}</option>`).join('')}</select></div>` : ''}
      `}

      <h3>Corps</h3>
      ${[['faim', 'Faim (satiété)'], ['soif', 'Soif'], ['energie', 'Forme'], ['sante', 'Santé'], ['securite', 'Sécurité']].map(([k, l]) => `<div class="ligne"><span class="lib">${l}</span>${barre(v.besoins[k])}<span class="val">${Math.round(v.besoins[k])}</span></div>`).join('')}
      <div class="ligne"><span class="lib"><b>Humeur déclarée</b></span>${barre(v.humeur)}<span class="val">${v.humeur}</span></div>

      <h3>Argent et logement</h3>
      <div class="note">${Math.round(p.pieces)} pièces sur ${F ? 'elle' : 'lui'}${p.nourriture >= 0.5 ? ` · porte ${arrondi(p.nourriture)} ration(s)` : ''}${p.eau >= 0.5 ? ` · ${Math.round(p.eau)} eau` : ''}. Maison : ${Math.round(stock?.nourriture ?? 0)} rations, ${Math.round(stock?.eau ?? 0)} eau · ${s.occupants(v.foyer)} occupant(s) pour ${s.couchages(v.foyer)} couchages.</div>
      ${dettes.length ? `<div class="note">Dettes : ${dettes.join(' ; ')}.</div>` : ''}
      ${v.impaye > 0 ? `<div class="note neg">Salaire impayé aujourd'hui : ${Math.round(v.impaye)} pièces.</div>` : ''}

      ${evts.length ? `<h3>Ce qu'${F ? 'elle' : 'il'} vient de vivre</h3>${evts.map((x) => `<div class="note">• ${esc(x.texte)}</div>`).join('')}` : ''}

      <h3>Mémoire (écrite par ${F ? 'elle' : 'lui'})</h3>
      ${v.resume ? `<div class="note"><b>Bilan :</b> ${esc(v.resume)}</div>` : ''}
      ${v.lecons ? `<div class="note"><b>Ce qu'il a compris :</b> ${esc(v.lecons)}</div>` : ''}
      ${v.questions ? `<div class="note"><b>Ce qu'il se demande :</b> ${esc(v.questions)}</div>` : ''}
      ${souvenirs.length ? souvenirs.map((m) => `<div class="souvenir"><i style="background:var(--accent)"></i><span>${esc(m.texte)}<small>${esc(s.horodatage(m.t))}</small></span></div>`).join('') : '<p class="note">Aucun souvenir noté pour l’instant.</p>'}

      <h3>Ce qu'${F ? 'elle' : 'il'} pense des autres</h3>
      ${avis.length ? avis.map(([id, a]) => `<div class="relation"><span class="lien" data-hab="${id}">${esc(s.habitant(Number(id)).prenom)}</span><span class="note">${esc(a.texte)}</span></div>`).join('') : '<p class="note">Pas encore d’avis formulé.</p>'}
      <h3>Famille</h3>${famille.length ? famille.map((o) => `<div class="relation"><span class="lien" data-hab="${o.id}">${esc(o.prenom)}</span><span class="note">${o.mort ? `mort${o.genre === 'F' ? 'e' : ''} ${esc(o.mort.cause)}` : `${this.agePhrase(o)} · ${esc(libelleMetier(o))}`}</span></div>`).join('') : `<p class="note">Vit seul${F ? 'e' : ''}.</p>`}
      <p class="note">${v.nbDecisions} décisions · ${v.stats.paroles} paroles · ${Math.round(v.stats.dons)} dons · ${v.stats.prises} prises · ${v.stats.requetes} demandes au conseil</p>`;
    if (el.dataset.cache !== html) {
      const saisie = $('#parole')?.value || '';
      el.innerHTML = html;
      el.dataset.cache = html;
      el.scrollTop = scroll;
      if (saisie && $('#parole')) $('#parole').value = saisie;
    }
  }
}
