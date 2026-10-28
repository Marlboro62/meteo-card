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
const CARD_VERSION = "3.8.1-beta.1";

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

  /**
   * Carte locale interactive (feux, séismes) dans la zone « keep » : Leaflet, fond vectoriel OpenFreeMap clair ou sombre
   * (villes, routes, noms ; gratuit et sans clé), sinon images OpenStreetMap, ou tiles_url. Renvoie Leaflet (L), ou rien
   * si la carte n'a pas pu être créée (message affiché à sa place). this._layer reçoit les marqueurs.
   */
  async _localMap(home, legend, source, height) {
    const c = this._config;
    if (!this._keep) return null;
    if (!this._keep.querySelector(".bm")) {
      const base = c.leaflet_path || LEAFLET;
      this._keep.innerHTML = `<link rel="stylesheet" href="${esc(base)}leaflet.css"><link rel="stylesheet" href="${MAPLIBRE}maplibre-gl.css"><div class="bm" style="height:${height}px">
        <div class="bm-map"></div><button class="bm-full" data-act="full" title="Plein écran"><ha-icon icon="mdi:fullscreen"></ha-icon></button></div>
        <div class="bm-leg">${legend}</div>`;
      this._map = null;
      this._fitted = null;
    }
    let L;
    try { L = await loadLeaflet(c.leaflet_path || LEAFLET); } catch (e) {
      const box = this._keep.querySelector(".bm-map");
      if (box) box.innerHTML = `<div class="empty"><b>Carte indisponible</b><span>La bibliothèque Leaflet n'a pas pu être chargée (${esc(e.message)}).</span></div>`;
      return null;
    }
    const el = this._keep.querySelector(".bm-map");
    if (!el) return null;
    try {
      const light = /light/.test(themeClass(c.theme, this._hass)) || (c.theme === "ha" && this._hass.themes?.darkMode === false);
      if (!this._map || this._mapEl !== el) {
        this._mapEl = el;
        this._map = L.map(el, { minZoom: 2, zoomSnap: 0.5, worldCopyJump: true }).setView(home, 8);
        // carte créée avant d'avoir sa taille (éditeur, onglet caché) : le cadrage est refait dès qu'elle en a une
        new ResizeObserver(() => {
          if (!this._map) return;
          this._map.invalidateSize();
          if (el.clientWidth && el.clientHeight && this._view && !this._viewed) { this._viewed = true; this._view(); }
        }).observe(el);
        // plein écran (entrée et sortie) : la carte reprend sa taille puis son cadrage
        if (!this._fsHook) {
          this._fsHook = () => setTimeout(() => { if (!this._map) return; this._map.invalidateSize(); this._view?.(); }, 250);
          document.addEventListener("fullscreenchange", this._fsHook);
        }
        this._map.attributionControl.addAttribution(source);
        this._layer = L.layerGroup().addTo(this._map);
        this._tiles = null;
        this._tilesKey = null;
      }
      const vector = !c.tiles_url && (await loadVector());
      const tkey = vector ? `ofm|${light}` : c.tiles_url || "raster";
      el.classList.toggle("dark", !vector && !light && !c.tiles_url);
      if (this._tilesKey !== tkey) {
        this._tiles?.remove();
        const osm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
        this._tiles = vector
          ? L.maplibreGL({ style: `${OFM}${light ? "liberty" : "dark"}`, attribution: `<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> ${osm}` })
          : L.tileLayer(c.tiles_url || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: osm });
        this._tiles.addTo(this._map);
        this._tilesKey = tkey;
      }
      return L;
    } catch (e) {
      console.error("Carte Météo (carte) :", e);
      this._map = null;
      el.innerHTML = `<div class="empty"><b>Erreur de la carte</b><span>${esc(e.message)}</span></div>`;
      return null;
    }
  }

  /** Cadrage de la carte locale : une seule fois par liste (le zoom choisi par l'utilisateur est gardé ensuite). */
  _localFit(key, pts, home, zoom = 9) {
    if (this._fitted === key) return;
    this._fitted = key;
    this._view = () => (pts.length > 1 ? this._map.fitBounds(pts, { padding: [24, 24], maxZoom: 11 }) : this._map.setView(home, zoom));
    this._viewed = !!(this._mapEl?.clientWidth && this._mapEl?.clientHeight);
    if (this._viewed) this._view();
  }

  /** Clic sur un élément de liste : la carte va au marqueur et ouvre sa bulle. */
  _fly(i) {
    const m = this._markers?.[i];
    if (!m || !this._map) return;
    this._keep?.querySelector(".bm")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    this._map.flyTo(m.getLatLng(), Math.max(this._map.getZoom(), this._flyZoom || 10), { duration: 0.8 });
    setTimeout(() => m.openPopup(), 850);
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
  show_space: true, // activité solaire et aurores
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

/* ------------------------------------------------ activité solaire (NOAA SWPC) */

/** Données ouvertes du centre de météo spatiale de la NOAA, lues depuis le navigateur si aucun capteur ne les donne. */
const SWPC = "https://services.swpc.noaa.gov/";
/** Indice Kp (0 à 9) : niveau de l'échelle NOAA des tempêtes géomagnétiques. */
const KP_SCALE = [[4, "Calme", "#5fcf8a"], [5, "Agité", "#f7c948"], [6, "Tempête mineure (G1)", "#ff8c33"], [7, "Tempête modérée (G2)", "#ff8c33"],
  [8, "Forte tempête (G3)", "#ee4a4a"], [9, "Tempête sévère (G4)", "#ee4a4a"], [Infinity, "Tempête extrême (G5)", "#b38cf0"]];
const kpInfo = (kp) => KP_SCALE.find(([to]) => kp < to);
/** Kp à partir duquel une aurore peut être vue à l'horizon nord, selon la latitude (environ Kp 7 vers 50° N). */
const kpNeeded = (lat) => Math.max(1, Math.min(9, Math.round((67 - Math.abs(lat)) / 2.3)));
/** Produits NOAA : tableau avec une ligne d'en-tête, ou liste d'objets. */
const swpcRows = (j) => {
  if (!Array.isArray(j)) return [];
  if (Array.isArray(j[0])) { const h = j[0].map(String); return j.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }
  return j;
};
const kpOf = (r) => num(r?.kp_index ?? r?.Kp ?? r?.kp ?? r?.estimated_kp);
const swpcTime = (t) => { const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? t : `${String(t).replace(" ", "T")}Z`); return isNaN(d) ? null : d; };

/** Lecture partagée par toutes les cartes de la page, gardée 15 minutes (une seule requête par source). */
const netCache = {};
const fetchJson = (url, ttl = 9e5) => {
  const c = netCache[url];
  if (c && Date.now() - c.at < ttl) return c.p;
  const p = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
  netCache[url] = { at: Date.now(), p };
  p.catch(() => { netCache[url].at = Date.now() - ttl + 12e4; }); // nouvel essai dans 2 minutes
  return p;
};
const spaceFetch = () => Promise.all([
  fetchJson(`${SWPC}products/noaa-planetary-k-index.json`).then(swpcRows).catch(() => null),
  fetchJson(`${SWPC}products/noaa-planetary-k-index-forecast.json`).then(swpcRows).catch(() => null),
  fetchJson(`${SWPC}json/solar_probabilities.json`).catch(() => null),
]).then(([kp, fc, prob]) => {
  const now = Date.now();
  const last = (kp || []).filter((r) => kpOf(r) !== null).pop();
  const future = (fc || []).map((r) => ({ t: swpcTime(r.time_tag), kp: kpOf(r), kind: String(r.observed || "") }))
    .filter((r) => r.t && r.kp !== null && r.t.getTime() > now && r.t.getTime() < now + 3 * DAYMS);
  const peak = future.reduce((a, b) => (!a || b.kp > a.kp ? b : a), null);
  const p0 = Array.isArray(prob) ? prob[0] : null;
  return {
    kp: last ? kpOf(last) : null, kpAt: last ? swpcTime(last.time_tag) : null, peak,
    m: num(p0?.m_class_1_day), x: num(p0?.x_class_1_day), ok: !!(last || peak || p0),
  };
});

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
    // activité solaire : lue auprès de la NOAA toutes les 15 minutes, en partage avec les autres cartes
    if (c.show_space !== false && (!this._spaceAt || Date.now() - this._spaceAt > 9e5) && !this._spaceBusy && typeof fetch === "function") {
      this._spaceBusy = true;
      spaceFetch().then((d) => { this._spaceData = d; }).catch(() => { this._spaceData = { ok: false }; })
        .finally(() => { this._spaceAt = Date.now(); this._spaceBusy = false; this._sig = null; this._render(); });
    }
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${Math.floor(Date.now() / 6e4)}|${sun?.state}|${this._spaceAt}|` +
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
    if (c.show_space !== false) parts.push(this._spaceHtml(xy));
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

  /** Activité solaire : indice Kp (capteur NOAA Space Weather, sinon NOAA directement), prévision sur 3 jours,
   *  probabilité d'éruption, flux et taches solaires, et chances de voir une aurore depuis chez vous. */
  _spaceHtml(xy) {
    const c = this._config, hass = this._hass, reg = hass.entities || {}, ids = Object.keys(hass.states);
    const noaa = ids.filter((id) => reg[id]?.platform === "noaa_space_weather");
    const pick = (re) => noaa.find((id) => re.test(id));
    const e = { kp: c.kp_entity || pick(/k_index|_kpi/), m: pick(/m_class/), x: pick(/x_class/), sfi: pick(/solar_flux|_sfi/), ssn: pick(/sunspot|_ssn/) };
    // intégration Aurora de Home Assistant : probabilité d'aurore à votre position (modèle OVATION de la NOAA)
    const aurora = c.aurora_entity || ids.find((id) => id.startsWith("sensor.") && reg[id]?.platform === "aurora");
    const d = this._spaceData || {};
    const kp = this._num(e.kp) ?? d.kp ?? null;
    if (kp === null && !d.peak) {
      return this._spaceAt && !e.kp ? "" : `<div class="sec">Activité solaire</div><div class="fc-empty">Chargement des données de la NOAA…</div>`;
    }
    const [, label, color] = kpInfo(kp ?? 0);
    const cells = Array.from({ length: 9 }, (_, i) => `<i style="${kp !== null && kp > i ? `background:${kpInfo(i)[2]}` : ""}"></i>`).join("");
    const dayFmt = (t) => `${t.toLocaleDateString("fr-FR", { weekday: "long" })} ${hm(t)}`;
    const peak = d.peak;
    const fcTxt = peak ? `Prévision 3 jours : <b style="color:${kpInfo(peak.kp)[2]}">Kp ${fmt(peak.kp, peak.kp % 1 ? 1 : 0)}</b> au plus fort, ${dayFmt(peak.t)}${peak.kp >= 5 ? ` · ${kpInfo(peak.kp)[1].toLowerCase()}` : ""}` : "";
    let aur = "";
    const av = this._num(aurora);
    if (av !== null) aur = `<span${aurora ? ` data-entity="${esc(aurora)}"` : ""}>Aurore chez vous : <b style="color:${av >= 50 ? "#b38cf0" : av >= 10 ? "#ff8c33" : "var(--med-text)"}">${fmt(av)} %</b></span>`;
    else if (xy) {
      const need = kpNeeded(xy[0]), mx = Math.max(kp ?? 0, peak?.kp ?? 0);
      const [txt, col] = mx >= need ? ["Aurore possible chez vous", "#b38cf0"] : mx >= need - 1 ? ["Aurore peu probable, à surveiller", "#ff8c33"] : ["Pas d'aurore visible chez vous", "var(--med-text)"];
      aur = `<span>Aurore : <b style="color:${col}">${txt}</b> <small>(Kp ${need} nécessaire)</small></span>`;
    }
    const pct = (v) => (v === null || v === undefined ? null : `${fmt(v)} %`);
    const tile = (id, icon, col, value, lab) => (value === null ? "" : `<div class="sky-t"${id ? ` data-entity="${esc(id)}"` : ""}><ha-icon icon="${icon}" style="color:${col}"></ha-icon><div class="k-v">${value}</div><div class="k-l">${lab}</div></div>`);
    const m = this._num(e.m) ?? d.m ?? null, x = this._num(e.x) ?? d.x ?? null, sfi = this._num(e.sfi), ssn = this._num(e.ssn);
    const tiles = [
      tile(e.m, "mdi:sun-wireless-outline", m >= 50 ? "#ff8c33" : "#f7c948", pct(m), "Éruption M"),
      tile(e.x, "mdi:sun-wireless", x >= 10 ? "#ee4a4a" : "#f7c948", pct(x), "Éruption X"),
      tile(e.sfi, "mdi:white-balance-sunny", "#f7c948", sfi === null ? null : fmt(sfi), "Flux solaire"),
      tile(e.ssn, "mdi:circle-slice-8", "#ff8c33", ssn === null ? null : fmt(ssn), "Taches"),
    ].filter(Boolean).join("");
    return `<div class="sec">Activité solaire</div><div class="sw"${e.kp ? ` data-entity="${esc(e.kp)}"` : ""}>
      <div class="sw-k"><b style="color:${color}">Kp ${kp === null ? "—" : fmt(kp, kp % 1 ? 1 : 0)}</b><span>${label}</span></div>
      <div class="sw-bar" role="img" aria-label="Indice Kp ${kp ?? "inconnu"} sur 9">${cells}</div>
      ${fcTxt || aur ? `<div class="sw-t">${fcTxt ? `<span>${fcTxt}</span>` : ""}${aur}</div>` : ""}</div>
      ${tiles ? `<div class="sky">${tiles}</div>` : ""}`;
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

