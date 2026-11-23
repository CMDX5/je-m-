// Interface du conseil : ressources, onglets, fiche habitant, notifications.
// Le joueur observe et oriente ; il ne commande personne.

import { METIERS, DEMANDES, PROJETS } from '../sim/data.js';
import { nomComplet, libelleMetier, decrire, pensee, libelleRelation, TRAIT_LABELS, relation } from '../sim/villager.js';
import { ACTIONS, croyances } from '../sim/esprit.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const $ = (s) => document.querySelector(s);

const RESSOURCES = [
  ['nourriture', 'Réserve commune', '#8fb85a'],
  ['huile', 'Huile', '#c9b04a'],
  ['pierre', 'Pierre', '#c8bba3'],
  ['bois', 'Bois', '#9c7a52'],
  ['pieces', 'Pièces', '#e6b450'],
  ['remedes', 'Remèdes', '#7ac0b0'],
];

const LIB_RENDU = {
  dormir: 'Sommeil', manger: 'Repas', travailler: 'Travail', socialiser: 'Vie sociale', flaner: 'Promenade', prier: 'Prière',
  ecole: 'École', jouer: 'Jeux', rester: 'À la maison', soigner: 'Soins', aider: 'Entraide', fete: 'Fête',
};

function barre(val, max = 100, neutre = false) {
  const p = Math.max(0, Math.min(100, (val / max) * 100));
  const cls = neutre ? 'neutre' : p < 30 ? 'bas' : p < 55 ? 'moyen' : '';
  return `<div class="barre ${cls}"><i style="width:${p.toFixed(0)}%"></i></div>`;
}

