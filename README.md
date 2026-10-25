# Carte Météo

Carte Lovelace pour Home Assistant qui affiche **la météo du jour** : conditions et température, ressenti, vent (direction et rafales), humidité, pression, **vigilance Météo-France**, **prévisions** des prochains jours ou des prochaines heures, et **saison, phase de lune et zodiaque**.

Elle fonctionne avec **toute entité météo** (Météo-France, Met.no, OpenWeatherMap…) et trouve ses entités toute seule. Les prévisions sont lues comme le fait Home Assistant : aucun capteur intermédiaire à créer.

Elle a le même style que la [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) et les [Cartes Linky Énergie](https://github.com/Marlboro62/linky-energie-cards), mais elle est **indépendante** : type `custom:meteo-card`, ressource à part.

🎮 **[Essayer la démo en ligne](https://marlboro62.github.io/meteo-card/docs/demo.html)** : la vraie carte avec des données simulées, sans installer Home Assistant.

| Bleu nuit, vigilance jaune | Clair, beau temps | Téléphone, prévisions par heure |
| --- | --- | --- |
| ![Bleu nuit](images/meteo-sombre.png) | ![Clair](images/meteo-clair.png) | ![Téléphone](images/meteo-telephone.png) |

*Aperçus avec une ville et des données fictives.*

## Ce que la carte affiche

- **En-tête** : icône du temps, titre, conditions en français et une **pastille de vigilance** (vert, jaune, orange, rouge).
- **Maintenant** : température en grand, minimale et maximale du jour.
- **Ressenti, vent, humidité, pression** : le vent avec sa direction (N, NE, E…), une flèche dans le sens où il souffle et les rafales. Sans ressenti fourni par l'intégration, la carte le calcule (refroidissement éolien).
- **Vigilance Météo-France** : chaque phénomène actif avec son icône et sa couleur (vent violent, pluie-inondation, orages, neige-verglas, canicule, grand froid…), ou « Pas de vigilance particulière ».
- **Prévisions** : par jour (avec une barre de température sur la semaine) ou par heure, avec la probabilité de pluie.
- **Saison, lune et zodiaque** : depuis vos capteurs, sinon la saison et la phase de lune sont calculées d'après la date.

Un appui sur une zone ouvre la fiche de l'entité correspondante.

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu **⋮** → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/meteo-card` avec le type **Tableau de bord** (Dashboard).
3. Cherchez **Carte Météo**, installez-la, puis rechargez la page (Ctrl+F5).

### Manuellement

1. Téléchargez [`meteo-card.js`](https://raw.githubusercontent.com/Marlboro62/meteo-card/main/meteo-card.js) (clic droit → Enregistrer sous) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource** :
   - URL : `/local/meteo-card.js`
   - Type : **Module JavaScript**
3. Rechargez la page (Ctrl+F5).

## Configuration

Rien d'obligatoire :

```yaml
type: custom:meteo-card
```

| Option | Rôle | Défaut |
| --- | --- | --- |
| `entity` | Entité météo (`weather.…`) | Météo-France, sinon la première trouvée |
| `title` | Titre | `Météo` |
| `alert` | Capteur de vigilance Météo-France (`sensor.…_weather_alert`) | détecté |
| `forecast_type` | `daily` (par jour), `hourly` (par heure) ou `twice_daily` (jour et nuit) | `daily` |
| `days` | Nombre de jours (ou d'heures) affichés | `5` |
| `season` | Capteur de saison (intégration **Saison**) | détecté, sinon calculé |
| `moon` | Capteur de phase de lune (intégration **Lune**) | détecté, sinon calculé |
| `zodiac` | Capteur du signe du zodiaque (intégration **Zodiaque**) | détecté |
| `show_stats`, `show_alert`, `show_forecast`, `show_sky` | Afficher chaque partie | `true` |
| `theme` | `v2` (bleu nuit MyElectricalData), `auto` (clair ou sombre selon HA), `ha` (thème Home Assistant) | `v2` |

Un exemple complet est dans [`exemples/carte-meteo.yaml`](exemples/carte-meteo.yaml).

> Les noms d'options de la carte « Météo Glossy » (`weather_alert`, `saison`, `moon_phase`, `zodiac`) sont aussi acceptés. Pour la météo, indiquez une entité `weather.…` dans `entity` : les capteurs `sensor.weather_hourly` / `sensor.weather_daily` ne sont plus nécessaires.

## Support

Questions et problèmes : uniquement via les [issues GitHub](https://github.com/Marlboro62/meteo-card/issues).

## Voir aussi

- [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) · [Cartes Linky Énergie](https://github.com/Marlboro62/linky-energie-cards) · [Carte Prix Carburant](https://github.com/Marlboro62/prix-carburant-card)

Si la carte vous est utile : [Buy Me a Coffee](https://buymeacoffee.com/marlboro62) · [Ko-fi](https://ko-fi.com/nothing_one)

## Licence

MIT. Inspirée de la carte « Météo Glossy » (glossy-weather-card).
