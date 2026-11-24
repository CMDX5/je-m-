// Fournisseurs de modèles gratuits, tous joints par leur interface compatible OpenAI.
// Fichier préfixé « _ » : Vercel ne le publie pas comme une fonction.
export const FOURNISSEURS = {
  groq: { nom: 'Groq', base: 'https://api.groq.com/openai/v1' },
  gemini: { nom: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
};

// Le jeu envoie x-fournisseur et x-cle ; x-groq-key reste accepté pour les anciennes versions de la page.
export function lireFournisseur(req) {
  const id = String(req.headers['x-fournisseur'] || 'groq');
  const f = FOURNISSEURS[id];
  const cle = req.headers['x-cle'] || req.headers['x-groq-key'];
  return f ? { id, ...f, cle } : null;
}

// ---------- Appels aux fournisseurs (utilisés par api/pensee.js, api/modeles.js et par le relais de nuit) ----------
// Gemini n'annonce pas toujours retry-after : on lit le délai dans le message d'erreur.
// Un quota « par jour » épuisé vaut une longue attente : le jeu passe alors à un autre modèle.
function attenteDepuis(r, texte) {
  if (/per ?day|PerDay|daily/i.test(texte)) return 3600;
  const entete = Number(r.headers.get('retry-after'));
  if (entete) return entete;
  const m = texte.match(/retry(?:Delay)?["\s:]*(?:in\s*)?"?([\d.]+)\s*s/i);
  return m ? Math.ceil(Number(m[1])) : 20;
}

export const DELAI_PENSEE_MS = 50000;
export const DELAI_MODELES_MS = 15000;

async function appeler(f, modele, prompt, avecReflexionCourte) {
  // les modèles qui « réfléchissent » avant de répondre consomment ces jetons dans le quota gratuit
  const reflexion = avecReflexionCourte && (/gpt-oss/.test(modele) || (f.id === 'gemini' && /gemini/.test(modele))) ? { reasoning_effort: 'low' } : {};
  return fetch(`${f.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${f.cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modele, temperature: 0.8, max_tokens: 6000, response_format: { type: 'json_object' },
      ...reflexion,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(DELAI_PENSEE_MS), // un fournisseur qui ne répond pas ne doit pas bloquer la fonction (300 s)
  });
}

// f = { id, nom, base, cle }. Renvoie { status, corps } : ce que la page reçoit de api/pensee.
export async function appelerPensee(f, modele, prompt) {
  try {
    let r = await appeler(f, modele, prompt, true);
    // un modèle qui ne connaît pas le réglage de réflexion : nouvel essai sans lui
    if (r.status === 400) r = await appeler(f, modele, prompt, false);
    // quotas restants annoncés (Groq) : le jeu s'en sert pour régler son rythme
    const quota = {
      jetons: Number(r.headers.get('x-ratelimit-remaining-tokens') ?? NaN),
      jetonsReset: r.headers.get('x-ratelimit-reset-tokens') || '',
      requetes: Number(r.headers.get('x-ratelimit-remaining-requests') ?? NaN),
      requetesReset: r.headers.get('x-ratelimit-reset-requests') || '',
    };
    if (r.status === 429) {
      const texte = await r.text().catch(() => '');
      return { status: 429, corps: { erreur: `limite ${f.nom} atteinte`, attente: attenteDepuis(r, texte), quota } };
    }
    if (r.status === 401 || r.status === 403) return { status: 401, corps: { erreur: `clé refusée par ${f.nom}` } };
    if (r.status === 404) return { status: 404, corps: { erreur: `modèle ${modele} introuvable chez ${f.nom}`, retirer: true } };
    if (!r.ok) {
      const texte = (await r.text().catch(() => '')).slice(0, 300);
      // modèle surchargé ou en panne chez le fournisseur : passager, on réessaiera plus tard
      if (r.status >= 500) return { status: 503, corps: { erreur: `${f.nom} surchargé`, attente: 60, detail: texte } };
      // message trop long pour ce modèle, ou modèle qui refuse ce format : on ne s'en sert plus
      return { status: 422, corps: { erreur: `${modele} ne convient pas`, retirer: true, detail: texte } };
    }
    const j = await r.json();
    return { status: 200, corps: { texte: j.choices?.[0]?.message?.content ?? '', quota, jetonsUtilises: j.usage?.total_tokens ?? null } };
  } catch {
    return { status: 502, corps: { erreur: `${f.nom} injoignable` } };
  }
}

// Renvoie { status, corps } : ce que la page reçoit de api/modeles (sert aussi à vérifier la clé).
export async function listerModeles(f) {
  try {
    const r = await fetch(`${f.base}/models`, { headers: { Authorization: `Bearer ${f.cle}` }, signal: AbortSignal.timeout(DELAI_MODELES_MS) });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { status: 401, corps: { erreur: `clé refusée par ${f.nom}` } };
    if (!r.ok) return { status: 502, corps: { erreur: `${f.nom} a répondu ${r.status}` } };
    const j = await r.json();
    return { status: 200, corps: { modeles: (j.data || []).map((m) => String(m.id).replace(/^models\//, '')) } };
  } catch {
    return { status: 502, corps: { erreur: `${f.nom} injoignable` } };
  }
}
