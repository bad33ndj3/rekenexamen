# Handoff - rekenleerapp

Laatste update: 2026-09-16 18:43 Europe/Amsterdam

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
3. Nog toevoegen aan tests: gedeeltelijke oude nulmeting (1/9) blijft onvoltooid en target 4 kiest aantoonbaar `DIAG4-*` plus `*-N4-001`.
4. `visualFor()` rendert vaste visuals/tabellen voor K2/K3/K6/K13 en R5/R6/R7/R9/R10. Render de overige `visual` descriptors uit `level4.json`, met name K4/K7/K11/K12 en R11-R15.
5. Maak proefexamens echte sessies: 30 vragen per A/B, voortgang, 90-minutenrichttijd, uitslag na einde, totaal >=80% en ieder domein >=70%. Antwoorden tonen nu terecht geen directe uitslag en wijzigen mastery niet, maar sessiescore/timer ontbreekt nog.
6. Mastery uit `LEERPLAN.md` is nog niet volledig: vereist uiteindelijk 5 nieuwe vragen, zelfstandig meerstapsbewijs, +3 dagen en +14 dagen. Huidige 3 basisvragen plus 1 niveau-4-vraag per doel ondersteunen `toetsklaar`, nog niet definitief `beheerst`.
7. R7 niveau 3 is tekstueel nog algemeen; level 4 is expliciet parallel aan een zijvlak.

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