export class Interface {
  constructor(sim, actions) {
    this.sim = sim;
    this.actions = actions; // { selectionner, suivre, vitesse, voir, sauvegarder, charger, recommencer, parler }
    this.onglet = 'village';
    this.selection = null;
    this.filtre = { texte: '', metier: '', tri: 'nom' };
    this.dernierRendu = 0;
    this.precedent = { ...sim.res };
    this.tendances = {};
    this.cerveau = null;

    document.querySelectorAll('#onglets button').forEach((b) => b.addEventListener('click', () => this.changerOnglet(b.dataset.onglet)));
    document.querySelectorAll('#vitesses button').forEach((b) => b.addEventListener('click', () => this.actions.vitesse(Number(b.dataset.v))));
    $('#contenu').addEventListener('click', (e) => this.clicContenu(e));
    $('#contenu').addEventListener('input', (e) => this.saisieContenu(e));
    $('#contenu').addEventListener('change', (e) => this.saisieContenu(e));
    $('#fiche').addEventListener('click', (e) => this.clicFiche(e));
    $('#fiche').addEventListener('change', (e) => {
      if (e.target.id === 'choix-demande') { this.sim.demanderTravail(this.selection, e.target.value || null); this.rendreFiche(true); }
    });
    $('#fiche').addEventListener('submit', (e) => {
      e.preventDefault();
      const champ = $('#parole');
      const msg = champ?.value.trim();
      if (!msg) return;
      champ.value = '';
      this.actions.parler(this.selection, msg);
    });

    sim.on('conflit', (c) => {
      if (!c.resolu && c.t === sim.temps) this.toast(`${c.type === 'vol' ? 'Vol' : 'Dispute'} : ${sim.habitant(c.a).prenom} et ${sim.habitant(c.b).prenom}. Voir l'onglet Conflits.`, 'mal');
      this.majBadges();
    });
    sim.on('assemblee', (a) => {
      if (a) this.toast(`${sim.habitant(a.porteur).prenom} réunit l'assemblée : « ${a.prop.titre} »`, 'conseil');
      this.majBadges();
    });
    sim.on('journal', (e) => {
      if (e.type === 'evenement' || /Chantier terminé|a réfléchi/.test(e.texte)) this.toast(e.texte, e.type);
    });
    sim.on('jour', () => {
      for (const [k] of RESSOURCES) this.tendances[k] = this.sim.res[k] - (this.precedent[k] ?? this.sim.res[k]);
      this.precedent = { ...this.sim.res };
    });
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
    if (s.meteo.bonnePeche > s.temps) m.push('Sardines près des côtes');
    if (s.navire) m.push('Navire au port');
    if (s.fete && s.temps >= s.fete.debut) m.push('Fête !');
    if (this.cerveau) m.push(this.cerveau.disponible ? 'Claude connecté' : 'Réflexions locales');
    $('#meteo').textContent = m.join(' · ');
    document.querySelectorAll('#vitesses button').forEach((b) => b.classList.toggle('actif', Number(b.dataset.v) === vitesse));
    const foyers = Math.floor(s.nourritureFoyers());
    $('#ressources').innerHTML = `<span class="res" title="Vivres stockés dans les maisons (propriété des familles)"><i class="ico" style="background:#6f9a45"></i>Foyers <b>${foyers}</b></span>` + RESSOURCES.map(([k, nom, c]) => {
      const v = Math.floor(s.res[k]);
      const tr = this.tendances[k];
      return `<span class="res" title="${nom}${tr !== undefined ? ` — hier : ${tr >= 0 ? '+' : ''}${Math.round(tr)}` : ''}"><i class="ico" style="background:${c}"></i>${nom} <b>${v}</b></span>`;
    }).join('');
    const moral = s.moyenne('moral'), conf = s.moyenne('confiance');
    $('#jauges').innerHTML = `<span class="jauge" title="Bien-être moyen ressenti">Bien-être ${barre(moral)} ${Math.round(moral)}</span>
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
      emergence: () => this.vueEmergence(),
      journal: () => this.vueJournal(),
    }[this.onglet]();
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
    const ordre = ['agriculteur', 'pecheur', 'oleiculteur', 'marchand', 'batisseur', 'charpentier', 'artisan', 'soignant', 'enseignant', 'sans', 'eleve', 'enfant', 'ancien'];
    const foyers = s.nourritureFoyers();
    let out = `<h3>Le village</h3>
      <div class="grille2">
        <div class="stat"><b>${s.habitants.length}</b><span>habitants · ${s.batiments.filter((b) => b.type === 'maison').length} foyers</span></div>
        <div class="stat"><b>${malades}</b><span>malade${malades > 1 ? 's' : ''}</span></div>
        <div class="stat"><b>${Math.round(foyers)}</b><span>rations dans les maisons</span></div>
        <div class="stat"><b>${Math.round(s.res.nourriture)}</b><span>rations à la réserve commune</span></div>
      </div>
      <p class="note">Les familles gardent ce qu'elles récoltent. La réserve commune ne se remplit que par les dons des habitants et vos achats.</p>
      <div class="boutons"><button class="btn" data-action="distribuer" ${s.res.nourriture < 2 ? 'disabled' : ''} title="Partager la réserve entre les familles, en priorité celles qui manquent">Distribuer la réserve</button></div>
      <h3>La nature</h3>
      <div class="ligne"><span class="lib">Poisson près des côtes</span>${barre(s.monde.poisson * 100)}<span class="val">${Math.round(s.monde.poisson * 100)}</span></div>
      <div class="ligne"><span class="lib">Pinède</span>${barre(s.monde.foret * 100)}<span class="val">${Math.round(s.monde.foret * 100)}</span></div>
      <div class="ligne"><span class="lib">Fertilité des champs</span>${barre(s.monde.fertilite * 100)}<span class="val">${Math.round(s.monde.fertilite * 100)}</span></div>
      <div class="ligne"><span class="lib">Olives sur les arbres</span>${barre(s.monde.olives * 100)}<span class="val">${Math.round(s.monde.olives * 100)}</span></div>
      <h3>Métiers reconnus</h3><p class="note">Personne n'a reçu de métier : chacun est reconnu pour ce qu'il fait réellement le plus souvent.</p>`;
    for (const m of ordre) {
      if (!rep[m]) continue;
      out += `<div class="ligne"><span class="lib"><i class="ico" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hex(METIERS[m].couleur)}"></i> ${METIERS[m].nom}${rep[m] > 1 && m !== 'sans' ? 's' : ''}</span><div class="barre"><i style="width:${(rep[m] / max) * 100}%;background:${hex(METIERS[m].couleur)}"></i></div><span class="val">${rep[m]}</span></div>`;
    }
    const regles = [];
    if (s.politique.contribution) regles.push('Chaque famille est invitée à apporter une part de ses récoltes');
    if (s.politique.rota) regles.push('Tour de rôle sur la jetée');
    if (s.politique.reparation) regles.push('Qui vole doit rendre le double');
    if (s.politique.surveillance) regles.push('Les voisins veillent les uns sur les autres');
    if (s.politique.anciens) regles.push('Un conseil des anciens aide aux médiations');
    for (const [a, fin] of Object.entries(s.normes)) if (fin > s.temps) regles.push(`${a === 'moinsBarques' ? 'Moins de barques en mer' : `Interdit de ${DEMANDES[a] || a}`} jusqu'au jour ${Math.floor(fin / 1440) + 1}`);
    out += `<h3>Décisions en vigueur</h3>${regles.length ? regles.map((r) => `<div class="note">• ${esc(r)}</div>`).join('') : '<p class="note">Aucune. Les règles naissent des questions que les habitants portent à l’assemblée ; chacun les respecte selon la confiance qu’il vous accorde.</p>'}`;

    out += `<h3>Chantiers</h3>`;
    if (s.projet) {
      const p = s.projet;
      const volontaires = s.habitants.filter((v) => v.activite?.action === 'construire').length;
      out += `<div class="carte-bloc"><b>${esc(p.nom)}</b> — ${p.enAttente ? 'en attente de matériaux' : `${Math.floor((p.progres / p.travail) * 100)} %`}
        ${barre(p.progres, p.travail, true)}<p class="note">${PROJETS[p.cle].effet}. ${volontaires} volontaire${volontaires > 1 ? 's' : ''} en ce moment. Personne n'y est obligé : vous pouvez le demander à quelqu'un depuis sa fiche.</p>
        <div class="boutons"><button class="btn" data-action="voir-chantier">Voir le chantier</button></div></div>`;
    } else {
      for (const [k, p] of Object.entries(PROJETS)) {
        const fait = s.bonus[k] && k !== 'maison';
        const cout = Object.entries(p.cout).map(([r, q]) => `${q} ${r}`).join(', ');
        out += `<div class="ligne" style="justify-content:space-between"><span><b>${p.nom}</b><br><small class="note">${cout} · ${p.effet}</small></span>
          <button class="btn" data-action="projet" data-cle="${k}" ${fait ? 'disabled' : ''}>${fait ? 'Fait' : s.peutPayer(p.cout) ? 'Ouvrir' : 'Réserver'}</button></div>`;
      }
    }

    out += `<h3>Commerce au port</h3>`;
    if (s.navire) {
      out += `<p class="note">Un navire marchand est à quai jusqu'à ${Math.floor(s.heure(s.navire))}h.</p><div class="boutons">
        <button class="btn" data-commerce="vendreHuile" ${s.res.huile < 10 ? 'disabled' : ''}>Vendre 10 huile → 32 pièces</button>
        <button class="btn" data-commerce="acheterNourriture" ${s.res.pieces < 30 ? 'disabled' : ''}>45 rations ← 30 pièces</button>
        <button class="btn" data-commerce="acheterBois" ${s.res.pieces < 25 ? 'disabled' : ''}>12 bois ← 25 pièces</button>
        <button class="btn" data-commerce="acheterPierre" ${s.res.pieces < 20 ? 'disabled' : ''}>12 pierre ← 20 pièces</button>
        <button class="btn" data-commerce="acheterRemedes" ${s.res.pieces < 30 ? 'disabled' : ''}>8 remèdes ← 30 pièces</button></div>`;
    } else out += `<p class="note">Aucun navire à quai. Les marchands passent certains matins.</p>`;

    out += `<h3>Partie</h3><div class="boutons">
      <button class="btn" data-action="sauver">Sauvegarder</button>
      <button class="btn" data-action="charger">Charger</button>
      <button class="btn danger" data-action="recommencer">Nouvelle île</button></div>`;
    return out;
  }

  // ---------- Émergence : ce qui est apparu sans être programmé ----------
  vueEmergence() {
    const s = this.sim;
    const st = s.stats;
    let out = `<h3>Ce qui a émergé</h3><p class="note">Rien de ce qui suit n'est écrit dans le code : ce sont des mesures de ce que les habitants ont fait d'eux-mêmes, par apprentissage, imitation et transmission.</p>
      <div class="grille2">
        <div class="stat"><b>${st.conversations}</b><span>conversations</span></div>
        <div class="stat"><b>${st.transmissions}</b><span>savoirs transmis de l'un à l'autre</span></div>
        <div class="stat"><b>${st.aides}</b><span>gestes d'entraide</span></div>
        <div class="stat"><b>${Math.round(st.dons)}</b><span>rations données à la réserve</span></div>
        <div class="stat"><b>${st.vols}</b><span>vols (${st.volsPris} pris sur le fait)</span></div>
        <div class="stat"><b>${st.confrontations}</b><span>règlements de comptes</span></div>
        <div class="stat"><b>${st.excuses}</b><span>excuses présentées</span></div>
        <div class="stat"><b>${st.disputes}</b><span>disputes</span></div>
      </div>`;
    const types = ['dormir', 'manger', 'travailler', 'socialiser', 'flaner', 'prier', 'ecole', 'jouer', 'rester', 'aider'];
    out += `<h3>La journée type, telle qu'elle s'est formée</h3><div class="routine">`;
    for (const t of types) {
      out += `<div class="routine-ligne"><span>${LIB_RENDU[t]}</span>`;
      for (let h = 0; h < 24; h++) {
        const r = st.routine[h];
        const tot = Object.values(r).reduce((a, b) => a + b, 0) || 1;
        const f = (r[t] || 0) / tot;
        out += `<i title="${h}h : ${Math.round(f * 100)} %" style="opacity:${Math.min(1, 0.06 + f * 1.6).toFixed(2)}"></i>`;
      }
      out += '</div>';
    }
    out += `<div class="routine-ligne heures"><span></span>${Array.from({ length: 24 }, (_, h) => `<b>${h % 6 === 0 ? h : ''}</b>`).join('')}</div></div>`;
    const savoirs = {};
    for (const v of s.habitants) for (const c of croyances(s, v, 3)) if (c.effet > 0) savoirs[c.texte] = (savoirs[c.texte] || 0) + 1;
    const top = Object.entries(savoirs).sort((a, b) => b[1] - a[1]).slice(0, 6);
    out += `<h3>Savoirs les plus partagés</h3>${top.length ? top.map(([t, n]) => `<div class="note">• ${n} habitant${n > 1 ? 's' : ''} : « ${esc(t)} »</div>`).join('') : '<p class="note">Pas encore de savoir commun.</p>'}`;
    const decouv = st.decouvertes.slice(-8).reverse();
    out += `<h3>Premières fois sur l'île</h3>${decouv.map((d) => `<div class="note">• ${esc(s.horodatage(d.t))} — <span class="lien" data-hab="${d.id}">${esc(s.habitant(d.id).prenom)}</span> : ${esc(ACTIONS[d.a]?.etat.toLowerCase() || d.a)}</div>`).join('')}`;
    if (s.historique.length > 1) out += `<h3>Évolution</h3>${this.courbe(s.historique)}`;
    return out;
  }

  courbe(hist) {
    const W = 330, H = 70;
    const pts = (f, max) => hist.map((h, i) => `${(i / Math.max(1, hist.length - 1)) * W},${H - Math.min(1, f(h) / max) * H}`).join(' ');
    const maxN = Math.max(100, ...hist.map((h) => h.nourriture));
    return `<svg viewBox="0 -4 ${W} ${H + 8}" width="100%" height="${H + 8}" role="img" aria-label="Évolution du bien-être, de la confiance, des vivres et du poisson">
      <polyline fill="none" stroke="#6fbf73" stroke-width="2" points="${pts((h) => h.moral, 100)}"/>
      <polyline fill="none" stroke="#e6b450" stroke-width="2" points="${pts((h) => h.confiance, 100)}"/>
      <polyline fill="none" stroke="#8fb85a" stroke-dasharray="4 3" stroke-width="1.5" points="${pts((h) => h.nourriture, maxN)}"/>
      <polyline fill="none" stroke="#6aa8d8" stroke-width="1.5" points="${pts((h) => (h.poisson ?? 1) * 100, 100)}"/>
    </svg><p class="note"><span style="color:#6fbf73">━ bien-être</span> · <span style="color:#e6b450">━ confiance</span> · <span style="color:#8fb85a">╌ vivres</span> · <span style="color:#6aa8d8">━ poisson</span> (par jour)</p>`;
  }

  // ---------- Habitants ----------
  vueHabitants() {
    const s = this.sim;
    const f = this.filtre;
    const liste = s.habitants.filter((v) => (!f.metier || v.metier === f.metier) && (!f.texte || nomComplet(v).toLowerCase().includes(f.texte.toLowerCase())));
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
      <select id="tri" aria-label="Trier"><option value="nom" ${f.tri === 'nom' ? 'selected' : ''}>Nom</option><option value="famille" ${f.tri === 'famille' ? 'selected' : ''}>Famille</option><option value="moral" ${f.tri === 'moral' ? 'selected' : ''}>Bien-être ↑</option><option value="confiance" ${f.tri === 'confiance' ? 'selected' : ''}>Confiance ↑</option></select></div>
      <p class="note">${liste.length} habitant${liste.length > 1 ? 's' : ''} · barre = bien-être</p><div class="liste-hab">`;
    for (const v of liste) {
      out += `<div class="hab ${this.selection === v.id ? 'sel' : ''}" data-hab="${v.id}">
        <span class="pt" style="background:${hex(METIERS[v.metier]?.couleur ?? 0x888888)}"></span>
        <span><span class="nom">${esc(nomComplet(v))}</span> <small class="note">${v.age} ans · ${esc(libelleMetier(v))}${v.malade ? ' · malade' : ''}</small><span class="etat">${esc(this.etat(v))}</span></span>
        <span class="mini">${barre(v.moral)}</span></div>`;
    }
    return out + '</div>';
  }

  etat(v) {
    const s = this.sim;
    if (v.conversation) {
      const autre = s.habitant(v.conversation.a === v.id ? v.conversation.b : v.conversation.a);
      return v.conversation.dispute ? `Se dispute avec ${autre.prenom}` : `Discute avec ${autre.prenom}`;
    }
    if (v.path) return `En route : ${v.activite?.etat?.toLowerCase() || '…'}`;
    return v.activite?.etat || 'Se réveille';
  }

  // ---------- Conflits ----------
  vueConflits() {
    const s = this.sim;
    const ouverts = s.conflits.filter((c) => !c.resolu);
    let out = `<h3>Différends en cours</h3><p class="note">Ils naissent de torts réellement vécus (un vol, une place prise, une accusation). Leur gravité est la rancune réelle des deux parties, qui s'apaise ou s'aggrave selon ce qu'ils vivent.</p>`;
    if (!ouverts.length) out += `<p class="note">Aucun différend ouvert.</p>`;
    for (const c of ouverts) {
      const a = s.habitant(c.a), b = s.habitant(c.b);
      const ga = a.esprit.griefs[b.id] || 0, gb = b.esprit.griefs[a.id] || 0;
      out += `<div class="carte-bloc conflit">
        <div><span class="lien" data-hab="${a.id}">${esc(nomComplet(a))}</span> et <span class="lien" data-hab="${b.id}">${esc(nomComplet(b))}</span></div>
        <div class="note">${c.type === 'vol' ? 'Vol' : 'Dispute'} — ${esc(c.motif)} · ${esc(s.horodatage(c.t))}</div>
        <div class="note">Gravité <span class="gravite">${'●'.repeat(c.gravite)}${'○'.repeat(3 - c.gravite)}</span> · rancune ${Math.round(ga * 100)} / ${Math.round(gb * 100)} · confiance ${Math.round(a.confiance)} / ${Math.round(b.confiance)}</div>
        <div class="boutons">
          <button class="btn principal" data-conflit="${c.id}" data-option="mediation">Médiation</button>
          <button class="btn" data-conflit="${c.id}" data-option="a">Raison à ${esc(a.prenom)}</button>
          <button class="btn" data-conflit="${c.id}" data-option="b">Raison à ${esc(b.prenom)}</button>
          <button class="btn" data-conflit="${c.id}" data-option="compensation" ${s.res.pieces < 15 ? 'disabled' : ''}>Dédommager (15 pièces)</button>
          <button class="btn" data-conflit="${c.id}" data-option="ignorer">Ignorer</button>
        </div></div>`;
    }
    const resolus = s.conflits.filter((c) => c.resolu).slice(-8).reverse();
    if (resolus.length) {
      const lib = { mediation: 'réconciliés par médiation', a: 'tranché par le conseil', b: 'tranché par le conseil', compensation: 'dédommagés', ignorer: 'ignoré par le conseil', spontane: "réglé d'eux-mêmes" };
      out += `<h3>Récemment clos</h3>${resolus.map((c) => `<div class="note">• ${esc(s.habitant(c.a).prenom)} / ${esc(s.habitant(c.b).prenom)} — ${esc(c.motif)} : ${lib[c.issue] || 'clos'}</div>`).join('')}`;
    }
    return out;
  }

  // ---------- Assemblée ----------
  vueAssemblee() {
    const s = this.sim;
    let out = '';
    const as = s.assemblee;
    if (as) {
      const total = Object.values(as.votes).reduce((a, b) => a + b, 0);
      out += `<h3>Question portée par les habitants</h3><div class="carte-bloc"><b>${esc(as.prop.titre)}</b><p class="note">${esc(as.prop.contexte)} Chacun a donné son avis d'après ce qu'il a lui-même vécu.</p>`;
      for (const o of as.prop.options) {
        const n = as.votes[o.id];
        out += `<div class="option-vote"><div class="tete"><span>${esc(o.label)}</span><span>${n} voix · ${Math.round((n / total) * 100)} %</span></div>${barre(n, total, true)}
          <div class="boutons"><button class="btn" data-decision="${o.id}">Trancher pour cette option</button></div></div>`;
      }
      out += `<p class="note">Ceux dont l'avis n'est pas suivi s'en souviendront. Sans décision dans ${Math.floor(Math.max(0, as.expire - s.temps) / 60)} h, l'assemblée se dispersera.</p></div>`;
    } else {
      out += `<h3>Assemblée</h3><p class="note">Personne ne la convoque à heure fixe : quand un problème revient assez souvent dans le vécu de plusieurs habitants, l'un d'eux réunit le village sur la place, le soir.</p>`;
      const plaintes = Object.entries(s.plaintes).filter(([, p]) => p.n > 0.5).sort((a, b) => b[1].n - a[1].n);
      if (plaintes.length) {
        out += `<h3>Ce qui monte dans le village</h3>`;
        const noms = { faim: 'La faim', jetee: 'La place sur la jetée', mer: 'La pêche qui s’épuise', foret: 'La pinède qui s’éclaircit', vol: 'Les vols', disputes: 'Les disputes' };
        for (const [k, p] of plaintes) out += `<div class="ligne"><span class="lib">${noms[k] || k}</span>${barre(p.n, 6)}<span class="val">${Object.values(p.porteurs).filter((x) => x > 0.3).length}</span></div>`;
        out += `<p class="note">Le chiffre indique combien d'habitants l'ont vécu récemment.</p>`;
      }
    }
    if (s.historiqueAssemblees.length) {
      out += `<h3>Décisions passées</h3>`;
      for (const h of [...s.historiqueAssemblees].reverse()) {
        out += `<div class="journal-e ${h.majorite ? 'bien' : 'mal'}"><time>${esc(s.horodatage(h.t))}</time>${esc(h.titre)}<br><b>${esc(h.choix)}</b> ${h.majorite ? '(avec la majorité)' : '(contre la majorité)'}</div>`;
      }
    }
    return out;
  }

  // ---------- Journal ----------
  vueJournal() {
    const s = this.sim;
    let out = `<h3>Chronique du village</h3>`;
    for (const e of [...s.journal].reverse().slice(0, 150)) {
      out += `<div class="journal-e ${e.type} ${e.prehistoire ? 'ancien' : ''}" ${e.sujets?.length ? `data-sujet="${e.sujets[0]}"` : ''}><time>${esc(s.horodatage(e.t))}${e.prehistoire ? ' · avant votre arrivée' : ''}</time>${esc(e.texte)}</div>`;
    }
    return out;
  }

  // ---------- Événements ----------
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
      this.toast('Décision prise. Chacun s’en souviendra.', 'conseil');
    } else if (t.dataset.commerce) {
      const r = s.commercer(t.dataset.commerce);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'bien' : 'mal');
    } else if (t.dataset.action === 'projet') {
      const r = s.lancerProjet(t.dataset.cle);
      if (!r.ok) this.toast(r.raison, 'mal');
    } else if (t.dataset.action === 'distribuer') {
      const r = s.distribuerReserve(0.6, true);
      this.toast(r.ok ? r.message : r.raison, r.ok ? 'conseil' : 'mal');
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
    const actif = document.activeElement;
    if (!force && el.contains(actif) && (actif.tagName === 'SELECT' || actif.tagName === 'INPUT')) return;
    const s = this.sim;
    const v = s.habitant(this.selection);
    el.hidden = false;
    const scroll = el.scrollTop;
    const F = v.genre === 'F';
    const il = F ? 'elle' : 'il';
    const foyer = s.batiment(v.foyer);
    const famille = v.famille.map((id) => s.habitant(id));
    const rels = Object.entries(v.relations)
      .map(([id, r]) => ({ o: s.habitant(Number(id)), r }))
      .filter((x) => !v.famille.includes(x.o.id) && (x.r.fam > 35 || Math.abs(x.r.aff) > 20))
      .sort((a, b) => Math.abs(b.r.aff) - Math.abs(a.r.aff))
      .slice(0, 6);
    const griefs = Object.entries(v.esprit.griefs).filter(([, g]) => g > 0.1).sort((a, b) => b[1] - a[1]);
    const souvenirs = [...v.memoire].sort((a, b) => b.t - a.t).slice(0, 9);
    const opinion = v.confiance >= 70 ? 'a pleinement confiance dans le conseil' : v.confiance >= 50 ? 'fait plutôt confiance au conseil' : v.confiance >= 30 ? 'se méfie du conseil' : 'a perdu confiance dans le conseil';
    const appris = croyances(s, v, 5);
    const comp = Object.entries(v.esprit.competence).filter(([, c]) => c > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const ref = v.reflexion && s.temps - v.reflexion.t < 2880 ? v.reflexion : null;

    let html = `<div class="entete"><div><h2>${esc(nomComplet(v))}</h2>
      <div class="sous">${v.age} ans · ${esc(libelleMetier(v))} · ${esc(foyer?.nom || '')} (${Math.round(s.foyers[v.foyer]?.nourriture ?? 0)} rations)</div></div>
      <button class="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></div>
      <div class="pensee">« ${esc(pensee(v, s))} »${ref ? `<small>${ref.source === 'Claude' ? 'Réflexion du soir (Claude)' : 'Réflexion du soir'}</small>` : ''}</div>
      <div class="etat-actuel"><b>${esc(this.etat(v))}</b>${v.malade ? ' · <span class="neg">malade</span>' : ''}${v.reposJusqua > s.temps ? ' · au repos' : ''}</div>
      <div class="note">${esc(decrire(v))}. ${F ? 'Elle' : 'Il'} ${opinion}.${v.intention && s.temps < v.intention.jusqua ? ` Intention : ${esc(ACTIONS[v.intention.action]?.etat.toLowerCase() || v.intention.action)}${v.intention.raison ? ` (${esc(v.intention.raison)})` : ''}.` : ''}</div>

      <h3>Parler à ${esc(v.prenom)}</h3>
      <div class="dialogue">${(v.dialogue || []).slice(-6).map((d) => `<p class="${d.de === 'conseil' ? 'moi' : 'lui'}"><b>${d.de === 'conseil' ? 'Conseil' : esc(d.de)}</b> ${esc(d.texte)}</p>`).join('') || `<p class="note">${this.cerveau?.disponible ? `Claude prête sa voix à ${esc(v.prenom)}, d'après son vécu simulé.` : 'Claude n’est pas connecté : la réponse viendra de son état simulé.'}</p>`}</div>
      <form class="parole"><input id="parole" type="text" maxlength="300" placeholder="Que voulez-vous lui dire ?" autocomplete="off"><button class="btn" type="submit">Dire</button></form>

      <h3>Ce que le conseil peut faire</h3>
      <div class="metier-sel"><label for="choix-demande" class="note">Demander de</label><select id="choix-demande">
        <option value="">— aucune demande —</option>
        ${Object.entries(DEMANDES).map(([a, l]) => `<option value="${a}" ${v.demande === a ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
      <p class="note">Une demande n'est pas un ordre : elle pèse selon la confiance de ${esc(v.prenom)} (${Math.round(v.confiance)}/100) et peut braquer s'${il} se méfie.</p>
      <div class="boutons">
        <button class="btn" data-aide="ecouter">Écouter</button>
        <button class="btn" data-aide="nourriture" title="4 rations de la réserve commune pour sa famille">Panier de vivres</button>
        <button class="btn" data-aide="remedes" title="−1 remède">Soigner</button>
        <button class="btn" data-aide="repos" ${v.age < 17 ? 'disabled' : ''}>Jour de repos</button>
        <button class="btn" data-suivre>Suivre</button></div>

      <h3>Besoins</h3>
      ${[['faim', 'Satiété'], ['energie', 'Énergie'], ['social', 'Vie sociale'], ['sante', 'Santé'], ['serenite', 'Sérénité'], ['estime', 'Estime de soi']].map(([k, l]) => `<div class="ligne"><span class="lib">${l}</span>${barre(v.besoins[k])}<span class="val">${Math.round(v.besoins[k])}</span></div>`).join('')}
      <div class="ligne"><span class="lib"><b>Bien-être</b></span>${barre(v.moral)}<span class="val">${Math.round(v.moral)}</span></div>
      <div class="ligne"><span class="lib"><b>Confiance (conseil)</b></span>${barre(v.confiance)}<span class="val">${Math.round(v.confiance)}</span></div>

      <h3>Ce qu'${il} a appris (${v.esprit.appris} expériences, ${v.esprit.transmis} conseils reçus)</h3>
      ${appris.length ? appris.map((c) => `<div class="note">• ${esc(c.texte)} <small>(${c.n.toFixed(0)}×)</small></div>`).join('') : `<p class="note">${F ? 'Elle' : 'Il'} n'a encore rien tiré de clair de ses expériences.</p>`}
      ${comp.length ? `<div class="note">Savoir-faire : ${comp.map(([a, c]) => `${esc(ACTIONS[a].etat.toLowerCase())} ${Math.round(c * 100)} %`).join(' · ')}</div>` : ''}

      <h3>Tempérament inné</h3>`;
    for (const [k, lib] of Object.entries(TRAIT_LABELS)) html += `<div class="ligne"><span class="lib">${lib.split(' (')[0]}</span>${barre(v.traits[k] * 100, 100, true)}<span class="val">${Math.round(v.traits[k] * 100)}</span></div>`;

    if (griefs.length) html += `<h3>Rancunes</h3>${griefs.map(([id, g]) => `<div class="relation"><span class="lien" data-hab="${id}">${esc(s.habitant(Number(id)).prenom)}</span><span class="note">${esc(v.esprit.griefMotif?.[id] || 'un tort')}</span><span class="aff neg">${Math.round(g * 100)}</span></div>`).join('')}`;
    html += `<h3>Famille</h3>${famille.length ? famille.map((o) => `<div class="relation"><span class="lien" data-hab="${o.id}">${esc(o.prenom)}</span><span class="note">${o.age} ans · ${esc(libelleMetier(o))}</span><span class="aff ${relation(v, o.id).aff >= 0 ? 'pos' : 'neg'}">${Math.round(relation(v, o.id).aff)}</span></div>`).join('') : '<p class="note">Seul' + (F ? 'e' : '') + '.</p>'}
      <h3>Relations nouées</h3>${rels.length ? rels.map(({ o, r }) => `<div class="relation"><span class="lien" data-hab="${o.id}">${esc(nomComplet(o))}</span><span class="note">${libelleRelation(r, false)}</span><span class="aff ${r.aff >= 0 ? 'pos' : 'neg'}">${Math.round(r.aff)}</span></div>`).join('') : '<p class="note">Pas encore de lien marqué.</p>'}
      <h3>Mémoire (${v.memoire.length} souvenirs)</h3>`;
    for (const m of souvenirs) {
      const c = m.valence > 0.15 ? 'var(--vert)' : m.valence < -0.15 ? 'var(--rouge)' : 'var(--doux)';
      html += `<div class="souvenir"><i style="background:${c};opacity:${0.35 + m.importance * 0.65}"></i><span>${esc(m.texte)}<small>${esc(s.horodatage(m.t))}${m.sujet === 'conseil' ? ' · à propos du conseil' : ''} · ${Math.round(m.importance * 100)} %</small></span></div>`;
    }
    html += `<p class="note">${v.stats.conversations} conversations · ${v.stats.aides} aides · ${Math.round(v.stats.dons)} rations données · ${v.stats.vols} vols · ${v.stats.disputes} disputes · ${v.stats.excuses} excuses</p>`;
    if (el.dataset.cache !== html) {
      const saisie = $('#parole')?.value || '';
      el.innerHTML = html;
      el.dataset.cache = html;
      el.scrollTop = scroll;
      if (saisie && $('#parole')) $('#parole').value = saisie;
    }
  }
}
