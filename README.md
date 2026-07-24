# Levaux Bouw · Voorraad

Mobiele webapp waarmee Cédric Levaux zijn Cebeo-materiaal in de werkbus bijhoudt.

- **Voorraad** — zoeken op naam, merk, referentie of leverancier, met foto en aantal
- **Categorieën** — Elektra · Sanitair & chauffage · Ruwbouw · Materialen, als filter bovenaan; per product aanpasbaar
- **Leveranciers** — filter per leverancier; elke leverancier heeft een standaardcategorie (Cebeo → Elektra)
- **Afboeken** — één tik op de min-knop, of een aantal ingeven in het productscherm
- **Bijbestellen vanaf** — het minimum per product staat in het productscherm zelf. Per soort materiaal ligt een vaste regel vast (automaat 15, afdekplaat 25, kabelgoot 5 …); nieuwe producten krijgen dat minimum vanzelf, en een zelf ingesteld minimum blijft staan
- **Categorieën altijd zichtbaar** — ook de lege, zodat je weet waar iets onder valt
- **Foto vergroten** — tik op de productfoto in het productscherm
- **Dubbels vermijden** — typ je een naam die lijkt op iets wat je al hebt, dan toont de app die producten en vraagt ze of je wil bijtellen
- **Inboeken** — orders inlezen via schermafbeeldingen (OCR), geplakte tekst of handmatig; bestaande referenties worden **bijgeteld**, niet overschreven
- **Twee soorten orderlijsten** — kaartjes met "Ref Cebeo" (de Cebeo-app) én tabellen met artikelnummer, aantal en prijs. De app herkent zelf welk soort het is en van welke leverancier de bon komt; is die nog niet bekend, dan stelt ze voor hem toe te voegen. Je hoeft niets in te stellen
- **Bulk verwijderen** — selectiestand in de voorraadlijst; "Alles" werkt op wat er na je filters overblijft
- **Minimums aanpasbaar** — de aantallen per soort staan bij Instellingen en zijn te wijzigen; producten die op die regel draaien volgen meteen mee
- **Productfoto's** — bij de Cebeo-kaartjes knipt de app de productfoto uit de schermafbeelding en hangt die automatisch aan het product
- **Eigen materiaal** — foto trekken, naam invullen, klaar; referentie en prijs mogen leeg (de app maakt zelf een referentie zoals `GEDI-001`)
- **Eenheden** — stuk, m, m², zak, pallet, rol, kg, doos, liter
- **Bijbestellen** — alles onder het ingestelde minimum, gegroepeerd per leverancier, klaar om te kopiëren of te mailen
- **Historiek** — elke beweging met datum, tijd en restant; exporteerbaar naar CSV
- **Back-up** — de volledige voorraad als JSON-bestand

Geen build-stap, geen framework, geen server. Gewoon statische bestanden.

## Bestanden

```
index.html               alle schermen
css/styles.css           huisstijl (logorood #be1717 / zwart / wit)
assets/logo-mark.png     het beeldmerk uit het logo van Cédric, tekst verwijderd
js/app.js                schermen en interactie
js/store.js              datalaag — hier zit de opslag achter een adapter
js/ocr.js                tekstherkenning + parser voor Cebeo-regels
data/seed.json           startvoorraad: de 27 producten van de Cebeo-order
tools/bouw-demo.mjs      maakt van de app één los demo-bestand
sw.js                    service worker, zodat de app offline opent
manifest.webmanifest     zodat de app op het startscherm kan
netlify.toml             instellingen voor Netlify
```

## Lokaal draaien

De app gebruikt ES-modules, dus je kan `index.html` niet zomaar dubbelklikken. Start een lokale server:

```bash
python -m http.server 8080
# of
npx serve .
```

Daarna: http://localhost:8080

## Demo in één bestand

Om iemand snel te laten klikken zonder server of hosting:

