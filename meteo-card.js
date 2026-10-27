/*
 * Cartes Météo pour Home Assistant, dans un seul fichier :
 *   meteo-card        météo du jour, une ou plusieurs villes en onglets : conditions, ressenti, vent, humidité,
 *                     pression, détails Météo-France, vigilance, prévisions par heure et par jour, saison, lune ;
 *   meteo-ciel-card   baromètre, boussole du vent, températures, pluie du jour, indice UV, carte Windy ;
 *   meteo-astro-card  soleil (boussole, course du jour, aube, lever, midi, coucher, crépuscule), lune (phase,
 *                     lever, coucher, fenêtre des phases), cycles et pollens ;
 *   meteo-air-card    qualité de l'air et polluants (Atmo France), pollens, vigilance sécheresse (VigiEau) ;
 *   meteo-eclairs-card  direction et distance du dernier éclair, compteur d'éclairs (Blitzortung).
 * Soleil et lune sont calculés d'après les coordonnées de Home Assistant : aucun capteur ni image à fournir.
 * Fonctionne avec toute entité weather (Météo-France, OpenWeatherMap, Met.no…) ; les prévisions sont lues
 * comme le fait Home Assistant (abonnement weather/subscribe_forecast).
 * Même style que la Carte Enedis Linky New et les Cartes Linky Énergie, mais indépendante.
 * Idées et vue météo d'origine : WarC0zes (forum HACF).
 * Icônes météo : amCharts (CC BY 4.0), jeu repris par la carte Météo-France de HACF.
 *
 *   type: custom:meteo-card
 *   entity: weather.ma_ville          (facultatif : la première entité weather, Météo-France en priorité)
 *   alert: sensor.xx_weather_alert    (facultatif : vigilance Météo-France détectée)
 *   ec_alerts: [sensor.ville_alertes, …]  (facultatif : alertes Environnement Canada détectées)
 *   entities: [weather.a, weather.b]  (facultatif : plusieurs villes en onglets)
 *   forecasts: [hourly, daily]        (facultatif : plusieurs prévisions l'une sous l'autre)
 *
 *   type: custom:meteo-ciel-card      (tout est détecté ; voir le README pour les options)
 *   type: custom:meteo-astro-card
 *   type: custom:meteo-air-card
 *   type: custom:meteo-eclairs-card
 */

