/*
 * Carte Météo — météo du jour pour Home Assistant : conditions actuelles, ressenti, vent, humidité,
 * pression, vigilance Météo-France, prévisions des prochains jours, saison, phase de lune et zodiaque.
 * Fonctionne avec toute entité weather (Météo-France, OpenWeatherMap, Met.no…) ; les prévisions sont lues
 * comme le fait Home Assistant (abonnement weather/subscribe_forecast).
 * Même style que la Carte Enedis Linky New et les Cartes Linky Énergie, mais indépendante.
 * Inspirée de la carte « Météo Glossy » (glossy-weather-card).
 *
 *   type: custom:meteo-card
 *   entity: weather.ma_ville          (facultatif : la première entité weather, Météo-France en priorité)
 *   alert: sensor.xx_weather_alert    (facultatif : vigilance Météo-France détectée)
 */

(() => {
const CARD_VERSION = "1.0.0";

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
const moonOfDate = (d) => {
  const lun = 29.530588853;
  const age = ((((d.getTime() / 86400e3 - 10957.5 - 5.597) % lun) + lun) % lun);
  const keys = ["new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "last_quarter", "waning_crescent"];
  return keys[Math.round(age / (lun / 8)) % 8];
};

/* -------------------------------------------------------- détection auto */

const DEFAULTS = {
  days: 5,
  forecast_type: "daily",
  show_stats: true,
  show_alert: true,
  show_forecast: true,
  show_sky: true,
  theme: "v2",
};

/** Entités trouvées automatiquement (celles de la configuration sont prioritaires). */
const detect = (hass, c) => {
  const ids = Object.keys(hass?.states || {});
  const reg = hass?.entities || {};
  const weathers = ids.filter((id) => id.startsWith("weather."));
  const weather = [c.entity, c.weather, c.weather_hourly, c.weather_daily].find((id) => String(id || "").startsWith("weather."))
    || weathers.find((id) => reg[id]?.platform === "meteo_france" || id.includes("meteo_france")) || weathers[0];
  const alert = c.alert || c.weather_alert
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

/* -------------------------------------------------------------------- carte */

class MeteoCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("meteo-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...(config || {}) };
    this._sig = null;
    this._unsub?.();
    this._unsub = null;
    this._fcKey = null;
    this._fc = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._clicks) this.shadowRoot.addEventListener("click", (this._clicks = (ev) => {
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
    this._fcKey = null;
    this._render();
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsub = null;
    this._fcKey = null;
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  _st(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  /** Prévisions : abonnement weather/subscribe_forecast, sinon l'ancien attribut forecast. */
  _subscribe(weather) {
    const type = this._config.forecast_type === "hourly" ? "hourly" : this._config.forecast_type === "twice_daily" ? "twice_daily" : "daily";
    const key = `${weather}|${type}`;
    if (!weather || key === this._fcKey || !this.isConnected) return;
    this._unsub?.();
    this._unsub = null;
    this._fcKey = key;
    this._fc = null;
    const conn = this._hass?.connection;
    if (!conn?.subscribeMessage) return;
    conn.subscribeMessage((msg) => {
      this._fc = Array.isArray(msg?.forecast) ? msg.forecast : [];
      this._sig = null;
      this._render();
    }, { type: "weather/subscribe_forecast", forecast_type: type, entity_id: weather })
      .then((unsub) => {
        if (this._fcKey === key) this._unsub = unsub;
        else unsub();
      })
      .catch(() => { this._fc = []; this._sig = null; this._render(); });
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const ent = detect(this._hass, c);
    this._subscribe(ent.weather);
    const w = this._st(ent.weather);
    const al = this._st(ent.alert);
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${w?.last_updated}|${al?.last_updated}|` +
      [ent.season, ent.moon, ent.zodiac].map((id) => this._st(id)?.state).join("|") + `|${JSON.stringify(this._fc)}|${new Date().getDate()}`;
    if (sig === this._sig) return;
    this._sig = sig;

    let body;
    if (!w) {
      body = `<div class="empty"><b>Aucune entité météo</b><span>Ajoutez une intégration météo (Météo-France, Met.no…) ou choisissez l'entité dans l'éditeur de la carte.</span></div>`;
    } else {
      body = this._header(w, al, ent) + this._now(w, ent) + (c.show_alert !== false ? this._alerts(al, ent) : "") +
        (c.show_forecast !== false ? this._forecast(w, ent) : "") + (c.show_sky !== false ? this._sky(ent) : "");
    }
    this.shadowRoot.innerHTML = `${STYLE}${METEO_STYLE}<ha-card class="${themeClass(c.theme, this._hass)}">${body}</ha-card>`;
  }

  /** Niveau de vigilance (0 à 3) et phénomènes actifs. */
  _vigilance(al) {
    if (!al || al.state === "unavailable" || al.state === "unknown") return null;
    const list = Object.entries(al.attributes || {})
      .map(([k, v]) => ({ name: k, level: levelOf(v) }))
      .filter((p) => p.level !== undefined)
      .sort((a, b) => b.level - a.level);
    const max = Math.max(levelOf(al.state) ?? 0, ...list.map((p) => p.level), 0);
    return { max, active: list.filter((p) => p.level > 0) };
  }

  _header(w, al, ent) {
    const c = this._config;
    const [label, icon, color] = condOf(w.state);
    const title = c.title || "Météo";
    const sub = label;
    const vg = this._vigilance(al);
    const pill = vg && c.show_alert !== false
      ? `<div class="pill" data-entity="${esc(ent.alert)}"><span class="dot" style="background:${LEVEL_COLOR[vg.max]}"></span><span class="pill-l">Vigilance</span><span class="pill-v">${LEVEL_LABEL[vg.max]}</span></div>`
      : "";
    return `<header>
      <div class="brand"><ha-icon class="b-ic" icon="${icon}" style="color:${color}"></ha-icon>
        <div><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div></div>
      ${pill}</header>`;
  }

  _now(w, ent) {
    const c = this._config;
    const a = w.attributes || {};
    const tu = a.temperature_unit || "°C";
    const t = num(a.temperature);
    const ws = num(a.wind_speed);
    // ressenti : celui de l'intégration, sinon le refroidissement éolien (formule JAG/TI, au-delà de 4,8 km/h et sous 10 °C)
    let fl = num(a.apparent_temperature ?? a.feels_like);
    if (fl === null && t !== null) fl = ws !== null && ws > 4.8 && t < 10 ? 13.12 + 0.6215 * t - 11.37 * ws ** 0.16 + 0.3965 * t * ws ** 0.16 : t;
    const [, icon, color] = condOf(w.state);
    const today = Array.isArray(this._fc) && this._fc.length && c.forecast_type !== "hourly" ? this._fc[0] : null;
    const hilo = today && num(today.temperature) !== null
      ? `<div class="n-hl"><span class="hi">↑ ${fmt(today.temperature)}°</span>${num(today.templow) !== null ? `<span class="lo">↓ ${fmt(today.templow)}°</span>` : ""}</div>` : "";
    const stats = c.show_stats === false ? "" : `<div class="stats">
      ${this._stat("mdi:thermometer", "Ressenti", fl === null ? "—" : `${fmt(fl)}°`)}
      ${this._stat("mdi:weather-windy", "Vent", ws === null ? "—" : `${fmt(ws)} <small>${esc(a.wind_speed_unit || "km/h")}</small>`,
        [compass(a.wind_bearing), num(a.wind_gust_speed) !== null ? `rafales ${fmt(a.wind_gust_speed)}` : null].filter(Boolean).join(" · "),
        num(a.wind_bearing) !== null ? `<ha-icon class="arrow" icon="mdi:navigation" style="transform:rotate(${(Number(a.wind_bearing) + 180) % 360}deg)"></ha-icon>` : "")}
      ${this._stat("mdi:water-percent", "Humidité", num(a.humidity) === null ? "—" : `${fmt(a.humidity)} <small>%</small>`)}
      ${this._stat("mdi:gauge", "Pression", num(a.pressure) === null ? "—" : `${fmt(a.pressure)} <small>${esc(a.pressure_unit || "hPa")}</small>`)}
    </div>`;
    return `<div class="now" data-entity="${esc(ent.weather)}">
      <ha-icon class="n-ic" icon="${icon}" style="color:${color}"></ha-icon>
      <div class="n-t">${t === null ? "—" : fmt(t, Math.abs(t) < 10 ? 1 : 0)}<span>${esc(tu)}</span></div>
      ${hilo}</div>${stats}`;
  }

  _stat(icon, label, value, note = "", extra = "") {
    return `<div class="stat"><div class="s-h"><ha-icon icon="${icon}"></ha-icon><span>${label}</span>${extra}</div>
      <div class="s-v">${value}</div>${note ? `<div class="s-n">${esc(note)}</div>` : ""}</div>`;
  }

  _alerts(al, ent) {
    const vg = this._vigilance(al);
    if (!vg) return "";
    if (!vg.active.length) {
      return `<div class="vig ok" data-entity="${esc(ent.alert)}"><ha-icon icon="mdi:shield-check-outline"></ha-icon><span>Pas de vigilance particulière</span></div>`;
    }
    return `<div class="vig" data-entity="${esc(ent.alert)}" style="--vc:${LEVEL_COLOR[vg.max]}">
      <div class="v-h"><ha-icon icon="mdi:alert-outline"></ha-icon><span>Vigilance ${LEVEL_LABEL[vg.max].toLowerCase()}</span></div>
      <div class="v-l">${vg.active.map((p) => `<span class="v-p" style="--pc:${LEVEL_COLOR[p.level]}"><ha-icon icon="${phenoIcon(p.name)}"></ha-icon>${esc(p.name)}<b>${LEVEL_LABEL[p.level]}</b></span>`).join("")}</div>
    </div>`;
  }

  _forecast(w, ent) {
    const c = this._config;
    const hourly = c.forecast_type === "hourly";
    let fc = Array.isArray(this._fc) ? this._fc : Array.isArray(w.attributes?.forecast) ? w.attributes.forecast : null;
    if (fc === null) return `<div class="fc-empty">Chargement des prévisions…</div>`;
    const n = Math.max(1, Math.min(hourly ? 12 : 7, Number(c.days) || 5));
    fc = fc.slice(0, n);
    if (!fc.length) return `<div class="fc-empty">Prévisions indisponibles pour ${esc(ent.weather)}.</div>`;
    // barre de température : position du min et du max du jour sur l'échelle de la période
    const his = fc.map((d) => num(d.temperature)).filter((v) => v !== null);
    const los = fc.map((d) => num(d.templow) ?? num(d.temperature)).filter((v) => v !== null);
    const gMin = Math.min(...los, ...his), gMax = Math.max(...los, ...his);
    const pct = (v) => (gMax > gMin ? ((v - gMin) / (gMax - gMin)) * 100 : 50);
    const days = fc.map((d, i) => {
      const dt = new Date(d.datetime);
      const name = hourly ? dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : i === 0 ? "Auj." : DAYS_FR[dt.getDay()];
      const [lab, icon, color] = condOf(d.condition);
      const hi = num(d.temperature), lo = num(d.templow);
      const rain = num(d.precipitation_probability);
      const bar = !hourly && hi !== null && lo !== null
        ? `<div class="f-bar"><span style="left:${pct(lo).toFixed(0)}%;right:${(100 - pct(hi)).toFixed(0)}%"></span></div>` : "";
      return `<div class="fc-d" title="${esc(lab)}"><div class="f-n">${esc(name)}</div>
        <ha-icon icon="${icon}" style="color:${color}"></ha-icon>
        <div class="f-hi">${hi === null ? "—" : `${fmt(hi)}°`}</div>${lo !== null ? `<div class="f-lo">${fmt(lo)}°</div>` : ""}${bar}
        ${rain !== null && rain > 0 ? `<div class="f-r"><ha-icon icon="mdi:water"></ha-icon>${fmt(rain)}%</div>` : `<div class="f-r"></div>`}</div>`;
    }).join("");
    return `<div class="sec">${hourly ? "Prochaines heures" : "Prévisions"}</div><div class="fc" data-entity="${esc(ent.weather)}">${days}</div>`;
  }

  _sky(ent) {
    const now = new Date();
    const south = Number(this._hass?.config?.latitude) < 0;
    const sRaw = String(this._st(ent.season)?.state || "").toLowerCase();
    const season = SEASON[sRaw] || SEASON[seasonOfDate(now, south)];
    const mRaw = String(this._st(ent.moon)?.state || "").toLowerCase().replace(/ /g, "_");
    const moon = MOON[mRaw] || MOON[moonOfDate(now)];
    const zRaw = String(this._st(ent.zodiac)?.state || "").toLowerCase();
    const tile = (id, icon, color, value, label) =>
      `<div class="sky-t"${id ? ` data-entity="${esc(id)}"` : ""}><ha-icon icon="${icon}" style="color:${color}"></ha-icon><div class="k-v">${esc(value)}</div><div class="k-l">${label}</div></div>`;
    return `<div class="sky">
      ${tile(SEASON[sRaw] ? ent.season : null, season[1], season[2], season[0], "Saison")}
      ${tile(MOON[mRaw] ? ent.moon : null, moon[1], "#d9e2f2", moon[0], "Lune")}
      ${ZODIAC[zRaw] ? tile(ent.zodiac, `mdi:zodiac-${zRaw}`, "#b38cf0", ZODIAC[zRaw], "Zodiaque") : ""}
    </div>`;
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
.sec { margin: 14px 18px 6px; font-size: .82rem; color: var(--med-muted); }
.fc { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(48px, 1fr); gap: 6px; margin: 0 12px; padding-bottom: 2px; cursor: pointer; overflow-x: auto; scrollbar-width: thin; }
.fc-d { text-align: center; padding: 8px 2px 7px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); min-width: 0; }
.f-n { font-size: .72rem; color: var(--med-muted); text-transform: capitalize; white-space: nowrap; }
.fc-d ha-icon { --mdc-icon-size: 26px; margin: 4px 0 2px; }
.f-hi { font-weight: 700; font-size: .95rem; }
.f-lo { font-size: .78rem; color: var(--med-muted); }
.f-bar { position: relative; height: 4px; margin: 5px 8px 0; border-radius: 2px; background: var(--med-line); }
.f-bar span { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: linear-gradient(90deg, var(--med-blue), var(--med-up)); }
.f-r { min-height: 1.1em; margin-top: 3px; font-size: .68rem; color: var(--med-blue); display: flex; align-items: center; justify-content: center; gap: 1px; }
.f-r ha-icon { --mdc-icon-size: 11px; margin: 0; }
.fc-empty { margin: 12px 12px 0; padding: 14px 0; text-align: center; font-size: .8rem; color: var(--med-muted); border: 1px dashed var(--med-line); border-radius: 12px; }
.sky { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; margin: 10px 12px 0; }
.sky-t { text-align: center; padding: 8px 4px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); min-width: 0; }
.sky-t[data-entity] { cursor: pointer; }
.sky-t ha-icon { --mdc-icon-size: 22px; }
.k-v { font-size: .8rem; font-weight: 600; margin-top: 3px; overflow-wrap: anywhere; }
.k-l { font-size: .66rem; color: var(--med-muted); text-transform: uppercase; letter-spacing: .6px; margin-top: 1px; }
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

const SCHEMA = [
  { name: "entity", selector: { entity: { domain: "weather" } } },
  { name: "title", selector: { text: {} } },
  { name: "alert", selector: { entity: { domain: "sensor" } } },
  { name: "forecast_type", selector: { select: { mode: "dropdown", options: [
    { value: "daily", label: "Par jour" }, { value: "hourly", label: "Par heure" }, { value: "twice_daily", label: "Jour et nuit" }] } } },
  { name: "days", selector: { number: { min: 1, max: 12, step: 1, mode: "box" } } },
  { name: "season", selector: { entity: { domain: "sensor" } } },
  { name: "moon", selector: { entity: { domain: "sensor" } } },
  { name: "zodiac", selector: { entity: { domain: "sensor" } } },
  { name: "show_stats", selector: { boolean: {} } },
  { name: "show_alert", selector: { boolean: {} } },
  { name: "show_forecast", selector: { boolean: {} } },
  { name: "show_sky", selector: { boolean: {} } },
  THEME_SELECT,
];
const LABELS = {
  entity: "Entité météo (vide = Météo-France, sinon la première trouvée)",
  title: "Titre (Météo par défaut)",
  alert: "Vigilance Météo-France (vide = détectée)",
  forecast_type: "Prévisions",
  days: "Nombre de jours (ou d'heures) affichés",
  season: "Saison (vide = détectée, sinon calculée d'après la date)",
  moon: "Phase de lune (vide = détectée, sinon calculée)",
  zodiac: "Signe du zodiaque (vide = détecté)",
  show_stats: "Ressenti, vent, humidité et pression",
  show_alert: "Vigilance",
  show_forecast: "Prévisions",
  show_sky: "Saison, lune et zodiaque",
  theme: "Couleurs de la carte",
};

class MeteoCardEditor extends HTMLElement {
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
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const v = { ...ev.detail.value };
        for (const k of ["entity", "alert", "season", "moon", "zodiac", "title"]) if (v[k] === "" || v[k] === undefined) delete v[k];
        this._config = v;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = SCHEMA;
    this._form.data = { ...DEFAULTS, ...this._config };
  }
}

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("meteo-card", MeteoCard);
  define("meteo-card-editor", MeteoCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "meteo-card")) {
    window.customCards.push({
      type: "meteo-card",
      name: "Carte Météo",
      description: "Météo du jour : conditions, ressenti, vent, vigilance Météo-France, prévisions, saison, lune et zodiaque.",
      preview: true,
    });
  }
  console.info(`%c METEO-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}
})();