```bash
node tools/bouw-demo.mjs
```

Dat schrijft `demo/levaux-voorraad-demo.html`: de volledige app met CSS, JavaScript, logo en startvoorraad ingebakken. Dubbelklikken volstaat. Alles werkt, behalve de tekstherkenning — die haalt Tesseract van het internet.

## Naar GitHub

```bash
git init
git add .
git commit -m "Eerste versie voorraadapp Levaux Bouw"
git branch -M main
git remote add origin https://github.com/<gebruiker>/levaux-voorraad.git
git push -u origin main
```

## Naar Netlify

1. app.netlify.com → **Add new site** → **Import an existing project** → GitHub
2. Kies de repo `levaux-voorraad`
3. Build command: **leeg laten** · Publish directory: **`.`**
4. Deploy. Elke `git push` naar `main` zet de nieuwe versie automatisch online.

Daarna op de telefoon: site openen in Chrome/Safari → menu → **Toevoegen aan startscherm**. De app opent dan zonder browserbalk en werkt offline.

## Waar de gegevens staan

Altijd in `localStorage` op het toestel zelf — daardoor werkt de app offline. Staat de cloud aan, dan wordt diezelfde voorraad ook automatisch naar Supabase weggeschreven en met je team gedeeld.

## Aanmelden verplicht

Staat de cloud aan, dan opent de app op een aanmeldscherm en is er niets te zien of te doen zonder wachtwoord. Eenmaal aangemeld blijft de sessie op het toestel staan, ook zonder internet: in een kelder zonder bereik kan Cédric gewoon blijven afboeken. Enkel wanneer Supabase de sessie écht weigert, moet hij opnieuw aanmelden.

Let wel: dit is een slot op de deur, geen kluis. De bestanden van de site blijven publiek opvraagbaar — dat is bij elke website zo. Wat beveiligd is, zijn de gegevens in Supabase.

Is `config.js` leeg, dan is er geen aanmeldscherm en werkt de app puur lokaal.

## Cloud aanzetten (Supabase)

1. Maak een gratis project op **supabase.com**
2. SQL Editor → plak `supabase/schema.sql` → **Run**
3. Authentication → Providers → **Email** aanzetten
4. Authentication → Users → **Add user**: het adres van Cédric (zet *Auto Confirm User* aan als je geen bevestigingsmail wil)
5. Project Settings → API: kopieer **Project URL** en de **anon public key** naar `config.js`
6. Commit en push → de app toont voortaan een **Cloud**-blok bij Instellingen

Bij de eerste aanmelding maakt de app een gedeelde voorraad ("team") aan. Wil je er later iemand bij: die persoon krijgt een eigen login, meldt zich aan en plakt de **teamcode** (te kopiëren bij Instellingen → Cloud).

De anon key mag in de code staan: hij geeft op zichzelf geen toegang. De beveiliging zit in de regels op de tabellen — zonder aanmelden en zonder lidmaatschap van het team krijg je niets te zien.

### Hoe de sync werkt

De volledige voorraad gaat als één JSON-blok naar de tabel `voorraad`, twee en een halve seconde na de laatste wijziging. Bij het opstarten haalt de app eerst de cloudversie op en voegt die samen met wat lokaal staat: per product wint de laatst gewijzigde versie, en de historiek van beide kanten wordt samengevoegd.

Werken twee mensen op exact hetzelfde moment aan hetzelfde product, dan kan één afboeking verloren gaan. In de historiek zie je dat wel staan. Voor één man met af en toe een tweede toestel is dat ruim voldoende; wordt het drukker, dan moet elke afboeking apart naar de server in plaats van de hele voorraad in één blok.

`js/store.js` praat via een adapter met de lokale opslag; `js/cloud.js` doet de cloud. Beide staan los van de schermen.

## Over de twee soorten orderlijsten

