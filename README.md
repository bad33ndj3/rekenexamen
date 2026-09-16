# Rekenen leren

Mobile-first leerapp voor `Startrekenen MBO niveau 3-4`.

## Starten

```sh
task serve
```

Open daarna <http://localhost:8000>.

## Controleren

```sh
task test
```

Gebruik `task --list` voor de afzonderlijke data-, core-, integratie- en browsercommando's.

De huidige verticale slice bevat intake, een verkorte nulmeting, directe feedback, lokale voortgang en een begeleider-view. De volledige vraagbank wordt daarna gevuld volgens `APP-SPEC.md`.

## Online zetten (GitHub Pages)

De app is plain HTML/JS zonder build-stap en werkt onder elk subpad.

1. Maak een nieuwe public repo aan en push `main` erheen.
2. Zet Pages aan: repo → **Settings → Pages → Source: "GitHub Actions"**.
3. Na de eerste groene workflow-run is de app live op `https://<user>.github.io/<repo>/`.

De workflow staat in `.github/workflows/pages.yml` en deployt de repo-root bij elke push naar `main`.
