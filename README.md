# Carte Météo

Cartes Lovelace pour Home Assistant, **en français**, toutes dans un seul fichier :

| Carte | Type | Ce qu'elle affiche |
| --- | --- | --- |
| **Météo** | `custom:meteo-card` | La météo du jour, une ou plusieurs villes en onglets : conditions, ressenti, vent, humidité, pression, détails et **vigilance Météo-France**, **prévisions par heure et par jour**, saison, lune et zodiaque |
| **Vent et ciel** | `custom:meteo-ciel-card` | **Baromètre**, **boussole du vent**, températures de vos capteurs, **pluie du jour**, **indice UV** et carte **Windy** |
| **Soleil et lune** | `custom:meteo-astro-card` | **Course du soleil** (boussole, aube, lever, midi, coucher, crépuscule, durée du jour), **lune** (lever, coucher, éclairement, fenêtre des phases), cycles et **pollens** |

Elles fonctionnent avec **toute entité météo** (Météo-France, Met.no, OpenWeatherMap…) et trouvent leurs entités toutes seules. Le soleil et la lune sont **calculés d'après les coordonnées de Home Assistant** : aucun capteur ni image à fournir.

*Basées sur les idées et la vue météo partagées par [@WarC0zes](https://forum.hacf.fr/u/warc0zes/summary) sur le forum HACF : merci à lui !*

Elles ont le même style que la [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) et les [Cartes Linky Énergie](https://github.com/Marlboro62/linky-energie-cards), mais elles sont **indépendantes**.

🎮 **[Essayer la démo en ligne](https://marlboro62.github.io/meteo-card/docs/demo.html)** : les vraies cartes avec des données simulées, sans installer Home Assistant.

| Météo, deux villes en onglets | Vent et ciel | Soleil et lune |
| --- | --- | --- |
| ![Météo](images/meteo-sombre.png) | ![Vent et ciel](images/meteo-ciel.png) | ![Soleil et lune](images/meteo-astro.png) |

| Phases de la lune (clic sur la lune) | Version claire | Téléphone |
| --- | --- | --- |
| ![Phases de la lune](images/meteo-phases.png) | ![Clair](images/meteo-clair.png) | ![Téléphone](images/meteo-telephone.png) |

*Aperçus avec des villes et des données fictives.*

## Remplacer une vue météo « à rallonge »

Une vue météo classique empile une quinzaine de cartes HACS : stack-in-card, tabbed-card, card-mod, meteofrance-weather-card, compass-card, tempometer-gauge-card, rain-gauge-card, uv-index-card, sun-card, button-card, bar-card, auto-entities, popup-card…

Ces trois cartes font la même chose avec **une seule ressource**, sans CSS à maintenir ni image de phases de lune à positionner à la main. La vue complète est prête dans [`exemples/vue-meteo.yaml`](exemples/vue-meteo.yaml).

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu **⋮** → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/meteo-card` avec le type **Tableau de bord** (Dashboard).
3. Cherchez **Carte Météo**, installez-la, puis rechargez la page (Ctrl+F5).

Les trois cartes apparaissent ensuite dans la liste des cartes, chacune avec son éditeur visuel.

### Manuellement

1. Téléchargez [`meteo-card.js`](https://raw.githubusercontent.com/Marlboro62/meteo-card/main/meteo-card.js) (clic droit → Enregistrer sous) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource** :
   - URL : `/local/meteo-card.js`
   - Type : **Module JavaScript**
3. Rechargez la page (Ctrl+F5).

## Carte Météo

```yaml
type: custom:meteo-card
```

- **En-tête** : icône du temps, ville, conditions en français et une **pastille de vigilance** (vert, jaune, orange, rouge).
- **Maintenant** : température en grand, minimale et maximale du jour.
- **Ressenti, vent, humidité, pression** : le vent avec sa direction (N, NE, E…), une flèche et les rafales. Sans ressenti fourni, la carte le calcule.
- **Détails Météo-France** : nuages, risque de pluie, de gel, de neige, indice UV et heure de la prochaine pluie, lus dans les capteurs Météo-France de la ville.
- **Vigilance Météo-France** : chaque phénomène actif avec son icône et sa couleur.
- **Prévisions** : par heure (température, pluie en mm, vent), par jour (barre de température sur la semaine, pluie) ou jour et nuit, **l'une sous l'autre** si vous le souhaitez.
- **Plusieurs villes** : des onglets en haut de la carte ; la carte retient l'onglet choisi.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `entity` | Entité météo (`weather.…`) | Météo-France, sinon la première trouvée |
| `entities` | Plusieurs villes en onglets : `weather.…`, ou `{ entity, name, alert }` | — |
| `title` | Titre (une seule ville) | `Météo` |
| `alert` | Capteur de vigilance Météo-France (`sensor.…_weather_alert`) | détecté |
| `forecasts` | Liste parmi `hourly`, `daily`, `twice_daily`, affichées l'une sous l'autre | `[daily]` |
| `hours` | Nombre d'heures (avec plusieurs prévisions) | `8` |
| `days` | Nombre de jours | `5` |
| `season`, `moon`, `zodiac` | Capteurs de saison, phase de lune, zodiaque | détectés, sinon calculés |
| `show_stats`, `show_details`, `show_alert`, `show_forecast`, `show_sky` | Afficher chaque partie | `true` |
| `theme` | `v2` (bleu nuit MyElectricalData), `auto` (clair ou sombre selon HA), `ha` (thème Home Assistant) | `v2` |

> L'ancienne option `forecast_type` (une seule prévision) reste acceptée. Avec plusieurs villes, la vigilance détectée va à la première ; indiquez `alert` pour les autres.

## Carte Vent et ciel

```yaml
type: custom:meteo-ciel-card
temperatures:
  - name: Salon
    entity: sensor.salon_temperature
    humidity: sensor.salon_humidity
windy: true
```

- **Baromètre** de 960 à 1060 hPa avec ses zones : tempête, pluie, variable, beau temps, très sec.
- **Boussole du vent** : flèche tournée vers le centre (le vent vient de là), vitesse, direction et rafales ; une image peut remplir le cadran (par exemple une vue du dessus de votre maison).
- **Températures** : autant de capteurs que vous voulez (intérieur, extérieur, avant, arrière…), avec leur humidité.
- **Pluie du jour** : une goutte qui se remplit jusqu'à `rain_max`.
- **Indice UV** sur une échelle colorée, avec le risque (faible à extrême).
- **Carte Windy** (facultative) centrée sur les coordonnées de Home Assistant : vent, pluie, température, nuages, radar ou pression.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `entity` | Entité météo | Météo-France, sinon la première trouvée |
| `title` | Titre | `Vent et ciel` |
| `pressure`, `wind_speed`, `wind_bearing`, `rain`, `uv` | Capteurs à utiliser à la place de ceux détectés | capteurs Météo-France, sinon entité météo |
| `temperatures` | Liste de `{ name, entity, humidity, icon }` | — |
| `compass_image` | Image au centre de la boussole (ex. `/local/images/maison.png`) | — |
| `pressure_min`, `pressure_max` | Échelle du baromètre (hPa) | `960`, `1060` |
| `rain_max` | Pluie du jour pour une goutte pleine (mm) | `30` |
| `windy` | Afficher la carte Windy | `false` |
| `windy_overlay` | `wind`, `rain`, `temp`, `clouds`, `radar`, `pressure` | `wind` |
| `windy_zoom` | Zoom de la carte Windy | `8` |
| `latitude`, `longitude` | Centre de la carte Windy | coordonnées de Home Assistant |
| `show_barometer`, `show_wind`, `show_temperatures`, `show_rain`, `show_uv` | Afficher chaque partie | `true` |
| `theme` | Couleurs de la carte | `v2` |

## Carte Soleil et lune

```yaml
type: custom:meteo-astro-card
```

- **Soleil** : boussole avec la position du soleil et de la lune, élévation, **courbe de la journée** avec la position actuelle, aube, lever, midi solaire, coucher, crépuscule, durée du jour (et son évolution depuis la veille).
- **Lune** : phase dessinée, lever, coucher, éclairement, azimut et élévation.
- **Cycles** : lune, soleil (au-dessus ou sous l'horizon), saison et zodiaque.
- **Phases de la lune** : un clic sur la lune ouvre une fenêtre avec les huit phases autour de la Terre, la phase du jour entourée, l'âge de la lune et les dates de la prochaine pleine lune et de la prochaine nouvelle lune.
- **Pollens** : niveau du département, barre de risque et une tuile par plante en circulation, avec les intégrations [Pollens](https://github.com/chris60600/pollens-home-assistant) ou Pollen Information (détectées, noms des plantes en français) ou vos propres capteurs.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `title` | Titre | `Soleil et lune` |
| `moon`, `season`, `zodiac` | Capteurs de phase de lune, saison, zodiaque | détectés, sinon calculés |
| `pollens` | Capteur principal : `sensor.pollens_xx` (Pollens) ou `sensor.polleninformation_…_allergy_risk` (Pollen Information) | détecté |
| `pollen_entities` | Liste de capteurs de pollens à afficher à la place | — |
| `show_all_pollens` | Afficher aussi les pollens à « nul » | `false` |
| `compass_image` | Image au centre de la boussole | — |
| `latitude`, `longitude` | Lieu des calculs | coordonnées de Home Assistant |
| `show_sun`, `show_moon`, `show_cycles`, `show_pollens` | Afficher chaque partie | `true` |
| `theme` | Couleurs de la carte | `v2` |

Les heures et positions du soleil et de la lune sont calculées dans le navigateur (formules de [SunCalc](https://github.com/mourner/suncalc)), à la minute près.

## Support

Questions et problèmes : uniquement via les [issues GitHub](https://github.com/Marlboro62/meteo-card/issues).

## Voir aussi

- [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) · [Cartes Linky Énergie](https://github.com/Marlboro62/linky-energie-cards) · [Carte Prix Carburant](https://github.com/Marlboro62/prix-carburant-card)

Si la carte vous est utile : [Buy Me a Coffee](https://buymeacoffee.com/marlboro62) · [Ko-fi](https://ko-fi.com/nothing_one)

## Licence

MIT. Idées et vue météo d'origine : [@WarC0zes](https://forum.hacf.fr/u/warc0zes/summary) (forum HACF). Calculs du soleil et de la lune d'après SunCalc (Vladimir Agafonkin, licence BSD-2).
