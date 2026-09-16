# Minimale appspecificatie

## Wat de app moet doen

De app is een persoonlijke leercoach rond `LEERPLAN.md`, geen digitale kopie van het boek.

## Gebruiker en eindresultaat

Ontwerp voor één volwassene die ongeveer tien jaar geleden vmbo-rekenen heeft gehad, veel basiskennis is vergeten en uiteindelijk een mbo-rekentoets op niveau 3 of 4 moet halen.

De app mag niets veronderstellen behalve Nederlands kunnen lezen en een telefoon kunnen bedienen. Begrippen als `omtrek`, `procentpunt`, `mediaan`, `straal`, `schaal` en `verhouding` worden eerst in gewone taal uitgelegd voordat ze worden gebruikt.

Het eindresultaat is bereikt wanneer zij:

1. de noodzakelijke basisvaardigheden opnieuw beheerst;
2. alle vijf officiële rekendomeinen op haar doelniveau zelfstandig kan toepassen;
3. twee volledige proefexamens volgens de criteria uit `LEERPLAN.md` haalt.

De app optimaliseert voor **slagen voor de toets**, niet voor zo snel mogelijk alle schermen doorlopen.

### Kernflow

1. Kies eindniveau 3 of 4.
2. Leg bij intake de inhoudsopgave en taaknamen van het eigen boek vast.
3. Koppel elke boektaak aan de leerdoelcodes uit `LEERPLAN.md`.
4. Neem per domein een korte nulmeting af.
5. Toon steeds precies één volgende activiteit: leren, oefenen, exitbewijs of hertoets.
6. Plan hertoetsen automatisch na 2–3 dagen en 2–3 weken.
7. Toon beheersing per leerdoel en domein; geen streaks of generieke XP.
8. Sluit af met twee integrale proefexamens.

De app kan alvast één gecontroleerde mapping meeleveren: `Wonen > Taak 3 > 3.1-3.4`, zoals vastgelegd onder "Bevestigde boekmapping" in `LEERPLAN.md`. Alle overige boekmapping blijft leeg totdat die uit het eigen exemplaar of een officiële handleiding is bevestigd.

## Vaste MVP-keuzes

### 1. Vraagbank

- Start met **8 vragen per leerdoel**: 5 oefenvragen in minstens twee contexten, 1 zelfstandige toetsvraag en 2 verschillende uitgestelde hertoetsvragen.
- Met de 58 leerdoelen uit `LEERPLAN.md` zijn dat maximaal **464 hardcoded JSON-vragen**, plus 60 afgeschermde proefexamenvragen. Een vraag mag meerdere doelen raken, maar heeft precies één primair doel en telt alleen daarvoor als beheersingsbewijs.
- Vragen staan in één lokaal JSON-bestand. Geen CMS en geen automatische vraaggeneratie in V1.
- Toets- en hertoetsvragen gebruiken andere contexten en andere getallen dan de oefenvragen.
- Niet iedere leerling hoeft alle 464 vragen te maken: de nulmeting en voortgang bepalen wat zij kan overslaan.

### 2. Nulmeting

- **8 vragen per domein**, dus 40 vragen totaal.
- Richttijd: **45 minuten**; geen harde tijdslimiet, wel tijd registreren.
- Per domein: 4 korte vragen, 3 contextvragen en 1 meerstapsvraag.
- Geen hints of directe feedback tijdens de nulmeting. Na afloop toont de app alleen welke leerdoelen eerst aandacht krijgen.
- De nulmeting kan worden gepauzeerd tussen domeinen, niet midden in een vraag.

### 3. Begeleider-view

- Zelfde lokale app en hetzelfde device, op de aparte route `#/begeleider`.
- Geen account of pincode in V1; dit is een hulpmiddel thuis, geen beveiligd examenplatform.
- Handmatig aftekenen vereist: score `0-4`, vinkje `zelfstandig`, optionele foutcategorie en een korte notitie.
- Na bevestiging schrijft de app een normale `Attempt` weg met `reviewed_by: "begeleider"`; wijzigen blijft mogelijk en wordt met tijdstip bewaard.

### 4. Tekenen, uploads en grafieken

- Meetkunde gebruikt een **statische figuur** plus een eenvoudig tekenveld; upload van een foto of afbeelding is toegestaan.
- Grafieken en tabellen zijn statische afbeeldingen of HTML-tabellen. Antwoorden gaan via velden, meerkeuze of het tekenveld.
- Geen interactieve grafiekeditor, objectherkenning of automatische beoordeling van tekeningen in V1. De begeleider beoordeelt open beeldantwoorden.

