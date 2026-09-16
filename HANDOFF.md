# Handoff - rekenleerapp

Laatste update: 2026-09-16 20:00 Europe/Amsterdam — AFGEROND: alle punten 1–7 klaar, `task test` groen, slot-browsercheck 5/5 groen.

## Voortgang deze sessie (git `main`: 7315b33 → e0e3e83 → 18de3ed → f1d9a8d)

- Git repo geïnitialiseerd; `.playwright-cli/` genegeerd.
- Punt 3 klaar (`e0e3e83`): 1/9-nulmeting blijft onvoltooid, target 4 kiest `DIAG4-*` + `*-N4-001` — alleen testbestanden, `task test` groen.
- Punt 4 klaar (`18de3ed`): `visualFor()` rendert generiek alle 18 `visual`-descriptors (K4/K7/K11/K12, R11–R15); bestaande vaste visuals behouden; 320px-veilig.
- Punt 5 klaar (`f1d9a8d`): proefexamens A/B als echte sessies — 2×30 (6/domein G→R→V→P→K), hervatbaar in localStorage, optellende 90:00-richttijd zonder lockout, `Vraag i van 30` + 5×6-strip, inleveren pas op vraag 30, uitslag `totaal ≥80% + elk domein ≥70%` (praktisch ≥5/6). EX-vraagbank hergebruikt (60 afgeschermde vragen blijven bekend tekort).
- Browsertest 19:20 groen (5/5, 0 console-fouten, geen favicon-404): K10-importflow intact, gate correct dicht bij import, volledige examenflow vanuit examenklare seed, K4-chart zonder overflow op 390px. Screenshot: `.playwright-cli/page-2026-09-16T17-19-28-458Z.png`. Twee nuances genoteerd (zie hieronder).

## Doel

Mobile-first lokale leerapp die een volwassene met weggezakte vmbo-rekenbasis naar mbo-rekenniveau 3 of 4 begeleidt. De app moet onderwijzen, niet alleen toetsen, alle 58 doelen dekken, lokaal opslaan en de aangeleverde voortgang kunnen hervatten.

## Belangrijkste gebruikersbestand

`/Users/casper.spruit@energyzero.nl/Downloads/rekenen-voortgang.json`

Dit is schema v1, target level 4, oude nulmeting afgerond, laatste fout K10 (gemiddelde: antwoord 24 in plaats van 8). Correct gedrag na import: direct `K10-guided` als herstelles tonen.

## Gebouwd

- `curriculum.json`: 58 doelen, 174 originele Nederlandse vragen, uitleg, voorbeeld en prerequisites.
- `level4.json`: 58 aparte complexere niveau-4-vragen; 18 hebben visual descriptors.
- `core.mjs`: import/migratie, scoring en activity planner.
- `app.js`: intake, 40 vragen per niveau voor nulmeting, leren/herstel/hertoets, voortgang, begeleider, JSON/CSV import/export en lokale drafts.
- `styles.css`: mobile-first, 320px-veilige navigatie, sticky acties, tabellen/figuren.
- `test-core.mjs`, `test-data.mjs`, `test-integration.mjs`.

## Reeds browser-getest

Met Playwright session `rekenen` op 390x844:

- echte gebruikers-JSON importeert;
- Vandaag toont `Herstel één denkstap`, K10;
- K10-les toont uitleg en uitgewerkt voorbeeld;
- invoer `6` blijft na reload staan;
- goed antwoord geeft uitleg en Volgende opent tweede K10-vraag;
- Voortgang toont alle 58 doelen;
- Begeleider toont pogingen;
- JSON en CSV downloaden en zijn leesbaar.

Screenshot: `.playwright-cli/page-2026-09-16T16-19-33-480Z.png`.

## Recent gereviewde en verwerkte fixes

- domein B toegestaan bij herimport;
- imported objective/domain/kind komen canoniek uit question ID;
- oude nulmeting geldt alleen voltooid bij alle 9 oude vragen;
- latest failed objective bepaalt herstel; uitgeputte foute oefening wordt herhaald in plaats van vals 'afgerond';
- examenantwoord wijzigt mastery niet en toont geen directe uitslag;
- status na review heet `toetsklaar`, niet vals `beheerst`;
- CSV-cellen met `= + - @` worden geneutraliseerd;
- basis-SVG/tabellen toegevoegd voor R5/R6/R7/R9/R10 en K2/K3/K6/K13;
- echte niveau-4-vragen toegevoegd en niveau-afhankelijke nulmeting voorbereid.