(() => {
const CARD_VERSION = "3.2.2";

/* ------------------------------------------------------------- affichage */

const fmt = (n, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Classe de thème de la carte :
 *  v2   : style MyElectricalData, toujours bleu nuit ;
 *  auto : style MyElectricalData, bleu nuit si Home Assistant est en mode sombre, clair sinon ;
 *  ha   : couleurs du thème Home Assistant (clair ou sombre). */
const themeClass = (theme, hass) => {
  const light = hass?.themes?.darkMode === false;
  if (theme === "ha") return `th-ha${light ? " light" : ""}`;
  if (theme === "auto") return `th-v2${light ? " light" : ""}`;
  return "th-v2";
};

const num = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

/* ------------------------------------------------------------ référentiels */

/** Conditions : libellé, icône et couleur. */
const COND = {
  "sunny": ["Ensoleillé", "mdi:weather-sunny", "#f7c948"],
  "clear-night": ["Nuit claire", "mdi:weather-night", "#9fb4d8"],
  "partlycloudy": ["Partiellement nuageux", "mdi:weather-partly-cloudy", "#f7c948"],
  "cloudy": ["Nuageux", "mdi:weather-cloudy", "#8fa0b8"],
  "fog": ["Brouillard", "mdi:weather-fog", "#8fa0b8"],
  "hail": ["Grêle", "mdi:weather-hail", "#cfe3ff"],
  "lightning": ["Orages", "mdi:weather-lightning", "#b38cf0"],
  "lightning-rainy": ["Orages et pluie", "mdi:weather-lightning-rainy", "#b38cf0"],
  "pouring": ["Pluie forte", "mdi:weather-pouring", "#1d93e3"],
  "rainy": ["Pluvieux", "mdi:weather-rainy", "#1d93e3"],
  "snowy": ["Neige", "mdi:weather-snowy", "#cfe3ff"],
  "snowy-rainy": ["Pluie et neige", "mdi:weather-snowy-rainy", "#cfe3ff"],
  "windy": ["Venteux", "mdi:weather-windy", "#8fa0b8"],
  "windy-variant": ["Très venteux", "mdi:weather-windy-variant", "#8fa0b8"],
  "exceptional": ["Exceptionnel", "mdi:alert-circle-outline", "#ee4a4a"],
};
const condOf = (c) => COND[c] || [c ? String(c) : "Inconnu", "mdi:weather-cloudy-alert", "#8fa0b8"];

const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const compass16 = (deg) => COMPASS16[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];
const compass = (deg) => (num(deg) === null ? "" : COMPASS[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8]);

/** Vigilance Météo-France : niveaux et phénomènes. */
const LEVELS = { vert: 0, green: 0, jaune: 1, yellow: 1, orange: 2, rouge: 3, red: 3 };
const LEVEL_LABEL = ["Vert", "Jaune", "Orange", "Rouge"];
const LEVEL_COLOR = ["#5fcf8a", "#f7c948", "#ff8c33", "#ee4a4a"];
const PHENO_ICON = [
  [/vent/i, "mdi:weather-windy"], [/pluie/i, "mdi:weather-pouring"], [/orage/i, "mdi:weather-lightning"],
  [/inondation/i, "mdi:home-flood"], [/neige|verglas/i, "mdi:snowflake-alert"], [/canicule/i, "mdi:sun-thermometer"],
  [/froid/i, "mdi:snowflake-thermometer"], [/avalanche/i, "mdi:image-filter-hdr"], [/vague|submersion|côtier|cotier/i, "mdi:waves"],
];
const phenoIcon = (name) => (PHENO_ICON.find(([re]) => re.test(name)) || [, "mdi:alert"])[1];
const levelOf = (v) => LEVELS[String(v ?? "").trim().toLowerCase()];
/** Un capteur de vigilance porte un niveau (Vert, Jaune…) dans son état ou ses attributs. */
const isAlert = (st) => !!st && (levelOf(st.state) !== undefined || Object.values(st.attributes || {}).some((v) => levelOf(v) !== undefined));

/** Alertes Environnement Canada : 5 capteurs par lieu (état = nombre d'alertes, attributs alert_N = titre,
 *  alert_time_N = date). La couleur réelle vient de l'action environment_canada.get_alerts ; à défaut, le
 *  niveau est déduit du type. Les terminaisons (alertes levées) ne sont pas affichées. */
const EC_KINDS = {
  warnings: { label: "Avertissement", level: 2, icon: "mdi:alert", re: /_(alertes|avertissements|warnings)$/ },
  watches: { label: "Veille", level: 1, icon: "mdi:eye-outline", re: /_(veilles|watches)$/ },
  advisories: { label: "Avis", level: 1, icon: "mdi:information-outline", re: /_(avis|advisories)$/ },
  statements: { label: "Bulletin", level: 0, icon: "mdi:bullhorn-outline", re: /_(bulletins|statements)$/ },
  endings: { label: "Terminaison", level: 0, icon: "mdi:check-circle-outline", re: /_(terminaisons|endings)$/ },
};
const EC_SHOWN = ["warnings", "watches", "advisories", "statements"];
const EC_COLOUR = { yellow: 1, jaune: 1, orange: 2, red: 3, rouge: 3 };
const INFO_COLOR = "#7cc4f5";
const ecKind = (hass, id) => {
  const tk = hass?.entities?.[id]?.translation_key;
  return EC_KINDS[tk] ? tk : Object.keys(EC_KINDS).find((k) => EC_KINDS[k].re.test(id));
};
/** Capteurs d'alertes Environnement Canada d'une ville, par type ({ warnings: id, … }), ou null. */
const ecSensorsOf = (hass, weather, given, fallback) => {
  const reg = hass?.entities || {};
  let ids;
  if (given === "-") return null;
  if (given) ids = (Array.isArray(given) ? given : [given]).filter((id) => hass?.states?.[id]);
  else {
    const all = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor.") && reg[id]?.platform === "environment_canada" && ecKind(hass, id));
    if (!all.length) return null;
    const dev = reg[weather]?.device_id;
    ids = dev ? all.filter((id) => reg[id]?.device_id === dev) : [];
    // pas sur le même appareil que la ville : le premier lieu trouvé (première ville seulement)
    if (!ids.length && fallback) ids = all.filter((id) => reg[id]?.device_id === reg[all[0]]?.device_id);
  }
  const out = {};
  for (const id of ids) { const k = ecKind(hass, id); if (k && !out[k]) out[k] = id; }
  return Object.keys(out).length ? out : null;
};

/** Saison, lune, zodiaque : libellé et icône. */
const SEASON = {
  spring: ["Printemps", "mdi:flower", "#5fcf8a"], summer: ["Été", "mdi:white-balance-sunny", "#f7c948"],
  autumn: ["Automne", "mdi:leaf-maple", "#f08a4b"], winter: ["Hiver", "mdi:snowflake", "#9fd0ff"],
  printemps: ["Printemps", "mdi:flower", "#5fcf8a"], "été": ["Été", "mdi:white-balance-sunny", "#f7c948"],
  automne: ["Automne", "mdi:leaf-maple", "#f08a4b"], hiver: ["Hiver", "mdi:snowflake", "#9fd0ff"],
};
const MOON = {
  new_moon: ["Nouvelle lune", "mdi:moon-new"], waxing_crescent: ["Premier croissant", "mdi:moon-waxing-crescent"],
  first_quarter: ["Premier quartier", "mdi:moon-first-quarter"], waxing_gibbous: ["Gibbeuse croissante", "mdi:moon-waxing-gibbous"],
  full_moon: ["Pleine lune", "mdi:moon-full"], waning_gibbous: ["Gibbeuse décroissante", "mdi:moon-waning-gibbous"],
  last_quarter: ["Dernier quartier", "mdi:moon-last-quarter"], waning_crescent: ["Dernier croissant", "mdi:moon-waning-crescent"],
};
const ZODIAC = {
  aries: "Bélier", taurus: "Taureau", gemini: "Gémeaux", cancer: "Cancer", leo: "Lion", virgo: "Vierge",
  libra: "Balance", scorpio: "Scorpion", sagittarius: "Sagittaire", capricorn: "Capricorne", aquarius: "Verseau", pisces: "Poissons",
};

/** Saison astronomique d'après la date, quand aucun capteur n'est disponible. */
const seasonOfDate = (d, south) => {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const n = md >= 1221 || md < 320 ? "winter" : md < 621 ? "spring" : md < 922 ? "summer" : "autumn";
  if (!south) return n;
  return { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" }[n];
};

/** Phase de lune approchée d'après la date (lunaison moyenne), quand aucun capteur n'est disponible. */
const moonOfDate = (d) => MOON_KEYS[Math.round(moonIllum(d).phase * 8) % 8];


/* ------------------------------------------------------------ astronomie */
/* Position et heures du soleil et de la lune, d'après les formules de SunCalc (Vladimir Agafonkin, BSD-2). */

const RAD = Math.PI / 180, DAYMS = 864e5, J1970 = 2440588, J2000 = 2451545, OBL = RAD * 23.4397;
const toDays = (d) => d.valueOf() / DAYMS - 0.5 + J1970 - J2000;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAYMS);
const rightAsc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const azim = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const alti = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
const solarAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
const eclLongitude = (M) => M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
const sunCoords = (d) => { const L = eclLongitude(solarAnomaly(d)); return { dec: decl(L, 0), ra: rightAsc(L, 0) }; };
const moonCoords = (d) => {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAsc(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
};
/** Azimut (degrés depuis le nord, sens horaire) et élévation (degrés) d'un astre. */
const position = (body, date, lat, lng) => {
  const lw = RAD * -lng, phi = RAD * lat, d = toDays(date);
  const c = body === "moon" ? moonCoords(d) : sunCoords(d);
  const H = sidereal(d, lw) - c.ra;
  let h = alti(H, phi, c.dec);
  if (body === "moon") { const hh = Math.max(h, 0); h += 0.0002967 / Math.tan(hh + 0.00312536 / (hh + 0.08901179)); }
  return { az: ((azim(H, phi, c.dec) / RAD + 180) % 360 + 360) % 360, el: h / RAD };
};
/** Aube, lever, midi solaire, coucher et crépuscule (civils) du jour de « date ». */
const sunTimes = (date, lat, lng) => {
  const lw = RAD * -lng, phi = RAD * lat, J0 = 0.0009;
  const noonLocal = new Date(date); noonLocal.setHours(12, 0, 0, 0);
  const d = toDays(noonLocal), n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n, M = solarAnomaly(ds), L = eclLongitude(M), dec = decl(L, 0);
  const transit = (x) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jnoon = transit(ds);
  const at = (deg) => {
    const c = (Math.sin(deg * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (c < -1 || c > 1) return [null, null]; // soleil de minuit ou nuit polaire
    const Jset = transit(J0 + (Math.acos(c) + lw) / (2 * Math.PI) + n);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [rise, set] = at(-0.833), [dawn, dusk] = at(-6);
  return { dawn, rise, noon: fromJulian(Jnoon), set, dusk };
};
/** Lever et coucher de la lune du jour de « date » (recherche heure par heure, interpolation quadratique). */
const moonTimes = (date, lat, lng) => {
  const t = new Date(date); t.setHours(0, 0, 0, 0);
  const hc = 0.133, alt = (h) => position("moon", new Date(t.getTime() + h * 36e5), lat, lng).el - hc;
  let h0 = alt(0), rise = null, set = null;
  for (let i = 1; i <= 24 && !(rise !== null && set !== null); i += 2) {
    const h1 = alt(i), h2 = alt(i + 1), a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), ye = (a * xe + b) * xe + h1, disc = b * b - 4 * a * h1;
    let roots = 0, x1 = 0, x2 = 0;
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) { if (h0 < 0) rise = rise ?? i + x1; else set = set ?? i + x1; }
    else if (roots === 2) { rise = rise ?? i + (ye < 0 ? x2 : x1); set = set ?? i + (ye < 0 ? x1 : x2); }
    h0 = h2;
  }
  const at = (h) => (h === null ? null : new Date(t.getTime() + h * 36e5));
  return { rise: at(rise), set: at(set) };
};
/** Éclairement (0 à 1) et phase (0 nouvelle lune, 0,25 premier quartier, 0,5 pleine lune, 0,75 dernier quartier). */
const moonIllum = (date) => {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (ang < 0 ? -1 : 1)) / Math.PI };
};
const MOON_KEYS = ["new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "last_quarter", "waning_crescent"];
const hm = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/** Partie éclairée d'une lune selon la phase (vue de l'hémisphère nord) : "" (nouvelle lune), "full" ou un tracé SVG. */
const moonLit = (phase, r, cx, cy) => {
  const p = ((phase % 1) + 1) % 1, f = (1 - Math.cos(2 * Math.PI * p)) / 2, rx = Math.abs(1 - 2 * f) * r;
  const waxing = p < 0.5, side = waxing ? 1 : 0, term = (f < 0.5) === waxing ? 0 : 1;
  return f < 0.02 ? "" : f > 0.98 ? "full" : `M${cx} ${cy - r}A${r} ${r} 0 0 ${side} ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${term} ${cx} ${cy - r}Z`;
};
let moonClip = 0;
/** Dessin d'une lune (SVG). Avec une photo de pleine lune (img), la photo est assombrie sur la partie non éclairée,
 *  qui est la partie éclairée de la phase opposée. */
const moonSvg = (phase, r, cx = 0, cy = 0, img = "") => {
  if (img) {
    const id = `mc${++moonClip}`, dark = moonLit(phase + 0.5, r, cx, cy);
    const shade = dark === "" ? "" : dark === "full" ? `<circle cx="${cx}" cy="${cy}" r="${r}" class="m-sh"/>` : `<path d="${dark}" class="m-sh"/>`;
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><image href="${esc(img)}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"
      clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>${shade}`;
  }
  const lit = moonLit(phase, r, cx, cy);
  const litEl = lit === "" ? "" : lit === "full" ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9edf3"/>` : `<path d="${lit}" fill="#e9edf3"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2b3446" stroke="#55627a" stroke-width=".6"/>${litEl}`;
};


/* -------------------------------------------------------- icônes météo SVG */
/* Dessinées ici (aucun fichier externe) ; version animée avec la classe « anim ». */

const SUN_C = "#f7c948", MOON_C = "#d9e2f2", CLOUD_C = "#dfe7f2", CLOUD_D = "#8fa0b8", RAIN_C = "#4aa8f0", SNOW_C = "#ffffff", BOLT_C = "#ffd23f";
const svgSun = (cx, cy, r) => `<g class="sun"><g class="rays">${Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4, x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4), x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
}).join("")}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN_C}"/></g>`;
const svgMoon = (cx, cy, r) => `<path class="moon" d="M${cx + r * 0.35} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55}a${r * 0.8} ${r * 0.8} 0 1 1 ${-r * 0.65} ${-r * 1.55}z" fill="${MOON_C}"/>`;
const svgCloud = (dx, dy, k, fill, cls = "cloud") =>
  `<path class="${cls}" transform="translate(${dx} ${dy}) scale(${k})" d="M14 40h30a9 9 0 0 0 1-18 13 13 0 0 0-25-3 10 10 0 0 0-6 21z" fill="${fill}"/>`;
const svgDrops = (n, x0, y0, step) => Array.from({ length: n }, (_, i) =>
  `<line class="drop" style="animation-delay:${(i * 0.37) % 1}s" x1="${x0 + i * step}" y1="${y0}" x2="${x0 + i * step - 2}" y2="${y0 + 7}" stroke="${RAIN_C}"/>`).join("");
const svgFlakes = (n, x0, y0, step) => Array.from({ length: n }, (_, i) =>
  `<circle class="flake" style="animation-delay:${(i * 0.6) % 2}s" cx="${x0 + i * step}" cy="${y0 + (i % 2) * 4}" r="2.2" fill="${SNOW_C}"/>`).join("");
const svgBolt = (x, y) => `<path class="bolt" transform="translate(${x} ${y})" d="M6 0L0 12h6l-3 10 11-14H8l4-8z" fill="${BOLT_C}"/>`;
const svgStars = `<g class="stars"><circle cx="50" cy="14" r="1.4"/><circle cx="56" cy="26" r="1"/><circle cx="44" cy="8" r="1"/></g>`;

/** Icône d'une condition météo : « night » remplace le soleil par la lune. */
const weatherSvg = (cond, night = false, anim = false, cls = "") => {
  const sky = (x, y, r) => (night ? svgMoon(x, y, r) : svgSun(x, y, r));
  const body = {
    "sunny": () => (night ? svgMoon(30, 32, 16) + svgStars : svgSun(32, 32, 13)),
    "clear-night": () => svgMoon(30, 32, 16) + svgStars,
    "partlycloudy": () => sky(23, 22, 10) + svgCloud(6, 12, 1, CLOUD_C),
    "cloudy": () => svgCloud(12, 2, 0.9, CLOUD_D, "cloud back") + svgCloud(2, 12, 1, CLOUD_C),
    "fog": () => svgCloud(4, 4, 1, CLOUD_C) + `<g class="fog"><line x1="10" y1="50" x2="54" y2="50"/><line x1="16" y1="57" x2="48" y2="57"/></g>`,
    "rainy": () => svgCloud(4, 2, 1, CLOUD_C) + svgDrops(3, 22, 46, 9),
    "pouring": () => svgCloud(4, 2, 1, CLOUD_D) + svgDrops(5, 16, 46, 7),
    "lightning": () => svgCloud(4, 2, 1, CLOUD_D) + svgBolt(26, 38),
    "lightning-rainy": () => svgCloud(4, 2, 1, CLOUD_D) + svgBolt(28, 38) + svgDrops(2, 18, 46, 24),
    "snowy": () => svgCloud(4, 2, 1, CLOUD_C) + svgFlakes(4, 18, 48, 9),
    "snowy-rainy": () => svgCloud(4, 2, 1, CLOUD_C) + svgDrops(2, 20, 46, 18) + svgFlakes(2, 29, 50, 18),
    "hail": () => svgCloud(4, 2, 1, CLOUD_D) + Array.from({ length: 4 }, (_, i) => `<circle class="flake" style="animation-delay:${i * 0.4}s" cx="${18 + i * 9}" cy="${49 + (i % 2) * 4}" r="2.6" fill="#cfe3ff" stroke="#8fb7e6"/>`).join(""),
    "windy": () => `<g class="wind"><path d="M8 24h30a7 7 0 1 0-7-7"/><path d="M8 34h42a7 7 0 1 1-7 7"/><path d="M8 44h22"/></g>`,
    "windy-variant": () => svgCloud(10, -2, 0.85, CLOUD_C) + `<g class="wind"><path d="M6 44h34a6 6 0 1 1-6 6"/><path d="M6 53h22"/></g>`,
    "exceptional": () => `<path d="M32 8l26 46H6z" fill="#ee4a4a"/><path d="M32 24v14M32 44v4" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  }[cond] || (() => svgCloud(4, 8, 1, CLOUD_D));
  return `<svg class="wi${anim ? " anim" : ""}${cls ? ` ${cls}` : ""}" viewBox="0 0 64 64" aria-hidden="true">${body()}</svg>`;
};

/** Icônes amCharts (CC BY 4.0, https://www.amcharts.com/free-animated-svg-weather-icons/), jeu repris par la
 *  carte Météo-France de HACF ; servies par jsDelivr à une version figée, ou depuis « icons_path ». */
const AMCHARTS_URL = "https://cdn.jsdelivr.net/gh/hacf-fr/lovelace-meteofrance-weather-card@56f1264b401b3cc37f9a6756eb9dc8b30b5f02bd/dist/icons/";
const AMCHARTS = {
  "sunny": ["day", "night"], "clear-night": ["night", "night"], "partlycloudy": ["cloudy-day-3", "cloudy-night-3"],
  "cloudy": ["cloudy"], "fog": ["fog"], "hail": ["rainy-7"], "lightning": ["thunder"], "lightning-rainy": ["lightning-rainy"],
  "pouring": ["rainy-6"], "rainy": ["rainy-5"], "snowy": ["snowy-6"], "snowy-rainy": ["snowy-rainy"],
  "windy": ["windy", "windy-night"], "windy-variant": ["windy", "windy-night"],
};

/** Nuit à un instant donné : le soleil est sous l'horizon (calculé d'après les coordonnées). */
const isNight = (date, hass) => {
  const lat = num(hass?.config?.latitude), lon = num(hass?.config?.longitude);
  if (lat === null || lon === null) return false;
  return position("sun", date, lat, lon).el < -0.833;
};

/* -------------------------------------------------------- détection auto */

const DEFAULTS = {
  days: 5,
  hours: 8,
  forecast_type: "daily",
  show_details: true,
  show_rain_hour: true,
  show_stats: true,
  show_alert: true,
  show_forecast: true,
  show_sky: true,
  icons: "animated",
  layout: "classic",
  halo: false,
  forecast_details: "full",
  hourly_wind: true, hourly_gust: true, hourly_precipitation: true, hourly_humidity: true, hourly_direction: true,
  daily_wind: true, daily_gust: true, daily_precipitation: true, daily_humidity: false, daily_direction: true,
  theme: "v2",
};

/** Entités trouvées automatiquement (celles de la configuration sont prioritaires). */
const detect = (hass, c) => {
  const ids = Object.keys(hass?.states || {});
  const reg = hass?.entities || {};
  const weathers = ids.filter((id) => id.startsWith("weather."));
  const weather = [c.entity, c.weather, c.weather_hourly, c.weather_daily].find((id) => String(id || "").startsWith("weather."))
    || weathers.find((id) => reg[id]?.platform === "meteo_france" || id.includes("meteo_france")) || weathers[0];
  const given = c.alert || c.weather_alert;
  // un capteur choisi qui n'est pas une vigilance (ex. nuages) est ignoré au profit de la détection
  const alert = (given && (given === "-" || isAlert(hass.states[given])) ? given : null)
    || ids.find((id) => id.startsWith("sensor.") && (reg[id]?.platform === "meteo_france" || id.includes("meteo_france")) && id.endsWith("weather_alert"))
    || ids.find((id) => id.startsWith("sensor.") && id.endsWith("_weather_alert"));
  const enumOf = (want) => ids.find((id) => {
    if (!id.startsWith("sensor.")) return false;
    const opts = hass.states[id].attributes?.options;
    return Array.isArray(opts) && want.every((w) => opts.includes(w));
  });
  return {
    weather,
    alert,
    season: c.season || c.saison || enumOf(["spring", "summer", "autumn", "winter"]),
    moon: c.moon || c.moon_phase || enumOf(["new_moon", "full_moon", "first_quarter"]),
    zodiac: c.zodiac || enumOf(["aries", "scorpio", "pisces"]),
  };
};

/** Capteurs liés à une entité météo (même appareil, ou même préfixe : weather.ville → sensor.ville_…). */
const related = (hass, weather) => {
  const reg = hass?.entities || {};
  const dev = reg[weather]?.device_id;
  const obj = String(weather || "").split(".")[1] || "";
  const ids = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor.") &&
    ((dev && reg[id]?.device_id === dev) || (obj && id.startsWith(`sensor.${obj}_`))));
  const find = (re) => ids.find((id) => re.test(id));
  return {
    cloud: find(/_cloud(_cover)?$/), rain: find(/_rain_chance$/), freeze: find(/_freeze_chance$/),
    snow: find(/_snow_chance$/), uv: find(/_uv(_index)?$/), precip: find(/_daily_?(original_)?precipitation$|_precipitation$/),
    next_rain: find(/_next_rain$/), pressure: find(/_pressure$/), wind: find(/_wind_speed$/),
  };
};

/** Capteur Météo-France « pluie dans l'heure » (attribut 1_hour_forecast) de la ville. */
const rainHourOf = (hass, weather, given) => {
  if (given) return given;
  const ids = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor.") && hass.states[id].attributes?.["1_hour_forecast"]);
  if (ids.length < 2) return ids[0];
  const tail = String(weather || "").split("_").pop();
  return ids.find((id) => tail && id.includes(tail)) || ids[0];
};
const RAIN_LEVEL = [[/sec|aucune|dry/i, 0], [/faible|light/i, 1], [/mod[ée]r|moderate/i, 2], [/fort|heavy/i, 3]];
const rainLevel = (v) => (RAIN_LEVEL.find(([re]) => re.test(String(v ?? ""))) || [, 1])[1];
const RAIN_COLOR = ["var(--med-line)", "#7cc4f5", "#1d93e3", "#0b5fa8"];

/** Une ville : chaîne « weather.… » ou objet { entity, name, alert }. */
const cityOf = (x) => (typeof x === "string" ? { entity: x } : x && typeof x === "object" ? x : {});

/** Stockage local (onglet choisi, etc.) sans erreur en navigation privée. */
const store = {
  get(k) { try { return JSON.parse(window.localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};

/* -------------------------------------------------------------- base commune */

/** Base des cartes : thème, clic vers la fiche d'une entité, abonnements aux prévisions. */
class MeteoBase extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { ...this.constructor.defaults, ...(config || {}) };
    this._sig = null;
    this._unsubAll();
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._clicks) this.shadowRoot.addEventListener("click", (this._clicks = (ev) => {
      const act = ev.target.closest?.("[data-act]");
      if (act) { this._action(act.dataset.act, act); return; }
      const el = ev.target.closest?.("[data-entity]");
      if (!el) return;
      const e = new Event("hass-more-info", { bubbles: true, composed: true });
      e.detail = { entityId: el.dataset.entity };
      this.dispatchEvent(e);
    }));
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._sig = null;
    this._render();
  }

  disconnectedCallback() {
    this._unsubAll();
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  _action() {}

  _st(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(id) {
    const st = this._st(id);
    return st ? num(st.state) : null;
  }

  _unsubAll() {
    for (const s of Object.values(this._subs || {})) s.unsub?.();
    this._subs = {};
  }

  /** Prévisions d'une entité et d'un type (daily, hourly, twice_daily) : abonnement weather/subscribe_forecast,
   *  sinon l'ancien attribut forecast. Renvoie null tant que rien n'est reçu. */
  _forecastOf(weather, type) {
    const key = `${weather}|${type}`;
    this._subs = this._subs || {};
    const sub = this._subs[key];
    if (sub) return sub.data;
    const conn = this._hass?.connection;
    if (!weather || !this.isConnected || !conn?.subscribeMessage) return null;
    const entry = (this._subs[key] = { data: null, unsub: null });
    conn.subscribeMessage((msg) => {
      entry.data = Array.isArray(msg?.forecast) ? msg.forecast : [];
      this._sig = null;
      this._render();
    }, { type: "weather/subscribe_forecast", forecast_type: type, entity_id: weather })
      .then((unsub) => { if (this._subs[key] === entry) entry.unsub = unsub; else unsub(); })
      .catch(() => { entry.data = []; this._sig = null; this._render(); });
    return null;
  }

  /** Les abonnements qui ne servent plus (autre onglet, autre entité) sont fermés. */
  _keepSubs(keys) {
    for (const [k, s] of Object.entries(this._subs || {})) if (!keys.includes(k)) { s.unsub?.(); delete this._subs[k]; }
  }

  /** Seul le contenu est redessiné : la zone « keep » (carte Windy, fenêtre des phases) n'est pas recréée. */
  _card(body, cls = "") {
    if (!this._main || !this.shadowRoot.contains(this._main)) {
      this.shadowRoot.innerHTML = `${STYLE}${METEO_STYLE}<ha-card><div class="main"></div><div class="keep"></div></ha-card>`;
      this._hc = this.shadowRoot.querySelector("ha-card");
      this._main = this.shadowRoot.querySelector(".main");
      this._keep = this.shadowRoot.querySelector(".keep");
    }
    this._hc.className = `${themeClass(this._config.theme, this._hass)}${cls ? ` ${cls}` : ""}`;
    // taille du texte : agrandit toute la carte (texte, icônes, jauges), de 80 à 160 %
    const zoom = Math.min(160, Math.max(80, Number(this._config.text_size) || 100));
    this._hc.style.zoom = zoom === 100 ? "" : String(zoom / 100);
    this._main.innerHTML = body;
  }

  _head(icon, color, title, sub, right = "") {
    return `<header><div class="brand"><ha-icon class="b-ic" icon="${icon}" style="color:${color}"></ha-icon>
      <div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div>${right}</header>`;
  }
}

/* -------------------------------------------------------------------- carte */

class MeteoCard extends MeteoBase {
  static get defaults() {
    return DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-card-editor");
  }

  getCardSize() {
    return 7;
  }

  /** Villes affichées : « entities » (onglets), sinon l'entité unique. */
  _cities() {
    const c = this._config;
    const list = (Array.isArray(c.entities) ? c.entities : []).map(cityOf).filter((x) => String(x.entity || "").startsWith("weather."));
    return list.length ? list : [{}];
  }

  /** Types de prévisions affichés l'un sous l'autre. */
  _types() {
    const c = this._config;
    const ok = ["daily", "hourly", "twice_daily"];
    const list = (Array.isArray(c.forecasts) ? c.forecasts : typeof c.forecasts === "string" ? [c.forecasts] : []).filter((t) => ok.includes(t));
    return list.length ? list : [ok.includes(c.forecast_type) ? c.forecast_type : "daily"];
  }

  _action(act, el) {
    if (act === "tab") {
      this._tab = Number(el.dataset.i) || 0;
      store.set(this._tabKey(), this._tab);
      this._sig = null;
      this._render();
    }
  }

  _tabKey() {
    return `meteo-card:${this._cities().map((x) => x.entity).join(",")}`;
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const cities = this._cities();
    if (this._tab === undefined) this._tab = Number(store.get(this._tabKey())) || 0;
    const ti = Math.min(this._tab, cities.length - 1);
    const city = cities[ti];
    // la première ville profite de la détection automatique (vigilance, saison, lune…)
    const ent = detect(this._hass, { ...c, ...(city.entity ? { entity: city.entity } : {}), ...(city.alert ? { alert: city.alert } : ti > 0 ? { alert: "-" } : {}) });
    if (ent.alert === "-") ent.alert = null;
    // alertes Environnement Canada : indiquées, ou détectées quand il n'y a pas de vigilance Météo-France
    const ecGiven = city.ec_alerts || (ti === 0 ? c.ec_alerts : null);
    ent.ec = ecGiven || !ent.alert ? ecSensorsOf(this._hass, ent.weather, ecGiven, ti === 0) : null;
    if (ent.ec) this._ecFetch(ent.ec);
    const w0 = this._st(ent.weather);
    const feat = num(w0?.attributes?.supported_features);
    // WeatherEntityFeature : 1 par jour, 2 par heure, 4 jour et nuit
    const types = this._types().filter((t) => feat === null || !w0?.attributes || (feat & { daily: 1, hourly: 2, twice_daily: 4 }[t]));
    this._keepSubs(types.map((t) => `${ent.weather}|${t}`));
    this._fcs = types.map((t) => [t, this._forecastOf(ent.weather, t)]);
    const w = this._st(ent.weather);
    const al = this._st(ent.alert);
    const rel = related(this._hass, ent.weather);
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${ti}|${w?.last_updated}|${al?.last_updated}|` +
      [ent.season, ent.moon, ent.zodiac, ...Object.values(rel)].map((id) => this._st(id)?.state).join("|") + `|${JSON.stringify(this._fcs)}|${new Date().getDate()}` +
      `|${Object.values(ent.ec || {}).map((id) => this._st(id)?.last_updated).join(",")}|${this._ecRes?.sig || ""}`;
    if (sig === this._sig) return;
    this._sig = sig;

    const tabs = cities.length > 1 ? `<div class="tabs" role="tablist">${cities.map((x, i) => {
      const name = x.name || this._st(x.entity)?.attributes?.friendly_name || x.entity;
      return `<button class="tab${i === ti ? " on" : ""}" role="tab" aria-selected="${i === ti}" data-act="tab" data-i="${i}"><ha-icon icon="${condOf(this._st(x.entity)?.state)[1]}"></ha-icon>${esc(name)}</button>`;
    }).join("")}</div>` : "";
    let body;
    const neon = c.layout === "warc0zes";
    if (!w) {
      body = `<div class="empty"><b>Aucune entité météo</b><span>Ajoutez une intégration météo (Météo-France, Met.no…) ou choisissez l'entité dans l'éditeur de la carte.</span></div>`;
    } else {
      body = (neon ? this._neonHead(w, al, ent, city) : this._header(w, al, ent, city)) + this._now(w, ent, neon) + (c.show_details !== false ? this._details(w, rel) : "") +
        (c.show_rain_hour !== false ? this._rainHour(rainHourOf(this._hass, ent.weather, city.rain_hour || (ti === 0 ? c.rain_hour : null))) : "") +
        (c.show_alert !== false ? this._alerts(al, ent) : "") +
        (c.show_forecast !== false ? this._fcs.map(([t, fc]) => this._forecast(w, ent, t, fc)).join("") : "") + (c.show_sky !== false ? this._sky(ent) : "");
    }
    this._card(tabs + body, [neon ? "neon" : "", c.halo === true ? "glow" : ""].filter(Boolean).join(" "));
  }

  /** Présentation « WarC0zes » : grande icône, titre, température, maximum et minimum du jour et vigilance sur une seule ligne. */
  _neonHead(w, al, ent, city = {}) {
    const c = this._config, a = w.attributes || {};
    const [label, icon, color] = condOf(w.state);
    const t = num(a.temperature);
    const today = this._today();
    const vg = this._vg(al, ent);
    const pill = vg && c.show_alert !== false ? this._pill(vg) : "";
    return `<header class="nh"><div class="nh-m" data-entity="${esc(ent.weather)}">
      ${this._wicon(w.state, new Date(), "n-ic", true, `<ha-icon class="n-ic" icon="${icon}" style="color:${color}"></ha-icon>`)}
      <div class="nh-n"><div class="title">${esc(city.name || c.title || "Météo")}</div><div class="sub">${esc(label)}</div></div>
      <div class="n-t">${t === null ? "—" : fmt(t, Math.abs(t) < 10 ? 1 : 0)}<span>${esc(a.temperature_unit || "°C")}</span></div>
      ${today ? `<i class="nh-sep"></i>${this._hilo(today)}` : ""}</div>${pill}</header>`;
  }

  /** Prévision du jour (première journée des prévisions par jour), pour le maximum et le minimum. */
  _today() {
    const daily = (this._fcs || []).find(([t, fc]) => t !== "hourly" && Array.isArray(fc) && fc.length);
    return daily && num(daily[1][0].temperature) !== null ? daily[1][0] : null;
  }

  _hilo(today) {
    return `<div class="n-hl"><span class="hi">↑ ${fmt(today.temperature)}°</span>${num(today.templow) !== null ? `<span class="lo">↓ ${fmt(today.templow)}°</span>` : ""}</div>`;
  }

  /** Pluie dans l'heure (Météo-France) : barre par tranche de 5 à 10 minutes. */
  _rainHour(id) {
    const st = this._st(id);
    const fc = st?.attributes?.["1_hour_forecast"];
    if (!fc || typeof fc !== "object") return "";
    const steps = Object.entries(fc).map(([k, v]) => [parseInt(k, 10), v]).filter(([m]) => Number.isFinite(m)).sort((a, b) => a[0] - b[0]);
    if (!steps.length) return "";
    const ref = new Date(st.attributes.forecast_time_ref || st.last_updated || Date.now());
    const start = isNaN(ref) ? new Date() : ref;
    const segs = steps.map(([m, v], i) => {
      const end = i + 1 < steps.length ? steps[i + 1][0] : 60;
      return `<span style="flex:${Math.max(1, end - m)};background:${RAIN_COLOR[rainLevel(v)]}" title="${hm(new Date(start.getTime() + m * 6e4))} : ${esc(v)}"></span>`;
    }).join("");
    const first = steps.find(([, v]) => rainLevel(v) > 0);
    const text = !first ? "Pas de pluie dans l'heure"
      : first[0] === 0 ? `${steps[0][1]} en ce moment` : `${first[1]} à ${hm(new Date(start.getTime() + first[0] * 6e4))}`;
    const ticks = [10, 20, 30, 40, 50].map((m) => `<i style="left:${(m / 60) * 100}%">${m}</i>`).join("");
    return `<div class="rh" data-entity="${esc(id)}"><div class="rh-h"><span>${hm(start)}</span><b>${esc(text)}</b><span>${hm(new Date(start.getTime() + 36e5))}</span></div>
      <div class="rh-b">${segs}</div><div class="rh-t">${ticks}</div></div>`;
  }

  /** Détails Météo-France : nuages, risque de pluie, de gel, de neige, indice UV, pluie dans l'heure. */
  _details(w, rel) {
    const a = w.attributes || {};
    const pct = (id) => { const v = this._num(id); return v === null ? null : `${fmt(v)} %`; };
    const uv = this._num(rel.uv) ?? num(a.uv_index);
    const cloud = this._num(rel.cloud) ?? num(a.cloud_coverage);
    const items = [
      [rel.cloud, "mdi:weather-cloudy", "Nuages", cloud === null ? null : `${fmt(cloud)} %`],
      [rel.rain, "mdi:weather-rainy", "Pluie", pct(rel.rain)],
      [rel.freeze, "mdi:snowflake-thermometer", "Gel", pct(rel.freeze)],
      [rel.snow, "mdi:weather-snowy", "Neige", pct(rel.snow)],
      [rel.uv, "mdi:sun-wireless-outline", "UV", uv === null ? null : fmt(uv)],
    ].filter((x) => x[3] !== null);
    // l'heure de la prochaine pluie est déjà dans la barre « pluie dans l'heure » quand elle est affichée
    const hourBar = this._config.show_rain_hour !== false && this._st(rainHourOf(this._hass, w.entity_id, this._config.rain_hour))?.attributes?.["1_hour_forecast"];
    const nr = hourBar ? null : this._st(rel.next_rain);
    if (nr && nr.state !== "unknown" && nr.state !== "unavailable") {
      const d = new Date(nr.state);
      if (!isNaN(d) && d > new Date()) items.push([rel.next_rain, "mdi:weather-pouring", "Pluie à", hm(d)]);
    }
    if (!items.length) return "";
    return `<div class="det">${items.map(([id, icon, label, v]) =>
      `<span class="d-i"${id ? ` data-entity="${esc(id)}"` : ""}><ha-icon icon="${icon}"></ha-icon>${label}<b>${esc(v)}</b></span>`).join("")}</div>`;
  }

  /** Niveau de vigilance (0 à 3) et phénomènes actifs. */
  _vigilance(al) {
    if (!al || al.state === "unavailable" || al.state === "unknown") return null;
    const list = Object.entries(al.attributes || {})
      .map(([k, v]) => ({ name: k, level: levelOf(v) }))
      .filter((p) => p.level !== undefined)
      .sort((a, b) => b.level - a.level);
    const max = Math.max(levelOf(al.state) ?? 0, ...list.map((p) => p.level), 0);
    return { max, active: list.filter((p) => p.level > 0), entity: al.entity_id };
  }

  /** Vigilance affichée : Environnement Canada si la ville en a, sinon Météo-France. */
  _vg(al, ent) {
    return ent?.ec ? this._ecVigilance(ent.ec) : this._vigilance(al);
  }

  /** Signature des compteurs d'alertes Environnement Canada (change quand une alerte apparaît ou disparaît). */
  _ecSig(ec) {
    return Object.entries(ec).map(([k, id]) => `${id}:${this._st(id)?.state}`).join("|");
  }

  /** Couleur réelle des alertes : action environment_canada.get_alerts, appelée seulement quand un compteur
   *  change. En cas d'échec (droits, version de Home Assistant), le niveau reste déduit du type. */
  _ecFetch(ec) {
    const sig = this._ecSig(ec);
    const total = EC_SHOWN.reduce((n, k) => n + (num(this._st(ec[k])?.state) || 0), 0);
    if (!total || sig === this._ecAsked || typeof this._hass?.callWS !== "function") return;
    this._ecAsked = sig;
    (async () => {
      let res = null;
      try {
        let entry = this._config.ec_entry;
        if (!entry) entry = (await this._hass.callWS({ type: "config/entity_registry/get", entity_id: Object.values(ec)[0] }))?.config_entry_id;
        if (entry) {
          const r = await this._hass.callWS({ type: "call_service", domain: "environment_canada", service: "get_alerts",
            service_data: { config_entry_id: entry }, return_response: true });
          res = r?.response ?? null;
          // réponse éventuellement rangée par lieu : { <entrée>: { warnings: [...] } }
          if (res && !EC_SHOWN.some((k) => k in res)) res = Object.values(res).find((v) => v && typeof v === "object" && EC_SHOWN.some((k) => k in v)) || null;
        }
      } catch (e) { res = null; }
      this._ecRes = { sig, data: res };
      this._sig = null;
      this._render();
    })();
  }

  /** Alertes Environnement Canada : niveau (0 à 3), alertes en cours (titre, type, heure, fin). */
  _ecVigilance(ec) {
    const sts = EC_SHOWN.map((k) => [k, this._st(ec[k])]).filter(([, st]) => st);
    if (!sts.length || sts.every(([, st]) => st.state === "unavailable" || st.state === "unknown")) return null;
    const res = this._ecRes?.sig === this._ecSig(ec) ? this._ecRes.data : null;
    const active = [];
    for (const [k, st] of sts) {
      const kind = EC_KINDS[k];
      // réponse de l'action si elle a des alertes de ce type ; sinon les attributs du capteur (titre, heure)
      const fromAction = Array.isArray(res?.[k]) && res[k].length ? res[k] : null;
      const items = fromAction || Object.keys(st.attributes || {}).filter((a) => /^alert_\d+$/.test(a))
        .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
        .map((a) => ({ title: st.attributes[a], date: st.attributes[`alert_time_${a.slice(6)}`] }));
      // compteur sans titre (attributs absents) : une ligne par alerte, avec le nom du type
      for (let i = items.length; i < (num(st.state) || 0); i++) items.push({});
      for (const it of items) {
        const lv = EC_COLOUR[String(it.alert_colour_level || "").toLowerCase()];
        active.push({ name: it.title || `${kind.label} en vigueur`, kind: k, label: kind.label, icon: kind.icon, info: lv === undefined && kind.level === 0,
          level: lv ?? kind.level, since: it.date, until: it.expiry_time, entity: ec[k] });
      }
    }
    active.sort((a, b) => b.level - a.level || Number(a.info) - Number(b.info));
    const max = active.reduce((m, p) => Math.max(m, p.level), 0);
    return { ec: true, max, info: active.length > 0 && active.every((p) => p.info), active, entity: (active[0] || {}).entity || Object.values(ec)[0] };
  }

  /** Pastille de l'en-tête : vigilance Météo-France ou alertes Environnement Canada. */
  _pill(vg) {
    const color = vg.info ? INFO_COLOR : LEVEL_COLOR[vg.max];
    const value = !vg.ec ? LEVEL_LABEL[vg.max] : vg.active.length ? String(vg.active.length) : "Aucune";
    return `<div class="pill" data-entity="${esc(vg.entity)}"><span class="dot" style="background:${color}"></span><span class="pill-l">${vg.ec ? "Alertes" : "Vigilance"}</span><span class="pill-v">${value}</span></div>`;
  }

  _header(w, al, ent, city = {}) {
    const c = this._config;
    const [label] = condOf(w.state);
    const title = city.name || c.title || "Météo";
    const sub = label;
    const vg = this._vg(al, ent);
    const pill = vg && c.show_alert !== false ? this._pill(vg) : "";
    // icône de titre fixe, comme les autres cartes (la condition du moment reste sur la grande icône)
    return `<header>
      <div class="brand"><ha-icon class="b-ic" icon="${esc(c.icon || "mdi:weather-partly-cloudy")}" style="color:var(--med-blue)"></ha-icon>
        <div><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div></div>
      ${pill}</header>`;
  }

  /** Conditions du moment (icône, température, maximum et minimum) puis tuiles ; seulement les tuiles avec la présentation « WarC0zes ». */
  _now(w, ent, statsOnly = false) {
    const c = this._config;
    const a = w.attributes || {};
    const tu = a.temperature_unit || "°C";
    const t = num(a.temperature);
    const ws = num(a.wind_speed);
    // ressenti : celui de l'intégration, sinon le refroidissement éolien (formule JAG/TI, au-delà de 4,8 km/h et sous 10 °C)
    let fl = num(a.apparent_temperature ?? a.feels_like);
    if (fl === null && t !== null) fl = ws !== null && ws > 4.8 && t < 10 ? 13.12 + 0.6215 * t - 11.37 * ws ** 0.16 + 0.3965 * t * ws ** 0.16 : t;
    const [, icon, color] = condOf(w.state);
    const today = this._today();
    const hilo = today ? this._hilo(today) : "";
    const stats = c.show_stats === false ? "" : `<div class="stats">
      ${this._stat("mdi:thermometer", "Ressenti", fl === null ? "—" : `${fmt(fl)}°`)}
      ${this._stat("mdi:weather-windy", "Vent", ws === null ? "—" : `${fmt(ws)} <small>${esc(a.wind_speed_unit || "km/h")}</small>`,
        [compass(a.wind_bearing), num(a.wind_gust_speed) !== null ? `rafales ${fmt(a.wind_gust_speed)}` : null].filter(Boolean).join(" · "),
        num(a.wind_bearing) !== null ? `<ha-icon class="arrow rot" icon="mdi:navigation" style="transform:rotate(${(Number(a.wind_bearing) + 180) % 360}deg)"></ha-icon>` : "")}
      ${this._stat("mdi:water-percent", "Humidité", num(a.humidity) === null ? "—" : `${fmt(a.humidity)} <small>%</small>`)}
      ${this._stat("mdi:gauge", "Pression", num(a.pressure) === null ? "—" : `${fmt(a.pressure)} <small>${esc(a.pressure_unit || "hPa")}</small>`)}
    </div>`;
    if (statsOnly) return stats;
    return `<div class="now" data-entity="${esc(ent.weather)}">
      ${this._wicon(w.state, new Date(), "n-ic", true, `<ha-icon class="n-ic" icon="${icon}" style="color:${color}"></ha-icon>`)}
      <div class="n-t">${t === null ? "—" : fmt(t, Math.abs(t) < 10 ? 1 : 0)}<span>${esc(tu)}</span></div>
      ${hilo}</div>${stats}`;
  }

  _stat(icon, label, value, note = "", extra = "") {
    return `<div class="stat"><div class="s-h"><ha-icon icon="${icon}"></ha-icon><span>${label}</span>${extra}</div>
      <div class="s-v">${value}</div>${note ? `<div class="s-n">${esc(note)}</div>` : ""}</div>`;
  }

  _alerts(al, ent) {
    const vg = this._vg(al, ent);
    if (!vg) return "";
    if (vg.ec) return this._ecAlerts(vg);
    if (!vg.active.length) {
      return `<div class="vig ok" data-entity="${esc(ent.alert)}"><ha-icon icon="mdi:shield-check-outline"></ha-icon><span>Pas de vigilance particulière</span></div>`;
    }
    return `<div class="vig" data-entity="${esc(ent.alert)}" style="--vc:${LEVEL_COLOR[vg.max]}">
      <div class="v-h"><ha-icon icon="mdi:alert-outline"></ha-icon><span>Vigilance ${LEVEL_LABEL[vg.max].toLowerCase()}</span></div>
      <div class="v-l">${vg.active.map((p) => `<span class="v-p" style="--pc:${LEVEL_COLOR[p.level]}"><ha-icon icon="${phenoIcon(p.name)}"></ha-icon>${esc(p.name)}<b>${LEVEL_LABEL[p.level]}</b></span>`).join("")}</div>
    </div>`;
  }

  /** Bloc des alertes Environnement Canada : une ligne par alerte (type, titre, heure de début et de fin). */
  _ecAlerts(vg) {
    if (!vg.active.length) {
      return `<div class="vig ok" data-entity="${esc(vg.entity)}"><ha-icon icon="mdi:shield-check-outline"></ha-icon><span>Aucune alerte en cours</span></div>`;
    }
    const col = (p) => (p.info ? INFO_COLOR : LEVEL_COLOR[p.level]);
    const when = (p) => {
      const d = (v) => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? x : null; };
      const until = d(p.until), since = d(p.since);
      const day = (x) => (x.toDateString() === new Date().toDateString() ? hm(x) : `${x.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} ${hm(x)}`);
      return until ? `jusqu'à ${day(until)}` : since ? `depuis ${day(since)}` : "";
    };
    const head = vg.info ? "Bulletin météo" : vg.active.length > 1 ? `${vg.active.length} alertes météo` : "Alerte météo";
    return `<div class="vig" data-entity="${esc(vg.entity)}" style="--vc:${vg.info ? INFO_COLOR : LEVEL_COLOR[vg.max]}">
      <div class="v-h"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${head}</span></div>
      <div class="v-rows">${vg.active.map((p) => `<div class="v-r" data-entity="${esc(p.entity)}" style="--pc:${col(p)}"><ha-icon icon="${p.icon}"></ha-icon>
        <div class="v-t"><span>${esc(p.name)}</span><small><b>${esc(p.label)}</b>${when(p) ? ` · ${esc(when(p))}` : ""}</small></div></div>`).join("")}</div>
    </div>`;
  }

  _forecast(w, ent, type, data) {
    const c = this._config;
    const hourly = type === "hourly";
    let fc = Array.isArray(data) ? data : Array.isArray(w.attributes?.forecast) ? w.attributes.forecast : null;
    const title = hourly ? "Prochaines heures" : type === "twice_daily" ? "Jour et nuit" : "Prévisions";
    if (fc === null) return `<div class="sec">${title}</div><div class="fc-empty">Chargement des prévisions…</div>`;
    // heures : « hours » ; seule exception, une ancienne configuration 1.0 (forecast_type: hourly sans forecasts
    // ni hours) où « days » comptait les heures
    const legacy = c.forecasts == null && c.forecast_type === "hourly" && c.hours == null;
    const n = Math.max(1, Math.min(hourly ? 24 : 14, Number(hourly ? (legacy ? c.days : c.hours) : c.days) || (hourly ? 8 : 5)));
    fc = fc.slice(0, n);
    if (!fc.length) return this._types().length > 1 ? "" : `<div class="fc-empty">Prévisions indisponibles pour ${esc(ent.weather)}.</div>`;
    // barre de température : position du min et du max du jour sur l'échelle de la période
    const his = fc.map((d) => num(d.temperature)).filter((v) => v !== null);
    const los = fc.map((d) => num(d.templow) ?? num(d.temperature)).filter((v) => v !== null);
    const gMin = Math.min(...los, ...his), gMax = Math.max(...los, ...his);
    const pct = (v) => (gMax > gMin ? ((v - gMin) / (gMax - gMin)) * 100 : 50);
    // affichage complet : mêmes lignes pour chaque heure et chaque jour (0 mm compris), alignées d'une colonne à l'autre
    const full = c.forecast_details !== "compact";
    const has = (k) => fc.some((d) => num(d[k]) !== null);
    // lignes choisies dans l'éditeur (hourly_* pour les heures, daily_* pour les jours) ; humidité par jour masquée par défaut
    const pre = hourly ? "hourly_" : "daily_";
    const on = { wind: c[pre + "wind"] !== false, gust: c[pre + "gust"] !== false, mm: c[pre + "precipitation"] !== false,
      hum: hourly ? c.hourly_humidity !== false : c.daily_humidity === true, dir: c[pre + "direction"] !== false };
    const rows = { mm: on.mm && has("precipitation"), rain: on.mm && has("precipitation_probability"), hum: on.hum && has("humidity"),
      wind: on.wind && has("wind_speed"), dir: on.dir && has("wind_speed"),
      // rafales : ligne affichée seulement si au moins une colonne a des rafales supérieures au vent moyen
      gust: on.gust && fc.some((d) => num(d.wind_gust_speed) > Math.max(0, num(d.wind_speed) ?? 0)) };
    const days = fc.map((d, i) => {
      const dt = new Date(d.datetime);
      const name = hourly ? dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : type === "twice_daily" ? `${DAYS_FR[dt.getDay()]} ${d.is_daytime === false ? "nuit" : "jour"}` : i === 0 ? "Auj." : `${DAYS_FR[dt.getDay()]} ${dt.getDate()}`;
      const [lab, icon, color] = condOf(d.condition);
      const hi = num(d.temperature), lo = num(d.templow);
      const rain = num(d.precipitation_probability);
      const mm = num(d.precipitation);
      const ws = num(d.wind_speed), wb = num(d.wind_bearing);
      const gust = num(d.wind_gust_speed);
      // flèche orientée vers où va le vent ; vent nul ou sans direction : icône « calme / variable »
      const dirIcon = ws === null && wb === null ? "" : ws === 0 || wb === null
        ? `<ha-icon class="rot" icon="mdi:autorenew" title="Vent calme ou variable"></ha-icon>`
        : `<ha-icon class="rot" icon="mdi:navigation" style="transform:rotate(${(wb + 180) % 360}deg)" title="${compass(wb)}"></ha-icon>`;
      const wind = hourly && ws !== null && (on.wind || on.dir)
        ? `<div class="f-w">${on.dir ? dirIcon : ""}${on.wind ? fmt(ws) : ""}</div>` +
          (on.gust && gust !== null && gust > ws ? `<div class="f-g" title="Rafales">${fmt(gust)}</div>` : "") : "";
      const hum = num(d.humidity);
      if (full) {
        const row = (on, cls, html) => (on ? `<div class="${cls}">${html}</div>` : "");
        const details =
          row(rows.mm, "f-mm", mm === null ? "—" : `${fmt(mm, mm > 0 && mm < 10 ? 1 : 0)} <small>mm</small>`) +
          row(rows.rain, "f-pp", rain === null ? "—" : `<ha-icon icon="mdi:umbrella-outline"></ha-icon>${fmt(rain)} %`) +
          row(rows.hum, "f-hu", hum === null ? "—" : `<ha-icon icon="mdi:water-percent"></ha-icon>${fmt(hum)} %`) +
          row(rows.wind, "f-w", ws === null ? "—" : `${fmt(ws)} <small>km/h</small>`) +
          row(rows.gust, "f-gb", gust === null || gust <= 0 || (ws !== null && gust <= ws) ? "&nbsp;" : `<span>${fmt(gust)} <small>km/h</small></span>`) +
          row(rows.dir, "f-dir", dirIcon);
        const barF = !hourly && hi !== null && lo !== null
          ? `<div class="f-bar"><span style="left:${pct(lo).toFixed(0)}%;right:${(100 - pct(hi)).toFixed(0)}%"></span></div>` : "";
        return `<div class="fc-d full" title="${esc(lab)}"><div class="f-n">${esc(name)}</div>
          ${this._wicon(d.condition, hourly ? dt : null, "f-ic", false, `<ha-icon icon="${icon}" style="color:${color}"></ha-icon>`)}
          <div class="f-hi">${hi === null ? "—" : `${fmt(hi, 1)}°`}</div>${!hourly ? `<div class="f-lo">${lo === null ? "&nbsp;" : `${fmt(lo, 1)}°`}</div>` : ""}${barF}${details}</div>`;
      }
      const wet = !on.mm ? "" : (mm !== null && mm > 0 ? `<span>${fmt(mm, mm < 10 ? 1 : 0)}<small>mm</small></span>` : "") +
        (rain !== null && rain > 0 ? `<span class="pp" title="Risque de pluie"><ha-icon icon="mdi:umbrella-outline"></ha-icon>${fmt(rain)}%</span>` : "");
      const bar = !hourly && hi !== null && lo !== null
        ? `<div class="f-bar"><span style="left:${pct(lo).toFixed(0)}%;right:${(100 - pct(hi)).toFixed(0)}%"></span></div>` : "";
      return `<div class="fc-d" title="${esc(lab)}"><div class="f-n">${esc(name)}</div>
        ${this._wicon(d.condition, hourly ? dt : null, "f-ic", false, `<ha-icon icon="${icon}" style="color:${color}"></ha-icon>`)}
        <div class="f-hi">${hi === null ? "—" : `${fmt(hi)}°`}</div>${lo !== null ? `<div class="f-lo">${fmt(lo)}°</div>` : ""}${bar}
        <div class="f-r">${wet}</div>${on.hum && hum !== null ? `<div class="f-hu" title="Humidité"><ha-icon icon="mdi:water-percent"></ha-icon>${fmt(hum)}%</div>` : ""}${wind}</div>`;
    }).join("");
    return `<div class="sec">${title}</div><div class="fc${full ? " full" : ""}" data-entity="${esc(ent.weather)}">${days}</div>`;
  }

  /** Icône météo : amCharts animée ou statique (défaut), dessinée par la carte, ou MDI.
   *  icons : animated | static | drawn | drawn_static | mdi. */
  _wicon(cond, date, cls, anim, mdi) {
    const mode = this._config.icons || "animated";
    if (mode === "mdi") return mdi;
    // prévision par jour (pas d'heure) : toujours l'icône de jour, sauf « nuit claire »
    const night = cond === "clear-night" || (date ? isNight(date, this._hass) : false);
    const am = AMCHARTS[cond];
    if ((mode === "animated" || mode === "static") && am) {
      const base = String(this._config.icons_path || AMCHARTS_URL).replace(/\/?$/, "/");
      const name = (night && am[1]) || am[0];
      return `<img class="wi-img ${cls}" src="${esc(base + name + (mode === "static" ? "-static" : ""))}.svg" alt="" loading="lazy" decoding="async">`;
    }
    return weatherSvg(cond, night, mode === "drawn" && anim, cls);
  }

  _sky(ent) {
    const now = new Date(), c = this._config;
    const south = Number(this._hass?.config?.latitude) < 0;
    const sRaw = String(this._st(ent.season)?.state || "").toLowerCase();
    const season = SEASON[sRaw] || SEASON[seasonOfDate(now, south)];
    const mRaw = String(this._st(ent.moon)?.state || "").toLowerCase().replace(/ /g, "_");
    const moon = MOON[mRaw] || MOON[moonOfDate(now)];
    const zRaw = String(this._st(ent.zodiac)?.state || "").toLowerCase();
    const tile = (id, icon, color, value, label) =>
      `<div class="sky-t"${id ? ` data-entity="${esc(id)}"` : ""}><ha-icon icon="${icon}" style="color:${color}"></ha-icon><div class="k-v">${esc(value)}</div><div class="k-l">${label}</div></div>`;
    // soleil : au-dessus ou sous l'horizon, lever et coucher du jour (calculés d'après les coordonnées)
    const lat = num(this._hass?.config?.latitude), lon = num(this._hass?.config?.longitude);
    const sunSt = this._st("sun.sun")?.state;
    const sunI = SUN_ICON[sunSt] || (lat !== null && lon !== null ? SUN_ICON[isNight(now, this._hass) ? "below_horizon" : "above_horizon"] : null);
    const st = lat !== null && lon !== null ? sunTimes(now, lat, lon) : null;
    return `<div class="sky">
      ${sunI ? tile(sunSt ? "sun.sun" : null, sunI[1], sunI[2], sunI[0], "Soleil") : ""}
      ${st ? `<div class="sky-t"${sunSt ? ` data-entity="sun.sun"` : ""}><ha-icon icon="mdi:weather-sunset" style="color:${SUN_C}"></ha-icon>
        <div class="k-v"><span class="sr">↑ ${hm(st.rise)}</span> <span class="ss">↓ ${hm(st.set)}</span></div><div class="k-l">Lever · coucher</div></div>` : ""}
      ${tile(SEASON[sRaw] ? ent.season : null, season[1], season[2], season[0], "Saison")}
      ${c.moon_image ? `<div class="sky-t"${MOON[mRaw] ? ` data-entity="${esc(ent.moon)}"` : ""}><svg viewBox="-22 -22 44 44" class="k-m">${moonSvg(moonIllum(now).phase, 20, 0, 0, c.moon_image)}</svg>
        <div class="k-v">${esc(moon[0])}</div><div class="k-l">Lune</div></div>` : tile(MOON[mRaw] ? ent.moon : null, moon[1], "#d9e2f2", moon[0], "Lune")}
      ${ZODIAC[zRaw] ? tile(ent.zodiac, `mdi:zodiac-${zRaw}`, "#b38cf0", ZODIAC[zRaw], "Zodiaque") : ""}
    </div>`;
  }
}


/* ------------------------------------------------------------ dessins SVG */

const pt = (cx, cy, r, a) => [cx + r * Math.sin(a * RAD), cy - r * Math.cos(a * RAD)];
const f2 = (v) => v.toFixed(2);
/** Arc de cercle de l'angle a0 à a1 (degrés, 0 en haut, sens horaire). */
const arcD = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`;
};
/** Rose des vents : cercle, graduations et points cardinaux (image de fond facultative). */
const roseSvg = (image) => {
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const a = i * 22.5, [x0, y0] = pt(70, 70, 52, a), [x1, y1] = pt(70, 70, i % 4 ? 48 : 45, a);
    return `<line x1="${f2(x0)}" y1="${f2(y0)}" x2="${f2(x1)}" y2="${f2(y1)}" class="tk"/>`;
  }).join("");
  const card = [["N", 0], ["E", 90], ["S", 180], ["O", 270]].map(([l, a]) => {
    const [x, y] = pt(70, 70, 62, a);
    return `<text x="${f2(x)}" y="${f2(y + 3.5)}" class="${l === "N" ? "cn n" : "cn"}">${l}</text>`;
  }).join("");
  const bg = image ? `<clipPath id="rc"><circle cx="70" cy="70" r="52"/></clipPath><image href="${esc(image)}" x="18" y="18" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#rc)" opacity=".55"/>` : "";
  return `${bg}<circle cx="70" cy="70" r="52" class="ring"/>${ticks}${card}`;
};
const duration = (ms) => { const m = Math.round(ms / 6e4); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

/* ------------------------------------------------------ carte Vent et ciel */

const CIEL_DEFAULTS = {
  title: "Vent et ciel",
  pressure_min: 960,
  pressure_max: 1060,
  rain_max: 30,
  show_barometer: true,
  show_wind: true,
  show_temperatures: true,
  show_rain: true,
  show_uv: true,
  windy: false,
  windy_overlay: "wind",
  windy_zoom: 8,
  theme: "v2",
};
/** Zones du baromètre (hPa). */
const BARO = [[980, "Tempête", "#ee4a4a"], [1000, "Pluie", "#ff8c33"], [1020, "Variable", "#1d93e3"], [1040, "Beau temps", "#f7c948"], [Infinity, "Très sec", "#f08a4b"]];
/** Indice UV : seuil, risque, couleur. */
const UV = [[3, "Faible", "#5fcf8a"], [6, "Modéré", "#f7c948"], [8, "Élevé", "#ff8c33"], [11, "Très élevé", "#ee4a4a"], [Infinity, "Extrême", "#b38cf0"]];

class MeteoCielCard extends MeteoBase {
  static get defaults() {
    return CIEL_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-ciel-card-editor");
  }

  getCardSize() {
    return 6;
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const ent = detect(this._hass, c);
    const rel = related(this._hass, ent.weather);
    const w = this._st(ent.weather);
    const temps = (Array.isArray(c.temperatures) ? c.temperatures : []).map(cityOf);
    const ids = [ent.weather, c.pressure || rel.pressure, c.wind_speed || rel.wind, c.wind_bearing, c.rain || rel.precip, c.uv || rel.uv,
      ...temps.flatMap((t) => [t.entity, t.humidity])];
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|` + ids.map((id) => this._st(id)?.last_updated).join("|");
    if (sig !== this._sig) {
      this._sig = sig;
      const a = w?.attributes || {};
      const pressure = this._num(c.pressure || rel.pressure) ?? num(a.pressure);
      const speed = this._num(c.wind_speed || rel.wind) ?? num(a.wind_speed);
      const bearing = this._num(c.wind_bearing) ?? num(a.wind_bearing);
      const rain = this._num(c.rain || rel.precip);
      const uv = this._num(c.uv || rel.uv) ?? num(a.uv_index);
      const top = [c.show_barometer !== false && pressure !== null ? this._baro(pressure, c.pressure || rel.pressure || ent.weather, a.pressure_unit) : "",
        c.show_wind !== false && (speed !== null || bearing !== null) ? this._wind(speed, bearing, num(a.wind_gust_speed), a.wind_speed_unit, c.wind_speed || rel.wind || ent.weather) : ""].filter(Boolean);
      const low = [c.show_rain !== false && rain !== null ? this._rain(rain, c.rain || rel.precip) : "",
        c.show_uv !== false && uv !== null ? this._uv(uv, c.uv || rel.uv || ent.weather) : ""].filter(Boolean);
      const [, icon, color] = condOf(w?.state);
      const body = this._head(c.icon || "mdi:weather-windy", c.icon ? "var(--med-blue)" : color, c.title || "Vent et ciel", w ? condOf(w.state)[0] : "") +
        (top.length ? `<div class="duo">${top.join("")}</div>` : "") +
        (c.show_temperatures !== false && temps.length ? this._temps(temps) : "") +
        (low.length ? `<div class="duo">${low.join("")}</div>` : "") +
        (!top.length && !low.length && !temps.length ? `<div class="empty"><b>Aucune donnée</b><span>Choisissez une entité météo ou des capteurs dans l'éditeur de la carte.</span></div>` : "");
      this._card(body);
    }
    this._windy();
  }

  /** Carte Windy : iframe créée une seule fois (recréée seulement si l'adresse change). */
  _action(act, el) {
    if (act === "wtab") { this._wtab = el.dataset.v; store.set("meteo-ciel-card:windy", this._wtab); this._windy(); }
  }

  _windy() {
    const c = this._config;
    if (!this._keep) return;
    if (!c.windy) { if (this._keep.innerHTML) this._keep.innerHTML = ""; this._windySrc = null; return; }
    if (this._wtab === undefined) this._wtab = store.get("meteo-ciel-card:windy") === "fc" ? "fc" : "map";
    const lat = num(c.latitude) ?? num(this._hass.config?.latitude), lon = num(c.longitude) ?? num(this._hass.config?.longitude);
    if (lat === null || lon === null) return;
    const q = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3), detailLat: lat.toFixed(3), detailLon: lon.toFixed(3),
      zoom: String(c.windy_zoom || 8), level: "surface", overlay: c.windy_overlay || "wind", product: "ecmwf", menu: "", message: "true",
      marker: "", calendar: "now", pressure: "", type: "map", location: "coordinates", detail: "", metricWind: "km/h", metricTemp: "°C", radarRange: "-1" });
    // Prévisions : tableau Windy du lieu (heure par heure)
    const fq = new URLSearchParams({ type: "forecast", location: "coordinates", detail: "true", detailLat: lat.toFixed(3), detailLon: lon.toFixed(3),
      metricTemp: "°C", metricRain: "mm", metricWind: "km/h" });
    const src = this._wtab === "fc" ? `https://embed.windy.com/embed.html?${fq}` : `https://embed.windy.com/embed2.html?${q}`;
    if (src === this._windySrc) return;
    this._windySrc = src;
    const tab = (v, label, icon) => `<button class="tab${this._wtab === v ? " on" : ""}" data-act="wtab" data-v="${v}" aria-selected="${this._wtab === v}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    this._keep.innerHTML = `<div class="tabs wt" role="tablist">${tab("map", "Carte", "mdi:map-outline")}${tab("fc", "Prévisions", "mdi:chart-timeline-variant")}</div>
      <iframe class="windy${this._wtab === "fc" ? " fc" : ""}" title="Windy" loading="lazy" referrerpolicy="no-referrer" src="${esc(src)}"></iframe>`;
  }

  _baro(p, id, unit) {
    const c = this._config;
    const lo = Number(c.pressure_min) || 960, hi = Number(c.pressure_max) || 1060;
    const ang = (v) => -130 + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * 260;
    let from = lo;
    const zones = BARO.map(([to, , col]) => {
      const a0 = ang(from), a1 = ang(Math.min(to, hi));
      from = Math.min(to, hi);
      return a1 > a0 + 0.5 ? `<path d="${arcD(70, 66, 52, a0, a1)}" stroke="${col}" class="zn"/>` : "";
    }).join("");
    const zone = BARO.find(([to]) => p < to);
    const [nx, ny] = pt(70, 66, 40, ang(p));
    return `<div class="gauge" data-entity="${esc(id)}"><svg viewBox="0 0 140 112" role="img" aria-label="Baromètre ${fmt(p)} ${esc(unit || "hPa")}">
      <path d="${arcD(70, 66, 52, -130, 130)}" class="trk"/>${zones}
      <line x1="70" y1="66" x2="${f2(nx)}" y2="${f2(ny)}" class="ndl"/><circle cx="70" cy="66" r="4" class="hub"/>
      <text x="70" y="98" class="big">${fmt(p)}</text><text x="70" y="110" class="sm">${esc(unit || "hPa")}</text>
      <text x="${f2(pt(70, 66, 52, -130)[0])}" y="108" class="sm">${fmt(lo)}</text><text x="${f2(pt(70, 66, 52, 130)[0])}" y="108" class="sm">${fmt(hi)}</text></svg>
      <div class="g-l">Baromètre · <b style="color:${zone[2]}">${zone[1]}</b></div></div>`;
  }

  _wind(speed, bearing, gust, unit, id) {
    const arrow = bearing === null ? "" : (() => {
      // flèche dirigée vers le centre : le vent vient de cette direction
      const [tx, ty] = pt(70, 70, 34, bearing), [lx, ly] = pt(70, 70, 54, bearing - 9), [rx, ry] = pt(70, 70, 54, bearing + 9);
      return `<path d="M${f2(tx)} ${f2(ty)}L${f2(lx)} ${f2(ly)}L${f2(rx)} ${f2(ry)}Z" class="arw"/>`;
    })();
    const dir = bearing === null ? "" : `${compass(bearing)} · ${fmt(bearing)}°`;
    return `<div class="gauge" data-entity="${esc(id)}"><svg viewBox="0 0 140 140" role="img" aria-label="Vent ${fmt(speed)} ${esc(unit || "km/h")} ${esc(dir)}">
      ${roseSvg(this._config.compass_image)}${arrow}
      <text x="70" y="74" class="big">${fmt(speed)}</text><text x="70" y="87" class="sm">${esc(unit || "km/h")}</text></svg>
      <div class="g-l">Vent${dir ? ` · <b>${esc(dir)}</b>` : ""}${gust !== null ? ` · rafales ${fmt(gust)}` : ""}</div></div>`;
  }

  _temps(list) {
    return `<div class="temps">${list.map((t) => {
      const v = this._num(t.entity), h = this._num(t.humidity);
      // tendance : sens de la dernière variation vue par la carte
      this._trend = this._trend || {};
      const tr = this._trend[t.entity] || {};
      if (v !== null && tr.v !== undefined && v !== tr.v) tr.dir = v > tr.v ? 1 : -1;
      if (v !== null) tr.v = v;
      this._trend[t.entity] = tr;
      const arrow = tr.dir ? `<ha-icon class="tp-tr ${tr.dir > 0 ? "up" : "down"}" icon="mdi:arrow-${tr.dir > 0 ? "up" : "down"}-bold"></ha-icon>` : "";
      const name = t.name || this._st(t.entity)?.attributes?.friendly_name || t.entity;
      return `<div class="tp" data-entity="${esc(t.entity)}"><ha-icon icon="${esc(t.icon || "mdi:home-thermometer-outline")}"></ha-icon>
        <div class="tp-c"><span class="tp-n">${esc(name)}</span><div><b>${v === null ? "—" : `${fmt(v, 1)}°`}</b>${arrow}${h !== null ? `<span class="tp-h"><ha-icon icon="mdi:water-percent"></ha-icon>${fmt(h)}%</span>` : ""}</div></div></div>`;
    }).join("")}</div>`;
  }

  _rain(mm, id) {
    const max = Number(this._config.rain_max) || 30;
    const lvl = Math.min(1, Math.max(0, mm / max));
    const y = 56 - lvl * 50;
    return `<div class="gauge row" data-entity="${esc(id)}"><svg viewBox="0 0 40 58" class="drop" aria-hidden="true">
      <clipPath id="dc"><path d="M20 3C20 3 5 24 5 37a15 15 0 0 0 30 0C35 24 20 3 20 3Z"/></clipPath>
      <rect x="0" y="${f2(y)}" width="40" height="58" clip-path="url(#dc)" class="water"/>
      <path d="M20 3C20 3 5 24 5 37a15 15 0 0 0 30 0C35 24 20 3 20 3Z" class="dropl"/></svg>
      <div><div class="g-v">${fmt(mm, mm < 10 ? 1 : 0)} <small>mm</small></div><div class="g-l">Pluie du jour</div></div></div>`;
  }

  _uv(v, id) {
    const level = UV.find(([to]) => v < to);
    const pos = Math.min(100, (v / 12) * 100);
    return `<div class="gauge row" data-entity="${esc(id)}"><div class="uv-b" style="color:${level[2]}"><ha-icon icon="mdi:sun-wireless-outline"></ha-icon>${fmt(v)}</div>
      <div class="uv-r"><div class="g-l">Indice UV · <b style="color:${level[2]}">${level[1]}</b></div>
      <div class="uv-s"><span style="left:${pos.toFixed(0)}%"></span></div></div></div>`;
  }
}

/* --------------------------------------------------- carte Soleil et lune */

const ASTRO_DEFAULTS = {
  title: "Soleil et lune",
  show_sun: true,
  show_moon: true,
  show_cycles: true,
  show_meteors: true,
  show_pollens: true,
  show_all_pollens: false,
  theme: "v2",
};
const POLLEN_LEVEL = {
  nul: 0, nulle: 0, aucun: 0, aucune: 0, none: 0, "très faible": 1, "tres faible": 1, faible: 1, low: 1,
  moyen: 2, moyenne: 2, "modéré": 2, "modérée": 2, modere: 2, moderee: 2, moderate: 2,
  "élevé": 3, "élevée": 3, eleve: 3, elevee: 3, high: 3, "très élevé": 4, "très élevée": 4, "tres eleve": 4, "tres elevee": 4, "very high": 4,
};
/** Noms français des pollens (identifiants anglais de l'intégration Pollen Information). */
const POLLEN_FR = {
  alder: "Aulne", birch: "Bouleau", grasses: "Graminées", grass: "Graminées", mugwort: "Armoise", olive: "Olivier", ragweed: "Ambroisie",
  hazel: "Noisetier", ash: "Frêne", cypress: "Cyprès", plane: "Platane", oak: "Chêne", nettle: "Urticacées", plantain: "Plantain",
  sorrel: "Oseille", poplar: "Peuplier", willow: "Saule", beech: "Hêtre", hornbeam: "Charme", lime: "Tilleul", linden: "Tilleul",
  rye: "Seigle", elm: "Orme", chestnut: "Châtaignier", alternaria: "Alternaria", goosefoot: "Chénopode", cladosporium: "Cladosporium",
};
const POLLEN_LABEL = ["Nul", "Faible", "Moyen", "Élevé", "Très élevé"];
const POLLEN_COLOR = ["#8fa0b8", "#5fcf8a", "#ff8c33", "#ee4a4a", "#b38cf0"];
const pollenLevel = (st) => {
  const s = String(st ?? "").trim().toLowerCase();
  if (POLLEN_LEVEL[s] !== undefined) return POLLEN_LEVEL[s];
  const n = num(s);
  return n === null ? null : Math.max(0, Math.min(4, Math.round(n)));
};
const pollenIcon = (name) => (/gramin/i.test(name) ? "mdi:grass" : /ambroisie|armoise|oseille|plantain|urtic|chénopod|chenopod/i.test(name) ? "mdi:sprout" : "mdi:tree");
const SUN_ICON = { above_horizon: ["Au-dessus de l'horizon", "mdi:white-balance-sunny", "#f7c948"], below_horizon: ["Sous l'horizon", "mdi:weather-night", "#9fb4d8"] };

/** Principales pluies d'étoiles filantes (calendrier IMO) : début, pic (nuit qui commence ce jour-là) et fin en [mois, jour],
 *  taux horaire zénithal (ZHR), radiant (ascension droite et déclinaison en degrés), vitesse en km/s. */
const METEORS = [
  { name: "Quadrantides", sky: "Bouvier", start: [12, 28], peak: [1, 3], end: [1, 12], zhr: 80, ra: 230, dec: 49, v: 41 },
  { name: "Lyrides", sky: "Lyre", start: [4, 14], peak: [4, 22], end: [4, 30], zhr: 18, ra: 271, dec: 34, v: 49 },
  { name: "Êta Aquarides", sky: "Verseau", start: [4, 19], peak: [5, 6], end: [5, 28], zhr: 50, ra: 338, dec: -1, v: 66 },
  { name: "Alpha Capricornides", sky: "Capricorne", start: [7, 3], peak: [7, 30], end: [8, 15], zhr: 5, ra: 307, dec: -10, v: 23 },
  { name: "Delta Aquarides", sky: "Verseau", start: [7, 12], peak: [7, 30], end: [8, 23], zhr: 25, ra: 340, dec: -16, v: 41 },
  { name: "Perséides", sky: "Persée", start: [7, 17], peak: [8, 12], end: [8, 24], zhr: 100, ra: 48, dec: 58, v: 59 },
  { name: "Draconides", sky: "Dragon", start: [10, 6], peak: [10, 8], end: [10, 10], zhr: 10, ra: 262, dec: 54, v: 20 },
  { name: "Taurides Sud", sky: "Taureau", start: [9, 10], peak: [10, 10], end: [11, 20], zhr: 5, ra: 32, dec: 9, v: 27 },
  { name: "Orionides", sky: "Orion", start: [10, 2], peak: [10, 21], end: [11, 7], zhr: 20, ra: 95, dec: 16, v: 66 },
  { name: "Taurides Nord", sky: "Taureau", start: [10, 20], peak: [11, 12], end: [12, 10], zhr: 5, ra: 58, dec: 22, v: 29 },
  { name: "Léonides", sky: "Lion", start: [11, 6], peak: [11, 17], end: [11, 30], zhr: 15, ra: 152, dec: 22, v: 71 },
  { name: "Géminides", sky: "Gémeaux", start: [12, 4], peak: [12, 14], end: [12, 20], zhr: 150, ra: 112, dec: 33, v: 35 },
  { name: "Ursides", sky: "Petite Ourse", start: [12, 17], peak: [12, 22], end: [12, 26], zhr: 10, ra: 217, dec: 76, v: 33 },
];
/** Pluies de l'année précédente, en cours et suivante, avec leurs dates réelles (début, pic, fin). */
const meteorDates = (now) => {
  const y = now.getFullYear(), out = [];
  for (const m of METEORS) for (const Y of [y - 1, y, y + 1]) {
    const peak = new Date(Y, m.peak[0] - 1, m.peak[1]);
    const start = new Date(Y - (m.start[0] > m.peak[0] ? 1 : 0), m.start[0] - 1, m.start[1]);
    const end = new Date(Y + (m.end[0] < m.peak[0] ? 1 : 0), m.end[0] - 1, m.end[1], 23, 59);
    out.push({ ...m, start, peak, end });
  }
  return out;
};
/** Nuit du pic : meilleure heure (radiant le plus haut, soleil à plus de 12° sous l'horizon), taux observable estimé et lune. */
const meteorNight = (m, lat, lon) => {
  const phi = RAD * lat, lw = RAD * -lon;
  let best = null;
  for (let i = 0; i <= 26; i++) {
    const t = new Date(m.peak.getFullYear(), m.peak.getMonth(), m.peak.getDate(), 18, 30 * i);
    if (position("sun", t, lat, lon).el > -12) continue;
    const alt = alti(sidereal(toDays(t), lw) - RAD * m.ra, phi, RAD * m.dec) / RAD;
    if (!best || alt > best.alt) best = { t, alt };
  }
  if (!best || best.alt <= 0) return { visible: false };
  const il = moonIllum(best.t), moonUp = position("moon", best.t, lat, lon).el > 0;
  // la lune levée efface les étoiles filantes faibles, d'autant plus qu'elle est éclairée
  const rate = Math.round(m.zhr * Math.sin(best.alt * RAD) * (moonUp ? 1 - 0.6 * il.fraction : 1));
  const moon = moonUp && il.fraction > 0.5 ? [2, "Lune gênante"] : moonUp && il.fraction > 0.2 ? [1, "Lune un peu gênante"] : [0, moonUp ? "Lune discrète" : "Lune couchée"];
  return { visible: true, t: best.t, alt: best.alt, rate, phase: il.phase, fraction: il.fraction, moon };
};

class MeteoAstroCard extends MeteoBase {
  static get defaults() {
    return ASTRO_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-astro-card-editor");
  }

  getCardSize() {
    return 7;
  }

  _coords() {
    const c = this._config, cfg = this._hass?.config || {};
    const lat = num(c.latitude) ?? num(cfg.latitude), lon = num(c.longitude) ?? num(cfg.longitude);
    return lat === null || lon === null ? null : [lat, lon];
  }

  /** Capteur principal de pollens et ses capteurs par plante :
   *  intégration « Pollens » (sensor.pollens_00, sensor.pollens_00_<plante>, sensor.pollens_00_risklevel)
   *  ou « Pollen Information » (sensor.polleninformation_<lieu>_allergy_risk, sensor.polleninformation_<lieu>_<plante>). */
  _pollens() {
    const c = this._config, ids = Object.keys(this._hass.states);
    const main = c.pollens || ids.find((id) => /^sensor\.pollens_[0-9]{1,3}[ab]?$/i.test(id))
      || ids.find((id) => /^sensor\.polleninformation_.+_allergy_risk$/.test(id));
    const base = main ? main.replace(/_allergy_risk$/, "") : null;
    const plants = Array.isArray(c.pollen_entities) ? c.pollen_entities
      : base ? ids.filter((id) => id !== main && id.startsWith(`${base}_`) && !/_risk_?level$|_allergy_risk(_hourly)?$/.test(id)) : [];
    const risk = main ? ids.find((id) => id === `${main}_risklevel` || id === `${main}_risk_level`) : null;
    return { main, plants, risk };
  }

  _action(act) {
    if (act === "moon") this._openMoon();
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const ent = detect(this._hass, c);
    const pol = this._pollens();
    const sun = this._st("sun.sun");
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${Math.floor(Date.now() / 6e4)}|${sun?.state}|` +
      [ent.moon, ent.season, ent.zodiac, pol.main, pol.risk, ...pol.plants].map((id) => this._st(id)?.state).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    const xy = this._coords();
    const now = new Date();
    const parts = [];
    if (xy && c.show_sun !== false) parts.push(this._sun(xy, now));
    if (xy && c.show_moon !== false) parts.push(this._moonRow(xy, now));
    if (c.show_cycles !== false) parts.push(`<div class="sec">Cycles</div>${this._cycles(ent, sun, now)}`);
    if (c.show_meteors !== false) parts.push(this._meteors(xy, now));
    if (c.show_pollens !== false && (pol.main || pol.plants.length)) parts.push(this._pollenHtml(pol));
    const head = this._head("mdi:weather-sunset", "#f7c948", c.title || "Soleil et lune", xy ? "" : "Coordonnées de Home Assistant introuvables");
    this._card(head + parts.join(""));
  }

  _sun([lat, lon], now) {
    const st = sunTimes(now, lat, lon), y = sunTimes(new Date(now.getTime() - DAYMS), lat, lon);
    const sp = position("sun", now, lat, lon), mp = position("moon", now, lat, lon);
    const ent = detect(this._hass, this._config), rel = related(this._hass, ent.weather);
    const uv = this._num(this._config.uv || rel.uv) ?? num(this._st(ent.weather)?.attributes?.uv_index);
    // boussole : soleil et lune sur le cercle, élévation du soleil au centre
    const dot = (p, r, cls) => { const [x, yy] = pt(70, 70, 52, p.az); return `<circle cx="${f2(x)}" cy="${f2(yy)}" r="${r}" class="${cls}${p.el < 0 ? " under" : ""}"/>`; };
    const rose = `<div class="gauge" data-entity="sun.sun"><svg viewBox="0 0 140 140" role="img" aria-label="Soleil : azimut ${fmt(sp.az)}°, élévation ${fmt(sp.el, 1)}°">
      ${roseSvg(this._config.compass_image)}${dot(mp, 5, "moon")}${dot(sp, 8, "sun")}
      <text x="70" y="56" class="dir">${compass16(sp.az)}</text>
      <text x="70" y="77" class="big">${fmt(sp.el, 1)}°</text><text x="70" y="88" class="sm">élévation</text>
      ${uv !== null ? `<text x="70" y="104" class="uvt" style="fill:${UV.find(([to]) => uv < to)[2]}">${fmt(uv)} UV</text>` : ""}</svg></div>`;
    // course du soleil sur la journée : élévation toutes les 20 minutes
    const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
    const pts = Array.from({ length: 73 }, (_, i) => position("sun", new Date(day0.getTime() + i * 12e5), lat, lon).el);
    const maxEl = Math.max(10, ...pts), k = 38 / maxEl, H = 48;
    const yOf = (el) => Math.min(76, H - el * k);
    const path = pts.map((el, i) => `${i ? "L" : "M"}${f2((i / 72) * 220)} ${f2(yOf(el))}`).join("");
    const nx = ((now - day0) / DAYMS) * 220;
    const curve = `<svg viewBox="0 0 220 80" class="curve" role="img" aria-label="Course du soleil">
      <clipPath id="up"><rect x="0" y="0" width="220" height="${H}"/></clipPath>
      <path d="${path}L220 ${H}L0 ${H}Z" class="day" clip-path="url(#up)"/>
      <line x1="0" y1="${H}" x2="220" y2="${H}" class="hz"/><path d="${path}" class="path"/>
      <circle cx="${f2(nx)}" cy="${f2(yOf(sp.el))}" r="5" class="sun${sp.el < 0 ? " under" : ""}"/></svg>`;
    const len = st.rise && st.set ? st.set - st.rise : null, ylen = y.rise && y.set ? y.set - y.rise : null;
    const diff = len !== null && ylen !== null ? Math.round((len - ylen) / 6e4) : null;
    const cell = (l, v) => `<div class="tm"><span>${l}</span><b>${v}</b></div>`;
    const times = `<div class="tms">${cell("Aube", hm(st.dawn))}${cell("Lever", hm(st.rise))}${cell("Midi solaire", hm(st.noon))}${cell("Coucher", hm(st.set))}${cell("Crépuscule", hm(st.dusk))}</div>`;
    const info = `<div class="tml">${len !== null ? `Durée du jour <b>${duration(len)}</b>${diff ? ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)} min)` : ""} · ` : ""}Azimut <b>${fmt(sp.az, 1)}°</b></div>`;
    return `<div class="sec">Soleil</div><div class="astro">${rose}<div class="a-r">${curve}</div></div><div class="band">${times}${info}</div>`;
  }

  _moonRow([lat, lon], now) {
    const mt = moonTimes(now, lat, lon), mp = position("moon", now, lat, lon), il = moonIllum(now);
    const cell = (l, v) => `<div class="tm"><span>${l}</span><b>${v}</b></div>`;
    return `<div class="sec">Lune</div><div class="mrow"><button class="mbtn" data-act="moon" aria-label="Phases de la lune"><svg viewBox="-22 -22 44 44">${moonSvg(il.phase, 20, 0, 0, this._config.moon_image)}</svg></button>
      <div class="tms">${cell("Lever", hm(mt.rise))}${cell("Coucher", hm(mt.set))}${cell("Éclairée", `${fmt(il.fraction * 100)} %`)}${cell("Azimut", `${fmt(mp.az)}°`)}${cell("Élévation", `${fmt(mp.el, 1)}°`)}</div></div>`;
  }

  _moonKey(ent, now) {
    const raw = String(this._st(ent.moon)?.state || "").toLowerCase().replace(/ /g, "_");
    return MOON[raw] ? raw : moonOfDate(now);
  }

  /** Étoiles filantes : prochaine grande pluie (pic, taux estimé, lune, meilleure heure) et pluies en cours. */
  _meteors(xy, now) {
    const all = meteorDates(now);
    const dayMs = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = dayMs(now);
    // le pic reste « à venir » jusqu'au matin qui suit la nuit du pic
    const next = all.filter((m) => m.zhr >= 10 && dayMs(m.peak) + DAYMS > today).sort((a, b) => a.peak - b.peak)[0];
    const active = all.filter((m) => m.start <= now && now <= m.end && m !== next).sort((a, b) => b.zhr - a.zhr);
    const dm = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const night = (d) => { const n = new Date(d.getTime() + DAYMS); return `nuit du ${d.getDate()}${d.getMonth() === n.getMonth() ? "" : ` ${d.toLocaleDateString("fr-FR", { month: "short" })}`} au ${dm(n)}`; };
    const days = Math.round((dayMs(next.peak) - today) / DAYMS);
    const when = days <= 0 ? "pic cette nuit !" : days === 1 ? "pic demain soir" : `pic dans ${days} jours`;
    const nt = xy ? meteorNight(next, xy[0], xy[1]) : null;
    const MC = ["#5fcf8a", "#f7c948", "#ff8c33"];
    const moon = nt?.visible ? `<div class="mt-m" title="Lune lors du pic : éclairée à ${fmt(nt.fraction * 100)} %"><svg viewBox="-22 -22 44 44">${moonSvg(nt.phase, 20, 0, 0, this._config.moon_image)}</svg>
      <span style="color:${MC[nt.moon[0]]}">${nt.moon[1]}</span></div>` : "";
    const detail = !nt ? "" : nt.visible
      ? `≈ <b>${fmt(nt.rate)}</b>/h vers ${nt.t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · radiant à ${fmt(nt.alt)}°`
      : "radiant trop bas depuis chez vous";
    const chips = active.map((m) => `<span class="mt-c" title="Actives du ${dm(m.start)} au ${dm(m.end)}">${esc(m.name)}<b>${m.peak < now ? "pic passé" : `pic ${dm(m.peak)}`}</b></span>`).join("");
    return `<div class="sec">Étoiles filantes</div><div class="mt">
      <ha-icon icon="mdi:star-shooting" style="color:#f7c948"></ha-icon>
      <div class="mt-t"><span>${esc(next.name)} · ${esc(next.sky)} · <span class="mt-w">${when}</span></span>
        <b>${night(next.peak)}</b><small title="Taux théorique (ZHR) et vitesse des météores">jusqu'à ${fmt(next.zhr)}/h dans un ciel parfait · ${fmt(next.v)} km/s</small>${detail ? `<small>${detail}</small>` : ""}</div>${moon}</div>
      ${chips ? `<div class="wl"><span class="mt-l">En cours</span>${chips}</div>` : ""}`;
  }

  _cycles(ent, sun, now) {
    const south = Number(this._hass?.config?.latitude) < 0;
    const mk = this._moonKey(ent, now), il = moonIllum(now);
    const sRaw = String(this._st(ent.season)?.state || "").toLowerCase();
    const season = SEASON[sRaw] || SEASON[seasonOfDate(now, south)];
    const zRaw = String(this._st(ent.zodiac)?.state || "").toLowerCase();
    const sunI = SUN_ICON[sun?.state];
    const tile = (attr, icon, color, value, label, svg) =>
      `<div class="sky-t" ${attr}>${svg || `<ha-icon icon="${icon}" style="color:${color}"></ha-icon>`}<div class="k-v">${esc(value)}</div><div class="k-l">${label}</div></div>`;
    return `<div class="sky">
      ${tile(`data-act="moon" role="button" tabindex="0"`, "", "", MOON[mk][0], "Lune", `<svg viewBox="-22 -22 44 44" class="k-m">${moonSvg(il.phase, 20, 0, 0, this._config.moon_image)}</svg>`)}
      ${sunI ? tile(`data-entity="sun.sun"`, sunI[1], sunI[2], sunI[0], "Soleil") : ""}
      ${tile(SEASON[sRaw] ? `data-entity="${esc(ent.season)}"` : "", season[1], season[2], season[0], "Saison")}
      ${ZODIAC[zRaw] ? tile(`data-entity="${esc(ent.zodiac)}"`, `mdi:zodiac-${zRaw}`, "#b38cf0", ZODIAC[zRaw], "Zodiaque") : ""}
    </div>`;
  }

  /** Fenêtre des phases : les 8 phases autour de la Terre, la phase du jour entourée. */
  _openMoon() {
    if (!this._keep) return;
    const now = new Date(), il = moonIllum(now), ent = detect(this._hass, this._config);
    const key = this._moonKey(ent, now), cur = MOON_KEYS.indexOf(key);
    const R = 100, cx = 190, cy = 162;
    const moons = MOON_KEYS.map((k, i) => {
      const a = i * 45 * RAD, x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
      const lx = cx + (R + 46) * Math.cos(a), ly = cy - (R + 40) * Math.sin(a);
      const words = MOON[k][0].split(" ");
      const label = words.length > 1 ? `<tspan x="${f2(lx)}" dy="-.3em">${words[0]}</tspan><tspan x="${f2(lx)}" dy="1.1em">${words.slice(1).join(" ")}</tspan>` : words[0];
      return `${moonSvg(i / 8, 18, +f2(x), +f2(y), this._config.moon_image)}${i === cur ? `<circle cx="${f2(x)}" cy="${f2(y)}" r="24" class="cur"/>` : ""}
        <text x="${f2(lx)}" y="${f2(ly)}" class="pl${i === cur ? " on" : ""}">${label}</text>`;
    }).join("");
    const lun = 29.530588853, age = il.phase * lun;
    const next = (target) => new Date(now.getTime() + (((target - il.phase) % 1 + 1) % 1) * lun * DAYMS);
    const dfmt = (d) => d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    if (!this._dlg || !this._keep.contains(this._dlg)) {
      this._keep.insertAdjacentHTML("beforeend", `<dialog class="dlg" aria-label="Phases de la lune"></dialog>`);
      this._dlg = this._keep.querySelector("dialog");
      this._dlg.addEventListener("click", (e) => { if (e.target === this._dlg || e.target.closest("[data-close]")) this._dlg.close(); });
    }
    this._dlg.className = `dlg ${themeClass(this._config.theme, this._hass)}`;
    this._dlg.innerHTML = `<div class="d-in" tabindex="-1" autofocus><div class="d-h"><b>Phases de la lune</b><button data-close aria-label="Fermer"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <svg viewBox="0 0 380 324" class="phases" role="img" aria-label="Phase actuelle : ${esc(MOON[key][0])}">
        <circle cx="${cx}" cy="${cy}" r="${R}" class="orb"/>
        ${this._config.earth_image
          // photo de la Terre (option earth_image), découpée en disque
          ? `<clipPath id="earthclip"><circle cx="${cx}" cy="${cy}" r="24"/></clipPath><image href="${esc(this._config.earth_image)}" x="${cx - 24}" y="${cy - 24}" width="48" height="48"
            clip-path="url(#earthclip)" preserveAspectRatio="xMidYMid slice"/>`
          : `<circle cx="${cx}" cy="${cy}" r="20" class="earth"/><path d="M${cx - 12} ${cy - 13}c7-3 13 1 11 7s-9 3-9 9-7 4-8-3 1-10 6-13zM${cx + 4} ${cy + 2}c5-2 11 1 10 6s-6 7-10 4-5-8 0-10z" class="land"/>`}
        ${moons}</svg>
      <div class="d-f"><span><b>${esc(MOON[key][0])}</b> · éclairée à ${fmt(il.fraction * 100)} % · ${fmt(age, 1)} jours</span>
        <span>Pleine lune ${dfmt(next(0.5))} · Nouvelle lune ${dfmt(next(0))}</span></div></div>`;
    if (typeof this._dlg.showModal === "function") this._dlg.showModal(); else this._dlg.setAttribute("open", "");
  }

  _pollenHtml(pol) {
    const c = this._config;
    const main = this._st(pol.main);
    const lv = main ? pollenLevel(main.state) : null;
    const risk = this._num(pol.risk);
    const rl = risk !== null ? Math.max(0, Math.min(3, risk)) : lv;
    const name = /_allergy_risk$/.test(pol.main || "") ? "Risque d'allergie" : main ? String(main.attributes?.friendly_name || "Pollens") : "Pollens";
    const headline = main ? `<div class="pol" data-entity="${esc(pol.main)}"><ha-icon icon="mdi:flower-pollen-outline" style="color:${POLLEN_COLOR[lv ?? 0]}"></ha-icon>
      <div class="pol-t"><span>${esc(name)}</span><b style="color:${POLLEN_COLOR[lv ?? 0]}">${lv === null ? esc(main.state) : POLLEN_LABEL[lv]}</b></div>
      ${rl !== null ? `<div class="pol-r"${pol.risk ? ` data-entity="${esc(pol.risk)}"` : ""}><span>Risque</span><div class="rbar"><i style="width:${((rl / 3) * 100).toFixed(0)}%;background:${POLLEN_COLOR[Math.min(4, Math.max(1, Math.round(rl)))]}"></i></div><b>${fmt(rl)}/3</b></div>` : ""}</div>` : "";
    const plants = pol.plants.map((id) => {
      const st = this._st(id);
      if (!st) return null;
      const l = pollenLevel(st.state);
      const key = id.split("_").pop();
      const pname = st.attributes?.pollen_name || POLLEN_FR[key] || String(st.attributes?.friendly_name || id).replace(/^pollens?\s+\S+\s+/i, "");
      return { id, l, pname, raw: st.state };
    }).filter((p) => p && (c.show_all_pollens || (p.l !== null && p.l > 0)))
      .sort((a, b) => (b.l ?? 0) - (a.l ?? 0) || a.pname.localeCompare(b.pname, "fr"));
    const grid = plants.length ? `<div class="plants">${plants.map((p) => `<div class="pl-t" data-entity="${esc(p.id)}" style="--pc:${POLLEN_COLOR[p.l ?? 0]}">
      <ha-icon icon="${pollenIcon(p.pname)}"></ha-icon><div class="pl-n">${esc(p.pname)}</div><div class="pl-v">${p.l === null ? esc(p.raw) : POLLEN_LABEL[p.l]}</div></div>`).join("")}</div>`
      : `<div class="fc-empty">Aucun pollen en circulation</div>`;
    return `<div class="sec">Pollens</div>${headline}${grid}`;
  }
}

/* ------------------------------------------------ carte Air, pollens et eau */

const AIR_DEFAULTS = { title: "Air, pollens et eau", show_air: true, show_pollens: true, show_water: true, show_all_pollens: true, theme: "v2" };
/** Indice Atmo (1 à 6) : libellé et couleur officiels. */
const ATMO = ["Indisponible", "Bon", "Moyen", "Dégradé", "Mauvais", "Très mauvais", "Extrêmement mauvais", "Événement"];
const ATMO_POLLEN = ["Indisponible", "Très faible", "Faible", "Modéré", "Élevé", "Très élevé", "Extrêmement élevé"];
const ATMO_COLOR = ["#8fa0b8", "#50f0e6", "#50ccaa", "#f0e641", "#ff5050", "#960032", "#872181", "#888888"];
const POLLUTANTS = [
  [/dioxyde_d_azote|_no2(_|$)/, "NO₂", "Dioxyde d'azote"], [/dioxyde_de_soufre|_so2(_|$)/, "SO₂", "Dioxyde de soufre"],
  [/[._]ozone|_o3(_|$)/, "O₃", "Ozone"], [/pm_?10/, "PM10", "Particules < 10 µm"], [/pm_?2_?5/, "PM2,5", "Particules < 2,5 µm"],
];
const ATMO_PLANTS = [["ambroisie", "Ambroisie"], ["armoise", "Armoise"], ["aulne", "Aulne"], ["bouleau", "Bouleau"], ["gramin", "Graminées"], ["olivier", "Olivier"]];
/** Sécheresse (VigiEau) : niveau de restriction. */
const WATER = [[/crise/i, 4, "Crise"], [/renforc/i, 3, "Alerte renforcée"], [/alerte/i, 2, "Alerte"], [/vigilance/i, 1, "Vigilance"], [/aucun|pas de|normal|none/i, 0, "Pas de restriction"]];
const WATER_COLOR = ["#5fcf8a", "#f7c948", "#ff8c33", "#ee4a4a", "#b3172f"];

class MeteoAirCard extends MeteoBase {
  static get defaults() {
    return AIR_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-air-card-editor");
  }

  getCardSize() {
    return 6;
  }

  /** Entités Atmo France et VigiEau : celles de la configuration, sinon détectées par leur nom. */
  _find() {
    const c = this._config, st = this._hass.states, ids = Object.keys(st).filter((id) => id.startsWith("sensor."));
    const reg = this._hass.entities || {};
    // Atmo France crée aussi les capteurs du lendemain (« Dioxyde d'azote-Ville-J+1 ») : seul le jour même est affiché
    const nextDay = (id) => /_j_?\d+(_\d+)?$/.test(id) || /-J\+\d/.test(String(st[id]?.attributes?.friendly_name || ""));
    const atmo = ids.filter((id) => (reg[id]?.platform === "atmofrance" || /^sensor\.(qualite_globale|dioxyde|ozone|pm_?10|pm_?25|niveau_|concentration_)/.test(id)) && !nextDay(id));
    const air = c.air || atmo.find((id) => /qualite_globale(?!_pollen)/.test(id) && !/pollen/.test(id));
    const pollen = c.pollen || atmo.find((id) => /qualite_globale_pollen/.test(id));
    const pollutants = Array.isArray(c.pollutants) ? c.pollutants
      : POLLUTANTS.map(([re]) => atmo.find((id) => re.test(id) && !/concentration/.test(id))).filter(Boolean);
    const plants = Array.isArray(c.pollens) ? c.pollens.map((x) => (typeof x === "string" ? { level: x } : x))
      : ATMO_PLANTS.map(([k, name]) => {
        const level = atmo.find((id) => id.includes(`niveau_${k}`));
        const conc = atmo.find((id) => id.includes(k) && !id.includes("niveau_") && st[id]?.attributes?.unit_of_measurement);
        return level || conc ? { name, level, concentration: conc } : null;
      }).filter(Boolean);
    // VigiEau : un niveau d'alerte texte par type d'eau (AEP, SOU, SUP), en plus de sa version numérique
    const isLevel = (id) => !/numeri|numeric/.test(id) && WATER.some(([re]) => re.test(st[id].state));
    const waters = c.water ? [].concat(c.water)
      : ids.filter((id) => (reg[id]?.platform === "vigieau" && /alert|niveau/.test(id)) || /(^sensor\.|_)alert_level$|secheresse/.test(id)).filter(isLevel);
    // usages interdits : capteurs binaires VigiEau à « off » (non autorisé), sans doublon entre types d'eau
    const bans = [...new Set(Object.keys(st).filter((id) => id.startsWith("binary_sensor.") && reg[id]?.platform === "vigieau" && st[id].state === "off")
      .map((id) => String(st[id].attributes?.friendly_name || id).replace(/^vigieau\s+.*?\s+(aep|sou|sup)\s+/i, "").replace(/\s+autoris.*$/i, "").trim()))];
    return { air, pollen, pollutants, plants, waters, bans };
  }

  _atmo(id, pollen) {
    const st = this._st(id);
    if (!st) return null;
    const n = num(st.state);
    const lv = n === null ? null : Math.max(0, Math.min(7, Math.round(n)));
    const label = st.attributes?.["Libellé"] || st.attributes?.libelle || st.attributes?.label || (lv === null ? st.state : (pollen ? ATMO_POLLEN : ATMO)[lv] || st.state);
    const color = st.attributes?.Couleur || st.attributes?.couleur || (lv === null ? ATMO_COLOR[0] : ATMO_COLOR[lv]);
    return { lv, label: String(label), color };
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const f = this._find();
    const ids = [f.air, f.pollen, ...f.waters, ...f.pollutants, ...f.plants.flatMap((p) => [p.level, p.concentration])];
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|` + ids.map((id) => this._st(id)?.state).join("|") + `|${f.bans.join(",")}`;
    if (sig === this._sig) return;
    this._sig = sig;
    const bar = (id, icon, title, a, max) => !a ? "" : `<div class="pol" data-entity="${esc(id)}"><ha-icon icon="${icon}" style="color:${a.color}"></ha-icon>
      <div class="pol-t"><span>${title}</span><b style="color:${a.color}">${esc(a.label)}${a.lv !== null ? ` (${a.lv})` : ""}</b></div>
      ${a.lv !== null ? `<div class="pol-r"><div class="rbar"><i style="width:${Math.min(100, (a.lv / max) * 100).toFixed(0)}%;background:${a.color}"></i></div><b>${a.lv}/${max}</b></div>` : ""}</div>`;
    const tile = (id, icon, name, a, extra = "") => `<div class="pl-t" data-entity="${esc(id)}" style="--pc:${a ? a.color : ATMO_COLOR[0]}">
      <ha-icon icon="${icon}"></ha-icon><div class="pl-n">${esc(name)}</div><div class="pl-v">${a ? esc(a.label) : "—"}</div>${extra}</div>`;
    const parts = [];
    if (c.show_air !== false && (f.air || f.pollutants.length)) {
      const tiles = f.pollutants.map((id) => {
        const p = POLLUTANTS.find(([re]) => re.test(id));
        return tile(id, "mdi:molecule", p ? p[1] : this._st(id)?.attributes?.friendly_name || id, this._atmo(id));
      }).join("");
      parts.push(`<div class="sec">Qualité de l'air</div>${bar(f.air, "mdi:air-filter", "Indice Atmo", this._atmo(f.air), 6)}${tiles ? `<div class="plants">${tiles}</div>` : ""}`);
    }
    if (c.show_pollens !== false && (f.pollen || f.plants.length)) {
      const tiles = f.plants.map((p) => {
        const a = p.level ? this._atmo(p.level, true) : null;
        const cv = this._num(p.concentration), unit = this._st(p.concentration)?.attributes?.unit_of_measurement || "µg/m³";
        if (!c.show_all_pollens && a && a.lv !== null && a.lv <= 1 && !(cv > 0)) return "";
        const name = p.name || ATMO_PLANTS.find(([k]) => String(p.level || p.concentration).includes(k))?.[1] || this._st(p.level || p.concentration)?.attributes?.friendly_name || p.level;
        return tile(p.level || p.concentration, pollenIcon(name), name, a, cv !== null ? `<div class="pl-c">${fmt(cv, 1)} ${esc(unit)}</div>` : "");
      }).join("");
      parts.push(`<div class="sec">Pollens</div>${bar(f.pollen, "mdi:flower-pollen-outline", "Indice pollens", this._atmo(f.pollen, true), 6)}${tiles ? `<div class="plants">${tiles}</div>` : ""}`);
    }
    if (c.show_water !== false && f.waters.length) {
      const TYPES = [[/_aep_|-aep\b|aep/i, "Eau potable"], [/_sou_|-sou\b|sou/i, "Eaux souterraines"], [/_sup_|-sup\b|sup/i, "Eaux superficielles"]];
      const levels = f.waters.map((id) => {
        const st = this._st(id);
        const w = WATER.find(([re]) => re.test(st?.state || "")) || [null, null, st?.state];
        const type = f.waters.length > 1 ? (TYPES.find(([re]) => re.test(id.replace(/^sensor\./, ""))) || [, ""])[1] : "";
        return { id, lv: w[1], label: w[2], type, col: st?.attributes?.Couleur || (w[1] === null ? ATMO_COLOR[0] : WATER_COLOR[w[1]]),
          area: st?.attributes?.zone || st?.attributes?.zone_name || st?.attributes?.commune || "" };
      });
      const top = levels.reduce((a, b) => ((b.lv ?? -1) > (a.lv ?? -1) ? b : a));
      const lv = top.lv, col = lv === null ? ATMO_COLOR[0] : WATER_COLOR[lv];
      const detail = levels.length > 1 ? `<div class="wl">${levels.map((l) => `<span class="w-i" data-entity="${esc(l.id)}" style="--pc:${l.lv === null ? ATMO_COLOR[0] : WATER_COLOR[l.lv]}">${esc(l.type || l.id)}<b>${esc(l.label)}</b></span>`).join("")}</div>` : "";
      const bans = f.bans.length ? `<div class="wl">${f.bans.map((b) => `<span class="w-b"><ha-icon icon="mdi:water-off"></ha-icon>${esc(b)}</span>`).join("")}</div>` : "";
      parts.push(`<div class="sec">Eau</div><div class="pol" data-entity="${esc(top.id)}"><ha-icon icon="mdi:water-alert" style="color:${col}"></ha-icon>
        <div class="pol-t"><span>Vigilance sécheresse${top.area ? ` · ${esc(top.area)}` : ""}</span><b style="color:${col}">${esc(top.label)}${lv !== null ? ` (${lv})` : ""}</b></div>
        ${lv !== null ? `<div class="pol-r"><div class="wbar">${[0, 1, 2, 3, 4].map((i) => `<i style="background:${WATER_COLOR[i]};opacity:${i <= lv ? 1 : 0.25}"></i>`).join("")}</div></div>` : ""}</div>${detail}${bans}`);
    }
    const body = this._head("mdi:leaf", "#5fcf8a", c.title || "Air, pollens et eau", "") + (parts.join("") ||
      `<div class="empty"><b>Aucun capteur trouvé</b><span>Installez les intégrations Atmo France (air, pollens) ou VigiEau (sécheresse), ou choisissez les capteurs dans l'éditeur.</span></div>`);
    this._card(body);
  }
}