### 5. Proefexamens

- Twee vaste examens van elk **30 vragen**, 6 per domein.
- Per domein: 2 korte vragen, 3 contextvragen en 1 meerstapsvraag.
- Richttijd: **90 minuten**; geen hints, feedback of tweede poging tijdens het examen.
- Vragen van examen A en B overlappen niet. Minimaal 10 van de 30 vragen vragen om berekening, uitleg, tekening of gegevensinterpretatie.
- Beoordeling op behaalde punten volgens `LEERPLAN.md`: totaal minimaal 80% en geen domein onder 70%.

## Leerroute vanaf weggezakte vmbo-basis

Voer deze route letterlijk uit:

1. **Intake:** kies niveau 3 of 4 en leg uit dat de eerste meting geen examen is.
2. **Nulmeting:** neem de vijf domeinen één voor één af.
3. **Basis herstellen:** begin met B1-B6 wanneer een fout laat zien dat plaatswaarde, hoofdbewerkingen, breuken, decimalen, negatieve getallen of afronden ontbreken.
4. **Eén nieuw concept:** leg één begrip uit met één concreet voorbeeld uit wonen, werk, vervoer, geld of vrije tijd.
5. **Samen doen:** toon een volledig uitgewerkt voorbeeld en benoem elke rekenstap.
6. **Met hulp doen:** laat één vergelijkbare vraag maken met hints per stap.
7. **Zelf doen:** laat minimaal twee nieuwe vragen zonder hints maken.
8. **Exitbewijs:** toets dezelfde vaardigheid in een andere context.
9. **Hertoetsen:** opnieuw na 2-3 dagen en na 2-3 weken.
10. **Combineren:** bied pas daarna meerstapsvragen aan waarin meerdere beheerste vaardigheden samenkomen.

Als een leerling vastloopt, ga precies één voorwaardevaardigheid terug. Stuur haar niet terug naar het begin van een heel domein.

### Opbouw van één mobiele les

Een les duurt bij voorkeur 10-15 minuten en bevat maximaal:

1. één leerdoel in gewone taal;
2. één korte uitleg;
3. één uitgewerkt voorbeeld;
4. drie tot vijf vragen;
5. één afsluitende samenvatting: `Dit kun je nu` of `Dit oefenen we nog`.

Toon nooit een lange theoriepagina gevolgd door twintig vragen. Breek uitleg op en laat de leerling meteen iets doen.

### Uitlegregels

- Schrijf `Je wilt weten hoeveel verf je nodig hebt` vóór `Bereken de oppervlakte`.
- Benoem bij iedere uitwerking: **wat weet je, wat zoek je, welke berekening past, wat betekent het antwoord?**
- Toon eenheden in iedere relevante tussenstap.
- Leg één aanpak goed uit; toon alternatieve strategieën pas wanneer de eerste wordt beheerst.
- Gebruik een rekenmachine waar die op het beoogde examen is toegestaan, maar laat de leerling eerst de juiste bewerking kiezen.
- Geef na een fout gerichte feedback, bijvoorbeeld `Je berekende de oppervlakte; gevraagd werd de omtrek`, niet alleen `Fout`.
- Herhaal een fout met een nieuwe context. Laat niet simpelweg dezelfde cijfers opnieuw invullen.

## Mobile-first gebruikersinterface

Ontwerp eerst voor **360 x 640 px** en controleer daarnaast 390 x 844 px. Desktop is dezelfde app met een gecentreerde kolom; maak geen apart desktopdashboard.

### Vaste layout

- Eén kolom van maximaal 640 px breed.
- Minimaal 16 px horizontale schermmarge.
- Gewone tekst minimaal 17 px met regelhoogte 1.5.
- Bedienbare elementen minimaal 44 x 44 px; minimaal 8 px ruimte ertussen.
- Eén primaire actie onderaan: bijvoorbeeld `Controleer antwoord` of `Volgende`.
- Houd de primaire actie zichtbaar, maar voorkom dat zij het invoerveld bedekt wanneer het toetsenbord openstaat.
- Bovenaan alleen: terugknop, korte titel en voortgang zoals `Vraag 2 van 4`.
- Geen zijbalk, hover-interacties, brede tabellen of meerdere kaarten naast elkaar op mobiel.

### Visuele richting