/* ----------------------------------------------------------- carte Séismes */

const SEISMES_DEFAULTS = { title: "Séismes", radius: 1000, min_magnitude: 2, world_magnitude: 6, days: 7, max_items: 6, direct: true, show_map: true, map_height: 300, theme: "v2" };
const USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
const EMSC_API = "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&orderby=time&limit=300";
/** Couleur d'une magnitude : vert sous 3, jaune, orange, rouge, violet à partir de 6. */
const magColor = (m) => (m < 3 ? "#5fcf8a" : m < 4 ? "#f7c948" : m < 5 ? "#ff8c33" : m < 6 ? "#ee4a4a" : "#b38cf0");
const magLabel = (m) => (m < 3 ? "Très faible" : m < 4 ? "Faible" : m < 5 ? "Léger" : m < 6 ? "Modéré" : m < 7 ? "Fort" : "Majeur");
const bearing = (lat1, lon1, lat2, lon2) => {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
};
/** « NORTHERN ITALY » (EMSC) → « Northern Italy ». */
const titleCase = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()) : s);
/** Régions et pays en français (noms anglais des réseaux EMSC et USGS). */
const PLACE_FR = [
  [/^northern italy$/i, "Italie du Nord"], [/^central italy$/i, "Italie centrale"], [/^southern italy$/i, "Italie du Sud"], [/^sicily, italy$/i, "Sicile, Italie"],
  [/^adriatic sea$/i, "Mer Adriatique"], [/^tyrrhenian sea$/i, "Mer Tyrrhénienne"], [/^ionian sea$/i, "Mer Ionienne"], [/^western mediterranean sea$/i, "Méditerranée occidentale"],
  [/^central mediterranean sea$/i, "Méditerranée centrale"], [/^eastern mediterranean sea$/i, "Méditerranée orientale"], [/^pyrenees$/i, "Pyrénées"],
  [/^switzerland$/i, "Suisse"], [/^germany$/i, "Allemagne"], [/^spain$/i, "Espagne"], [/^portugal$/i, "Portugal"], [/^belgium$/i, "Belgique"], [/^netherlands$/i, "Pays-Bas"],
  [/^austria$/i, "Autriche"], [/^slovenia$/i, "Slovénie"], [/^croatia$/i, "Croatie"], [/^greece$/i, "Grèce"], [/^southern greece$/i, "Grèce du Sud"], [/^albania$/i, "Albanie"],
  [/^united kingdom$/i, "Royaume-Uni"], [/^great britain$/i, "Grande-Bretagne"], [/^ireland$/i, "Irlande"], [/^northern algeria$/i, "Algérie du Nord"], [/^morocco$/i, "Maroc"],
  [/^strait of gibraltar$/i, "Détroit de Gibraltar"], [/^bay of biscay$/i, "Golfe de Gascogne"], [/^english channel$/i, "Manche"], [/^north sea$/i, "Mer du Nord"],
  [/^corsica, france$/i, "Corse"], [/^czech republic$/i, "Tchéquie"], [/^poland$/i, "Pologne"], [/^romania$/i, "Roumanie"], [/^bosnia and herzegovina$/i, "Bosnie-Herzégovine"],
  [/^turkey$|^western turkey$|^eastern turkey$|^central turkey$/i, "Turquie"], [/^iceland$/i, "Islande"], [/^norway$/i, "Norvège"],
];
const COUNTRY_FR = { China: "Chine", Japan: "Japon", "Japan region": "Japon", Indonesia: "Indonésie", Philippines: "Philippines", Chile: "Chili", Peru: "Pérou", Mexico: "Mexique",
  Turkey: "Turquie", Türkiye: "Turquie", Greece: "Grèce", Italy: "Italie", Spain: "Espagne", Iran: "Iran", Afghanistan: "Afghanistan", Pakistan: "Pakistan", India: "Inde",
  "New Zealand": "Nouvelle-Zélande", "Papua New Guinea": "Papouasie-Nouvelle-Guinée", Vanuatu: "Vanuatu", Tonga: "Tonga", Fiji: "Fidji", Alaska: "Alaska", California: "Californie",
  Russia: "Russie", Taiwan: "Taïwan", Ecuador: "Équateur", Colombia: "Colombie", Argentina: "Argentine", "Solomon Islands": "Îles Salomon", Algeria: "Algérie", Morocco: "Maroc" };
const DIR_FR = { W: "O", WNW: "ONO", WSW: "OSO", NW: "NO", SW: "SO", NNW: "NNO", SSW: "SSO" };
/** « 191 km ENE of Nagqu, China » → « 191 km ENE de Nagqu, Chine » ; « Northern Italy » → « Italie du Nord ». */
const placeFr = (p) => {
  let s = String(p || "").trim();
  const hit = PLACE_FR.find(([re]) => re.test(s));
  if (hit) return hit[1];
  s = s.replace(/^(\d+(?:\.\d+)?) km ([NSEW]{1,3}) of /, (m, d, dir) => `${d} km ${DIR_FR[dir] || dir} de `);
  s = s.replace(/,\s*([^,]+)$/, (m, c) => `, ${COUNTRY_FR[c.trim()] || c.trim()}`);
  return s.replace(/\bregion\b/i, "région");
};
const agoTxt = (ms) => { const m = Math.round(ms / 6e4); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };

class MeteoSeismesCard extends MeteoBase {
  static get defaults() {
    return SEISMES_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-seismes-card-editor");
  }

  getCardSize() {
    return 6;
  }

  _home() {
    const c = this._config, cfg = this._hass?.config || {};
    const lat = num(c.latitude) ?? num(cfg.latitude), lon = num(c.longitude) ?? num(cfg.longitude);
    return lat === null || lon === null ? null : [lat, lon];
  }

  /** Séismes des intégrations Home Assistant : entités geo_location (USGS, GDACS, IGN, GeoNet…) qui donnent une magnitude. */
  _fromEntities(home) {
    const out = [];
    for (const st of Object.values(this._hass.states)) {
      if (!st.entity_id.startsWith("geo_location.")) continue;
      const a = st.attributes || {};
      if (a.source === "gdacs" && !/earthquake|séisme/i.test(String(a.event_type || ""))) continue;
      const mag = num(a.magnitude) ?? num((/magnitude\s*([\d.]+)/i.exec(String(a.severity || "")) || [])[1]);
      const lat = num(a.latitude), lon = num(a.longitude);
      if (mag === null || lat === null || lon === null) continue;
      const t = new Date(a.time || a.from_date || a.publication_date || st.last_changed);
      out.push({ id: st.entity_id, mag, lat, lon, t, place: a.place || a.region || a.country || a.friendly_name, depth: num((/depth:?\s*([\d.]+)/i.exec(String(a.severity || "")) || [])[1]),
        dist: home ? greatCircle(home[0], home[1], lat, lon) : num(st.state), url: a.source === "usgs_earthquakes_feed" && a.external_id ? `https://earthquake.usgs.gov/earthquakes/eventpage/${a.external_id}` : null });
    }
    return out;
  }

