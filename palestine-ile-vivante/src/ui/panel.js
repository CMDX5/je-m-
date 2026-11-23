// Interface de gestion : barre de ressources, onglets, fiche habitant, notifications.

import { METIERS, METIERS_ADULTES, PROJETS } from '../sim/data.js';
import { nomComplet, libelleMetier, decrire, pensee, libelleRelation, TRAIT_LABELS, relation } from '../sim/villager.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const $ = (s) => document.querySelector(s);

const RESSOURCES = [
  ['nourriture', 'Nourriture', '#8fb85a'],
  ['huile', 'Huile', '#c9b04a'],
  ['pierre', 'Pierre', '#c8bba3'],
  ['bois', 'Bois', '#9c7a52'],
  ['pieces', 'Pièces', '#e6b450'],
  ['remedes', 'Remèdes', '#7ac0b0'],
];

function barre(val, max = 100, neutre = false) {
  const p = Math.max(0, Math.min(100, (val / max) * 100));
  const cls = neutre ? 'neutre' : p < 30 ? 'bas' : p < 55 ? 'moyen' : '';
  return `<div class="barre ${cls}"><i style="width:${p.toFixed(0)}%"></i></div>`;
}

export class Interface {
  constructor(sim, actions) {
    this.sim = sim;
    this.actions = actions; // { selectionner, suivre, vitesse, sauvegarder, charger, recommencer }
    this.onglet = 'village';
    this.selection = null;
    this.filtre = { texte: '', metier: '', tri: 'nom' };
    this.dernierRendu = 0;
    this.precedent = { ...sim.res };
    this.tendances = {};

    document.querySelectorAll('#onglets button').forEach((b) =>
      b.addEventListener('click', () => this.changerOnglet(b.dataset.onglet))
    );
    document.querySelectorAll('#vitesses button').forEach((b) =>
      b.addEventListener('click', () => this.actions.vitesse(Number(b.dataset.v)))
    );
    $('#contenu').addEventListener('click', (e) => this.clicContenu(e));
    $('#contenu').addEventListener('input', (e) => this.saisieContenu(e));
    $('#contenu').addEventListener('change', (e) => this.saisieContenu(e));
    $('#fiche').addEventListener('click', (e) => this.clicFiche(e));
    $('#fiche').addEventListener('change', (e) => {
      if (e.target.id === 'choix-metier') {
        this.sim.assignerMetier(this.selection, e.target.value);
        this.rendreFiche(true);
      }
    });

    sim.on('conflit', (c) => {
      if (!c.resolu && c.gravite === 1 && c.t === sim.temps) this.toast(`Dispute : ${sim.habitant(c.a).prenom} et ${sim.habitant(c.b).prenom}. Voir l'onglet Conflits.`, 'mal');
      this.majBadges();
    });
    sim.on('assemblee', (a) => {
      if (a) this.toast(`L'assemblée se réunit : « ${a.prop.titre} »`, 'conseil');
      this.majBadges();
    });
    sim.on('journal', (e) => {
      if (e.type === 'evenement' || (e.type === 'bien' && /Chantier terminé/.test(e.texte))) this.toast(e.texte, e.type);
    });
    sim.on('jour', () => {
      for (const [k] of RESSOURCES) this.tendances[k] = this.sim.res[k] - (this.precedent[k] ?? this.sim.res[k]);
      this.precedent = { ...this.sim.res };
    });
    this.majBadges();
    this.rendreContenu();
  }