## Nu eerst doen

1. Alle snelle tests zijn nu groen:

   ```sh
   node --check app.js
   node test-data.mjs
   node test-core.mjs
   node test-integration.mjs
   ```

   Laatste resultaat: `task test` volledig geslaagd om 18:43.

2. Browsertest na de eerste integratie was groen voor import K10, uitleg, reload-opslag, feedback, vervolgvraag, 58-doelenpagina en JSON/CSV. Na de laatste niveau-4-cataloguswijziging is een reload groen gecontroleerd; herimport exact bestand is via `test-integration.mjs` groen.
3. ✅ Klaar (`e0e3e83`): gedeeltelijke oude nulmeting (1/9) blijft onvoltooid en target 4 kiest aantoonbaar `DIAG4-*` plus `*-N4-001`.
4. ✅ Klaar (`18de3ed`): alle 18 `visual` descriptors uit `level4.json` renderen generiek (incl. K4/K7/K11/K12 en R11-R15); vaste fallbacks K2/K3/K6/K13 en R5/R6/R7/R9/R10 behouden.
5. ✅ Klaar (`f1d9a8d`, browser-geverifieerd 19:20): proefexamens zijn echte A/B-sessies (30 vragen, voortgang, 90-minutenrichttijd, uitslag na inleveren, totaal >=80% en ieder domein >=70%). Twee kleine nuances open: (a) gate-dicht = afwezigheid van A/B-kaarten i.p.v. zichtbare vergrendelde kaarten; (b) examen-`feedback` persisteert niet over reload (`feedback:null` bij import) — na reload opnieuw "Sla antwoord op" i.p.v. "Volgende", her-beantwoorden is idempotent maar telt elapsed dubbel. B-inleveren end-to-end viel buiten de browserchecks.
6. Mastery uit `LEERPLAN.md` is nog niet volledig: vereist uiteindelijk 5 nieuwe vragen, zelfstandig meerstapsbewijs, +3 dagen en +14 dagen. Huidige 3 basisvragen plus 1 niveau-4-vraag per doel ondersteunen `toetsklaar`, nog niet definitief `beheerst`. Advies ligt klaar: `toetsklaar` bevriezen, bankgroei +2/doel (`review2` + `multistep`), `review_stage` +3d/+14d, begeleider-review 0–4; geen `scoreAnswer`-magie.
7. ✅ Klaar: R7 niveau 3 `R7-independent` gepreciseerd naar diagonale verticale snede (rechthoek, breder dan zijvlak) — distinct van niveau 4 (vlak evenwijdig aan zijvlak → vierkant).
8. ✅ Klaar (`b08255e`, browser 6/6 groen op 390px): rekenmachine-tool tijdens proefexamens — inschuifpaneel van rechts (`#calc-panel`, max 340px), knop in sticky actiebalk, rekenvolgorde (3+4×2=11), komma-notatie, %, ±, C, ⌫, toetsenbordsteun, nette `Delen door nul kan niet`, `role=dialog` + `aria-live`, `prefers-reduced-motion`, raakt attempts/mastery/timer niet. Bekend gedrag: open paneel bedekt op 390px de antwoordknoppen (eerst sluiten, dan antwoorden).
- Testnotitie: app bewaart bij `visibilitychange:hidden` in-memory state over localStorage; handmatige localStorage-seeds vooraf dempen vóór herlaad (import-UI heeft hier geen last van).

## Starten en browsertesten

Voorkeurscommando's:

```sh
task --list
task serve
task test
task browser
task browser:mobile
```

Server draait mogelijk nog op poort 8000:

```sh
python3 -m http.server 8000
```

Playwright wrapper:

```sh
/Users/casper.spruit@energyzero.nl/.codex/skills/playwright/scripts/playwright_cli.sh --session rekenen open http://127.0.0.1:8000
```

Gebruik `snapshot`, klik via verse refs, `resize 390 844` en controleer console. De oude favicon-404 is opgelost met een data-favicon.

## Grenzen

- Geen boektekst gekopieerd; inhoud is origineel en gebaseerd op openbare wettelijke domeinen plus het openbare proefkatern.
- Exacte boekhoofdstukmapping blijft alleen bevestigd voor Wonen taak 3.
- Noem de app pas 'klaar' nadat bovenstaande P0-tests en browserflow groen zijn.