  /** Sans intégration : flux public de l'USGS (monde, magnitude 2,5 et plus) et de l'EMSC (Europe, autour de chez vous). */
  _fetch(home) {
    if (this._busy || (this._data && Date.now() - this._dataAt < 6e5)) return;
    this._busy = true;
    const c = this._config, days = Math.max(1, Number(c.days) || 7);
    const start = new Date(Date.now() - days * DAYMS).toISOString().slice(0, 19);
    const emsc = home ? `${EMSC_API}&lat=${home[0].toFixed(2)}&lon=${home[1].toFixed(2)}&maxradius=${((Number(c.radius) || 1000) / 111.2).toFixed(1)}&minmag=${Number(c.min_magnitude) || 0}&start=${start}` : null;
    Promise.all([
      fetchJson(USGS_FEED, 6e5).then((j) => (j.features || []).map((f) => ({ mag: num(f.properties?.mag), lat: f.geometry?.coordinates?.[1], lon: f.geometry?.coordinates?.[0],
        depth: num(f.geometry?.coordinates?.[2]), t: new Date(f.properties?.time), place: f.properties?.place, url: f.properties?.url, src: "USGS" }))).catch(() => null),
      emsc ? fetchJson(emsc, 6e5).then((j) => (j.features || []).map((f) => ({ mag: num(f.properties?.mag), lat: num(f.properties?.lat), lon: num(f.properties?.lon),
        depth: num(f.properties?.depth), t: new Date(f.properties?.time), place: titleCase(f.properties?.flynn_region),
        url: f.properties?.unid ? `https://www.seismicportal.eu/eventdetails.html?unid=${f.properties.unid}` : null, src: "EMSC" }))).catch(() => null) : Promise.resolve([]),
    ]).then(([usgs, eu]) => {
      // un même séisme vu par les deux réseaux (moins de 2 min et 50 km d'écart) n'est gardé qu'une fois, version EMSC
      const list = [...(eu || [])];
      for (const q of usgs || []) if (!list.some((e) => Math.abs(e.t - q.t) < 12e4 && greatCircle(e.lat, e.lon, q.lat, q.lon) < 50)) list.push(q);
      this._data = list.filter((q) => q.mag !== null && Number.isFinite(q.lat) && Number.isFinite(q.lon) && !isNaN(q.t));
      this._failed = !usgs && !eu;
    }).finally(() => { this._dataAt = Date.now(); this._busy = false; this._sig = null; this._render(); });
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config, home = this._home();
    const ents = this._fromEntities(home);
    if (!ents.length && c.direct !== false) this._fetch(home);
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${Math.floor(Date.now() / 6e4)}|${this._dataAt}|` + ents.map((q) => `${q.id}${q.mag}`).join(",");
    if (sig === this._sig) return;
    this._sig = sig;
    const now = Date.now(), days = Math.max(1, Number(c.days) || 7), radius = Number(c.radius) || 1000;
    const all = (ents.length ? ents : this._data || []).filter((q) => now - q.t <= days * DAYMS)
      .map((q) => ({ ...q, dist: home ? greatCircle(home[0], home[1], q.lat, q.lon) : q.dist ?? null, az: home ? bearing(home[0], home[1], q.lat, q.lon) : null }))
      .sort((a, b) => b.t - a.t);
    const near = all.filter((q) => q.dist !== null && q.dist <= radius && q.mag >= (Number(c.min_magnitude) || 0));
    const world = all.filter((q) => q.mag >= (Number(c.world_magnitude) || 6) && !near.includes(q)).sort((a, b) => b.mag - a.mag);
    const km = (d) => `${fmt(d, d < 10 ? 1 : 0)} km`;
    const sub = !home ? "Coordonnées de Home Assistant introuvables"
      : near.length ? `${fmt(near.length)} séisme${near.length > 1 ? "s" : ""} à moins de ${fmt(radius)} km en ${days} jours` : `Aucun séisme à moins de ${fmt(radius)} km en ${days} jours`;
    let body = this._head(c.icon || "mdi:pulse", "#ff8c33", c.title || "Séismes", sub);
    if (!all.length) {
      const loading = !ents.length && c.direct !== false && !this._dataAt;
      body += loading ? `<div class="empty"><b>Chargement…</b></div>`
        : `<div class="empty"><b>${this._failed ? "Données des séismes inaccessibles" : "Aucun séisme récent"}</b><span>${this._failed
          ? "Le navigateur n'a pas pu lire les flux USGS et EMSC. Ajoutez l'intégration USGS Earthquake Hazards Program ou GDACS."
          : "Aucun séisme connu sur la période."}</span></div>`;
      this._card(body);
      return;
    }
    const last = near[0], close = [...near].sort((a, b) => a.dist - b.dist)[0], big = [...near].sort((a, b) => b.mag - a.mag)[0];
    // boussole : chaque séisme proche à sa direction, plus loin du centre quand il est loin, plus gros quand il est fort
    const dots = near.slice(0, 40).reverse().map((q) => {
      // le centre est gardé pour la magnitude du dernier séisme
      const [x, y] = pt(70, 70, 30 + Math.min(1, q.dist / radius) * 24, q.az);
      return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(2 + Math.max(0, q.mag - 1.5) * 1.6)}" fill="${magColor(q.mag)}" class="qk${q === last ? " last" : ""}"/>`;
    }).join("");
    const rose = `<div class="gauge"${last?.id ? ` data-entity="${esc(last.id)}"` : ""}><svg viewBox="0 0 140 140" role="img" aria-label="Séismes autour de chez vous">
      ${roseSvg(c.compass_image)}${dots}
      ${last ? `<text x="70" y="74" class="big">M ${fmt(last.mag, 1)}</text><text x="70" y="87" class="sm">${agoTxt(now - last.t)}</text>` : `<text x="70" y="78" class="sm">rien à proximité</text>`}</svg>
      <div class="g-l">${last ? `Dernier · <b>${km(last.dist)} ${compass16(last.az)}</b>` : `Rayon de ${fmt(radius)} km`}</div></div>`;
    const tile = (q, icon, label, value) => (q ? `<div class="sky-t"${q.id ? ` data-entity="${esc(q.id)}"` : ""}><ha-icon icon="${icon}" style="color:${magColor(q.mag)}"></ha-icon>
      <div class="k-v">${value}</div><div class="k-l">${label}</div></div>` : "");
    const tiles = `<div class="sky qk-t">${tile(close, "mdi:home-map-marker", "Le plus proche", close ? `${km(close.dist)} · M ${fmt(close.mag, 1)}` : "")}
      ${tile(big, "mdi:chart-bell-curve", "Le plus fort", big ? `M ${fmt(big.mag, 1)} · ${km(big.dist)}` : "")}
      ${tile(world[0], "mdi:earth", "Dans le monde", world[0] ? `M ${fmt(world[0].mag, 1)}` : "")}</div>`;
    const mapOn = c.show_map !== false && !!home;
    const shown = [...near.slice(0, Math.max(1, Number(c.max_items) || 6)), ...world.slice(0, 3)];
    const row = (q) => {
      // avec la carte, un clic centre la carte sur le séisme (la fiche s'ouvre depuis sa bulle) ; sinon il ouvre la fiche
      const fly = mapOn && Number.isFinite(q.lat);
      const attrs = fly ? `data-act="fly" data-i="${shown.indexOf(q)}" role="button" tabindex="0"` : q.url ? `href="${esc(q.url)}" target="_blank" rel="noopener noreferrer"` : "";
      const tag = !fly && q.url ? "a" : "div";
      return `<${tag} class="qk-r" ${attrs}${!fly && !q.url && q.id ? ` data-entity="${esc(q.id)}"` : ""}><span class="qk-m" style="background:${magColor(q.mag)}">${fmt(q.mag, 1)}</span>
        <span class="qk-p"><b>${esc(placeFr(q.place) || "Lieu inconnu")}</b><small>${q.dist !== null ? `${km(q.dist)}${q.az !== null ? ` ${compass16(q.az)}` : ""} · ` : ""}${agoTxt(now - q.t)}${q.depth ? ` · ${fmt(q.depth)} km de profondeur` : ""}</small></span>
        <span class="qk-l">${magLabel(q.mag)}</span></${tag}>`;
    };
    const max = Math.max(1, Number(c.max_items) || 6);
    body += `<div class="duo">${rose}<div class="qk-side">${tiles}</div></div>`
      + (near.length ? `<div class="sec">Autour de chez vous</div><div class="qk-l-w">${near.slice(0, max).map(row).join("")}</div>` : "")
      + (world.length ? `<div class="sec">Dans le monde · magnitude ${fmt(Number(c.world_magnitude) || 6)} et plus</div><div class="qk-l-w">${world.slice(0, 3).map(row).join("")}</div>` : "")
      + `<div class="qk-src">${ents.length ? "Source : intégrations Home Assistant" : "Sources : EMSC et USGS"}</div>`;
    this._card(body);
    if (mapOn) this._mapUpdate(shown, near, home, radius);
    else if (this._keep) { this._keep.innerHTML = ""; this._map = null; }
  }

  _action(act, el) {
    if (act === "fly") this._fly(Number(el.dataset.i));
    else if (act === "full") { const w = this._keep?.querySelector(".bm"); if (document.fullscreenElement) document.exitFullscreen(); else w?.requestFullscreen?.(); }
  }

  /** Carte interactive : séismes proches et forts séismes du monde, à la couleur et à la taille de leur magnitude. */
  async _mapUpdate(shown, near, home, radius) {
    const c = this._config;
    const legend = [[2, "moins de 3"], [3.5, "3 à 4"], [4.5, "4 à 5"], [5.5, "5 à 6"], [6.5, "6 et plus"]].map(([m, l]) => `<span><i style="background:${magColor(m)}"></i>${l}</span>`).join("") + "<span>taille : magnitude</span>";
    const L = await this._localMap(home, legend, 'séismes : <a href="https://www.emsc-csem.org/">EMSC</a>, <a href="https://earthquake.usgs.gov/">USGS</a>', Number(c.map_height) || 300);
    if (!L) return;
    try {
      this._layer.clearLayers();
      this._markers = [];
      this._flyZoom = 7;
      const now = Date.now();
      const km = (d) => `${fmt(d, d < 10 ? 1 : 0)} km`;
      const dt = (d) => d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      // tous les séismes proches de la période, plus les forts du monde ; les plus récents au-dessus
      const all = [...near, ...shown.filter((q) => !near.includes(q))];
      for (const q of [...all].reverse()) {
        if (!Number.isFinite(q.lat) || !Number.isFinite(q.lon)) continue;
        const col = magColor(q.mag), fresh = now - q.t < DAYMS;
        const m = L.circleMarker([q.lat, q.lon], { radius: 3 + Math.max(0, q.mag - 1.5) * 2.2, color: fresh ? "#ffffff" : "#1a2434", weight: fresh ? 1.6 : 1, fillColor: col, fillOpacity: 0.85 })
          .bindPopup(`<div class="bp"><b>Magnitude ${fmt(q.mag, 1)} · ${esc(magLabel(q.mag))}</b>
            <span>${esc(placeFr(q.place) || "Lieu inconnu")}</span>
            ${q.dist !== null ? `<span>À <b>${km(q.dist)}</b>${q.az !== null ? ` ${compass16(q.az)}` : ""} de chez vous</span>` : ""}
            <span>${dt(q.t)} · ${agoTxt(now - q.t)}</span>${q.depth ? `<span>Profondeur <b>${fmt(q.depth)} km</b></span>` : ""}
            ${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">Fiche du séisme (${esc(q.src || "réseau")})</a>` : ""}</div>`,
          { autoPanPaddingTopLeft: L.point(56, 16), autoPanPaddingBottomRight: L.point(56, 24) });
        m.addTo(this._layer);
        const i = shown.indexOf(q);
        if (i >= 0) this._markers[i] = m;
      }
      L.circleMarker(home, { radius: 6, color: "#fff", weight: 2, fillColor: "#1d93e3", fillOpacity: 1 }).bindTooltip("Chez vous").addTo(this._layer);
      L.circle(home, { radius: radius * 1000, color: "#1d93e3", weight: 1, dashArray: "6 6", fill: false, interactive: false }).addTo(this._layer);
      // cadrage : le rayon surveillé autour de chez vous (les séismes lointains restent à portée du zoom arrière)
      const dLat = radius / 111.2, dLon = radius / (111.2 * Math.cos(home[0] * RAD));
      this._localFit(`${radius}|${home}`, [[home[0] - dLat, home[1] - dLon], [home[0] + dLat, home[1] + dLon]], home, 5);
    } catch (e) {
      console.error("Carte Météo (séismes) :", e);
      this._map = null;
      if (this._mapEl) this._mapEl.innerHTML = `<div class="empty"><b>Erreur de la carte</b><span>${esc(e.message)}</span></div>`;
    }
  }
}

/* ------------------------------------------------------- carte Feux de forêt */

const FEUX_DEFAULTS = { title: "Feux de forêt", radius: 0, max_items: 6, show_map: true, map_height: 300, theme: "v2" };
/** Intensité d'un feu (puissance radiative, intégration NASA FIRMS) : libellé et couleur de l'intégration. */
const FIRE_BAND = { extreme: ["Extrême", "#ff0000"], high: ["Fort", "#ff4d00"], moderate: ["Modéré", "#ff7400"], low: ["Faible", "#ffc100"] };
const FIRE_NONE = ["Inconnue", "#9e9e9e"];
const FIRE_CONF = { low: "faible", nominal: "normale", high: "élevée" };
/** Fumée : écart entre le vent et la direction du feu (0 = poussée droit vers vous, 180 = à l'opposé). */
const smokeOf = (o) => (o === null || o === undefined ? null : o <= 45 ? ["Fumée vers vous", "#ee4a4a"] : o <= 90 ? ["Fumée de côté", "#ff8c33"] : ["Fumée qui s'éloigne de vous", "#5fcf8a"]);
const SAT_FR = (s) => String(s || "").replace(/_/g, " ").replace(/\bNOAA(\d+)\b/i, "NOAA-$1").replace(/\bSNPP\b/i, "Suomi NPP");

class MeteoFeuxCard extends MeteoBase {
  static get defaults() {
    return FEUX_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-feux-card-editor");
  }

  getCardSize() {
    return 6;
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config, hass = this._hass, reg = hass.entities || {}, st = hass.states;
    const ids = Object.keys(st);
    // feux : entités geo_location de l'intégration NASA FIRMS ; capteurs : nombre, plus proche, puissance, prochain passage
    const fires = ids.filter((id) => id.startsWith("geo_location.") && (st[id].attributes?.source === "nasa_firms" || reg[id]?.platform === "nasa_firms"));
    const firms = ids.filter((id) => id.startsWith("sensor.") && reg[id]?.platform === "nasa_firms");
    const tk = (k, re) => firms.find((id) => reg[id]?.translation_key === k) || firms.find((id) => re.test(id));
    const s = { count: tk("hotspot_count", /hotspots?$|foyers?$/), near: tk("nearest_distance", /nearest_hotspot$|plus_proche$/), frp: tk("max_frp", /max_fire_radiative_power$|frp$/), pass: tk("satellite_observation", /satellite_observation$|passage/) };
    const sig = `${c.theme}|${hass.themes?.darkMode}|${Math.floor(Date.now() / 6e4)}|` + [...fires, ...Object.values(s)].map((id) => `${id}=${st[id]?.state}`).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    const now = Date.now();
    const home = [num(c.latitude) ?? num(hass.config?.latitude), num(c.longitude) ?? num(hass.config?.longitude)];
    if (home[0] === null || home[1] === null) home.length = 0;
    const list = fires.map((id) => {
      const a = st[id].attributes || {};
      const band = FIRE_BAND[a.intensity] || FIRE_NONE;
      const t = a.acquired ? new Date(a.acquired) : null;
      return { id, lat: num(a.latitude), lon: num(a.longitude), windFrom: num(a.wind_bearing), dist: num(st[id].state), az: num(a.bearing), frp: num(a.frp_mw), band, conf: FIRE_CONF[a.confidence] || null, sats: Array.isArray(a.satellites) ? a.satellites : [],
        t: t && !isNaN(t) ? t : null, place: a.place_name || null, placeKm: num(a.place_distance_km), wind: num(a.wind_speed), windDir: a.wind_direction, smoke: smokeOf(num(a.smoke_offset)) };
    }).filter((f) => f.dist !== null).sort((a, b) => a.dist - b.dist);
    const n = this._num(s.count) ?? list.length;
    const radius = Number(c.radius) || Math.max(50, Math.ceil(Math.max(0, ...list.map((f) => f.dist)) * 1.1 / 10) * 10);
    const km = (d) => `${fmt(d, d < 10 ? 1 : 0)} km`;
    const head = this._head(c.icon || "mdi:fire", n ? "#ff4d00" : "#5fcf8a", c.title || "Feux de forêt",
      !fires.length && !firms.length ? "" : n ? `${fmt(n)} feu${n > 1 ? "x" : ""} détecté${n > 1 ? "s" : ""} par satellite` : "Aucun feu détecté autour de chez vous");
    if (!fires.length && !firms.length) {
      this._card(head + `<div class="empty"><b>Aucune donnée de feux</b><span>Installez l'intégration NASA FIRMS Wildfire Monitor (HACS) avec une clé gratuite de la NASA, puis choisissez le rayon à surveiller.</span></div>`);
      if (this._keep) this._keep.innerHTML = "";
      this._map = null;
      return;
    }
    // prochain passage d'un satellite au-dessus de chez vous (la prochaine occasion de voir un nouveau feu)
    const pass = this._st(s.pass), passT = pass && !isNaN(Date.parse(pass.state)) ? new Date(pass.state) : null;
    const passTxt = passT ? `${passT.toDateString() === new Date().toDateString() ? "aujourd'hui" : passT.toLocaleDateString("fr-FR", { weekday: "long" })} à ${hm(passT)}` : null;
    const nearest = list[0], strongest = [...list].sort((a, b) => (b.frp ?? -1) - (a.frp ?? -1))[0];
    const dots = list.slice(0, 60).reverse().map((f) => {
      if (f.az === null) return "";
      const [x, y] = pt(70, 70, 30 + Math.min(1, f.dist / radius) * 24, f.az);
      return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(3 + Math.min(5, Math.log10(1 + (f.frp || 0))) * 1.3)}" fill="${f.band[1]}" class="qk${f === nearest ? " last" : ""}"/>`;
    }).join("");
    const rose = `<div class="gauge"${nearest ? ` data-entity="${esc(nearest.id)}"` : s.near ? ` data-entity="${esc(s.near)}"` : ""}><svg viewBox="0 0 140 140" role="img" aria-label="Feux autour de chez vous">
      ${roseSvg(c.compass_image)}${dots}
      ${nearest ? `<text x="70" y="74" class="big">${km(nearest.dist)}</text><text x="70" y="87" class="sm">${nearest.az !== null ? compass16(nearest.az) : "plus proche"}</text>`
        : `<text x="70" y="74" class="big" style="fill:#5fcf8a">0</text><text x="70" y="87" class="sm">aucun feu</text>`}</svg>
      <div class="g-l">${nearest ? `Plus proche${nearest.place ? ` · <b>près de ${esc(nearest.place)}</b>` : ""}` : `Rayon de ${fmt(radius)} km`}</div></div>`;
    const tile = (id, icon, col, value, lab) => (value === null || value === undefined ? "" : `<div class="sky-t"${id ? ` data-entity="${esc(id)}"` : ""}><ha-icon icon="${icon}" style="color:${col}"></ha-icon>
      <div class="k-v">${value}</div><div class="k-l">${lab}</div></div>`);
    const tiles = `<div class="sky qk-t">
      ${nearest?.smoke ? tile(nearest.id, "mdi:weather-windy", nearest.smoke[1], `${nearest.smoke[0]}${nearest.wind !== null ? ` · ${fmt(nearest.wind * 3.6)} km/h` : ""}`, "Vent au feu le plus proche") : ""}
      ${tile(strongest?.id || s.frp, "mdi:heat-wave", strongest ? strongest.band[1] : "#8fa0b8", strongest?.frp !== null && strongest?.frp !== undefined ? `${fmt(strongest.frp, strongest.frp < 10 ? 1 : 0)} MW · ${strongest.band[0]}` : null, "Le plus intense")}
      ${tile(s.pass, "mdi:satellite-variant", "#1d93e3", passTxt, `Prochain passage${pass?.attributes?.satellite_name || pass?.attributes?.satellite ? ` · ${esc(SAT_FR(pass.attributes.satellite_name || pass.attributes.satellite))}` : ""}`)}
    </div>`;
    const mapOn = c.show_map !== false && home.length === 2;
    const row = (f, i) => `<div class="qk-r" ${mapOn ? `data-act="fly" data-i="${i}" role="button" tabindex="0"` : `data-entity="${esc(f.id)}"`}><span class="qk-m" style="background:${f.band[1]}${/^#ff(0000|4d00)$/.test(f.band[1]) ? ";color:#fff" : ""}">${f.frp === null ? "?" : fmt(f.frp, f.frp < 10 ? 1 : 0)}</span>
      <span class="qk-p"><b>${f.place ? `${f.placeKm !== null ? `${km(f.placeKm)} de ` : "Près de "}${esc(f.place)}` : "Feu détecté"}</b>
        <small>${km(f.dist)}${f.az !== null ? ` ${compass16(f.az)}` : ""}${f.t ? ` · ${agoTxt(now - f.t)}` : ""}${f.conf ? ` · confiance ${f.conf}` : ""}${f.sats.length > 1 ? ` · ${f.sats.length} satellites` : ""}</small>
        ${f.smoke ? `<small style="color:${f.smoke[1]}">${f.smoke[0]}${f.windDir ? ` · vent ${esc(String(f.windDir).replace(/W/g, "O"))}` : ""}</small>` : ""}</span>
      <span class="qk-l">${f.band[0]}</span></div>`;
    const max = Math.max(1, Number(c.max_items) || 6);
    const body = head + `<div class="duo">${rose}<div class="qk-side">${tiles}</div></div>`
      + (list.length ? `<div class="sec">Feux détectés</div><div class="qk-l-w">${list.slice(0, max).map((f) => row(f, list.indexOf(f))).join("")}</div>`
        : `<div class="fc-empty">Aucun feu dans la zone surveillée par l'intégration${passTxt ? ` · prochain passage ${passTxt}` : ""}</div>`)
      + `<div class="qk-src">Source : NASA FIRMS (satellites VIIRS et MODIS). Un point chaud peut aussi être une usine ou un brûlage.</div>`;
    this._card(body);
    if (mapOn) this._mapUpdate(list, home, radius);
    else if (this._keep) { this._keep.innerHTML = ""; this._map = null; }
  }

  _action(act, el) {
    if (act === "fly") this._fly(Number(el.dataset.i));
    else if (act === "full") { const w = this._keep?.querySelector(".bm"); if (document.fullscreenElement) document.exitFullscreen(); else w?.requestFullscreen?.(); }
  }

  /** Carte interactive des feux (Leaflet, fond OpenStreetMap avec villes et routes), créée une fois dans la zone « keep ». */
  async _mapUpdate(list, home, radius) {
    const c = this._config;
    const legend = `${Object.values(FIRE_BAND).map(([l, col]) => `<span><i style="background:${col}"></i>${l}</span>`).join("")}<span>trait : direction de la fumée</span>`;
    const L = await this._localMap(home, legend, 'feux : <a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</a>', Number(c.map_height) || 300);
    if (!L) return;
    const el = this._mapEl;
    try {
      this._layer.clearLayers();
      this._markers = [];
      const km = (d) => `${fmt(d, d < 10 ? 1 : 0)} km`;
      const dt = (d) => d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      for (const f of [...list].reverse()) {
        if (f.lat === null || f.lon === null) continue;
        const col = f.band[1];
        // fumée : vers où le vent pousse (le vent vient de wind_bearing), sur 12 km
        if (f.windFrom !== null) {
          const to = (f.windFrom + 180) * RAD, d = 12 / 111;
          L.polyline([[f.lat, f.lon], [f.lat + d * Math.cos(to), f.lon + (d * Math.sin(to)) / Math.cos(f.lat * RAD)]], { color: "#8fa0b8", weight: 2.5, dashArray: "4 4", opacity: 0.9 }).addTo(this._layer);
        }
        const m = L.circleMarker([f.lat, f.lon], { radius: 5 + Math.min(6, Math.log10(1 + (f.frp || 0)) * 2.2), color: "#3e1200", weight: 1, fillColor: col, fillOpacity: 0.9 })
          .bindPopup(`<div class="bp"><b>${f.place ? `${f.placeKm !== null ? `${km(f.placeKm)} de ` : "Près de "}${esc(f.place)}` : "Feu détecté"}</b>
            <span>Intensité <b>${f.band[0]}</b>${f.frp !== null ? ` · ${fmt(f.frp, f.frp < 10 ? 1 : 0)} MW` : ""}</span>
            ${f.dist !== null ? `<span>À <b>${km(f.dist)}</b>${f.az !== null ? ` ${compass16(f.az)}` : ""} de chez vous</span>` : ""}
            ${f.t ? `<span>Détecté ${dt(f.t)}</span>` : ""}${f.conf ? `<span>Confiance <b>${f.conf}</b>${f.sats.length ? ` · ${f.sats.map(SAT_FR).join(", ")}` : ""}</span>` : ""}
            ${f.smoke ? `<span style="color:${f.smoke[1]}">${f.smoke[0]}${f.wind !== null ? ` · vent ${fmt(f.wind * 3.6)} km/h` : ""}</span>` : ""}</div>`,
          { autoPanPaddingTopLeft: L.point(56, 16), autoPanPaddingBottomRight: L.point(56, 24) });
        m.addTo(this._layer);
        this._markers[list.indexOf(f)] = m;
      }
      L.circleMarker(home, { radius: 6, color: "#fff", weight: 2, fillColor: "#1d93e3", fillOpacity: 1 }).bindTooltip("Chez vous").addTo(this._layer);
      if (Number(c.radius)) L.circle(home, { radius: Number(c.radius) * 1000, color: "#1d93e3", weight: 1, dashArray: "6 6", fill: false }).addTo(this._layer);
      // cadrage : maison et feux
      this._localFit(list.map((f) => f.id).join(), [home, ...list.filter((f) => f.lat !== null).map((f) => [f.lat, f.lon])], home);
    } catch (e) {
      console.error("Carte Météo (feux) :", e);
      this._map = null;
      el.innerHTML = `<div class="empty"><b>Erreur de la carte</b><span>${esc(e.message)}</span></div>`;
    }
  }

}