/* ---------------------------------------------------------- carte Éclairs */

const ECLAIRS_DEFAULTS = { title: "Éclairs", counter_max: 100, theme: "v2" };

class MeteoEclairsCard extends MeteoBase {
  static get defaults() {
    return ECLAIRS_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-eclairs-card-editor");
  }

  getCardSize() {
    return 4;
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config, ids = Object.keys(this._hass.states);
    const reg = this._hass.entities || {}, st = this._hass.states;
    // Blitzortung : capteurs reconnus par leur plateforme et leur unité (km, °, ↯), sinon par leur nom (anglais ou français)
    const blitz = ids.filter((id) => id.startsWith("sensor.") && reg[id]?.platform === "blitzortung");
    const unit = (id) => String(st[id]?.attributes?.unit_of_measurement || "");
    const find = (re, u) => blitz.find((id) => u.test(unit(id))) || blitz.find((id) => re.test(id)) || ids.find((id) => id.startsWith("sensor.") && re.test(id));
    const counter = c.counter || find(/lightning_counter$|compteur_de_foudre$/, /↯/);
    const distance = c.distance || find(/lightning_distance$|distance_de_foudre$/, /^(km|mi)$/);
    const azimuth = c.azimuth || find(/lightning_azimuth$|azimut_de_foudre$/, /^°$/);
    // éclairs du mois : compteur (utility_meter) alimenté par le compteur Blitzortung (attribut source en YAML),
    // sinon compteur utility_meter ou capteur dont le nom évoque les éclairs du mois
    const monthRe = /eclairs?_mensuel|eclairs?_du_mois|foudre_du_mois|lightning.*month/;
    const month = c.month_counter || (counter && ids.find((id) => id.startsWith("sensor.") && st[id]?.attributes?.source === counter
      && /month/.test(String(st[id].attributes.meter_period || ""))))
      || ids.find((id) => id.startsWith("sensor.") && reg[id]?.platform === "utility_meter" && /eclair|foudre|lightning/.test(id))
      || ids.find((id) => id.startsWith("sensor.") && monthRe.test(id));
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|` + [counter, distance, azimuth, month].map((id) => this._st(id)?.state).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    const n = this._num(counter), dist = this._num(distance), az = this._num(azimuth), mn = this._num(month);
    const last = this._st(counter)?.last_changed ? new Date(this._st(counter).last_changed) : null;
    const strike = az === null ? "" : (() => {
      const r = dist === null ? 40 : Math.max(10, 52 - Math.min(1, dist / (Number(c.distance_max) || 100)) * 40);
      const [x, y] = pt(70, 70, r, az);
      return `<g class="bolt" transform="translate(${f2(x)} ${f2(y)})"><circle r="9"/><path d="M1.5-6L-3.5 1h3l-1.5 5 5-7h-3z"/></g>`;
    })();
    const rose = `<div class="gauge" data-entity="${esc(azimuth || distance || counter)}"><svg viewBox="0 0 140 140" role="img" aria-label="Dernier éclair">
      ${roseSvg(c.compass_image)}${strike}
      <text x="70" y="74" class="big">${dist === null ? "—" : fmt(dist, dist < 100 ? 1 : 0)}</text><text x="70" y="87" class="sm">${dist === null ? "aucun éclair" : "km"}</text></svg>
      <div class="g-l">Dernier éclair${az !== null ? ` · <b>${compass16(az)}</b>` : ""}${last && n ? ` · ${hm(last)}` : ""}</div></div>`;
    const max = Number(c.counter_max) || 100;
    const val = n ?? 0;
    const zones = [[0.33, "#5fcf8a"], [0.66, "#f7c948"], [1, "#ee4a4a"]];
    let from = 0;
    const arcs = zones.map(([to, col]) => { const a0 = -130 + from * 260, a1 = -130 + to * 260; from = to; return `<path d="${arcD(70, 66, 52, a0, a1)}" stroke="${col}" class="zn"/>`; }).join("");
    const [nx, ny] = pt(70, 66, 40, -130 + Math.min(1, val / max) * 260);
    const gauge = `<div class="gauge" data-entity="${esc(counter || month)}"><svg viewBox="0 0 140 112" role="img" aria-label="${fmt(val)} éclairs">
      <path d="${arcD(70, 66, 52, -130, 130)}" class="trk"/>${arcs}
      <line x1="70" y1="66" x2="${f2(nx)}" y2="${f2(ny)}" class="ndl"/><circle cx="70" cy="66" r="4" class="hub"/>
      <text x="70" y="98" class="big">${n === null ? "—" : fmt(n)}</text><text x="70" y="110" class="sm">éclairs</text></svg>
      <div class="g-l">Compteur${mn !== null ? ` · <b>${fmt(mn)}</b> ce mois` : ""}</div></div>`;
    const ok = counter || distance || azimuth;
    const body = this._head("mdi:flash", "#f7c948", c.title || "Éclairs", n ? `${fmt(n)} éclair${n > 1 ? "s" : ""} détecté${n > 1 ? "s" : ""}` : "Aucun éclair à proximité") +
      (ok ? `<div class="duo">${rose}${gauge}</div>` : `<div class="empty"><b>Aucun capteur d'éclairs</b><span>Installez l'intégration Blitzortung, ou choisissez les capteurs dans l'éditeur.</span></div>`);
    this._card(body);
  }
}


