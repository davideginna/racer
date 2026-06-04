# Racer — clone del Chrome Experiment (2013)

Gara multiplayer multi-device ispirata a **Racer: A Chrome Experiment** (Google, 2013).
Ogni giocatore è una **scia colorata** (max 5: blu, rosso, verde, giallo, bianco) su un
circuito condiviso. Sync via Firebase Realtime Database, niente server da gestire.

Demo per un talk/workshop universitario.

## Stack

- **Frontend:** vanilla JS + Canvas (ES modules, nessun build step)
- **Sync real-time:** Firebase Realtime Database + Anonymous Auth
- **Client-side prediction:** auto locale autoritativa, auto remote interpolate
- **PWA:** installabile, app shell offline
- **Deploy:** GitHub Pages via GitHub Actions

## Avvio locale

```bash
python3 -m http.server 8000
# apri http://localhost:8000
```

Serve un progetto Firebase (Realtime DB in `europe-west1` + Anonymous auth abilitata).
Config in `js/firebase-config.js`. Regole DB: lettura/scrittura su `rooms` con `auth != null`.

## Test

```bash
node --test tests/
```

## Fonti / riferimenti

Sul gioco originale "Racer: A Chrome Experiment":

- Racer su Experiments with Google — https://experiments.withgoogle.com/racer
- Annuncio sul Google Chrome Blog (2013) — https://chrome.googleblog.com/2013/05/roll-across-platforms-and-race-across.html
- Case study di Stewart Smith (sviluppatore del progetto) — https://stewartsmith.io/work/racer
- Pagina della colonna sonora di Giorgio Moroder — https://www.giorgiomoroder.com/music/giorgio-moroder-google-chrome-racer/
- Chrome Experiments su Wikipedia — https://en.wikipedia.org/wiki/Chrome_experiment