/* ------------------------------------------------------------ carte Crues */

const CRUES_DEFAULTS = { title: "Crues et rivières", radius: 25, max_items: 6, direct: true, show_map: true, map_height: 300, theme: "v2" };
/** API publique Hub'Eau (hydrométrie en temps réel, mêmes stations que Vigicrues), sans clé. */
const HUBEAU = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/";
/** Tendance de la hauteur d'eau sur 24 h (mètres) : libellé, couleur, icône. */
const riverTrend = (d) => (d === null ? ["Hauteur", "#8fa0b8", "mdi:waves"] : d >= 0.5 ? ["Forte hausse", "#ee4a4a", "mdi:arrow-up-bold"]
  : d >= 0.1 ? ["En hausse", "#ff8c33", "mdi:arrow-top-right"] : d <= -0.1 ? ["En baisse", "#1d93e3", "mdi:arrow-bottom-right"] : ["Stable", "#5fcf8a", "mdi:arrow-right"]);
/** « La Seine à Paris » → { river: « La Seine », place: « Paris » }. */
const stationParts = (name) => {
  const m = /^(.*?)\s+(?:à|au|aux|a)\s+(.+)$/i.exec(String(name || "").trim());
  return m ? { river: m[1], place: m[2] } : { river: null, place: String(name || "").trim() };
};
/** Petite courbe de la hauteur sur 24 h. */
const sparkSvg = (pts, col) => {
  if (!pts || pts.length < 2) return "";
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0], vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = Math.max(hi - lo, 0.02);
  const d = pts.map(([t, v], i) => `${i ? "L" : "M"}${f2(((t - t0) / Math.max(1, t1 - t0)) * 100)} ${f2(26 - ((v - lo) / span) * 22)}`).join("");
  return `<svg viewBox="0 0 100 28" class="rv-sp" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" stroke="${col}"/></svg>`;
};