/* ---------------------------------------------------------------- bolides */

const BOLIDES_DEFAULTS = { title: "Bolides", period: "all", min_energy: 0, show_home: true, map_height: 320, theme: "v2" };
const FIREBALL_API = "https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true";
const LEAFLET = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/";
const MAPLIBRE = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/";
const MAPLIBRE_LEAFLET = "https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js";
// fonds vectoriels officiels d'OpenStreetMap (Shortbread), ceux de Home Assistant depuis que CARTO exige une clé
const OSM_VECTOR = "https://vector.openstreetmap.org/shortbread_v1/tilejson.json";
const scripts = {};
/** Script classique chargé une seule fois (délai de 20 s : sans réponse, la carte affiche un message au lieu de rester vide). */
const loadScript = (src, ready) => (scripts[src] = scripts[src] || new Promise((resolve, reject) => {
  if (ready()) { resolve(); return; }
  const s = document.createElement("script");
  const timer = setTimeout(() => reject(new Error("délai dépassé")), 20000);
  s.src = src;
  s.onload = () => { clearTimeout(timer); ready() ? resolve() : reject(new Error(`${src} incomplet`)); };
  s.onerror = () => { clearTimeout(timer); reject(new Error(`${src} introuvable`)); };
  document.head.appendChild(s);
}).catch((e) => { delete scripts[src]; throw e; }));
/** Leaflet (carte du monde, window.L), à la première carte Bolides affichée. */
const loadLeaflet = (base) => loadScript(`${base}leaflet.js`, () => window.L?.map).then(() => window.L);
/** Fond vectoriel : MapLibre GL et son extension Leaflet ; faux si le navigateur n'a pas WebGL2 ou si le chargement échoue. */
const loadVector = () => {
  if (!document.createElement("canvas").getContext("webgl2")) return Promise.resolve(false);
  return loadScript(`${MAPLIBRE}maplibre-gl.js`, () => window.maplibregl?.Map)
    .then(() => loadScript(MAPLIBRE_LEAFLET, () => window.L?.maplibreGL))
    .then(() => true, () => false);
};
/** Style sobre des fonds Shortbread : continents, océans, lacs et frontières (sans étiquettes, donc sans polices à charger). */
const vectorStyle = (light) => {
  const k = light ? { land: "#eef2f6", sea: "#b9d3ea", line: "#9aaabd" } : { land: "#24324a", sea: "#111a28", line: "#4b5e7c" };
  return { version: 8, sources: { osm: { type: "vector", url: OSM_VECTOR } }, layers: [
    { id: "land", type: "background", paint: { "background-color": k.land } },
    { id: "ocean", type: "fill", source: "osm", "source-layer": "ocean", paint: { "fill-color": k.sea } },
    { id: "water", type: "fill", source: "osm", "source-layer": "water_polygons", paint: { "fill-color": k.sea } },
    { id: "borders", type: "line", source: "osm", "source-layer": "boundaries", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], true]],
      paint: { "line-color": k.line, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.2] } },
  ] };
};
const BOLIDE_PERIODS = [["30", "30 jours", 30], ["365", "1 an", 365], ["1825", "5 ans", 1825], ["all", "Tout", Infinity]];
const BOLIDE_ENERGY = [[0, "Tous"], [1, "≥ 1 kt"], [10, "≥ 10 kt"]];
const bolideColor = (days) => (days < 30 ? "#ee4a4a" : days < 183 ? "#ff8c33" : "#8fa0b8");
const bolideRadius = (kt, old) => Math.min(22, (old ? 2 : 3) + (old ? 3 : 4) * Math.log10(1 + Math.max(0, kt || 0) * 10));
/** Distance (km) entre deux points, formule de haversine. */
const greatCircle = (lat1, lon1, lat2, lon2) => {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
};
/** Réponse de l'API Fireball (fields + data) en liste de bolides localisés, du plus récent au plus ancien. */
const parseFireballs = (fields, data) => {
  if (!Array.isArray(fields) || !Array.isArray(data)) return [];
  const i = (k) => fields.indexOf(k);
  const v = (row, k) => (i(k) < 0 ? null : num(row[i(k)]));
  return data.map((row) => {
    const lat = v(row, "lat"), lon = v(row, "lon");
    if (lat === null || lon === null) return null;
    return { date: new Date(`${String(row[i("date")]).replace(" ", "T")}Z`), lat: row[i("lat-dir")] === "S" ? -lat : lat, lon: row[i("lon-dir")] === "W" ? -lon : lon,
      alt: v(row, "alt"), vel: v(row, "vel"), energy: v(row, "energy"), impact: v(row, "impact-e") };
  }).filter((b) => b && !isNaN(b.date)).sort((a, b) => b.date - a.date);
};

