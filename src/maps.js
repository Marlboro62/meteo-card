// Bibliothèques des cartes interactives (Séismes, Feux de forêt, Crues et rivières, Bolides), livrées
// avec la carte dans dist/meteo-card-maps.js : aucun script ni style chargé depuis un CDN.
// Ce fichier n'est chargé qu'à l'affichage de la première carte (import() depuis meteo-card.js).
import L from "leaflet";
import * as maplibregl from "maplibre-gl";
// extension Leaflet de MapLibre (fonds vectoriels) : ajoute L.maplibreGL à la même instance de Leaflet
import "@maplibre/maplibre-gl-leaflet";
import leafletCss from "leaflet/dist/leaflet.css";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 fait ses calculs dans un worker livré à part : dist/meteo-card-maps-worker.js, à côté de ce fichier
// (extension .js : servie partout avec le bon type, ce qui n'est pas toujours le cas de .mjs)
maplibregl.setWorkerUrl(new URL("./meteo-card-maps-worker.js", import.meta.url).href);

export { L, maplibregl, leafletCss, maplibreCss };