class MeteoCruesCard extends MeteoBase {
  static get defaults() {
    return CRUES_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-crues-card-editor");
  }

  getCardSize() {
    return 6;
  }

  _home() {
    const c = this._config, cfg = this._hass?.config || {};
    const lat = num(c.latitude) ?? num(cfg.latitude), lon = num(c.longitude) ?? num(cfg.longitude);
    return lat === null || lon === null ? null : [lat, lon];
  }

  /** Stations de l'intégration Vigicrues : capteurs de hauteur (height) et de débit (waterflowrate) regroupés par station. */
  _fromEntities() {
    const hass = this._hass, reg = hass.entities || {}, out = {};
    for (const [id, st] of Object.entries(hass.states)) {
      if (!id.startsWith("sensor.") || reg[id]?.platform !== "vigicrues") continue;
      const a = st.attributes || {}, code = a.station_id || id;
      const s = (out[code] ||= { code, lat: num(a.latitude), lon: num(a.longitude), ents: {} });
      const kind = a.type === "Q" || reg[id]?.translation_key === "waterflowrate" || /debit|flow|_q$/.test(id) ? "q" : "h";
      s.ents[kind] = id;
      if (kind === "h") {
        const dev = hass.devices?.[reg[id]?.device_id];
        s.name = String(dev?.name_by_user || dev?.name || a.friendly_name || code).replace(/\s*-\s*[A-Z]\d{6,}\s*$/, "").replace(/^Vigicrues\s+/i, "");
      }
    }
    return Object.values(out).map((s) => ({ ...s, h: this._num(s.ents.h), q: this._num(s.ents.q), at: this._st(s.ents.h)?.last_changed ? new Date(this._st(s.ents.h).last_changed) : null, ...stationParts(s.name) }));
  }