Tekstherkenning leest een tabel kolom per kolom als je haar haar gang laat gaan: eerst alle artikelnummers, dan alle namen, dan alle aantallen. Daarmee valt niet meer te achterhalen welk aantal bij welke regel hoort. Daarom zet de app de herkenning in "één blok"-modus (`tessedit_pageseg_mode = 6`) zodra de leverancier op **tabel** staat. Voor de Cebeo-kaartjes werkt de automatische modus juist beter.

Daarom leest de app eerst in de gewone modus. Vindt ze geen "Ref Cebeo"-kaartjes, dan leest ze dezelfde afbeeldingen nog eens in blokmodus en probeert ze de tabelparser. Dat kost wat extra tijd bij tabellen, maar je hoeft vooraf niets in te stellen.

De leverancier wordt uit de tekst afgeleid: eerst op "Ref Cebeo", dan op de namen die je al kent, en anders op de naam die boven het ordernummer staat. Op het controlescherm kan je die altijd nog wijzigen of als nieuwe leverancier toevoegen.

## Over de tekstherkenning

De OCR draait met [Tesseract.js](https://tesseract.projectnaptha.com/) **in de browser**. Er gaat dus geen enkele foto naar een server en er zijn geen kosten per scan. De eerste keer wordt wel ~2 MB taalbestand gedownload (daarna gecachet), dus dat vraagt internet.

Tips voor een goed resultaat:

- schermafbeeldingen rechtstreeks uit de Cebeo-app (scherpe tekst) werken veel beter dan een foto van een scherm
- laat de kaartjes elkaar gerust overlappen; dezelfde `Ref Cebeo` wordt maar één keer geteld
- het controlescherm toont in het rood wat niet zeker herkend is — daar even nakijken volstaat

## Datamodel

Een product ziet er zo uit:

```js
{
  ref, refKey, brand, name, qty, min, price,
  hoofdcat,      // elektra | sanitair | ruwbouw | materialen
  leverancier,   // "Cebeo", "Gedimat", …
  eenheid,       // stuk, m, zak, pallet, …
  cat,           // fijne soort, bepaalt het icoontje
  foto,          // dataURL, verkleind tot 320px
  type, gewijzigd
}
```

Opgeslagen gegevens van een oudere versie worden automatisch bijgewerkt (`migreer()` in `store.js`). Bij een modelwijziging: `DATAVERSIE` verhogen en de migratie aanvullen.

### Minimumregels

`MINIMUMREGELS` in `store.js` bepaalt per soort product wanneer er bijbesteld moet worden. De standaardaantallen staan daar; wijzigt de gebruiker er één, dan komt dat in `staat.minima` onder de sleutel van de regel — de code blijft dus de bron van de regels, de gebruiker die van de aantallen. De eerste regel die past wint, dus het meest specifieke staat bovenaan (`Differentieel 300mA` vóór `Differentieel 30mA`). Een product onthoudt in `minAuto` of het minimum van een regel komt of zelf is ingesteld; "Regels opnieuw toepassen" bij Instellingen laat de zelf ingestelde met rust, tenzij je uitdrukkelijk anders kiest.

Nieuwe soorten toevoegen: één regel bij in de lijst (met een eigen `key`), `DATAVERSIE` verhogen en in `migreer()` de regels opnieuw laten lopen.

### Verwijderen en synchroniseren

Verwijderde producten laten een spoor na in `staat.verwijderd` (id, refKey, tijdstip). Zonder dat spoor zet het andere toestel bij de volgende synchronisatie zijn eigen lijst terug en staat alles er weer. `samenvoegen()` gooit daarom producten weg waarvan het spoor jonger is dan de versie die binnenkomt. Sporen worden een half jaar bewaard.

## Volgende stappen

- Cloudopslag (Supabase) voor sync en back-up
- Barcode/QR scannen om een product meteen te vinden
- Materiaal per werf/klant kunnen toewijzen richting facturatie (bewust nog niet gebouwd)
