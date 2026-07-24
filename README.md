# Levaux Bouw · Voorraad

Mobiele webapp waarmee Cédric Levaux zijn Cebeo-materiaal in de werkbus bijhoudt.

- **Voorraad** — zoeken op naam, merk, referentie of leverancier, met foto en aantal
- **Categorieën** — Elektra · Sanitair & chauffage · Ruwbouw · Materialen, als filter bovenaan; per product aanpasbaar
- **Leveranciers** — filter per leverancier; elke leverancier heeft een standaardcategorie (Cebeo → Elektra)
- **Afboeken** — één tik op de min-knop, of een aantal ingeven in het productscherm
- **Bijbestellen vanaf** — het minimum per product staat in het productscherm zelf, zodat je het instelt op het moment dat je de voorraad ziet
- **Inboeken** — orders inlezen via schermafbeeldingen (OCR), geplakte tekst of handmatig; bestaande referenties worden **bijgeteld**, niet overschreven
- **Twee soorten orderlijsten** — kaartjes met "Ref Cebeo" (de Cebeo-app) én tabellen met artikelnummer, aantal en prijs (EMZ en de meeste andere leveranciers). Je kiest de leverancier bij het inlezen; het soort lijst staat per leverancier ingesteld
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

Voorlopig in `localStorage` van de browser op het toestel zelf. Dat betekent:

- werkt offline en zonder account
- **staat op één toestel** — de telefoon van Cédric
- browsergegevens wissen = voorraad weg → **maak regelmatig een back-up** via Instellingen

`js/store.js` praat via een adapter met de opslag. Om naar de cloud te gaan (sync tussen telefoon en laptop, back-up, meerdere gebruikers) hoef je enkel een `CloudAdapter` te schrijven met dezelfde `laden()` en `bewaren()`, en die in `kiesAdapter()` te zetten. De rest van de app blijft ongewijzigd.

## Over de twee soorten orderlijsten

Tekstherkenning leest een tabel kolom per kolom als je haar haar gang laat gaan: eerst alle artikelnummers, dan alle namen, dan alle aantallen. Daarmee valt niet meer te achterhalen welk aantal bij welke regel hoort. Daarom zet de app de herkenning in "één blok"-modus (`tessedit_pageseg_mode = 6`) zodra de leverancier op **tabel** staat. Voor de Cebeo-kaartjes werkt de automatische modus juist beter.

Dat is de reden dat elke leverancier een veld `formaat` heeft. Klopt de herkenning niet, dan is dat het eerste om te controleren.

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

## Volgende stappen

- Cloudopslag (Supabase) voor sync en back-up
- Barcode/QR scannen om een product meteen te vinden
- Materiaal per werf/klant kunnen toewijzen richting facturatie (bewust nog niet gebouwd)