  /** Hauteurs des dernières 24 h des capteurs de l'intégration (historique de Home Assistant), une fois par heure. */
  _histEntities(list) {
    const ids = list.map((s) => s.ents.h).filter(Boolean);
    const key = ids.join(",");
    if (!ids.length || !this._hass.callApi || (this._hKey === key && Date.now() - this._hAt < 36e5) || this._hBusy) return;
    this._hBusy = true;
    const from = new Date(Date.now() - DAYMS).toISOString();
    this._hass.callApi("GET", `history/period/${from}?filter_entity_id=${key}&minimal_response&no_attributes`).then((res) => {
      const out = {};
      for (const ser of res || []) {
        const id = ser?.[0]?.entity_id;
        if (id) out[id] = ser.map((p) => [Date.parse(p.last_changed), Number(p.state)]).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));
      }
      this._hist = out;
    }).catch(() => {}).finally(() => { this._hKey = key; this._hAt = Date.now(); this._hBusy = false; this._sig = null; this._render(); });
  }

  /** Sans intégration : stations Hub'Eau autour de chez vous, puis hauteurs et débits des dernières 24 h (toutes les 30 min). */
  _fetch(home) {
    if (this._busy || (this._data && Date.now() - this._dataAt < 18e5)) return;
    this._busy = true;
    const c = this._config, r = Math.max(1, Number(c.radius) || 25);
    const dLat = r / 111.2, dLon = r / (111.2 * Math.cos(home[0] * RAD));
    const bbox = [home[1] - dLon, home[0] - dLat, home[1] + dLon, home[0] + dLat].map((v) => v.toFixed(4)).join(",");
    const forced = (Array.isArray(c.stations) ? c.stations : c.stations ? String(c.stations).split(/[,\s]+/) : []).map((x) => String(x).replace(/^.*\//, "")).filter(Boolean);
    const stUrl = `${HUBEAU}referentiel/stations?format=json&en_service=true&size=200&fields=code_station,libelle_station,libelle_cours_eau,latitude_station,longitude_station&`
      + (forced.length ? `code_station=${forced.join(",")}` : `bbox=${bbox}`);
    const since = new Date(Date.now() - DAYMS).toISOString().slice(0, 19);
    fetchJson(stUrl, 36e5).then((j) => {
      let st = (j.data || []).map((x) => ({ code: x.code_station, name: x.libelle_station, riverName: x.libelle_cours_eau, lat: num(x.latitude_station), lon: num(x.longitude_station) }))
        .filter((x) => x.lat !== null && x.lon !== null);
      st = st.map((x) => ({ ...x, dist: greatCircle(home[0], home[1], x.lat, x.lon) })).filter((x) => forced.length || x.dist <= r).sort((a, b) => a.dist - b.dist).slice(0, 30);
      if (!st.length) return [];
      const obs = (g) => fetchJson(`${HUBEAU}observations_tr?format=json&size=20000&grandeur_hydro=${g}&date_debut_obs=${since}&fields=code_station,date_obs,resultat_obs&sort=asc&code_entite=${st.map((x) => x.code).join(",")}`, 18e5)
        .then((o) => o.data || []).catch(() => []);
      return Promise.all([obs("H"), obs("Q")]).then(([H, Q]) => st.map((x) => {
        const hs = H.filter((o) => o.code_station === x.code).map((o) => [Date.parse(o.date_obs), Number(o.resultat_obs) / 1000]).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));
        const qs = Q.filter((o) => o.code_station === x.code);
        const lastQ = qs.length ? Number(qs[qs.length - 1].resultat_obs) / 1000 : null;
        return { ...x, h: hs.length ? hs[hs.length - 1][1] : null, q: Number.isFinite(lastQ) ? lastQ : null, at: hs.length ? new Date(hs[hs.length - 1][0]) : null, series: hs, ...stationParts(x.name), river: x.riverName || stationParts(x.name).river };
      }).filter((x) => x.h !== null || x.q !== null));
    }).then((list) => { this._data = list; this._failed = false; })
      .catch(() => { this._data = []; this._failed = true; })
      .finally(() => { this._dataAt = Date.now(); this._busy = false; this._sig = null; this._render(); });
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config, home = this._home();
    const ents = this._fromEntities();
    if (ents.length) this._histEntities(ents);
    else if (c.direct !== false && home) this._fetch(home);
    const al = detect(this._hass, c).alert, ast = this._st(al);
    const vigi = (k) => { const v = ast?.attributes?.[k]; const l = levelOf(v); return l === undefined ? null : l; };
    const crue = vigi("Inondation"), rain = vigi("Pluie-inondation");
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${Math.floor(Date.now() / 6e4)}|${this._dataAt}|${this._hAt}|${crue}|${rain}|` + ents.map((s) => `${s.h}/${s.q}`).join(",");
    if (sig === this._sig) return;
    this._sig = sig;
    const now = Date.now();
    let list = (ents.length ? ents.map((s) => ({ ...s, series: (this._hist?.[s.ents.h] || []).concat(s.h !== null && s.at ? [[s.at.getTime(), s.h]] : []) })) : this._data || [])
      .map((s) => {
        const ser = (s.series || []).filter(([t]) => now - t <= DAYMS + 36e5).sort((a, b) => a[0] - b[0]);
        const d24 = ser.length > 1 ? ser[ser.length - 1][1] - ser[0][1] : null;
        return { ...s, series: ser, d24, trend: riverTrend(d24), dist: home && s.lat !== null ? greatCircle(home[0], home[1], s.lat, s.lon) : s.dist ?? null, az: home && s.lat !== null ? bearing(home[0], home[1], s.lat, s.lon) : null };
      })
      .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
    const max = Math.max(1, Number(c.max_items) || 6);
    list = list.slice(0, max);
    const rising = list.filter((s) => s.d24 !== null && s.d24 >= 0.1).length;
    const sub = !list.length ? "" : rising ? `${rising} station${rising > 1 ? "s" : ""} en hausse sur 24 h` : `${list.length} station${list.length > 1 ? "s" : ""} suivie${list.length > 1 ? "s" : ""} · niveaux stables`;
    let body = this._head(c.icon || "mdi:home-flood", crue >= 2 ? LEVEL_COLOR[crue] : "#1d93e3", c.title || "Crues et rivières", sub);
    // vigilance crues du département (Météo-France, alimentée par Vigicrues), et pluie-inondation
    if (crue !== null || rain !== null) {
      const chip = (lv, label) => (lv === null ? "" : `<div class="rv-v" data-entity="${esc(al)}" style="--vc:${LEVEL_COLOR[lv]}"><ha-icon icon="${label === "Crues" ? "mdi:home-flood" : "mdi:weather-pouring"}"></ha-icon>
        <span>${label === "Crues" ? "Vigilance crues" : "Pluie-inondation"}</span><b>${LEVEL_LABEL[lv]}</b></div>`);
      body += `<div class="rv-vs">${chip(crue, "Crues")}${chip(rain, "Pluie")}</div>`;
    }
    if (!list.length) {
      const loading = !ents.length && c.direct !== false && home && !this._dataAt;
      body += loading ? `<div class="empty"><b>Chargement…</b></div>` : `<div class="empty"><b>${this._failed ? "Données des rivières inaccessibles" : "Aucune station de mesure à proximité"}</b><span>${this._failed
        ? "Le navigateur n'a pas pu lire Hub'Eau. Installez l'intégration Vigicrues (HACS) et choisissez vos stations."
        : `Aucune station Vigicrues à moins de ${fmt(Number(c.radius) || 25)} km. Agrandissez le rayon, ou indiquez vos stations (option stations, ou intégration Vigicrues).`}</span></div>`;
      this._card(body);
      if (this._keep) { this._keep.innerHTML = ""; this._map = null; }
      return;
    }
    const mapOn = c.show_map !== false && !!home;
    const m = (v) => `${fmt(v, Math.abs(v) < 10 ? 2 : 1)} m`;
    const cm = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmt(Math.abs(v * 100))} cm`;
    const row = (s, i) => `<div class="rv-r" ${mapOn && s.lat !== null ? `data-act="fly" data-i="${i}" role="button" tabindex="0"` : s.ents?.h ? `data-entity="${esc(s.ents.h)}"` : ""}>
      <div class="rv-n"><b>${esc(s.river || s.place)}</b><small>${esc(s.river ? s.place : "")}${s.dist !== null ? `${s.river ? " · " : ""}${fmt(s.dist, s.dist < 10 ? 1 : 0)} km${s.az !== null ? ` ${compass16(s.az)}` : ""}` : ""}</small></div>
      ${sparkSvg(s.series, s.trend[1])}
      <div class="rv-h"><b>${s.h === null ? "—" : m(s.h)}</b><small style="color:${s.trend[1]}"><ha-icon icon="${s.trend[2]}"></ha-icon>${s.d24 === null ? s.trend[0] : `${cm(s.d24)} en 24 h`}</small>
        ${s.q !== null ? `<small>${fmt(s.q, s.q < 10 ? 2 : s.q < 100 ? 1 : 0)} m³/s</small>` : ""}</div></div>`;
    body += `<div class="sec">Stations de mesure</div><div class="qk-l-w">${list.map(row).join("")}</div>
      <div class="qk-src">${ents.length ? "Source : intégration Vigicrues" : "Source : Hub'Eau (stations Vigicrues)"}${crue !== null ? " · vigilance : Météo-France" : ""}</div>`;
    this._card(body);
    if (mapOn) this._mapUpdate(list, home);
    else if (this._keep) { this._keep.innerHTML = ""; this._map = null; }
  }

  _action(act, el) {
    if (act === "fly") this._fly(Number(el.dataset.i));
    else if (act === "full") { const w = this._keep?.querySelector(".bm"); if (document.fullscreenElement) document.exitFullscreen(); else w?.requestFullscreen?.(); }
  }

  /** Carte interactive des stations, à la couleur de leur tendance sur 24 h. */
  async _mapUpdate(list, home) {
    const c = this._config;
    const legend = ["Forte hausse", "En hausse", "Stable", "En baisse"].map((l) => { const t = [0.6, 0.2, 0, -0.2].map(riverTrend).find(([x]) => x === l); return `<span><i style="background:${t[1]}"></i>${l}</span>`; }).join("") + "<span>sur 24 h</span>";
    const L = await this._localMap(home, legend, 'rivières : <a href="https://www.vigicrues.gouv.fr/">Vigicrues</a>, <a href="https://hubeau.eaufrance.fr/">Hub\'Eau</a>', Number(c.map_height) || 300);
    if (!L) return;
    try {
      this._layer.clearLayers();
      this._markers = [];
      this._flyZoom = 12;
      const dt = (d) => d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      list.forEach((s, i) => {
        if (s.lat === null || s.lon === null) return;
        const mk = L.circleMarker([s.lat, s.lon], { radius: 8, color: "#ffffff", weight: 1.5, fillColor: s.trend[1], fillOpacity: 0.95 })
          .bindPopup(`<div class="bp"><b>${esc(s.river || s.place)}${s.river ? ` à ${esc(s.place)}` : ""}</b>
            ${s.h !== null ? `<span>Hauteur <b>${fmt(s.h, 2)} m</b>${s.d24 !== null ? ` · ${s.d24 > 0 ? "+" : s.d24 < 0 ? "−" : "±"}${fmt(Math.abs(s.d24 * 100))} cm en 24 h` : ""}</span>` : ""}
            ${s.q !== null ? `<span>Débit <b>${fmt(s.q, s.q < 10 ? 2 : 1)} m³/s</b></span>` : ""}
            <span style="color:${s.trend[1]}">${s.trend[0]}</span>${s.at ? `<span>Mesure ${dt(s.at)}</span>` : ""}
            ${s.dist !== null ? `<span>À <b>${fmt(s.dist, s.dist < 10 ? 1 : 0)} km</b>${s.az !== null ? ` ${compass16(s.az)}` : ""} de chez vous</span>` : ""}
            ${s.code ? `<a href="https://www.vigicrues.gouv.fr/station/${encodeURIComponent(s.code)}" target="_blank" rel="noopener noreferrer">Station sur Vigicrues</a>` : ""}</div>`,
          { autoPanPaddingTopLeft: L.point(56, 16), autoPanPaddingBottomRight: L.point(56, 24) });
        mk.addTo(this._layer);
        this._markers[i] = mk;
      });
      L.circleMarker(home, { radius: 6, color: "#fff", weight: 2, fillColor: "#1d93e3", fillOpacity: 1 }).bindTooltip("Chez vous").addTo(this._layer);
      this._localFit(list.map((s) => s.code).join(), [home, ...list.filter((s) => s.lat !== null).map((s) => [s.lat, s.lon])], home, 11);
    } catch (e) {
      console.error("Carte Météo (crues) :", e);
      this._map = null;
      if (this._mapEl) this._mapEl.innerHTML = `<div class="empty"><b>Erreur de la carte</b><span>${esc(e.message)}</span></div>`;
    }
  }
}

/* ---------------------------------------------------------- carte EcoWatt */

