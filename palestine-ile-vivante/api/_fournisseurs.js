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