class MeteoBolidesCard extends MeteoBase {
  static get defaults() {
    return BOLIDES_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-bolides-card-editor");
  }

  getCardSize() {
    return 7;
  }

  /** Capteur de l'API Fireball : celui de la configuration, sinon le premier qui porte ses attributs fields et data. */
  _source() {
    const c = this._config, st = this._hass.states;
    const ok = (id) => Array.isArray(st[id]?.attributes?.fields) && st[id].attributes.fields.includes("impact-e");
    return c.entity && st[c.entity] ? c.entity : Object.keys(st).find((id) => id.startsWith("sensor.") && ok(id));
  }

  /** Sans capteur, l'API est appelée depuis le navigateur (si elle l'autorise), une fois par session. */
  _direct() {
    if (this._fetching) return;
    this._fetching = true;
    fetch(FIREBALL_API).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => { this._directData = parseFireballs(j.fields, j.data); })
      .catch(() => { this._directData = []; })
      .finally(() => { this._sig = null; this._render(); });
  }

  _action(act, el) {
    if (act === "period") { this._period = el.dataset.v; store.set("meteo-bolides-card:period", this._period); }
    else if (act === "energy") { this._energy = Number(el.dataset.v); store.set("meteo-bolides-card:energy", this._energy); }
    else if (act === "fly") { this._fly(Number(el.dataset.i)); return; }
    else if (act === "full") { const w = this._keep?.querySelector(".bm"); if (document.fullscreenElement) document.exitFullscreen(); else w?.requestFullscreen?.(); return; }
    this._sig = null;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const src = this._source();
    if (!src && this._directData === undefined) this._direct();
    const st = this._st(src);
    if (this._period === undefined) this._period = store.get("meteo-bolides-card:period") || String(c.period || "all");
    if (this._energy === undefined) this._energy = store.get("meteo-bolides-card:energy") ?? Number(c.min_energy || 0);
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${src}|${st?.last_updated}|${this._period}|${this._energy}|${this._directData?.length}`;
    if (sig === this._sig) return;
    this._sig = sig;
    // la liste (environ un millier de bolides) n'est relue que lorsque le capteur change
    const key = st ? `${src}|${st.last_updated}` : "direct";
    if (this._allKey !== key || !st) { this._all = st ? parseFireballs(st.attributes.fields, st.attributes.data) : this._directData || []; this._allKey = key; }
    const all = this._all;
    const home = [num(c.latitude) ?? num(this._hass.config?.latitude), num(c.longitude) ?? num(this._hass.config?.longitude)];
    const hasHome = home[0] !== null && home[1] !== null;
    const now = Date.now();
    const per = (BOLIDE_PERIODS.find(([k]) => k === this._period) || BOLIDE_PERIODS[3])[2];
    const list = all.filter((b) => (now - b.date) / DAYMS <= per && (b.impact ?? 0) >= this._energy)
      .map((b) => ({ ...b, days: (now - b.date) / DAYMS, dist: hasHome ? greatCircle(home[0], home[1], b.lat, b.lon) : null }));
    this._list = list;
    const dfull = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    const ago = (days) => (days < 1 ? "aujourd'hui" : days < 2 ? "hier" : days < 60 ? `il y a ${Math.floor(days)} jours` : days < 730 ? `il y a ${Math.floor(days / 30.4)} mois` : `il y a ${Math.floor(days / 365.25)} ans`);
    const kt = (v) => (v === null ? "—" : `${fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)} kt`);
    const last = list[0], near = hasHome ? [...list].sort((a, b) => a.dist - b.dist)[0] : null, big = [...list].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))[0];
    const tile = (b, icon, label, value, sub) => (b ? `<div class="sky-t bt" data-act="fly" data-i="${list.indexOf(b)}" role="button" tabindex="0">
      <ha-icon icon="${icon}" style="color:${bolideColor(b.days)}"></ha-icon><div class="k-v">${value}</div><div class="k-l">${label}</div><div class="bt-s">${sub}</div></div>` : "");
    const chips = (act, items, cur) => items.map(([k, lab]) => `<button class="mt-c bc${String(k) === String(cur) ? " on" : ""}" data-act="${act}" data-v="${k}">${lab}</button>`).join("");
    const sub = st || this._directData?.length ? `${fmt(list.length)} bolide${list.length > 1 ? "s" : ""}${all[0] ? ` · dernier connu le ${dfull(all[0].date)}` : ""}` : "";
    let body = this._head(c.icon || "mdi:meteor", "#ff8c33", c.title || "Bolides", sub);
    if (!all.length) {
      body += this._directData === undefined && !src ? `<div class="empty"><b>Chargement…</b></div>`
        : `<div class="empty"><b>Aucune donnée de bolides</b><span>Ajoutez le capteur REST de l'API Fireball de la NASA (voir la documentation de la carte), ou choisissez-le dans l'éditeur.</span></div>`;
      this._card(body);
      if (this._keep) this._keep.innerHTML = "";
      this._map = null;
      return;
    }
    body += `<div class="sky bts">${tile(last, "mdi:clock-outline", "Dernier", dfull(last?.date || new Date()), last ? ago(last.days) : "")}
      ${tile(near, "mdi:home-map-marker", "Le plus proche", near ? `${fmt(near.dist)} km` : "", near ? dfull(near.date) : "")}
      ${tile(big, "mdi:flash-alert", "Le plus puissant", big ? kt(big.impact) : "", big ? dfull(big.date) : "")}</div>
      <div class="wl bf"><span class="mt-l">Période</span>${chips("period", BOLIDE_PERIODS, this._period)}<span class="mt-l">Énergie</span>${chips("energy", BOLIDE_ENERGY, this._energy)}</div>`;
    this._card(body);
    this._mapUpdate(list, hasHome ? home : null);
  }

  /** Carte Leaflet : créée une fois dans la zone « keep », marqueurs recréés à chaque changement de données ou de filtre. */
  async _mapUpdate(list, home) {
    const c = this._config;
    if (!this._keep) return;
    if (!this._keep.querySelector(".bm")) {
      const base = c.leaflet_path || LEAFLET;
      this._keep.innerHTML = `<link rel="stylesheet" href="${esc(base)}leaflet.css"><link rel="stylesheet" href="${MAPLIBRE}maplibre-gl.css"><div class="bm" style="height:${Number(c.map_height) || 320}px">
        <div class="bm-map"></div><button class="bm-full" data-act="full" title="Plein écran"><ha-icon icon="mdi:fullscreen"></ha-icon></button></div>
        <div class="bm-leg"><span><i style="background:#ee4a4a"></i>moins de 30 jours</span><span><i style="background:#ff8c33"></i>moins de 6 mois</span><span><i style="background:#8fa0b8"></i>plus ancien</span><span>taille : énergie</span></div>`;
      this._map = null;
    }
    let L;
    try { L = await loadLeaflet(c.leaflet_path || LEAFLET); } catch (e) {
      const box = this._keep.querySelector(".bm-map");
      if (box) box.innerHTML = `<div class="empty"><b>Carte indisponible</b><span>La bibliothèque Leaflet n'a pas pu être chargée (${esc(e.message)}).</span></div>`;
      return;
    }
    const el = this._keep.querySelector(".bm-map");
    if (!el) return;
    try {
      const light = /light/.test(themeClass(c.theme, this._hass)) || (c.theme === "ha" && this._hass.themes?.darkMode === false);
      if (!this._map || this._mapEl !== el) {
        this._mapEl = el;
        this._map = L.map(el, { worldCopyJump: true, minZoom: 1, zoomSnap: 0.5, attributionControl: true }).setView([home ? home[0] * 0.4 : 20, home ? home[1] : 0], 1);
        new ResizeObserver(() => this._map?.invalidateSize()).observe(el);
        // la source des bolides reste citée quel que soit le fond (le fond vectoriel remplace la mention de sa couche)
        this._map.attributionControl.addAttribution('bolides : <a href="https://cneos.jpl.nasa.gov/fireballs/">NASA JPL CNEOS</a>');
        this._layer = L.layerGroup().addTo(this._map);
      }
      // fond : vectoriel OpenStreetMap (comme Home Assistant), sinon images OpenStreetMap assombries par un filtre CSS ; tiles_url pour un autre fournisseur
      const vector = !c.tiles_url && (await loadVector());
      const attribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      const key = vector ? `vector|${light}` : c.tiles_url || "raster";
      el.classList.toggle("dark", !vector && !light && !c.tiles_url);
      if (this._tilesKey !== key) {
        this._tiles?.remove();
        this._tiles = vector ? L.maplibreGL({ style: vectorStyle(light), attribution, interactive: false })
          : L.tileLayer(c.tiles_url || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution });
        this._tiles.addTo(this._map);
        this._tilesKey = key;
      }
      this._layer.clearLayers();
      this._markers = [];
      const dt = (d) => d.toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const kt = (v) => (v === null ? "—" : `${fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)} kt`);
      // les plus anciens d'abord, pour que les récents restent au-dessus
      for (const b of [...list].reverse()) {
        const col = bolideColor(b.days);
        const old = b.days >= 183;
        const m = L.circleMarker([b.lat, b.lon], { radius: bolideRadius(b.impact, old), color: col, weight: old ? 0.6 : 1, opacity: old ? 0.6 : 1, fillColor: col, fillOpacity: old ? 0.3 : 0.85 })
          .bindPopup(`<div class="bp"><b>Bolide du ${dt(b.date)}</b>
            ${b.vel !== null ? `<span>Vitesse <b>${fmt(b.vel, 1)} km/s</b></span>` : ""}${b.alt !== null ? `<span>Altitude <b>${fmt(b.alt, 1)} km</b></span>` : ""}
            ${b.energy !== null ? `<span>Énergie rayonnée <b>${fmt(b.energy, b.energy < 10 ? 1 : 0)} × 10¹⁰ J</b></span>` : ""}<span>Énergie d'impact <b>${kt(b.impact)}</b></span>
            ${b.dist !== null ? `<span>À <b>${fmt(b.dist)} km</b> de chez vous</span>` : ""}</div>`,
          // la carte se décale pour que la bulle ne passe pas sous les boutons de zoom et de plein écran
          { autoPanPaddingTopLeft: L.point(56, 16), autoPanPaddingBottomRight: L.point(56, 24) });
        m.addTo(this._layer);
        this._markers[list.indexOf(b)] = m;
      }
      if (home && c.show_home !== false) L.circleMarker(home, { radius: 6, color: "#fff", weight: 2, fillColor: "#1d93e3", fillOpacity: 1 }).bindTooltip("Chez vous").addTo(this._layer);
    } catch (e) {
      // erreur affichée dans la carte plutôt qu'une zone vide
      console.error("Carte Météo (bolides) :", e);
      this._map = null;
      el.innerHTML = `<div class="empty"><b>Erreur de la carte</b><span>${esc(e.message)}</span></div>`;
    }
  }

  _fly(i) {
    const m = this._markers?.[i];
    if (!m || !this._map) return;
    this._map.flyTo(m.getLatLng(), Math.max(this._map.getZoom(), 4), { duration: 0.8 });
    setTimeout(() => m.openPopup(), 850);
  }
}