const ECOWATT_DEFAULTS = { title: "EcoWatt", show_map: true, show_home: false, theme: "v2" };
/** Signal horaire de RTE : 0 production décarbonée, 1 pas d'alerte, 2 système tendu, 3 coupures possibles. */
const EW_HOUR = [["Production décarbonée", "#2fbf8f"], ["Pas d'alerte", "#5fcf8a"], ["Système électrique tendu", "#ff8c33"], ["Coupures possibles", "#ee4a4a"]];
const EW_DAY = { 1: ["Pas d'alerte", "#5fcf8a", "mdi:check-circle"], 2: ["Système électrique tendu", "#ff8c33", "mdi:alert"], 3: ["Coupures possibles", "#ee4a4a", "mdi:alert-octagon"] };
/** Contour simplifié de la France métropolitaine et de la Corse (longitude, latitude). */
const FRANCE = [[[2.54, 51.09], [3.15, 50.79], [4.23, 49.96], [4.87, 50.15], [5.47, 49.5], [6.36, 49.46], [7.6, 49.08], [8.23, 48.97], [7.6, 48.1], [7.59, 47.58],
  [6.95, 47.45], [6.1, 46.6], [6.13, 46.14], [6.79, 45.78], [7.04, 45.0], [6.63, 44.37], [7.53, 43.78], [6.6, 43.15], [5.0, 43.35], [4.2, 43.45], [3.1, 43.0],
  [3.17, 42.43], [1.7, 42.5], [0.0, 42.7], [-1.78, 43.37], [-1.25, 44.66], [-1.16, 46.0], [-2.2, 47.12], [-3.35, 47.7], [-4.4, 47.95], [-4.79, 48.38], [-3.0, 48.83],
  [-1.6, 48.65], [-1.94, 49.72], [-1.26, 49.7], [0.1, 49.48], [1.4, 50.07], [1.6, 50.9]], [[9.4, 43.0], [9.56, 42.15], [9.2, 41.37], [8.6, 41.9], [8.7, 42.6]]];
const franceSvg = (fill, home) => {
  const k = Math.cos(46 * RAD), X = (lon) => (lon + 5.2) * k * 9.2, Y = (lat) => (51.4 - lat) * 9.2;
  const path = FRANCE.map((ring) => `M${ring.map(([lo, la]) => `${f2(X(lo))} ${f2(Y(la))}`).join("L")}Z`).join("");
  const dot = home ? `<circle cx="${f2(X(home[1]))}" cy="${f2(Y(home[0]))}" r="3.2" class="ew-home"/>` : "";
  return `<svg viewBox="0 0 108 96" class="ew-fr" role="img" aria-label="France"><path d="${path}" fill="${fill}"/>${dot}</svg>`;
};

class MeteoEcowattCard extends MeteoBase {
  static get defaults() {
    return ECOWATT_DEFAULTS;
  }

  static getConfigElement() {
    return document.createElement("meteo-ecowatt-card-editor");
  }

  getCardSize() {
    return 5;
  }

  /** Jours EcoWatt : capteurs ecowatt_j0, j1, j2 de MyElectricalData (heure par heure), sinon RTE EcoWatt (HACS) au jour. */
  _days() {
    const st = this._hass.states, ids = Object.keys(st);
    const days = [];
    for (const n of [0, 1, 2]) {
      const id = (this._config.entities || [])[n] || ids.find((x) => new RegExp(`^sensor\\..*ecowatt_j${n}$`).test(x));
      const s = st[id];
      if (!s) continue;
      const a = s.attributes || {};
      let hours = Array.isArray(a.hourly_values) ? a.hourly_values.map(num) : null;
      if (!hours && a.forecast && typeof a.forecast === "object") {
        hours = Array(24).fill(null);
        for (const [k, v] of Object.entries(a.forecast)) { const h = parseInt(k, 10); if (h >= 0 && h < 24) hours[h] = num(v); }
      }
      const date = a.date ? new Date(`${a.date}T00:00`) : new Date(Date.now() + n * DAYMS);
      days.push({ n, id, level: num(s.state), hours, message: a.message || "", date });
    }
    // intégration RTE EcoWatt (HACS) : niveau par jour (level_code), sans détail horaire
    if (!days.length) {
      for (const id of ids.filter((x) => x.startsWith("sensor.") && /ecowatt/.test(x) && st[x].attributes?.level_code !== undefined && !/hours?|heure|now|maintenant/.test(x))) {
        const m = /(\d+)_?days?|j(\d)/.exec(id), n = m ? Number(m[1] ?? m[2]) : 0;
        if (n <= 2 && !days.some((d) => d.n === n)) days.push({ n, id, level: num(st[id].attributes.level_code), hours: null, message: "", date: new Date(Date.now() + n * DAYMS) });
      }
      days.sort((a, b) => a.n - b.n);
    }
    return days;
  }