- Achtergrond `#F7F8F4`, tekst `#17212B`, primair `#176B68`, aandacht `#B86B16`, fout `#B42318`, lijnen `#D9DED8`.
- Gebruik het systeemlettertype (`system-ui`); duidelijkheid en snelheid gaan boven een externe fontdownload.
- Gebruik kleur nooit als enige betekenis: combineer kleur met tekst en een icoon.
- Gebruik rustige, vlakke vlakken; geen gradients, glassmorphism, confetti of speelse schoolkinderstijl.
- Maak berekeningen herkenbaar met een subtiel ruitjespapierpatroon in het kladvlak. Dit is het enige decoratieve motief.

### Invoer per vraagsoort

- **Getal:** numeriek toetsenbord, apart veld voor eenheid indien nodig.
- **Geld:** accepteer komma en punt als decimaalteken; toon na invoer Nederlandse notatie.
- **Meerkeuze:** grote antwoordknoppen onder elkaar; selectie is nog geen definitief antwoord totdat `Controleer antwoord` is gekozen.
- **Meerstapsvraag:** één kladveld en één eindantwoord; dwing niet af dat haar tussenstappen exact overeenkomen met één modeluitwerking.
- **Tabel:** maak kolommen passend of toon één rij per kaart; nooit horizontaal scrollen voor een antwoord dat kolommen moet vergelijken.
- **Grafiek:** gehele grafiek past op het scherm en kan schermvullend worden geopend; assen, legenda en waarden blijven leesbaar.
- **Meetkunde:** figuur kan schermvullend worden geopend; afmetingen blijven zichtbaar; tekenveld ondersteunt wissen en ongedaan maken.

### Feedback

- Goed: toon kort waarom de aanpak klopt en ga door.
- Fout, eerste poging: markeer de relevante denkstap en bied één hint.
- Fout, tweede poging: toon een uitgewerkt parallel voorbeeld en daarna een nieuwe vraag.
- Fout door basiskennis: open een korte herstelles voor de specifieke B-code.
- Sla ieder antwoord direct lokaal op, zodat sluiten of verversen geen voortgang verliest.

### Toegankelijkheid

- Alles werkt met toetsenbord en schermlezer.
- Elk invoerveld heeft een zichtbaar label; afbeeldingen hebben functionele alt-tekst.
- Focus is altijd zichtbaar.
- Gebruik geen tijdsdruk in gewone lessen.
- Respecteer `prefers-reduced-motion`; functionele animaties duren maximaal 200 ms.
- Foutmeldingen zeggen wat ontbreekt en hoe de gebruiker verder kan.

## Technische stack en lichte architectuur

### Stack

- HTML5, CSS en browser-JavaScript met ES-modules.
- Hardcoded `questions.json` als vraagbank.
- `localStorage` voor profiel, pogingen en voortgang.
- Geen framework, package manager, buildstap, backend, database of externe dienst in V1.
- Lokaal starten met `python3 -m http.server 8000` en openen via `http://localhost:8000`.

### Bestandsverantwoordelijkheid

```text
index.html       schermstructuur en toegankelijke labels
styles.css       mobile-first layout en visuele tokens
app.js           navigatie, leerflow, beoordeling en opslag
questions.json   inhoud en antwoordmodellen
test-data.mjs    controleert de vraagbank met Node.js
```

Houd de stroom één richting op:

```text
questions.json -> app.js -> scherm
                      |
                      v
                  localStorage
```

`app.js` leest de gegevens, rendert één scherm en schrijft na iedere poging de volledige lokale toestand terug. Voeg pas modules of een backend toe wanneer het bestand onoverzichtelijk wordt of synchronisatie tussen apparaten echt nodig is.

Gebruik voor de begeleider in deze statische V1 `#/begeleider` in plaats van `/begeleider`; dat blijft werken na verversen zonder serverconfiguratie.

### Nodige schermen

- **Vandaag:** één opdracht, verwachte duur, benodigde boekpagina en reden waarom deze nu komt.
- **Opgave:** context, invoerveld, kladruimte, optionele stapsgewijze hint en knop “controleer”.
- **Meetkunde-opgave:** naast getallen ook een duidelijke figuur, schaal, uitslag, doorsnede of aanzicht; de leerling kan tekenen of een afbeelding uploaden.
- **Data-opgave:** interactieve of statische tabel/grafiek met leesvragen én opdrachten om gegevens zelf passend weer te geven.
- **Fout herstellen:** foutcategorie, korte uitleg, vergelijkbare nieuwe vraag.
- **Voortgang:** matrix van leerdoelcodes met `niet gestart`, `in opbouw`, `toetsklaar`, `beheerst`, `hertoets nodig`.
- **Begeleider:** recente fouten, hardnekkige foutpatronen, geplande hertoetsen en handmatig aftekenen van mondeling bewijs.
- **Boekkoppeling:** taak/pagina → leerdoelcodes; waarschuwing voor boekonderdelen zonder koppeling.