/* ------------------------------------------------------------------ style */

const STYLE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55;
  --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-green: #96d21f; --med-blue: #1d93e3;
  --t-red: #ee4a4a;
  --med-up: #f08a4b; --med-down: #5fcf8a;
}
ha-card { background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line);
  border-radius: 18px; overflow: hidden; font-variant-numeric: tabular-nums; container-type: inline-size; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 4px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title { font-size: 1.15rem; font-weight: 700; letter-spacing: .2px; }
.sub { font-size: .78rem; color: var(--med-muted); }
.pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; cursor: pointer;
  background: var(--med-surface); border: 1px solid var(--med-line); font-size: .78rem; }
.pill-l { color: var(--med-muted); }
.pill-v { font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--med-muted); flex: none; }
.empty { padding: 18px; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
.empty span { color: var(--med-muted); }
/* Thème Home Assistant : fond, textes et bordures suivent le thème clair ou sombre */
ha-card.th-ha {
  --med-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 5%, transparent);
  --med-line: var(--divider-color, rgba(127, 127, 127, .25));
  --med-text: var(--primary-text-color, #1f2937);
  --med-muted: var(--secondary-text-color, #6b7280);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card.th-ha.light { --med-green: #4c8a0b; --med-up: #c2560f; --med-down: #1d8a4b; }
/* Style MyElectricalData en version claire (theme: auto quand Home Assistant est en mode clair) */
ha-card.th-v2.light {
  --med-bg: #ffffff; --med-surface: #f2f5f9; --med-line: #dbe2ec;
  --med-text: #1a2434; --med-muted: #5b6b82;
  --med-green: #4c8a0b; --med-blue: #1673b8; --med-up: #c2560f; --med-down: #1d8a4b;
  box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>`;

const METEO_STYLE = `<style>
ha-card { display: block; padding-bottom: 14px; }
.b-ic { --mdc-icon-size: 32px; flex: none; }
.now { display: flex; align-items: center; gap: 14px; padding: 6px 18px 4px; cursor: pointer; }
.n-ic { --mdc-icon-size: 64px; flex: none; filter: drop-shadow(0 0 10px color-mix(in srgb, currentColor 35%, transparent)); }
.n-t { font-size: 3.4rem; font-weight: 700; line-height: 1; letter-spacing: -1px; }
.n-t span { font-size: 1.2rem; font-weight: 500; color: var(--med-muted); margin-left: 3px; vertical-align: top; position: relative; top: .5rem; letter-spacing: 0; }
.n-hl { margin-left: auto; display: flex; flex-direction: column; gap: 2px; text-align: right; font-weight: 600; font-size: .95rem; }
.hi { color: var(--med-up); } .lo { color: var(--med-blue); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 10px 12px 0; }
@container (max-width: 440px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.stat { padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); min-width: 0; }
.s-h { display: flex; align-items: center; gap: 5px; font-size: .72rem; color: var(--med-muted); }
.s-h ha-icon { --mdc-icon-size: 15px; }
.s-h .arrow { margin-left: auto; color: var(--med-blue); --mdc-icon-size: 16px; }
.s-v { font-size: 1.15rem; font-weight: 700; margin-top: 3px; white-space: nowrap; }
.s-v small { font-size: .72rem; font-weight: 500; color: var(--med-muted); }
.s-n { font-size: .68rem; color: var(--med-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vig { margin: 10px 12px 0; padding: 9px 12px; border-radius: 12px; cursor: pointer; font-size: .84rem;
  border: 1px solid color-mix(in srgb, var(--vc, var(--med-line)) 55%, transparent);
  background: color-mix(in srgb, var(--vc, transparent) 10%, var(--med-surface)); }
.vig.ok { display: flex; align-items: center; gap: 8px; color: var(--med-muted); --vc: var(--med-down); }
.vig ha-icon { --mdc-icon-size: 18px; }
.vig.ok ha-icon { color: var(--med-down); }
.v-h { display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--vc); }
.v-l { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.v-p { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 6px; border-radius: 999px; font-size: .76rem;
  border: 1px solid color-mix(in srgb, var(--pc) 50%, transparent); }
.v-p ha-icon { --mdc-icon-size: 15px; color: var(--pc); }
.v-p b { color: var(--pc); font-weight: 700; }
ha-card.light .v-h, ha-card.light .v-p b { filter: brightness(.8); }
.v-rows { display: grid; gap: 6px; margin-top: 7px; }
.v-r { display: flex; align-items: flex-start; gap: 8px; padding: 6px 9px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--pc) 45%, transparent); background: color-mix(in srgb, var(--pc) 8%, transparent); }
.v-r ha-icon { --mdc-icon-size: 17px; color: var(--pc); margin-top: 1px; }
.v-t { display: grid; gap: 1px; min-width: 0; }
.v-t span { font-weight: 600; }
.v-t small { font-size: .74rem; color: var(--med-muted); }
.v-t small b { color: var(--pc); font-weight: 700; }
ha-card.light .v-t small b { filter: brightness(.8); }
.sec { margin: 14px 18px 6px; font-size: .82rem; color: var(--med-muted); }
.fc { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(48px, 1fr); gap: 6px; margin: 0 12px; padding-bottom: 2px; cursor: pointer; overflow-x: auto; scrollbar-width: thin; }
.fc-d { text-align: center; padding: 8px 2px 7px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); min-width: 0; }
.f-n { font-size: .72rem; color: var(--med-muted); text-transform: capitalize; white-space: nowrap; }
.fc-d ha-icon { --mdc-icon-size: 26px; margin: 4px 0 2px; }
ha-icon.rot { display: inline-block; }
.f-hi { font-weight: 700; font-size: .95rem; }
.f-lo { font-size: .78rem; color: var(--med-muted); }
.f-bar { position: relative; height: 4px; margin: 5px 8px 0; border-radius: 2px; background: var(--med-line); }
.f-bar span { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: linear-gradient(90deg, var(--med-blue), var(--med-up)); }
.f-r { min-height: 1.1em; margin-top: 3px; font-size: .68rem; color: var(--med-blue); display: flex; align-items: center; justify-content: center; gap: 1px; }
.f-r ha-icon { --mdc-icon-size: 11px; margin: 0; }
.f-r { white-space: nowrap; flex-direction: column; gap: 0; line-height: 1.25; }
.f-r span { display: flex; align-items: center; justify-content: center; }
.f-r .pp { color: var(--med-muted); }
.f-g { font-size: .64rem; font-weight: 700; color: var(--t-red); }
.rh { margin: 10px 12px 0; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; }
.rh-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: .72rem; color: var(--med-muted); }
.rh-h b { color: var(--med-text); font-size: .8rem; text-align: center; }
.rh-b { display: flex; gap: 2px; height: 10px; margin-top: 6px; }
.rh-b span { border-radius: 3px; }
.rh-t { position: relative; height: 12px; font-size: .6rem; color: var(--med-muted); }
.rh-t i { position: absolute; top: 1px; transform: translateX(-50%); font-style: normal; }
.f-r small { font-size: .6rem; margin-left: 1px; opacity: .8; }
.fc-empty { margin: 12px 12px 0; padding: 14px 0; text-align: center; font-size: .8rem; color: var(--med-muted); border: 1px dashed var(--med-line); border-radius: 12px; }
.sky { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin: 10px 12px 0; }
.sky-t { text-align: center; padding: 8px 4px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); min-width: 0; }
.sky-t[data-entity] { cursor: pointer; }
.sky-t ha-icon { --mdc-icon-size: 22px; }
.k-v { font-size: .8rem; font-weight: 600; margin-top: 3px; overflow-wrap: anywhere; }
.k-l { font-size: .66rem; color: var(--med-muted); text-transform: uppercase; letter-spacing: .6px; margin-top: 1px; }
.tabs { display: flex; gap: 6px; padding: 12px 12px 0; overflow-x: auto; scrollbar-width: none; }
.tab { flex: 1 1 0; min-width: max-content; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px;
  border-radius: 10px; border: 1px solid var(--med-line); background: transparent; color: var(--med-muted); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; }
.tab ha-icon { --mdc-icon-size: 17px; }
.tab.on { background: var(--med-surface); color: var(--med-text); border-color: color-mix(in srgb, var(--med-blue) 60%, var(--med-line)); box-shadow: inset 0 -2px 0 var(--med-blue); }
.tab:focus-visible, .mbtn:focus-visible, .sky-t:focus-visible { outline: 2px solid var(--med-blue); outline-offset: 2px; }
.det { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 12px 0; }
.d-i { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px 4px 7px; border-radius: 999px; font-size: .76rem; color: var(--med-muted);
  background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; }
.d-i ha-icon { --mdc-icon-size: 15px; color: var(--med-blue); }
.d-i b { color: var(--med-text); font-weight: 700; }
svg.wi { flex: none; overflow: visible; }
img.wi-img { flex: none; display: block; object-fit: contain; }
img.wi-img.n-ic { width: 92px; height: 92px; margin: -14px -10px -14px -12px; }
img.wi-img.b-ic { width: 44px; height: 44px; margin: -6px -4px -6px -6px; }
img.wi-img.f-ic { width: 44px; height: 44px; margin: -4px auto -6px; }
svg.wi.n-ic { width: 72px; height: 72px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .35)); }
svg.wi.b-ic { width: 34px; height: 34px; }
svg.wi.f-ic { width: 30px; height: 30px; margin: 3px auto 1px; display: block; }
svg.wi .rays line { stroke: #f7c948; stroke-width: 3; stroke-linecap: round; }
svg.wi .drop { stroke-width: 2.6; stroke-linecap: round; }
svg.wi .bolt { stroke: #c79a00; stroke-width: .6; }
svg.wi .fog line, svg.wi .wind path { stroke: #b8c6d8; stroke-width: 3.5; stroke-linecap: round; fill: none; }
svg.wi .stars circle { fill: #ffffff; }
svg.wi .moon { stroke: #8fa0b8; stroke-width: 1; }
ha-card.light svg.wi .stars circle { fill: #8fa0b8; }
svg.wi .cloud.back { opacity: .9; }
svg.wi .cloud { stroke: rgba(26, 36, 52, .18); stroke-width: 1; }
svg.wi.anim .rays { animation: wi-spin 14s linear infinite; transform-box: fill-box; transform-origin: center; }
svg.wi.anim .cloud:not(.back) { animation: wi-drift 5s ease-in-out infinite alternate; }
svg.wi.anim .drop { animation: wi-fall 1s linear infinite; }
svg.wi.anim .flake { animation: wi-snow 2.2s linear infinite; }
svg.wi.anim .bolt { animation: wi-flash 2.6s ease-in-out infinite; }
svg.wi.anim .fog line { animation: wi-fog 4s ease-in-out infinite alternate; }
svg.wi.anim .stars circle { animation: wi-twinkle 3s ease-in-out infinite; }
svg.wi.anim .stars circle:nth-child(2) { animation-delay: 1s; } svg.wi.anim .stars circle:nth-child(3) { animation-delay: 2s; }
svg.wi.anim .wind path { stroke-dasharray: 60; animation: wi-wind 2.5s ease-in-out infinite; }
@keyframes wi-spin { to { transform: rotate(360deg); } }
@keyframes wi-drift { from { transform: translateX(-1.5px); } to { transform: translateX(1.5px); } }
@keyframes wi-fall { 0% { transform: translateY(-4px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(8px); opacity: 0; } }
@keyframes wi-snow { 0% { transform: translate(0, -4px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translate(2px, 9px); opacity: 0; } }
@keyframes wi-flash { 0%, 70%, 100% { opacity: 1; } 75%, 85% { opacity: .15; } 80% { opacity: 1; } }
@keyframes wi-fog { from { transform: translateX(-3px); } to { transform: translateX(3px); } }
@keyframes wi-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes wi-wind { 0% { stroke-dashoffset: 60; } 50% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -60; } }
@media (prefers-reduced-motion: reduce) { svg.wi * { animation: none !important; } }
.fc.full { grid-auto-columns: minmax(58px, 1fr); }
.fc-d.full > div { line-height: 1.35; }
.fc-d.full .f-hi { font-size: .9rem; }
.f-mm { font-size: .7rem; color: var(--med-blue); white-space: nowrap; }
.f-mm small, .f-w small, .f-gb small { font-size: .58rem; opacity: .8; }
.f-pp { font-size: .66rem; color: var(--med-muted); display: flex; align-items: center; justify-content: center; white-space: nowrap; }
.f-pp ha-icon { --mdc-icon-size: 11px; margin: 0; }
.fc-d.full .f-w { white-space: nowrap; font-size: .68rem; color: var(--med-text); }
.f-gb { margin-top: 2px; }
.f-gb span { display: inline-block; padding: 0 4px; border-radius: 4px; background: var(--t-red); color: #fff; font-size: .66rem; font-weight: 700; white-space: nowrap; }
.f-dir { margin-top: 3px; min-height: 18px; }
.f-dir ha-icon { --mdc-icon-size: 18px; margin: 0; color: var(--med-blue); }
.f-hu { font-size: .64rem; color: var(--med-muted); display: flex; align-items: center; justify-content: center; }
.f-hu ha-icon { --mdc-icon-size: 11px; margin: 0; color: var(--med-blue); }
.k-v .sr { color: var(--med-up); } .k-v .ss { color: var(--med-blue); }
.f-w { font-size: .66rem; color: var(--med-muted); display: flex; align-items: center; justify-content: center; gap: 1px; }
.f-w ha-icon { --mdc-icon-size: 11px; margin: 0; color: var(--med-blue); }
/* Vent et ciel */
.duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 8px 12px 0; }
.gauge { padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; min-width: 0; text-align: center; }
.gauge svg { width: 100%; max-width: 190px; display: block; margin: 0 auto; overflow: visible; }
.gauge.row { display: flex; align-items: center; gap: 12px; text-align: left; }
.g-l { font-size: .74rem; color: var(--med-muted); margin-top: 2px; }
.g-l b { font-weight: 700; color: var(--med-text); }
.g-v { font-size: 1.3rem; font-weight: 700; }
.g-v small { font-size: .72rem; font-weight: 500; color: var(--med-muted); }
svg .trk { fill: none; stroke: var(--med-line); stroke-width: 10; stroke-linecap: round; }
svg .zn { fill: none; stroke-width: 7; }
svg .ndl { stroke: var(--med-text); stroke-width: 2.5; stroke-linecap: round; }
svg .hub { fill: var(--med-text); }
svg .big { font-size: 19px; font-weight: 700; fill: var(--med-text); text-anchor: middle; }
svg .sm { font-size: 8.5px; fill: var(--med-muted); text-anchor: middle; }
svg .ring { fill: color-mix(in srgb, var(--med-text) 5%, transparent); stroke: var(--med-blue); stroke-width: 2; }
svg .tk { stroke: var(--med-muted); stroke-width: 1; opacity: .7; }
svg .cn { font-size: 10px; font-weight: 700; fill: var(--med-muted); text-anchor: middle; }
svg .cn.n { fill: var(--med-blue); }
svg .dir { font-size: 11px; font-weight: 700; fill: var(--med-muted); text-anchor: middle; letter-spacing: .5px; }
svg .uvt { font-size: 10px; font-weight: 700; text-anchor: middle; }
svg .arw { fill: #f7c948; stroke: color-mix(in srgb, #f7c948 50%, #000); stroke-width: .6; }
.temps { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 8px 12px 0; }
.tp { display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; min-width: 0; }
.tp > ha-icon { --mdc-icon-size: 20px; color: var(--med-blue); flex: none; }
.tp-c { flex: 1; min-width: 0; }
.tp-c > div { display: flex; align-items: baseline; gap: 8px; }
.tp-n { display: block; font-size: .74rem; color: var(--med-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp b { font-size: 1.05rem; }
.tp-tr { --mdc-icon-size: 15px; align-self: center; }
.tp-tr.up { color: var(--med-up); } .tp-tr.down { color: var(--med-blue); }
.tp-h { display: inline-flex; align-items: center; font-size: .74rem; color: var(--med-muted); }
.tp-h ha-icon { --mdc-icon-size: 14px; color: var(--med-blue); }
svg.drop { width: 34px; flex: none; margin: 0; }
svg .water { fill: var(--med-blue); opacity: .85; }
svg .dropl { fill: none; stroke: var(--med-blue); stroke-width: 2; }
.uv-b { display: flex; align-items: center; gap: 3px; font-size: 1.5rem; font-weight: 700; flex: none; }
.uv-b ha-icon { --mdc-icon-size: 26px; }
.uv-r { flex: 1; min-width: 0; }
.uv-s { position: relative; height: 7px; margin-top: 8px; border-radius: 4px;
  background: linear-gradient(90deg, #5fcf8a 0 25%, #f7c948 25% 50%, #ff8c33 50% 66%, #ee4a4a 66% 91%, #b38cf0 91%); }
.uv-s span { position: absolute; top: -4px; width: 4px; height: 15px; margin-left: -2px; border-radius: 2px; background: var(--med-text); box-shadow: 0 0 0 2px var(--med-bg); }
.tabs.wt { padding-top: 10px; }
.windy.fc { aspect-ratio: auto; height: 188px; }
.windy { display: block; width: calc(100% - 24px); margin: 10px 12px 0; aspect-ratio: 4 / 3; border: 1px solid var(--med-line); border-radius: 12px; }
/* Soleil et lune */
.astro { display: grid; grid-template-columns: minmax(110px, 160px) minmax(0, 1fr); gap: 10px; margin: 0 12px; align-items: center; }
@container (max-width: 400px) { .astro { grid-template-columns: 1fr; } .astro .gauge svg { max-width: 160px; } }
.a-r { min-width: 0; }
svg.curve { width: 100%; display: block; }
svg .day { fill: color-mix(in srgb, #f7c948 22%, transparent); }
svg .hz { stroke: var(--med-line); stroke-width: 1; stroke-dasharray: 3 3; }
svg .path { fill: none; stroke: #f7c948; stroke-width: 2; opacity: .9; }
svg .sun { fill: #f7c948; stroke: color-mix(in srgb, #f7c948 40%, #fff); stroke-width: 1.5; filter: drop-shadow(0 0 4px #f7c948); }
svg .moon { fill: #d9e2f2; stroke: #55627a; stroke-width: 1; }
svg .m-sh { fill: #05080f; opacity: .82; }
svg .under { opacity: .45; filter: none; }
.tms { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin-top: 6px; flex: 1; min-width: 0; }
.tm { text-align: center; min-width: 0; }
.tm span { display: block; font-size: .64rem; color: var(--med-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm b { font-size: .86rem; }
.band { margin: 6px 12px 0; padding: 4px 6px 8px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.tml { margin-top: 6px; font-size: .74rem; color: var(--med-muted); text-align: center; }
.tml b { color: var(--med-text); }
.mrow { display: flex; align-items: center; gap: 12px; margin: 0 12px; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.mbtn { width: 48px; height: 48px; flex: none; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; }
.mbtn svg, .k-m { width: 100%; height: 100%; display: block; }
.k-m { width: 24px; height: 24px; margin: 0 auto; }
.pol { display: flex; align-items: center; gap: 10px; margin: 0 12px; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; flex-wrap: wrap; }
.pol > ha-icon { --mdc-icon-size: 30px; }
.pol-t { display: flex; flex-direction: column; font-size: .8rem; }
.pol-t span { color: var(--med-muted); }
.pol-r { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: .76rem; color: var(--med-muted); min-width: 160px; flex: 1; max-width: 260px; }
.rbar { flex: 1; height: 9px; border-radius: 5px; background: var(--med-line); overflow: hidden; }
.rbar i { display: block; height: 100%; border-radius: 5px; }
.plants { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; margin: 8px 12px 0; }
.pl-t { text-align: center; padding: 8px 4px; border-radius: 12px; cursor: pointer; background: color-mix(in srgb, var(--pc) 10%, var(--med-surface));
  border: 1px solid color-mix(in srgb, var(--pc) 55%, transparent); min-width: 0; }
.pl-t ha-icon { --mdc-icon-size: 24px; color: var(--pc); }
.pl-n { font-size: .78rem; font-weight: 600; overflow-wrap: anywhere; }
.pl-v { font-size: .7rem; font-weight: 700; color: var(--pc); }
ha-card.light .pl-v, ha-card.light .pol-t b { filter: brightness(.8); }
dialog.dlg { padding: 0; border: 1px solid var(--med-line); border-radius: 18px; background: var(--med-bg); color: var(--med-text); max-width: min(560px, calc(100vw - 24px)); width: 100%; }
dialog.dlg::backdrop { background: rgba(5, 10, 20, .6); }
.d-in { padding: 12px 14px 14px; outline: none; }
.d-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; }
.d-h button { border: 0; background: none; color: var(--med-muted); cursor: pointer; padding: 4px; border-radius: 8px; }
svg.phases { width: 100%; display: block; background: radial-gradient(circle at 50% 50%, #18233a, #0b1220 70%); border-radius: 14px; margin-top: 8px; }
svg .orb { fill: none; stroke: #55627a; stroke-dasharray: 2 4; }
svg .earth { fill: #2a6fb8; stroke: #9fd0ff; stroke-width: 1; }
svg .land { fill: #5fcf8a; opacity: .85; }
svg .cur { fill: none; stroke: #f7c948; stroke-width: 2.5; }
svg .pl { font-size: 10px; font-weight: 700; fill: #c9d4e5; text-anchor: middle; text-transform: uppercase; letter-spacing: .3px; }
svg .pl.on { fill: #f7c948; }
.d-f { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; font-size: .8rem; color: var(--med-muted); }
.d-f b { color: var(--med-text); }
.pl-c { font-size: .64rem; color: var(--med-muted); }
.wbar { display: flex; gap: 3px; flex: 1; height: 9px; }
.wbar i { flex: 1; border-radius: 3px; }
.wl { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 12px 0; }
.w-i { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: .74rem; color: var(--med-muted); cursor: pointer;
  background: color-mix(in srgb, var(--pc) 10%, var(--med-surface)); border: 1px solid color-mix(in srgb, var(--pc) 50%, transparent); }
.w-i b { color: var(--pc); }
.w-b { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px 3px 7px; border-radius: 999px; font-size: .74rem;
  background: color-mix(in srgb, #ee4a4a 10%, var(--med-surface)); border: 1px solid color-mix(in srgb, #ee4a4a 45%, transparent); }
.w-b ha-icon { --mdc-icon-size: 14px; color: #ee4a4a; }
.mt { display: flex; align-items: center; gap: 10px; margin: 0 12px; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.mt > ha-icon { --mdc-icon-size: 30px; flex: none; }
.mt-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mt-t > span { font-size: .72rem; color: var(--med-muted); }
.mt-t b { font-size: .9rem; }
.mt-t small { font-size: .68rem; color: var(--med-muted); }
.mt-t small b { font-size: .72rem; color: var(--med-text); }
.mt-w { color: #f7c948; font-weight: 600; }
.mt-m { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; width: 74px; text-align: center; }
.mt-m svg { width: 30px; height: 30px; }
.mt-m span { font-size: .62rem; line-height: 1.15; }
.mt-l { font-size: .68rem; color: var(--med-muted); align-self: center; }
.mt-c { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: .72rem; color: var(--med-text);
  background: var(--med-surface); border: 1px solid var(--med-line); }
.mt-c b { color: var(--med-muted); font-weight: 600; }
ha-card.light .w-i b { filter: brightness(.75); }
.bts .bt { cursor: pointer; }
.bt-s { font-size: .64rem; color: var(--med-muted); margin-top: 1px; }
.bf .bc { cursor: pointer; font: inherit; font-size: .72rem; }
.bf .bc.on { border-color: color-mix(in srgb, var(--med-blue) 70%, var(--med-line)); background: color-mix(in srgb, var(--med-blue) 18%, var(--med-surface)); }
.bm { position: relative; margin: 10px 12px 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--med-line); background: var(--med-surface); }
.bm-map { position: absolute; inset: 0; background: #0f1724; }
.bm-map.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(.85) contrast(.85) saturate(.6); }
.bm-full { position: absolute; top: 10px; right: 10px; z-index: 1000; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--med-line);
  background: var(--med-bg); color: var(--med-text); cursor: pointer; display: grid; place-items: center; }
.bm-full ha-icon { --mdc-icon-size: 20px; }
.bm:fullscreen { margin: 0; border-radius: 0; height: 100% !important; }
.bm-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 6px 14px 0; font-size: .66rem; color: var(--med-muted); }
.bm-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; }
.bm .leaflet-popup-content-wrapper, .bm .leaflet-popup-tip { background: var(--med-bg); color: var(--med-text); box-shadow: 0 4px 18px rgba(0,0,0,.45); }
.bm .leaflet-popup-content { margin: 10px 14px; font: 12px/1.45 inherit; }
.bm .leaflet-container a.leaflet-popup-close-button { color: var(--med-muted); }
.bp { display: flex; flex-direction: column; gap: 2px; }
.bp > b { font-size: 13px; margin-bottom: 3px; }
.bp span { color: var(--med-muted); }
.bp span b { color: var(--med-text); }
.bm .leaflet-control-attribution { background: color-mix(in srgb, var(--med-bg) 80%, transparent); color: var(--med-muted); font-size: 9px; }
.bm .leaflet-control-attribution a { color: var(--med-blue); }
.bm .leaflet-bar a { background: var(--med-bg); color: var(--med-text); border-color: var(--med-line); }
/* option « halo » (avec les deux présentations) : bordures et reflets colorés ;
   couleur : bleu MyElectricalData, ou couleur principale du thème avec theme: ha */
ha-card.glow { --nx: var(--med-blue); }
ha-card.th-ha.glow { --nx: var(--primary-color, var(--med-blue)); }
ha-card.glow { --nb: color-mix(in srgb, var(--nx) 55%, transparent); border: 1.5px solid var(--nb);
  background: radial-gradient(120% 70% at 15% 0%, color-mix(in srgb, var(--nx) 20%, var(--med-bg)) 0%, transparent 60%), var(--med-bg);
  box-shadow: 0 0 22px color-mix(in srgb, var(--nx) 28%, transparent), inset 0 0 28px color-mix(in srgb, var(--nx) 8%, transparent); }
ha-card.glow :is(.stat, .fc-d, .sky-t, .rh, .d-i, .pill, .tab) { border-color: color-mix(in srgb, var(--nx) 40%, transparent);
  background: color-mix(in srgb, var(--nx) 7%, var(--med-surface)); box-shadow: inset 0 0 14px color-mix(in srgb, var(--nx) 10%, transparent); }
ha-card.glow .vig.ok { box-shadow: 0 0 12px color-mix(in srgb, var(--med-down) 25%, transparent); }
ha-card.glow .sec { color: color-mix(in srgb, var(--nx) 35%, var(--med-text)); }
ha-card.glow .f-lo { color: var(--med-blue); }
/* présentation « WarC0zes » : en-tête sur une ligne, textes plus grands, couleurs du thème choisi */
.nh { padding: 16px 16px 6px; flex-wrap: nowrap; }
.nh-m { display: flex; align-items: center; gap: 12px; cursor: pointer; min-width: 0; flex: 1; }
.nh-n { min-width: 64px; flex: 0 1 auto; }
.nh .title, .nh .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nh .pill { flex: none; }
@container (max-width: 470px) { .nh { flex-wrap: wrap; } .nh .n-t { font-size: 2.8rem; } .nh .n-ic { --mdc-icon-size: 50px; } }
.nh .n-ic { --mdc-icon-size: 54px; }
.nh .title { font-size: 1.3rem; }
.nh .sub { font-size: .9rem; }
.nh .n-t { font-size: 3.1rem; flex: none; }
.nh-sep { align-self: stretch; width: 2px; margin: 6px 0; border-radius: 1px; background: var(--med-line); }
ha-card.glow .nh-sep { background: color-mix(in srgb, var(--nx) 45%, transparent); }
.nh .n-hl { margin-left: 0; text-align: left; font-size: 1.1rem; white-space: nowrap; flex: none; }
.nh .pill { padding: 7px 12px; font-size: .88rem; white-space: nowrap; }
ha-card.neon .s-h { font-size: .88rem; }
ha-card.neon .s-h ha-icon { --mdc-icon-size: 19px; }
ha-card.neon .s-v { font-size: 1.55rem; }
ha-card.neon .s-v small { font-size: .9rem; }
ha-card.neon .s-n { font-size: .8rem; }
ha-card.neon .d-i { font-size: .9rem; padding: 6px 12px 6px 9px; }
ha-card.neon .d-i ha-icon { --mdc-icon-size: 19px; }
ha-card.neon .sec { font-size: 1.05rem; font-weight: 700; }
ha-card.neon .f-n { font-size: .88rem; }
ha-card.neon .f-hi, ha-card.neon .fc-d.full .f-hi { font-size: 1.15rem; }
ha-card.neon .f-lo { font-size: .92rem; }
ha-card.neon :is(.f-mm, .f-pp, .f-hu, .fc-d.full .f-w) { font-size: 14px; }
ha-card.neon :is(.f-mm, .f-w, .f-gb) small { font-size: 12px; }
ha-card.neon :is(.f-hu, .f-pp) ha-icon { --mdc-icon-size: 16px; }
ha-card.neon .rh-h { font-size: .86rem; }
ha-card.neon .rh-h b { font-size: .95rem; }
ha-card.neon .k-v { font-size: .95rem; }
ha-card.neon .k-l { font-size: .74rem; }
ha-card.neon .sky-t ha-icon { --mdc-icon-size: 28px; }
svg .bolt circle { fill: #f7c948; stroke: color-mix(in srgb, #f7c948 40%, #000); stroke-width: 1; filter: drop-shadow(0 0 4px #f7c948); }
svg .bolt path { fill: #1a2434; }
</style>`;

/* ----------------------------------------------------------------- éditeur */

const THEME_SELECT = {
  name: "theme",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
        { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
        { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
      ],
    },
  },
};

const TEXT_SIZE = { name: "text_size", selector: { number: { min: 80, max: 160, step: 5, mode: "slider", unit_of_measurement: "%" } } };

const SCHEMA = [
  { name: "entity", selector: { entity: { domain: "weather" } } },
  // villes en onglets : une ligne par ville, avec son nom et sa vigilance (sélecteur « object » de Home Assistant)
  { name: "entities", selector: { object: { multiple: true, label_field: "name", description_field: "entity", fields: {
    entity: { label: "Entité météo", required: true, selector: { entity: { domain: "weather" } } },
    name: { label: "Nom de l'onglet (facultatif)", selector: { text: {} } },
    alert: { label: "Vigilance (facultatif, capteur de vigilance Météo-France ou équivalent)", selector: { entity: { domain: "sensor" } } },
    ec_alerts: { label: "Alertes Environnement Canada (facultatif, détectées)", selector: { entity: { domain: "sensor", integration: "environment_canada", multiple: true } } },
  } } } },
  { name: "title", selector: { text: {} } },
  { name: "alert", selector: { entity: { domain: "sensor", integration: "meteo_france" } } },
  { name: "ec_alerts", selector: { entity: { domain: "sensor", integration: "environment_canada", multiple: true } } },
  { name: "forecasts", selector: { select: { multiple: true, mode: "list", options: [
    { value: "hourly", label: "Par heure" }, { value: "daily", label: "Par jour" }, { value: "twice_daily", label: "Jour et nuit" }] } } },
  { name: "days", selector: { number: { min: 1, max: 14, step: 1, mode: "box" } } },
  { name: "hours", selector: { number: { min: 1, max: 24, step: 1, mode: "box" } } },
  // lignes des prévisions, comme la carte Météo-France de HACF : une section par heure, une par jour
  { type: "expandable", flatten: true, title: "Prévisions par heure : lignes affichées", schema: [{ type: "grid", name: "", schema: [
    { name: "hourly_wind", selector: { boolean: {} } }, { name: "hourly_gust", selector: { boolean: {} } },
    { name: "hourly_precipitation", selector: { boolean: {} } }, { name: "hourly_humidity", selector: { boolean: {} } },
    { name: "hourly_direction", selector: { boolean: {} } }] }] },
  { type: "expandable", flatten: true, title: "Prévisions par jour : lignes affichées", schema: [{ type: "grid", name: "", schema: [
    { name: "daily_wind", selector: { boolean: {} } }, { name: "daily_gust", selector: { boolean: {} } },
    { name: "daily_precipitation", selector: { boolean: {} } }, { name: "daily_humidity", selector: { boolean: {} } },
    { name: "daily_direction", selector: { boolean: {} } }] }] },
  { name: "season", selector: { entity: { domain: "sensor" } } },
  { name: "moon", selector: { entity: { domain: "sensor" } } },
  { name: "zodiac", selector: { entity: { domain: "sensor" } } },
  { name: "show_stats", selector: { boolean: {} } },
  { name: "show_details", selector: { boolean: {} } },
  { name: "show_rain_hour", selector: { boolean: {} } },
  { name: "show_alert", selector: { boolean: {} } },
  { name: "show_forecast", selector: { boolean: {} } },
  { name: "show_sky", selector: { boolean: {} } },
  { name: "layout", selector: { select: { mode: "dropdown", options: [
    { value: "classic", label: "Classique" }, { value: "warc0zes", label: "WarC0zes : en-tête sur une ligne, textes plus grands" }] } } },
  { name: "halo", selector: { boolean: {} } },
  { name: "icons", selector: { select: { mode: "dropdown", options: [
    { value: "animated", label: "Animées (amCharts, comme la carte Météo-France)" }, { value: "static", label: "Statiques (amCharts)" },
    { value: "drawn", label: "Dessinées par la carte, temps actuel animé" }, { value: "drawn_static", label: "Dessinées par la carte, sans animation" },
    { value: "mdi", label: "Icônes Material Design (MDI)" }] } } },
  { name: "icons_path", selector: { text: {} } },
  { name: "forecast_details", selector: { select: { mode: "dropdown", options: [
    { value: "full", label: "Complètes : mm, risque de pluie, humidité, vent, rafales et direction, heure et jour" },
    { value: "compact", label: "Compactes : seulement les valeurs utiles" }] } } },
  { name: "moon_image", selector: { text: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const LABELS = {
  entity: "Entité météo (vide = Météo-France, sinon la première trouvée)",
  entities: "Plusieurs villes en onglets (facultatif, remplace l'entité ci-dessus)",
  title: "Titre (Météo par défaut)",
  alert: "Vigilance Météo-France (vide = détectée)",
  ec_alerts: "Alertes Environnement Canada (vide = détectées quand il n'y a pas de vigilance Météo-France)",
  forecasts: "Prévisions affichées (vide = par jour)",
  days: "Nombre de jours affichés",
  hours: "Nombre d'heures affichées",
  hourly_wind: "Vent", hourly_gust: "Rafales", hourly_precipitation: "Précipitations", hourly_humidity: "Humidité", hourly_direction: "Girouette",
  daily_wind: "Vent", daily_gust: "Rafales", daily_precipitation: "Précipitations", daily_humidity: "Humidité", daily_direction: "Girouette",
  season: "Saison (vide = détectée, sinon calculée d'après la date)",
  moon: "Phase de lune (vide = détectée, sinon calculée)",
  zodiac: "Signe du zodiaque (vide = détecté)",
  show_stats: "Ressenti, vent, humidité et pression",
  show_details: "Détails Météo-France (nuages, pluie, gel, neige, UV)",
  show_rain_hour: "Pluie dans l'heure (Météo-France)",
  show_alert: "Vigilance (Météo-France) ou alertes (Environnement Canada)",
  show_forecast: "Prévisions",
  show_sky: "Soleil (lever, coucher), saison, lune et zodiaque",
  layout: "Présentation",
  halo: "Halo coloré : bordures et reflets (bleu, ou couleur du thème avec le thème Home Assistant)",
  icons: "Icônes météo",
  forecast_details: "Détails des prévisions",
  icons_path: "Dossier des icônes amCharts (vide = jsDelivr ; ex. /local/meteo-icons/ pour un usage hors ligne)",
  moon_image: "Photo de pleine lune pour les phases (facultatif, ex. /local/images/lune.svg)",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};

const CIEL_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "entity", selector: { entity: { domain: "weather" } } },
  { name: "pressure", selector: { entity: { domain: "sensor" } } },
  { name: "wind_speed", selector: { entity: { domain: "sensor" } } },
  { name: "rain", selector: { entity: { domain: "sensor" } } },
  { name: "uv", selector: { entity: { domain: "sensor" } } },
  { name: "compass_image", selector: { text: {} } },
  { name: "show_barometer", selector: { boolean: {} } },
  { name: "show_wind", selector: { boolean: {} } },
  { name: "show_temperatures", selector: { boolean: {} } },
  { name: "show_rain", selector: { boolean: {} } },
  { name: "show_uv", selector: { boolean: {} } },
  { name: "windy", selector: { boolean: {} } },
  { name: "windy_overlay", selector: { select: { mode: "dropdown", options: [
    { value: "wind", label: "Vent" }, { value: "rain", label: "Pluie et orages" }, { value: "temp", label: "Température" },
    { value: "clouds", label: "Nuages" }, { value: "radar", label: "Radar" }, { value: "pressure", label: "Pression" }] } } },
  { name: "windy_zoom", selector: { number: { min: 3, max: 12, step: 1, mode: "box" } } },
  THEME_SELECT,
  TEXT_SIZE,
];
const CIEL_LABELS = {
  title: "Titre (Vent et ciel par défaut)",
  entity: "Entité météo (vide = Météo-France, sinon la première trouvée)",
  pressure: "Pression (vide = capteur Météo-France ou entité météo)",
  wind_speed: "Vitesse du vent (vide = détectée)",
  rain: "Pluie du jour en mm (vide = capteur Météo-France)",
  uv: "Indice UV (vide = détecté)",
  compass_image: "Image au centre des boussoles (ex. /local/images/maison.png)",
  show_barometer: "Baromètre",
  show_wind: "Boussole du vent",
  show_temperatures: "Températures (liste « temperatures » en YAML)",
  show_rain: "Pluie du jour",
  show_uv: "Indice UV",
  windy: "Carte Windy (coordonnées de Home Assistant)",
  windy_overlay: "Couche de la carte Windy",
  windy_zoom: "Zoom de la carte Windy",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const ASTRO_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "moon", selector: { entity: { domain: "sensor" } } },
  { name: "season", selector: { entity: { domain: "sensor" } } },
  { name: "zodiac", selector: { entity: { domain: "sensor" } } },
  { name: "pollens", selector: { entity: { domain: "sensor" } } },
  { name: "compass_image", selector: { text: {} } },
  { name: "show_sun", selector: { boolean: {} } },
  { name: "show_moon", selector: { boolean: {} } },
  { name: "show_cycles", selector: { boolean: {} } },
  { name: "show_meteors", selector: { boolean: {} } },
  { name: "show_pollens", selector: { boolean: {} } },
  { name: "show_all_pollens", selector: { boolean: {} } },
  { name: "moon_image", selector: { text: {} } },
  { name: "earth_image", selector: { text: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const ASTRO_LABELS = {
  title: "Titre (Soleil et lune par défaut)",
  moon: "Phase de lune (vide = détectée, sinon calculée)",
  season: "Saison (vide = détectée, sinon calculée)",
  zodiac: "Signe du zodiaque (vide = détecté)",
  pollens: "Pollens : capteur du département (vide = détecté, intégration Pollens)",
  compass_image: "Image au centre de la boussole (ex. /local/images/maison.png)",
  show_sun: "Soleil (boussole, course du jour, heures)",
  show_moon: "Lune (lever, coucher, éclairement)",
  show_cycles: "Cycles (lune, soleil, saison, zodiaque)",
  show_meteors: "Étoiles filantes (prochaine pluie, pic, lune)",
  show_pollens: "Pollens",
  show_all_pollens: "Afficher aussi les pollens à « nul »",
  moon_image: "Photo de pleine lune pour les phases (facultatif, ex. /local/images/lune.svg)",
  earth_image: "Photo de la Terre au centre de la fenêtre des phases (facultatif, ex. /local/images/terre.svg)",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};

const AIR_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "air", selector: { entity: { domain: "sensor" } } },
  { name: "pollen", selector: { entity: { domain: "sensor" } } },
  { name: "water", selector: { entity: { domain: "sensor" } } },
  { name: "show_air", selector: { boolean: {} } },
  { name: "show_pollens", selector: { boolean: {} } },
  { name: "show_all_pollens", selector: { boolean: {} } },
  { name: "show_water", selector: { boolean: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const AIR_LABELS = {
  title: "Titre (Air, pollens et eau par défaut)",
  air: "Qualité de l'air globale (vide = Atmo France détecté)",
  pollen: "Qualité globale des pollens (vide = détectée)",
  water: "Vigilance sécheresse (vide = VigiEau détecté)",
  show_air: "Qualité de l'air et polluants",
  show_pollens: "Pollens",
  show_all_pollens: "Afficher aussi les pollens à « très faible »",
  show_water: "Vigilance sécheresse",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const ECLAIRS_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "counter", selector: { entity: { domain: "sensor" } } },
  { name: "distance", selector: { entity: { domain: "sensor" } } },
  { name: "azimuth", selector: { entity: { domain: "sensor" } } },
  { name: "month_counter", selector: { entity: { domain: "sensor" } } },
  { name: "counter_max", selector: { number: { min: 10, max: 10000, step: 10, mode: "box" } } },
  { name: "compass_image", selector: { text: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const BOLIDES_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "entity", selector: { entity: { domain: "sensor" } } },
  { name: "period", selector: { select: { mode: "dropdown", options: BOLIDE_PERIODS.map(([value, label]) => ({ value, label })) } } },
  { name: "min_energy", selector: { select: { mode: "dropdown", options: BOLIDE_ENERGY.map(([value, label]) => ({ value: String(value), label })) } } },
  { name: "show_home", selector: { boolean: {} } },
  { name: "map_height", selector: { number: { min: 200, max: 800, step: 20, mode: "slider", unit_of_measurement: "px" } } },
  THEME_SELECT,
  TEXT_SIZE,
];
const BOLIDES_LABELS = {
  title: "Titre (Bolides par défaut)",
  entity: "Capteur de l'API Fireball (vide = détecté)",
  period: "Période affichée au départ",
  min_energy: "Énergie minimale affichée au départ",
  show_home: "Afficher votre maison sur la carte",
  map_height: "Hauteur de la carte",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const ECLAIRS_LABELS = {
  title: "Titre (Éclairs par défaut)",
  counter: "Compteur d'éclairs (vide = Blitzortung détecté)",
  distance: "Distance du dernier éclair (vide = détectée)",
  azimuth: "Direction du dernier éclair (vide = détectée)",
  month_counter: "Éclairs du mois (facultatif, ex. compteur utility_meter)",
  counter_max: "Maximum de la jauge",
  compass_image: "Image au centre de la boussole",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};

/** Éditeur visuel commun : formulaire ha-form ; les champs vidés sont retirés de la configuration. */
const makeEditor = (schema, labels, defaults) => class extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._draw();
  }

  set hass(hass) {
    this._hass = hass;
    this._draw();
  }

  _draw() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => labels[s.name] || s.title || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const v = { ...ev.detail.value };
        for (const [k, x] of Object.entries(v)) {
          if (x === "" || x === undefined || (Array.isArray(x) && !x.length) || (k !== "type" && JSON.stringify(x) === JSON.stringify(defaults[k]))) delete v[k];
        }
        this._config = v;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = typeof schema === "function" ? schema(this._hass, this._config) : schema;
    const data = { ...defaults, ...this._config };
    if (Array.isArray(data.entities)) data.entities = data.entities.map(cityOf);
    this._form.data = data;
  }
};
/** Vigilance d'une ville : seuls les capteurs qui portent un niveau (vert, jaune, orange, rouge) sont proposés,
 *  plus ceux déjà choisis. Sans aucun capteur de ce type, tous les capteurs restent proposés. */
let alertKey = "", alertSchema = SCHEMA;
const meteoSchema = (hass, config) => {
  const chosen = (Array.isArray(config.entities) ? config.entities : []).map((x) => cityOf(x).alert).filter(Boolean);
  const ids = [...new Set([...Object.keys(hass.states).filter((id) => id.startsWith("sensor.") && isAlert(hass.states[id])), ...chosen])].sort();
  const key = ids.join(",");
  if (key === alertKey) return alertSchema;
  alertKey = key;
  alertSchema = SCHEMA.map((f) => {
    if (f.name !== "entities" || !ids.length) return f;
    const fields = f.selector.object.fields;
    return { ...f, selector: { object: { ...f.selector.object, fields: { ...fields,
      alert: { ...fields.alert, selector: { entity: { domain: "sensor", include_entities: ids } } } } } } };
  });
  return alertSchema;
};
const MeteoCardEditor = makeEditor(meteoSchema, LABELS, DEFAULTS);

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("meteo-card", MeteoCard);
  define("meteo-card-editor", MeteoCardEditor);
  define("meteo-ciel-card", MeteoCielCard);
  define("meteo-ciel-card-editor", makeEditor(CIEL_SCHEMA, CIEL_LABELS, CIEL_DEFAULTS));
  define("meteo-astro-card", MeteoAstroCard);
  define("meteo-astro-card-editor", makeEditor(ASTRO_SCHEMA, ASTRO_LABELS, ASTRO_DEFAULTS));
  define("meteo-air-card", MeteoAirCard);
  define("meteo-air-card-editor", makeEditor(AIR_SCHEMA, AIR_LABELS, AIR_DEFAULTS));
  define("meteo-eclairs-card", MeteoEclairsCard);
  define("meteo-eclairs-card-editor", makeEditor(ECLAIRS_SCHEMA, ECLAIRS_LABELS, ECLAIRS_DEFAULTS));
  define("meteo-bolides-card", MeteoBolidesCard);
  define("meteo-bolides-card-editor", makeEditor(BOLIDES_SCHEMA, BOLIDES_LABELS, BOLIDES_DEFAULTS));
  window.customCards = window.customCards || [];
  for (const card of [
    { type: "meteo-card", name: "Carte Météo", description: "Météo du jour, une ou plusieurs villes : conditions, ressenti, vent, détails et vigilance Météo-France, prévisions par heure et par jour, saison, lune." },
    { type: "meteo-ciel-card", name: "Carte Météo : vent et ciel", description: "Baromètre, boussole du vent, températures, pluie du jour, indice UV et carte Windy." },
    { type: "meteo-air-card", name: "Carte Météo : air, pollens et eau", description: "Qualité de l'air et polluants (Atmo France), pollens, vigilance sécheresse (VigiEau)." },
    { type: "meteo-eclairs-card", name: "Carte Météo : éclairs", description: "Direction et distance du dernier éclair, compteur d'éclairs (Blitzortung)." },
    { type: "meteo-bolides-card", name: "Carte Météo : bolides", description: "Carte du monde interactive des bolides (grosses météorites) détectés par la NASA, avec le plus récent, le plus proche et le plus puissant." },
    { type: "meteo-astro-card", name: "Carte Météo : soleil et lune", description: "Course du soleil, lever et coucher du soleil et de la lune, phases de la lune, cycles et pollens." },
  ]) if (!window.customCards.some((c) => c.type === card.type)) window.customCards.push({ ...card, preview: true });
  console.info(`%c METEO-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}
})();