  // ---------- Notifications ----------
  toast(texte, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = texte;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 5200);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }

  // ---------- Rafraîchissement ----------
  tick(maintenant, vitesse) {
    this.majBarre(vitesse);
    if (maintenant - this.dernierRendu > 700) {
      this.dernierRendu = maintenant;
      if (!this.interactionEnCours()) this.rendreContenu();
      this.rendreFiche();
    }
  }

  interactionEnCours() {
    const a = document.activeElement;
    return a && $('#contenu').contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT');
  }

  majBarre(vitesse) {
    const s = this.sim;
    const h = s.heure();
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const phase = h >= 5.5 && h < 7 ? 'aube' : h >= 7 && h < 18.5 ? 'jour' : h >= 18.5 && h < 20.5 ? 'crépuscule' : 'nuit';
    $('#horloge').textContent = `Jour ${s.jour} · ${hh}h${String(mm).padStart(2, '0')} · ${phase}`;
    const m = [];
    if (s.meteo.tempete > s.temps) m.push('Tempête');
    if (s.meteo.secheresse > s.temps) m.push('Vague de chaleur');
    if (s.meteo.bonnePeche > s.temps) m.push('Pêche abondante');
    if (s.navire) m.push('Navire au port');
    if (s.fete && s.temps >= s.fete.debut) m.push('Fête !');
    $('#meteo').textContent = m.join(' · ');
    document.querySelectorAll('#vitesses button').forEach((b) => b.classList.toggle('actif', Number(b.dataset.v) === vitesse));
    $('#ressources').innerHTML = RESSOURCES.map(([k, nom, c]) => {
      const v = Math.floor(s.res[k]);
      const tr = this.tendances[k];
      const alerte = (k === 'nourriture' && v < 60) || (k === 'remedes' && v < 3);
      return `<span class="res ${alerte ? 'alerte' : ''}" title="${nom}${tr !== undefined ? ` — hier : ${tr >= 0 ? '+' : ''}${Math.round(tr)}` : ''}"><i class="ico" style="background:${c}"></i>${nom} <b>${v}</b>${tr !== undefined ? `<small>${tr >= 0 ? '▲' : '▼'}</small>` : ''}</span>`;
    }).join('');
    const moral = s.moyenne('moral'), conf = s.moyenne('confiance');
    $('#jauges').innerHTML = `<span class="jauge" title="Moral moyen des habitants">Moral ${barre(moral)} ${Math.round(moral)}</span>
      <span class="jauge" title="Confiance moyenne envers le conseil">Confiance ${barre(conf)} ${Math.round(conf)}</span>`;
  }

  majBadges() {
    const n = this.sim.conflits.filter((c) => !c.resolu).length;
    $('#badge-conflits').textContent = n || '';
    $('#badge-assemblee').textContent = this.sim.assemblee ? '1' : '';
  }

  changerOnglet(o) {
    this.onglet = o;
    document.querySelectorAll('#onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === o));
    this.rendreContenu(true);
  }

  rendreContenu(force = false) {
    const html = {
      village: () => this.vueVillage(),
      habitants: () => this.vueHabitants(),
      conflits: () => this.vueConflits(),
      assemblee: () => this.vueAssemblee(),
      journal: () => this.vueJournal(),
    }[this.onglet]();
    const c = $('#contenu');
    if (force || c.dataset.cache !== html) {
      const scroll = c.scrollTop;
      c.innerHTML = html;
      c.dataset.cache = html;
      if (!force) c.scrollTop = scroll;
      if (this.onglet === 'habitants') {
        const inp = $('#recherche');
        if (inp) inp.value = this.filtre.texte;
      }
    }
    this.majBadges();
  }

  // ---------- Onglet Village ----------
  vueVillage() {
    const s = this.sim;
    const malades = s.habitants.filter((v) => v.malade).length;
    const rep = s.repartitionMetiers();
    const max = Math.max(...Object.values(rep));
    const ordre = ['agriculteur', 'oleiculteur', 'pecheur', 'marchand', 'batisseur', 'charpentier', 'artisan', 'soignant', 'enseignant', 'imam', 'eleve', 'enfant', 'ancien'];
    const besoinNourriture = s.habitants.length * 3;
    let out = `<h3>Le village</h3>
      <div class="grille2">
        <div class="stat"><b>${s.habitants.length}</b><span>habitants · ${s.batiments.filter((b) => b.type === 'maison').length} foyers</span></div>
        <div class="stat"><b>${malades}</b><span>malade${malades > 1 ? 's' : ''}</span></div>
        <div class="stat"><b>${Math.round(s.moyenne('moral'))}</b><span>moral moyen</span></div>
        <div class="stat"><b>${Math.round(s.moyenne('confiance'))}</b><span>confiance envers le conseil</span></div>
      </div>
      <p class="note">Le village consomme environ ${besoinNourriture} rations par jour (3 repas). Réserve actuelle : ${Math.floor(s.res.nourriture)} — soit ${(s.res.nourriture / besoinNourriture).toFixed(1)} jour(s).</p>
      <h3>Métiers</h3>`;
    for (const m of ordre) {
      if (!rep[m]) continue;
      out += `<div class="ligne"><span class="lib"><i class="ico" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hex(METIERS[m].couleur)}"></i> ${METIERS[m].nom}${rep[m] > 1 && m !== 'imam' ? 's' : ''}</span><div class="barre"><i style="width:${(rep[m] / max) * 100}%;background:${hex(METIERS[m].couleur)}"></i></div><span class="val">${rep[m]}</span></div>`;
    }
    out += `<p class="note">Pour changer un métier, sélectionnez un habitant (onglet Habitants ou clic dans la scène).</p>`;

    out += `<h3>Politique du conseil</h3>
      <div class="ligne"><label for="rations">Rations</label>
        <select id="rations">
          ${[['genereuse', 'Généreuses (+moral, ×1,3)'], ['normale', 'Normales'], ['stricte', 'Strictes (−moral, ×0,7)']].map(([k, l]) => `<option value="${k}" ${s.politique.rations === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div class="ligne"><span class="lib">Rythme de travail</span><span>${{ normal: 'Normal (7h–12h, 13h–17h)', long: 'Journées longues', repos: 'Journées allégées' }[s.politique.rythme]}</span></div>
      <div class="ligne"><span class="lib">Grands élèves</span><span>${s.politique.elevesAuxChamps ? "Aux champs l'après-midi" : "À l'école seulement"}</span></div>
      <p class="note">Le rythme et l'organisation de l'école se décident en assemblée.</p>`;

    out += `<h3>Chantiers</h3>`;
    if (s.projet) {
      const p = s.projet;
      out += `<div class="carte-bloc"><b>${esc(p.nom)}</b> — ${p.enAttente ? 'en attente de matériaux' : `${Math.floor((p.progres / p.travail) * 100)} %`}
        ${barre(p.progres, p.travail, true)}<p class="note">${PROJETS[p.cle].effet}. Bâtisseurs et charpentiers y travaillent pendant leurs heures.</p>
        <div class="boutons"><button class="btn" data-action="voir-chantier">Voir le chantier</button></div></div>`;
    } else {
      out += `<p class="note">Lancer un chantier sans passer par l'assemblée peut froisser les plus impatients.</p>`;
      for (const [k, p] of Object.entries(PROJETS)) {
        const fait = s.bonus[k] && k !== 'maison';
        const cout = Object.entries(p.cout).map(([r, q]) => `${q} ${r}`).join(', ');
        const ok = s.peutPayer(p.cout);
        out += `<div class="ligne" style="justify-content:space-between"><span><b>${p.nom}</b><br><small class="note">${cout} · ${p.effet}</small></span>
          <button class="btn" data-action="projet" data-cle="${k}" ${fait ? 'disabled' : ''}>${fait ? 'Fait' : ok ? 'Lancer' : 'Réserver'}</button></div>`;
      }
    }

    out += `<h3>Commerce au port</h3>`;
    if (s.navire) {
      out += `<p class="note">Un navire marchand est à quai jusqu'à ${Math.floor(s.heure(s.navire))}h.</p><div class="boutons">
        <button class="btn" data-commerce="vendreHuile" ${s.res.huile < 10 ? 'disabled' : ''}>Vendre 10 huile → 32 pièces</button>
        <button class="btn" data-commerce="acheterNourriture" ${s.res.pieces < 30 ? 'disabled' : ''}>45 nourriture ← 30 pièces</button>
        <button class="btn" data-commerce="acheterBois" ${s.res.pieces < 25 ? 'disabled' : ''}>12 bois ← 25 pièces</button>
        <button class="btn" data-commerce="acheterPierre" ${s.res.pieces < 20 ? 'disabled' : ''}>12 pierre ← 20 pièces</button>
        <button class="btn" data-commerce="acheterRemedes" ${s.res.pieces < 30 ? 'disabled' : ''}>8 remèdes ← 30 pièces</button></div>`;
    } else out += `<p class="note">Aucun navire à quai. Les marchands passent de temps en temps, le matin.</p>`;

    if (s.historique.length) {
      out += `<h3>Évolution</h3>${this.courbe(s.historique)}`;
    }
    out += `<h3>Partie</h3><div class="boutons">
      <button class="btn" data-action="sauver">Sauvegarder</button>
      <button class="btn" data-action="charger">Charger</button>
      <button class="btn danger" data-action="recommencer">Nouvelle île</button></div>`;
    return out;
  }

  courbe(hist) {
    const W = 330, H = 70;
    const pts = (cle, max) => hist.map((h, i) => `${(i / Math.max(1, hist.length - 1)) * W},${H - (h[cle] / max) * H}`).join(' ');
    const maxN = Math.max(100, ...hist.map((h) => h.nourriture));
    return `<svg viewBox="0 -4 ${W} ${H + 8}" width="100%" height="${H + 8}" role="img" aria-label="Évolution du moral, de la confiance et des réserves">
      <polyline fill="none" stroke="#6fbf73" stroke-width="2" points="${pts('moral', 100)}"/>
      <polyline fill="none" stroke="#e6b450" stroke-width="2" points="${pts('confiance', 100)}"/>
      <polyline fill="none" stroke="#8fb85a" stroke-dasharray="4 3" stroke-width="1.5" points="${pts('nourriture', maxN)}"/>
    </svg><p class="note"><span style="color:#6fbf73">━ moral</span> · <span style="color:#e6b450">━ confiance</span> · <span style="color:#8fb85a">╌ nourriture</span> (par jour)</p>`;
  }

  // ---------- Onglet Habitants ----------
  vueHabitants() {
    const s = this.sim;
    const f = this.filtre;
    let liste = s.habitants.filter((v) => (!f.metier || v.metier === f.metier) && (!f.texte || nomComplet(v).toLowerCase().includes(f.texte.toLowerCase())));
    const tri = {
      nom: (a, b) => a.prenom.localeCompare(b.prenom),
      moral: (a, b) => a.moral - b.moral,
      confiance: (a, b) => a.confiance - b.confiance,
      famille: (a, b) => a.nom.localeCompare(b.nom) || b.age - a.age,
    }[f.tri];
    liste.sort(tri);
    const metiers = Object.keys(s.repartitionMetiers());
    let out = `<div class="filtres"><input type="search" id="recherche" placeholder="Rechercher un nom…" aria-label="Rechercher">
      <select id="filtre-metier" aria-label="Filtrer par métier"><option value="">Tous</option>${metiers.map((m) => `<option value="${m}" ${f.metier === m ? 'selected' : ''}>${METIERS[m].nom}</option>`).join('')}</select>
      <select id="tri" aria-label="Trier"><option value="nom" ${f.tri === 'nom' ? 'selected' : ''}>Nom</option><option value="famille" ${f.tri === 'famille' ? 'selected' : ''}>Famille</option><option value="moral" ${f.tri === 'moral' ? 'selected' : ''}>Moral ↑</option><option value="confiance" ${f.tri === 'confiance' ? 'selected' : ''}>Confiance ↑</option></select></div>
      <p class="note">${liste.length} habitant${liste.length > 1 ? 's' : ''} · barre = moral</p><div class="liste-hab">`;
    for (const v of liste) {
      const etat = v.conversation ? (v.conversation.dispute ? 'Se dispute' : `Discute avec ${s.habitant(v.conversation.a === v.id ? v.conversation.b : v.conversation.a).prenom}`) : v.path ? `En route vers ${v.activite?.nomLieu || '…'}` : v.activite?.etat || '—';
      out += `<div class="hab ${this.selection === v.id ? 'sel' : ''}" data-hab="${v.id}">
        <span class="pt" style="background:${hex(METIERS[v.metier].couleur)}"></span>
        <span><span class="nom">${esc(nomComplet(v))}</span> <small class="note">${v.age} ans · ${esc(libelleMetier(v))}${v.malade ? ' · malade' : ''}</small><span class="etat">${esc(etat)}</span></span>
        <span class="mini">${barre(v.moral)}</span></div>`;
    }
    return out + '</div>';
  }

  // ---------- Onglet Conflits ----------
  vueConflits() {
    const s = this.sim;
    const ouverts = s.conflits.filter((c) => !c.resolu);
    let out = `<h3>Différends en cours</h3>`;
    if (!ouverts.length) out += `<p class="note">Aucun différend ouvert. Le village est en paix — pour l'instant.</p>`;
    for (const c of ouverts) {
      const a = s.habitant(c.a), b = s.habitant(c.b);
      const ra = relation(a, b.id).aff, rb = relation(b, a.id).aff;
      out += `<div class="carte-bloc conflit">
        <div><span class="lien" data-hab="${a.id}">${esc(nomComplet(a))}</span> et <span class="lien" data-hab="${b.id}">${esc(nomComplet(b))}</span></div>
        <div class="note">À propos de ${esc(c.motif)} · ${esc(s.horodatage(c.t))}${c.lieu ? ` · ${esc(c.lieu)}` : ''}</div>
        <div class="note">Gravité <span class="gravite">${'●'.repeat(c.gravite)}${'○'.repeat(3 - c.gravite)}</span> · confiance ${Math.round(a.confiance)} / ${Math.round(b.confiance)} · affinité ${Math.round(ra)} / ${Math.round(rb)}</div>
        <div class="boutons">
          <button class="btn principal" data-conflit="${c.id}" data-option="mediation" title="Chance de réconciliation selon la patience et la confiance des deux parties">Médiation</button>
          <button class="btn" data-conflit="${c.id}" data-option="a" title="${esc(a.prenom)} gagne en confiance, ${esc(b.prenom)} et sa famille s'en souviendront">Raison à ${esc(a.prenom)}</button>
          <button class="btn" data-conflit="${c.id}" data-option="b" title="${esc(b.prenom)} gagne en confiance, ${esc(a.prenom)} et sa famille s'en souviendront">Raison à ${esc(b.prenom)}</button>
          <button class="btn" data-conflit="${c.id}" data-option="compensation" ${s.res.pieces < 15 ? 'disabled' : ''}>Dédommager (15 pièces)</button>
          <button class="btn" data-conflit="${c.id}" data-option="ignorer">Ignorer</button>
        </div></div>`;
    }
    out += `<p class="note">Un différend ignoré s'envenime chaque jour ; au troisième degré, les familles prennent parti.</p>`;
    const resolus = s.conflits.filter((c) => c.resolu).slice(-8).reverse();
    if (resolus.length) {
      out += `<h3>Récemment réglés</h3>`;
      const lib = { mediation: 'réconciliés par médiation', a: 'tranché', b: 'tranché', compensation: 'dédommagés', ignorer: 'ignoré par le conseil' };
      for (const c of resolus) out += `<div class="note">• ${esc(s.habitant(c.a).prenom)} / ${esc(s.habitant(c.b).prenom)} — ${esc(c.motif)} : ${lib[c.issue] || 'réglé'}</div>`;
    }
    return out;
  }

  // ---------- Onglet Assemblée ----------
  vueAssemblee() {
    const s = this.sim;
    let out = '';
    const as = s.assemblee;
    if (as) {
      const total = Object.values(as.votes).reduce((a, b) => a + b, 0);
      const reste = Math.max(0, as.expire - s.temps);
      out += `<h3>Question en cours</h3><div class="carte-bloc"><b>${esc(as.prop.titre)}</b><p class="note">${esc(as.prop.contexte)}</p>`;
      for (const o of as.prop.options) {
        const n = as.votes[o.id];
        out += `<div class="option-vote"><div class="tete"><span>${esc(o.label)}</span><span>${n} voix · ${Math.round((n / total) * 100)} %</span></div>${barre(n, total, true)}
          <div class="boutons"><button class="btn" data-decision="${o.id}">Trancher pour cette option</button></div></div>`;
      }
      out += `<p class="note">Les ${total} adultes ont donné leur avis. Ceux dont l'avis n'est pas suivi s'en souviendront ; aller contre la majorité coûte davantage de confiance. Sans décision dans ${Math.floor(reste / 60)} h, l'assemblée se dispersera.</p></div>`;
    } else {
      out += `<h3>Assemblée</h3><p class="note">Pas de question en suspens. L'assemblée se réunit sur la place un soir sur deux, à 18 h.</p>`;
    }
    if (s.historiqueAssemblees.length) {
      out += `<h3>Décisions passées</h3>`;
      for (const h of [...s.historiqueAssemblees].reverse()) {
        out += `<div class="journal-e ${h.majorite ? 'bien' : 'mal'}"><time>${esc(s.horodatage(h.t))}</time>${esc(h.titre)}<br><b>${esc(h.choix)}</b> ${h.majorite ? '(avec la majorité)' : '(contre la majorité)'}</div>`;
      }
    }
    return out;
  }

  // ---------- Onglet Journal ----------
  vueJournal() {
    const s = this.sim;
    let out = `<h3>Chronique du village</h3>`;
    for (const e of [...s.journal].reverse().slice(0, 120)) {
      out += `<div class="journal-e ${e.type}" ${e.sujets?.length ? `data-sujet="${e.sujets[0]}"` : ''}><time>${esc(s.horodatage(e.t))}</time>${esc(e.texte)}</div>`;
    }
    return out;
  }

  // ---------- Événements du panneau ----------
  clicContenu(e) {
    const t = e.target.closest('[data-hab],[data-action],[data-conflit],[data-decision],[data-commerce],[data-sujet]');
    if (!t) return;
    const s = this.sim;
    if (t.dataset.hab !== undefined) return this.actions.selectionner(Number(t.dataset.hab), true);
    if (t.dataset.sujet !== undefined) return this.actions.selectionner(Number(t.dataset.sujet), true);
    if (t.dataset.conflit) {
      const r = s.resoudreConflit(Number(t.dataset.conflit), t.dataset.option);
      if (r?.message) this.toast(r.message, r.reussi === false ? 'mal' : 'conseil');
      else if (r?.raison) this.toast(r.raison, 'mal');
    } else if (t.dataset.decision) {
      s.deciderAssemblee(t.dataset.decision);
      this.toast('Décision prise. Le village s’en souviendra.', 'conseil');
    } else if (t.dataset.commerce) {
      const r = s.commercer(t.dataset.commerce);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'bien' : 'mal');
    } else if (t.dataset.action === 'projet') {
      const r = s.lancerProjet(t.dataset.cle);
      if (!r.ok) this.toast(r.raison, 'mal');
    } else if (t.dataset.action === 'voir-chantier') this.actions.voir(s.projet?.site);
    else if (t.dataset.action === 'sauver') this.actions.sauvegarder();
    else if (t.dataset.action === 'charger') this.actions.charger();
    else if (t.dataset.action === 'recommencer') this.actions.recommencer();
    this.rendreContenu(true);
    this.rendreFiche(true);
  }

  saisieContenu(e) {
    const id = e.target.id;
    if (id === 'recherche') { this.filtre.texte = e.target.value; this.rafraichirListe(); }
    else if (id === 'filtre-metier') { this.filtre.metier = e.target.value; this.rafraichirListe(); }
    else if (id === 'tri') { this.filtre.tri = e.target.value; this.rafraichirListe(); }
    else if (id === 'rations' && e.type === 'change') { this.sim.definirRations(e.target.value); this.toast('Rations mises à jour.', 'conseil'); }
  }

  rafraichirListe() {
    // reconstruit la liste sans perdre le focus du champ de recherche
    const html = this.vueHabitants();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
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
  }

  clicFiche(e) {
    const t = e.target.closest('[data-aide],[data-hab],.fermer,[data-suivre]');
    if (!t) return;
    if (t.classList.contains('fermer')) return this.actions.selectionner(null);
    if (t.dataset.hab !== undefined) return this.actions.selectionner(Number(t.dataset.hab), true);
    if (t.dataset.suivre !== undefined) return this.actions.suivre(this.selection);
    if (t.dataset.aide) {
      const r = this.sim.aiderHabitant(this.selection, t.dataset.aide);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'conseil' : 'mal');
      this.rendreFiche(true);
    }
  }

  rendreFiche(force = false) {
    const el = $('#fiche');
    if (this.selection == null) { el.hidden = true; return; }
    if (!force && el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    const s = this.sim;
    const v = s.habitant(this.selection);
    el.hidden = false;
    const scroll = el.scrollTop;
    const F = v.genre === 'F';
    const etat = v.conversation
      ? `${v.conversation.dispute ? 'Se dispute' : 'Discute'} avec <span class="lien" data-hab="${v.conversation.a === v.id ? v.conversation.b : v.conversation.a}">${esc(s.habitant(v.conversation.a === v.id ? v.conversation.b : v.conversation.a).prenom)}</span> (${esc(v.conversation.sujet)})`
      : v.path ? `En route vers ${esc(v.activite?.nomLieu || '…')}` : `${esc(v.activite?.etat || 'Se réveille')}${v.activite?.nomLieu && !v.activite?.etat?.includes(v.activite.nomLieu) ? ` — ${esc(v.activite.nomLieu)}` : ''}`;
    const foyer = s.batiment(v.foyer);
    const famille = v.famille.map((id) => s.habitant(id));
    const adulte = v.age >= 17;
    const metiers = adulte ? METIERS_ADULTES.filter((m) => m !== 'imam' || !F) : [];

    // relations les plus fortes (hors famille)
    const rels = Object.entries(v.relations)
      .map(([id, r]) => ({ o: s.habitant(Number(id)), r }))
      .filter((x) => !v.famille.includes(x.o.id) && (x.r.fam > 35 || Math.abs(x.r.aff) > 25))
      .sort((a, b) => Math.abs(b.r.aff) - Math.abs(a.r.aff))
      .slice(0, 6);
    const souvenirs = [...v.memoire].sort((a, b) => b.t - a.t).slice(0, 9);
    const opinion = v.confiance >= 70 ? 'a pleinement confiance dans le conseil' : v.confiance >= 50 ? 'fait plutôt confiance au conseil' : v.confiance >= 30 ? 'se méfie du conseil' : 'a perdu confiance dans le conseil';

    let html = `<div class="entete"><div><h2>${esc(nomComplet(v))}</h2>
      <div class="sous">${v.age} ans · ${esc(libelleMetier(v))} · ${esc(foyer?.nom || '')}</div></div>
      <button class="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></div>
      <div class="pensee">« ${esc(pensee(v, s))} »</div>
      <div class="etat-actuel"><b>${etat}</b>${v.malade ? ' · <span class="neg">malade</span>' : ''}${v.reposJusqua > s.temps ? ' · en repos' : ''}</div>
      <div class="note">${esc(decrire(v))}. ${F ? 'Elle' : 'Il'} ${opinion}.</div>`;

    if (adulte) {
      html += `<h3>Métier</h3><div class="metier-sel"><select id="choix-metier" aria-label="Métier">${metiers.map((m) => `<option value="${m}" ${v.metier === m ? 'selected' : ''}>${libelleMetier(v, m)}</option>`).join('')}${!metiers.includes(v.metier) ? `<option value="${v.metier}" selected>${libelleMetier(v)}</option>` : ''}</select>
        <span class="souhait">${v.metierSouhaite === v.metier ? '✓ le métier qu’' + (F ? 'elle' : 'il') + ' souhaitait' : `rêve d'être ${esc(libelleMetier(v, v.metierSouhaite).toLowerCase())}`}</span></div>`;
    }

    html += `<h3>Besoins</h3>
      <div class="ligne"><span class="lib">Satiété</span>${barre(v.besoins.faim)}<span class="val">${Math.round(v.besoins.faim)}</span></div>
      <div class="ligne"><span class="lib">Énergie</span>${barre(v.besoins.energie)}<span class="val">${Math.round(v.besoins.energie)}</span></div>
      <div class="ligne"><span class="lib">Vie sociale</span>${barre(v.besoins.social)}<span class="val">${Math.round(v.besoins.social)}</span></div>
      <div class="ligne"><span class="lib">Santé</span>${barre(v.besoins.sante)}<span class="val">${Math.round(v.besoins.sante)}</span></div>
      <div class="ligne"><span class="lib"><b>Moral</b></span>${barre(v.moral)}<span class="val">${Math.round(v.moral)}</span></div>
      <div class="ligne"><span class="lib"><b>Confiance (conseil)</b></span>${barre(v.confiance)}<span class="val">${Math.round(v.confiance)}</span></div>

      <h3>Le conseil peut…</h3><div class="boutons">
        <button class="btn" data-aide="ecouter" title="Prendre le temps de l'écouter (une fois par jour)">Écouter</button>
        <button class="btn" data-aide="nourriture" title="−3 nourriture">Panier de nourriture</button>
        <button class="btn" data-aide="remedes" title="−1 remède">Soigner</button>
        <button class="btn" data-aide="repos" ${!adulte ? 'disabled' : ''} title="Une journée sans travail">Jour de repos</button>
        <button class="btn" data-suivre>Suivre</button></div>

      <h3>Personnalité</h3>`;
    for (const [k, lib] of Object.entries(TRAIT_LABELS)) {
      html += `<div class="ligne"><span class="lib">${lib}</span>${barre(v.traits[k] * 100, 100, true)}<span class="val">${Math.round(v.traits[k] * 100)}</span></div>`;
    }

    html += `<h3>Famille</h3>${famille.length ? famille.map((o) => `<div class="relation"><span class="lien" data-hab="${o.id}">${esc(o.prenom)}</span><span class="note">${o.age} ans · ${esc(libelleMetier(o))}</span><span class="aff ${relation(v, o.id).aff >= 0 ? 'pos' : 'neg'}">${Math.round(relation(v, o.id).aff)}</span></div>`).join('') : '<p class="note">Vit seul' + (F ? 'e' : '') + '.</p>'}
      <h3>Relations</h3>${rels.length ? rels.map(({ o, r }) => `<div class="relation"><span class="lien" data-hab="${o.id}">${esc(nomComplet(o))}</span><span class="note">${libelleRelation(r, false)}</span><span class="aff ${r.aff >= 0 ? 'pos' : 'neg'}">${Math.round(r.aff)}</span></div>`).join('') : '<p class="note">Pas encore de lien marqué.</p>'}

      <h3>Mémoire (${v.memoire.length} souvenirs)</h3>`;
    for (const m of souvenirs) {
      const c = m.valence > 0.15 ? 'var(--vert)' : m.valence < -0.15 ? 'var(--rouge)' : 'var(--doux)';
      const date = m.t < 0 ? 'il y a longtemps' : s.horodatage(m.t);
      html += `<div class="souvenir"><i style="background:${c};opacity:${0.35 + m.importance * 0.65}"></i><span>${esc(m.texte)}<small>${esc(date)}${m.sujet === 'conseil' ? ' · à propos du conseil' : ''} · importance ${Math.round(m.importance * 100)} %</small></span></div>`;
    }
    html += `<p class="note">Statistiques : ${v.stats.conversations} conversations, ${v.stats.disputes} disputes, ${v.stats.aides} visites d'entraide.</p>`;
    if (el.dataset.cache !== html) {
      el.innerHTML = html;
      el.dataset.cache = html;
      el.scrollTop = scroll;
    }
  }
}