  _action(act, el) {
    if (act === "day") { this._day = Number(el.dataset.n); this._hour = null; }
    else if (act === "hour") { this._day = Number(el.dataset.n); this._hour = Number(el.dataset.h); }
    this._sig = null;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config, days = this._days();
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${new Date().getHours()}|${this._day}|${this._hour}|` + days.map((d) => `${d.id}=${d.level}:${(d.hours || []).join("")}`).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    const now = new Date();
    const today = days.find((d) => d.n === 0);
    const head = this._head(c.icon || "mdi:transmission-tower", today ? (EW_DAY[today.level] || EW_DAY[1])[1] : "#1d93e3", c.title || "EcoWatt",
      today ? `Signal de RTE · aujourd'hui : ${(EW_DAY[today.level] || ["Inconnu"])[0].toLowerCase()}` : "");
    if (!days.length) {
      this._card(head + `<div class="empty"><b>Aucun signal EcoWatt</b><span>Activez l'export Home Assistant de MyElectricalData (capteurs ecowatt_j0 à j2), ou installez l'intégration RTE EcoWatt (HACS).</span></div>`);
      return;
    }
    const sel = days.find((d) => d.n === this._day) || today || days[0];
    const dayName = (d) => (d.n === 0 ? "Aujourd'hui" : d.n === 1 ? "Demain" : d.date.toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (x) => x.toUpperCase()));
    // frise : une case par heure, l'heure en cours entourée ; clic = détail de l'heure
    const rows = days.map((d) => {
      const [lab, col, icon] = EW_DAY[d.level] || ["Inconnu", "#8fa0b8", "mdi:help-circle"];
      const cells = d.hours ? d.hours.map((v, h) => {
        const t = EW_HOUR[v] || [null, "var(--med-line)"];
        const cur = d.n === 0 && h === now.getHours(), on = sel === d && this._hour === h;
        return `<button class="ew-h${cur ? " now" : ""}${on ? " on" : ""}" style="background:${t[1]}" data-act="hour" data-n="${d.n}" data-h="${h}" title="${h} h – ${h + 1} h : ${esc(t[0] || "pas de valeur")}"></button>`;
      }).join("") : "";
      return `<div class="ew-d${sel === d ? " sel" : ""}"><button class="ew-dl" data-act="day" data-n="${d.n}"><ha-icon icon="${icon}" style="color:${col}"></ha-icon>
        <span><b>${dayName(d)}</b><small>${d.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</small></span><em style="color:${col}">${lab}</em></button>
        ${cells ? `<div class="ew-hs">${cells}</div>` : ""}</div>`;
    }).join("");
    const ticks = days.some((d) => d.hours) ? `<div class="ew-tk"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>` : "";
    // détail : heure choisie, sinon heure en cours (aujourd'hui), sinon résumé du jour
    let detail;
    if (sel.hours && this._hour !== null && this._hour !== undefined) {
      const t = EW_HOUR[sel.hours[this._hour]] || ["Pas de valeur", "#8fa0b8"];
      detail = `${dayName(sel)}, ${this._hour} h – ${this._hour + 1} h : <b style="color:${t[1]}">${t[0]}</b>`;
    } else if (sel.hours) {
      const count = (v) => sel.hours.filter((x) => x === v).length;
      const worst = Math.max(...sel.hours.filter((x) => x !== null));
      const hot = sel.hours.map((v, h) => (v === worst && worst >= 2 ? h : null)).filter((h) => h !== null);
      detail = worst >= 2 ? `<b style="color:${EW_HOUR[worst][1]}">${EW_HOUR[worst][0]}</b> de ${hot[0]} h à ${hot[hot.length - 1] + 1} h · réduisez la consommation sur ces heures`
        : `${count(0) ? `<b style="color:${EW_HOUR[0][1]}">${count(0)} h de production décarbonée</b> · ` : ""}aucune tension sur le réseau`;
    } else detail = (EW_DAY[sel.level] || ["Inconnu"])[0];
    const map = c.show_map !== false ? `<div class="ew-map" data-entity="${esc(sel.id)}">${franceSvg((EW_DAY[sel.level] || ["", "#8fa0b8"])[1], c.show_home !== true ? null : [num(this._hass.config?.latitude), num(this._hass.config?.longitude)].every((v) => v !== null) ? [this._hass.config.latitude, this._hass.config.longitude] : null)}
      <div class="ew-mt"><b>${dayName(sel)}</b><span>${(EW_DAY[sel.level] || ["Inconnu"])[0]}</span><small>Signal national, le même pour toute la France</small></div></div>` : "";
    const legend = `<div class="bm-leg ew-lg">${EW_HOUR.map(([l, col]) => `<span><i style="background:${col}"></i>${l}</span>`).join("")}</div>`;
    const msg = sel.message && !/^\s*$/.test(sel.message) ? `<div class="fc-empty ew-msg">${esc(sel.message)}</div>` : "";
    this._card(head + `<div class="ew-top">${map}<div class="ew-dt">${detail}</div></div>` + `<div class="ew-ds">${rows}</div>${ticks}${legend}${msg}`
      + `<div class="qk-src">Source : RTE EcoWatt${days[0]?.hours ? " (MyElectricalData)" : ""}. Cliquez sur un jour ou une heure.</div>`);
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
// styles vectoriels complets d'OpenFreeMap (villes, routes, noms), gratuits et sans clé : carte des feux
const OFM = "https://tiles.openfreemap.org/styles/";
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
.fc-d.full .f-w { white-space: nowrap; font-size: .68rem; color: var(--med-text); gap: .25em; }
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
.bp a { color: var(--med-blue); margin-top: 4px; }
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
ha-card.neon .f-gb span { font-size: 14px; }
ha-card.neon :is(.f-hu, .f-pp) ha-icon { --mdc-icon-size: 16px; }
ha-card.neon .rh-h { font-size: .86rem; }
ha-card.neon .rh-h b { font-size: .95rem; }
ha-card.neon .k-v { font-size: .95rem; }
ha-card.neon .k-l { font-size: .74rem; }
ha-card.neon .sky-t ha-icon { --mdc-icon-size: 28px; }
svg .bolt circle { fill: #f7c948; stroke: color-mix(in srgb, #f7c948 40%, #000); stroke-width: 1; filter: drop-shadow(0 0 4px #f7c948); }
svg .bolt path { fill: #1a2434; }
.sw { margin: 0 12px; padding: 10px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); display: grid; gap: 8px; }
.sw[data-entity] { cursor: pointer; }
.sw-k { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sw-k b { font-size: 1.3rem; } .sw-k span { font-size: .82rem; color: var(--med-muted); }
.sw-bar { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; }
.sw-bar i { height: 9px; border-radius: 3px; background: var(--med-line); }
.sw-t { display: grid; gap: 3px; font-size: .78rem; color: var(--med-muted); }
.sw-t b { font-weight: 700; } .sw-t small { font-size: .72rem; }
.qk { stroke: rgba(0, 0, 0, .35); stroke-width: .6; opacity: .85; }
.qk.last { stroke: var(--med-text); stroke-width: 1.4; opacity: 1; }
.qk-side { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.qk-t { margin: 0; grid-template-columns: 1fr; }
.qk-l-w { display: grid; gap: 6px; margin: 0 12px; }
.qk-r { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line);
  color: inherit; text-decoration: none; cursor: pointer; min-width: 0; }
a.qk-r:hover { border-color: var(--med-blue); }
.qk-m { flex: none; min-width: 38px; text-align: center; padding: 4px 6px; border-radius: 8px; font-weight: 800; font-size: .86rem; color: #1a2434; }
.qk-p { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.qk-p b { font-size: .84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qk-p small { font-size: .72rem; color: var(--med-muted); }
.qk-l { flex: none; font-size: .7rem; color: var(--med-muted); }
.qk-src { margin: 8px 18px 0; font-size: .68rem; color: var(--med-muted); text-align: right; }
.rv-vs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 8px 12px 0; }
.rv-v { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; cursor: pointer; font-size: .8rem;
  background: color-mix(in srgb, var(--vc) 14%, var(--med-surface)); border: 1px solid color-mix(in srgb, var(--vc) 55%, transparent); }
.rv-v ha-icon { --mdc-icon-size: 20px; color: var(--vc); } .rv-v span { flex: 1; color: var(--med-muted); } .rv-v b { color: var(--vc); }
.rv-r { display: grid; grid-template-columns: minmax(0, 1fr) 76px auto; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px;
  background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; }
.rv-n { display: flex; flex-direction: column; min-width: 0; } .rv-n b { font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-n small { font-size: .72rem; color: var(--med-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-sp { width: 76px; height: 28px; } .rv-sp path { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.rv-h { display: flex; flex-direction: column; align-items: flex-end; text-align: right; } .rv-h b { font-size: .95rem; }
.rv-h small { font-size: .7rem; color: var(--med-muted); display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.rv-h small ha-icon { --mdc-icon-size: 13px; }
.ew-top { display: flex; gap: 10px; align-items: center; margin: 8px 12px 0; flex-wrap: wrap; }
.ew-map { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; flex: 1 1 220px; }
.ew-fr { width: 92px; height: 82px; flex: none; } .ew-fr path { stroke: rgba(0, 0, 0, .35); stroke-width: .6; transition: fill .3s; }
.ew-home { fill: #1d93e3; stroke: #fff; stroke-width: 1; }
.ew-mt { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .ew-mt b { font-size: .9rem; } .ew-mt span { font-size: .86rem; font-weight: 600; }
.ew-mt small { font-size: .68rem; color: var(--med-muted); }
.ew-dt { flex: 1 1 200px; font-size: .8rem; color: var(--med-muted); padding: 4px 2px; }
.ew-ds { display: grid; gap: 6px; margin: 10px 12px 0; }
.ew-d { padding: 8px 10px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.ew-d.sel { border-color: var(--med-blue); }
.ew-dl { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; }
.ew-dl ha-icon { --mdc-icon-size: 20px; } .ew-dl span { display: flex; flex-direction: column; flex: 1; } .ew-dl b { font-size: .84rem; }
.ew-dl small { font-size: .68rem; color: var(--med-muted); } .ew-dl em { font-style: normal; font-size: .76rem; font-weight: 700; text-align: right; }
.ew-hs { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 8px; }
.ew-h { all: unset; cursor: pointer; height: 16px; border-radius: 3px; box-sizing: border-box; }
.ew-h.now { box-shadow: 0 0 0 2px var(--med-text); } .ew-h.on { box-shadow: 0 0 0 2px var(--med-blue); }
.ew-h:focus-visible { outline: 2px solid var(--med-blue); }
.ew-tk { display: flex; justify-content: space-between; margin: 3px 24px 0; font-size: .62rem; color: var(--med-muted); }
.ew-lg { margin: 8px 14px 0; } .ew-msg { margin-top: 8px; }
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
  { name: "show_space", selector: { boolean: {} } },
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
  show_space: "Activité solaire et aurores (NOAA)",
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
const SEISMES_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "radius", selector: { number: { min: 50, max: 5000, step: 50, mode: "box", unit_of_measurement: "km" } } },
  { name: "min_magnitude", selector: { number: { min: 0, max: 6, step: 0.5, mode: "box" } } },
  { name: "world_magnitude", selector: { number: { min: 4, max: 9, step: 0.5, mode: "box" } } },
  { name: "days", selector: { number: { min: 1, max: 30, mode: "box", unit_of_measurement: "j" } } },
  { name: "max_items", selector: { number: { min: 1, max: 20, mode: "box" } } },
  { name: "direct", selector: { boolean: {} } },
  { name: "show_map", selector: { boolean: {} } },
  { name: "map_height", selector: { number: { min: 180, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } } },
  { name: "compass_image", selector: { text: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const SEISMES_LABELS = {
  title: "Titre (Séismes par défaut)",
  radius: "Rayon autour de chez vous",
  min_magnitude: "Magnitude minimale autour de chez vous",
  world_magnitude: "Magnitude minimale dans le monde",
  days: "Période",
  max_items: "Nombre de séismes listés",
  direct: "Sans intégration, lire les flux EMSC et USGS depuis le navigateur",
  show_map: "Carte interactive des séismes",
  map_height: "Hauteur de la carte",
  compass_image: "Image au centre de la boussole",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const FEUX_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "radius", selector: { number: { min: 0, max: 500, step: 10, mode: "box", unit_of_measurement: "km" } } },
  { name: "max_items", selector: { number: { min: 1, max: 20, mode: "box" } } },
  { name: "show_map", selector: { boolean: {} } },
  { name: "map_height", selector: { number: { min: 180, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } } },
  { name: "compass_image", selector: { text: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const FEUX_LABELS = {
  title: "Titre (Feux de forêt par défaut)",
  radius: "Distance au bord de la boussole (0 = automatique)",
  max_items: "Nombre de feux listés",
  show_map: "Carte interactive des feux",
  map_height: "Hauteur de la carte",
  compass_image: "Image au centre de la boussole",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const CRUES_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "radius", selector: { number: { min: 1, max: 200, mode: "box", unit_of_measurement: "km" } } },
  { name: "stations", selector: { text: {} } },
  { name: "max_items", selector: { number: { min: 1, max: 20, mode: "box" } } },
  { name: "direct", selector: { boolean: {} } },
  { name: "show_map", selector: { boolean: {} } },
  { name: "map_height", selector: { number: { min: 180, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } } },
  THEME_SELECT,
  TEXT_SIZE,
];
const CRUES_LABELS = {
  title: "Titre (Crues et rivières par défaut)",
  radius: "Stations à moins de",
  stations: "Stations à suivre (codes Vigicrues séparés par des virgules, vide = les plus proches)",
  max_items: "Nombre de stations affichées",
  direct: "Sans intégration, lire Hub'Eau depuis le navigateur",
  show_map: "Carte interactive des stations",
  map_height: "Hauteur de la carte",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
const ECOWATT_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "entities", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "show_map", selector: { boolean: {} } },
  { name: "show_home", selector: { boolean: {} } },
  THEME_SELECT,
  TEXT_SIZE,
];
const ECOWATT_LABELS = {
  title: "Titre (EcoWatt par défaut)",
  entities: "Capteurs d'aujourd'hui, demain et après-demain (vide = ecowatt_j0, j1, j2 détectés)",
  show_map: "Carte de France à la couleur du jour choisi",
  show_home: "Votre maison sur la carte de France",
  theme: "Couleurs de la carte",
  text_size: "Taille du texte (%)",
};
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
  define("meteo-seismes-card", MeteoSeismesCard);
  define("meteo-seismes-card-editor", makeEditor(SEISMES_SCHEMA, SEISMES_LABELS, SEISMES_DEFAULTS));
  define("meteo-ecowatt-card", MeteoEcowattCard);
  define("meteo-ecowatt-card-editor", makeEditor(ECOWATT_SCHEMA, ECOWATT_LABELS, ECOWATT_DEFAULTS));
  define("meteo-crues-card", MeteoCruesCard);
  define("meteo-crues-card-editor", makeEditor(CRUES_SCHEMA, CRUES_LABELS, CRUES_DEFAULTS));
  define("meteo-feux-card", MeteoFeuxCard);
  define("meteo-feux-card-editor", makeEditor(FEUX_SCHEMA, FEUX_LABELS, FEUX_DEFAULTS));
  define("meteo-bolides-card", MeteoBolidesCard);
  define("meteo-bolides-card-editor", makeEditor(BOLIDES_SCHEMA, BOLIDES_LABELS, BOLIDES_DEFAULTS));
  window.customCards = window.customCards || [];
  for (const card of [
    { type: "meteo-card", name: "Carte Météo", description: "Météo du jour, une ou plusieurs villes : conditions, ressenti, vent, détails et vigilance Météo-France, prévisions par heure et par jour, saison, lune." },
    { type: "meteo-ciel-card", name: "Carte Météo : vent et ciel", description: "Baromètre, boussole du vent, températures, pluie du jour, indice UV et carte Windy." },
    { type: "meteo-air-card", name: "Carte Météo : air, pollens et eau", description: "Qualité de l'air et polluants (Atmo France), pollens, vigilance sécheresse (VigiEau)." },
    { type: "meteo-eclairs-card", name: "Carte Météo : éclairs", description: "Direction et distance du dernier éclair, compteur d'éclairs (Blitzortung)." },
    { type: "meteo-bolides-card", name: "Carte Météo : bolides", description: "Carte du monde interactive des bolides (grosses météorites) détectés par la NASA, avec le plus récent, le plus proche et le plus puissant." },
    { type: "meteo-astro-card", name: "Carte Météo : soleil et lune", description: "Course du soleil, lever et coucher du soleil et de la lune, phases de la lune, étoiles filantes, activité solaire et aurores, cycles et pollens." },
    { type: "meteo-ecowatt-card", name: "Carte Météo : EcoWatt", description: "Signal EcoWatt de RTE (risque de coupures) aujourd'hui, demain et après-demain, heure par heure, avec la France à la couleur du jour." },
    { type: "meteo-crues-card", name: "Carte Météo : crues et rivières", description: "Hauteur et débit des rivières proches avec leur tendance sur 24 h, vigilance crues, carte interactive des stations (Vigicrues, Hub'Eau)." },
    { type: "meteo-feux-card", name: "Carte Météo : feux de forêt", description: "Feux détectés par satellite autour de chez vous (NASA FIRMS) : boussole, distance, intensité, fumée et vent, prochain passage." },
    { type: "meteo-seismes-card", name: "Carte Météo : séismes", description: "Séismes autour de chez vous et dans le monde, sur une boussole et en liste (EMSC, USGS, ou intégrations USGS et GDACS)." },
  ]) if (!window.customCards.some((c) => c.type === card.type)) window.customCards.push({ ...card, preview: true });
  console.info(`%c METEO-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}
})();