## Data die volstaat

```text
Learner(id, target_level)
BookTask(id, title, pages, objective_codes[])
Objective(code, domain, description)
Question(id, objective_codes[], level, context_type, prompt, answer_model)
Attempt(question_id, date, score, seconds, hints[], error_type, independent)
Mastery(objective_code, state, next_review_at)
```

Minimaal JSON-exportformaat:

```json
{
  "schema_version": 1,
  "exported_at": "2026-09-16T18:00:00+02:00",
  "learner": { "id": "partner", "target_level": 4 },
  "attempts": [
    {
      "question_id": "R11-N4-001",
      "objective_codes": ["R11"],
      "kind": "practice",
      "started_at": "2026-09-16T17:52:00+02:00",
      "seconds": 210,
      "score": 4,
      "max_score": 4,
      "hints": [],
      "error_type": null,
      "independent": true,
      "reviewed_by": "begeleider",
      "review_note": "Berekening en eenheid kloppen."
    }
  ],
  "mastery": [
    {
      "objective_code": "R11",
      "state": "in_opbouw",
      "next_review_at": "2026-09-19"
    }
  ]
}
```

CSV-export bevat één regel per poging met dezelfde velden; arrays worden met `|` gescheiden. JSON is leidend voor herstel/import, CSV alleen voor inzage.

Gebruik eerst lokale opslag. Accounts, synchronisatie, klassenbeheer en AI-generatie zijn pas nodig als één leerling de basisflow aantoonbaar gebruikt.

## Selectieregels

- Kies eerst een achterstallige hertoets, daarna het zwakste open leerdoel.
- Herhaal niet exact dezelfde vraag; wissel getallen én context.
- Geef na één fout geen antwoord, maar eerst één gerichte hint.
- Na twee mislukte pogingen: toon een uitgewerkt parallel voorbeeld en bied daarna een nieuwe vraag.
- Gebruik per boekonderdeel de volgorde `voorkennis -> begeleid oefenen -> tussencheck -> gevarieerd oefenen -> eindopdracht/exit-ticket`.
- Zet een leerdoel alleen op `beheerst` volgens de criteria in `LEERPLAN.md`.
- Een goed antwoord met hint telt als oefening, niet als zelfstandig toetsbewijs.
- Een fout op een voorwaardevaardigheid heropent die basisvaardigheid.

## Vraagkwaliteit

Elke vraag heeft:

- één primair leerdoel en hoogstens twee secundaire doelen;
- een eenduidig antwoordmodel met toegestane afrondingsmarge;
- expliciete eenheid en vereiste nauwkeurigheid;
- een plausibiliteitscontrole;
- een niveau-label gebaseerd op gegevensdichtheid, aantal stappen, bekendheid van de context en hoeveelheid begeleiding;
- een menselijke review voordat de vraag als toetsbewijs mag meetellen.

Laat een taalmodel dus wel oefenvarianten voorstellen, maar niet zelfstandig bepalen dat iets beheerst is.

## Acceptatiecriteria voor de bouwer

- Elk leerdoel uit `LEERPLAN.md` is in de voortgangsmatrix zichtbaar.
- Geen boektaak kan ongemerkt ongekoppeld blijven.
- Een toetsvraag die eerder is getoond wordt niet als nieuwe hertoets aangeboden.
- De meetkundeset toetst afzonderlijk 2D-vormen, 3D-vormen, uitslagen, aanzichten, doorsneden, schaal, oppervlakte en inhoud.
- De dataset toetst afzonderlijk tabellen, staafdiagrammen, lijngrafieken, cirkeldiagrammen, omzetting tussen weergaven en misleidende grafieken.
- Open tekenopgaven kunnen door een begeleider worden beoordeeld; automatische beoordeling mag daarbij alleen een voorstel doen.
- Hints verlagen de poging aantoonbaar van toetsbewijs naar oefenbewijs.
- De app kan een volledig voortgangsoverzicht als JSON of CSV exporteren.
- Met een vaste testdataset levert de beheersingsregel steeds dezelfde uitkomst.
- De begeleider kan een foutieve automatische beoordeling corrigeren met reden.

## Bewust niet bouwen in versie 1

- geen chatcoach;
- geen sociale functies of ranglijst;
- geen badges, streaks of XP;
- geen eigen auteurs- of CMS-omgeving;
- geen OCR behalve eventueel éénmalig voor de inhoudsopgave;
- geen betaalde AI-afhankelijkheid voor kernfunctionaliteit.
