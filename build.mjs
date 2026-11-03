// Construction de dist/ :
// - dist/meteo-card.js : la carte (src/meteo-card.js), sans dépendance ;
// - dist/meteo-card-maps.js : Leaflet, MapLibre GL, l'extension maplibre-gl-leaflet et leurs feuilles de style,
//   chargé par la carte seulement quand une carte interactive s'affiche.
// Les bibliothèques sont reprises telles que publiées sur npm (versions fixées dans package.json).
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

mkdirSync("dist", { recursive: true });
copyFileSync("src/meteo-card.js", "dist/meteo-card.js");
// icônes météo animées (amCharts, CC BY 4.0), servies à côté de la carte : aucun appel à un CDN
mkdirSync("dist/icons", { recursive: true });
for (const f of readdirSync("icons")) copyFileSync(`icons/${f}`, `dist/icons/${f}`);

await build({
  entryPoints: ["src/maps.js"],
  outfile: "dist/meteo-card-maps.js",
  bundle: true,
  format: "esm",
  target: "es2020",
  // les fichiers dist de Leaflet et MapLibre sont déjà minifiés ; MapLibre crée son worker à partir de son
  // propre code : il ne doit pas être retransformé
  minify: false,
  // « leaflet » seul (carte et extension MapLibre) : le fichier minifié publié, une seule instance
  plugins: [{
    name: "leaflet-dist",
    setup(b) {
      b.onResolve({ filter: /^leaflet$/ }, () => ({ path: require.resolve("leaflet/dist/leaflet.js") }));
    },
  }],
  loader: { ".css": "text" },
  legalComments: "inline",
  banner: { js: "/* Carte Météo : Leaflet (BSD-2-Clause), MapLibre GL JS (BSD-3-Clause), maplibre-gl-leaflet (ISC). Licences dans les commentaires ci-dessous. */" },
});
console.log("dist/ construit");
