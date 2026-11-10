// Tiny string table. English is the source of truth; other languages may be partial and fall back per key.
export const STRINGS = {
  en: {
    'btn.reroll': 'Stitch a new village',
    'btn.share': 'Copy share link',
    'btn.shared': 'Link copied',
    'btn.sharefail': 'Copy the address bar',
    'btn.whisper': 'Hear a whisper (-8)',
    'btn.church': 'Enter the church (-15)',
    'btn.candle': 'Light a candle (+10)',
    'btn.postcard': 'Save postcard (PNG)',
    'btn.save': 'Save session',
    'btn.load': 'Load session',
    'btn.casefile': 'Download case file',
    'btn.map': 'Map (G)',
    'label.dread': 'Dread {n}%',
    'label.seed': 'Seed',
    'label.night': 'Night',
    'title.whispers': 'Whispers',
    'title.map': 'Village map',
    'msg.saved': 'Session saved on this device.',
    'msg.loaded': 'Session loaded.',
    'msg.nosave': 'Nothing saved yet, or storage is unavailable.',
  },
  fr: {
    'btn.reroll': 'Coudre un nouveau village',
    'btn.share': 'Copier le lien',
    'btn.shared': 'Lien copie',
    'btn.sharefail': 'Copiez la barre d\'adresse',
    'btn.whisper': 'Ecouter un murmure (-8)',
    'btn.church': 'Entrer dans l\'eglise (-15)',
    'btn.candle': 'Allumer une bougie (+10)',
    'btn.postcard': 'Enregistrer la carte postale (PNG)',
    'btn.save': 'Sauvegarder la session',
    'btn.load': 'Charger la session',
    'btn.casefile': 'Telecharger le dossier',
    'btn.map': 'Carte (G)',
    'label.dread': 'Effroi {n}%',
    'label.seed': 'Graine',
    'label.night': 'Nuit',
    'title.whispers': 'Murmures',
    'title.map': 'Carte du village',
    'msg.saved': 'Session sauvegardee sur cet appareil.',
    'msg.loaded': 'Session chargee.',
    'msg.nosave': 'Rien de sauvegarde, ou stockage indisponible.',
  },
};
export const LANGS = Object.keys(STRINGS);
export const DEFAULT_LANG = 'en';

export function parseLang(v) {
  const s = String(v || '').toLowerCase().slice(0, 2);
  return LANGS.includes(s) ? s : DEFAULT_LANG;
}
/** Keys present in `lang` but missing from English (must be empty). */
export const extraKeys = (lang) => Object.keys(STRINGS[lang] || {}).filter((k) => !(k in STRINGS.en));

export function t(key, lang = DEFAULT_LANG, vars = {}) {
  const raw = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
