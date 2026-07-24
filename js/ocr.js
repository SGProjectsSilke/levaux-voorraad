/* ===========================================================
   ocr.js — orders inlezen
   -----------------------------------------------------------
   Twee soorten orderlijsten:

   1. KAARTEN (Cebeo-app): elk product is een kaartje met een
      foto links, de naam, "x 28", een prijs en "Ref Cebeo …".
      → parseerKaarten()

   2. TABEL (EMZ Maarten Paulissen en de meeste webshops):
      artikelnummer | productnaam | aantal | prijs | totaal.
      → parseerTabel()

   Voor tabellen moet de tekstherkenning in "één blok"-modus
   staan, anders leest ze kolom per kolom en zijn de aantallen
   niet meer aan de juiste regel te koppelen. Vandaar de
   instelling `formaat` per leverancier.

   Alles draait in de browser. Geen server, geen kosten.
   =========================================================== */

import { fuzzKey, lijktOp } from './store.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let tesseractGeladen = null;

function laadTesseract() {
  if (tesseractGeladen) return tesseractGeladen;
  tesseractGeladen = new Promise((ok, nok) => {
    const s = document.createElement('script');
    s.src = TESSERACT_CDN;
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => nok(new Error('De tekstherkenning kon niet geladen worden — is er internet?'));
    document.head.appendChild(s);
  });
  return tesseractGeladen;
}

/** Schaalt een screenshot op: kleine cijfers worden anders overgeslagen. */
async function voorbewerk(bestand) {
  const bitmap = await createImageBitmap(bestand);
  const factor = Math.min(3, Math.max(1, 1900 / bitmap.width));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * factor);
  c.height = Math.round(bitmap.height * factor);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  return c;
}

/**
 * Leest een reeks afbeeldingen.
 * @param {File[]} bestanden
 * @param {(pct:number, tekst:string)=>void} opVoortgang
 * @param {{formaat?: 'cebeo'|'tabel'}} opties
 * @returns {Promise<{tekst:string, paginas:{tekst:string,woorden:object[],canvas:HTMLCanvasElement}[]}>}
 */
export async function leesAfbeeldingen(bestanden, opVoortgang = () => {}, opties = {}) {
  opVoortgang(2, 'Tekstherkenning laden…');
  const T = await laadTesseract();

  opVoortgang(6, 'Taalbestand klaarzetten…');
  const worker = await T.createWorker('nld', 1, {
    logger: m => {
      if (m.status === 'recognizing text') opVoortgang(12 + m.progress * 78, 'Tekst lezen…');
    }
  });
  // '6' = één tekstblok: houdt tabelrijen bij elkaar. '3' = automatisch.
  await worker.setParameters({ tessedit_pageseg_mode: opties.formaat === 'tabel' ? '6' : '3' });

  const paginas = [];
  try {
    for (let i = 0; i < bestanden.length; i++) {
      opVoortgang(12 + (i / bestanden.length) * 78, `Afbeelding ${i + 1} van ${bestanden.length}…`);
      const canvas = await voorbewerk(bestanden[i]);
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      paginas.push({ tekst: data.text || '', woorden: haalWoorden(data), canvas });
    }
  } finally {
    await worker.terminate();
  }
  opVoortgang(100, 'Klaar');
  return { tekst: paginas.map(p => p.tekst).join('\n'), paginas };
}

/**
 * Leest dezelfde afbeeldingen opnieuw in een andere leesmodus. Wordt
 * gebruikt als blijkt dat de bon een tabel is in plaats van kaartjes:
 * een tabel moet in "één blok"-modus gelezen worden, anders leest de
 * herkenning kolom per kolom en horen de aantallen bij de verkeerde regel.
 */
export async function herlees(paginas, formaat, opVoortgang = () => {}) {
  const T = await laadTesseract();
  const worker = await T.createWorker('nld', 1, {
    logger: m => { if (m.status === 'recognizing text') opVoortgang(10 + m.progress * 85, 'Opnieuw lezen…'); }
  });
  await worker.setParameters({ tessedit_pageseg_mode: formaat === 'tabel' ? '6' : '3' });
  try {
    for (let i = 0; i < paginas.length; i++) {
      opVoortgang(10 + (i / paginas.length) * 85, `Opnieuw lezen ${i + 1} van ${paginas.length}…`);
      const { data } = await worker.recognize(paginas[i].canvas, {}, { text: true, blocks: true });
      paginas[i].tekst = data.text || '';
      paginas[i].woorden = haalWoorden(data);
    }
  } finally {
    await worker.terminate();
  }
  return { tekst: paginas.map(p => p.tekst).join('\n'), paginas };
}

/** Plat lijstje van alle herkende woorden met hun positie. */
function haalWoorden(data) {
  const uit = [];
  const duw = w => {
    const b = w.bbox || w;
    if (!b || b.x0 === undefined) return;
    uit.push({ t: (w.text || '').trim(), x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
  };
  (data.blocks || []).forEach(b =>
    (b.paragraphs || []).forEach(p =>
      (p.lines || []).forEach(l => (l.words || []).forEach(duw))));
  if (!uit.length && data.words) data.words.forEach(duw);
  return uit.filter(w => w.t);
}

/* ===========================================================
   Gedeelde hulpjes
   =========================================================== */

/** "€ 1.085,72" → 1085.72 ; "6,76" → 6.76 */
function naarGetal(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/** Dubbels samenvoegen; overlappende screenshots tellen niet dubbel. */
function voegSamen(regels) {
  const perRef = new Map();
  for (const r of regels) {
    const k = fuzzKey(r.ref);
    let bestaand = perRef.get(k);
    if (!bestaand) {
      for (const [, kandidaat] of perRef) {
        if (lijktOp(kandidaat.ref, r.ref)) { bestaand = kandidaat; break; }
      }
    }
    if (!bestaand) { perRef.set(k, r); continue; }

    if (r.qty > 0 && bestaand.qty === 0) {
      bestaand.qty = r.qty;
      bestaand.zeker = r.zeker;
    } else if (r.qty > 0 && bestaand.qty > 0) {
      if (r.qty === bestaand.qty) bestaand.zeker = bestaand.zeker || r.zeker;
      else { bestaand.qty = Math.max(bestaand.qty, r.qty); bestaand.zeker = false; }
    }
    bestaand.price = bestaand.price || r.price;
    if (r.name.length > bestaand.name.length) { bestaand.name = r.name; bestaand.brand = r.brand || bestaand.brand; }
  }
  return [...perRef.values()];
}

/* ===========================================================
   1. Kaartjes (Cebeo-app)
   =========================================================== */

const REF = /Ref\s*[C(][eE][bB][eE][o0]\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,})/gi;
const GRENS = /geleverd|(?:^|\s)\d{1,4}\s*[\/l|]\s*\d{1,4}(?=\s|$)/gi;

function poetsNaam(blok) {
  return blok
    .split(/\n/)
    .map(r => r.trim())
    .filter(r =>
      r &&
      !/^geleverd/i.test(r) &&
      !/^\d{1,2}[:.]\d{2}\b/.test(r) &&
      !/^\d+\s*[\/l|]\s*\d+$/.test(r) &&
      !/^\d+\s*producten?$/i.test(r) &&
      !/^(5G|4G|LTE|Wi-?Fi|\d{1,3}%?)$/i.test(r)
    )
    .join(' ')
    .replace(/[x×]\s*\d{1,4}\b/gi, ' ')
    .replace(/€\s*[\d.\s]*,\d{2}/g, ' ')
    .replace(/\bgeleverd\b/gi, ' ')
    .replace(/\bref\s*cebeo\b/gi, ' ')
    .replace(/(^|\s)[^\wÀ-ÿ€\-]{1,4}(?=\s|$)/g, ' ')
    .replace(/(^|\s)[a-z]{1,2}[^\wÀ-ÿ\s\-]{1,3}(?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—.,:]+|[\s\-–—.,:]+$/g, '')
    .trim();
}

function splitsMerk(volledig) {
  const m = volledig.match(/^(.*?)\s+[-–—]\s+(.+)$/);
  if (!m) return { brand: '', name: volledig };
  let woorden = m[1].trim().split(/\s+/).slice(-3);
  while (woorden.length > 1) {
    const w = woorden[0];
    const rommel = w.length < 2 || /^\d+$/.test(w) || /[^\wÀ-ÿ&.()\/']/.test(w) || /^[a-z]/.test(w);
    if (!rommel) break;
    woorden.shift();
  }
  const merk = woorden.join(' ');
  const geldig = merk && merk.length <= 26 && /^[A-ZÀ-Þ]/.test(merk);
  return geldig ? { brand: merk, name: m[2].trim() } : { brand: '', name: (merk ? merk + ' ' : '') + m[2].trim() };
}

export function parseerKaarten(tekst) {
  const t = String(tekst || '').replace(/\r/g, '');
  const regels = [];
  let vorigEind = 0, m;

  REF.lastIndex = 0;
  while ((m = REF.exec(t)) !== null) {
    const blok = t.slice(vorigEind, m.index);
    const na = m.index + m[0].length;
    vorigEind = na;

    const rest = t.slice(na, na + 400);
    const volgende = rest.search(/Ref\s*[C(]eb/i);
    const staart = volgende > -1 ? rest.slice(0, volgende) : rest.slice(0, 160);

    const ref = m[1].toUpperCase().replace(/[.,;:]+$/, '');

    GRENS.lastIndex = 0;
    const grens = [...blok.matchAll(GRENS)].pop();
    const kern = grens ? blok.slice(grens.index + grens[0].length) : blok;

    const mQty = kern.match(/[x×]\s*(\d{1,4})\b/i);
    const iGel = staart.search(/geleverd/i);
    const mGeleverd = iGel > -1
      ? staart.slice(iGel, iGel + 30).match(/(\d{1,4})\s*[\/l|]\s*(\d{1,4})/)
      : null;

    let qty = mQty ? parseInt(mQty[1], 10) : 0;
    let zeker = !!mQty;
    if (mGeleverd) {
      const gel = parseInt(mGeleverd[1], 10);
      if (!qty) { qty = gel; zeker = true; }
      else if (gel !== qty) zeker = false;
    }
    if (!qty) zeker = false;

    const mPrijs = kern.match(/€\s*([\d.\s]*\d,\d{2})/);
    const volledig = poetsNaam(kern);
    const { brand, name } = splitsMerk(volledig);

    if (!name && !qty) continue;
    if (/km\s*heffing|transportkost|leveringskost|verzendkost|toeslag/i.test(volledig)) continue;

    regels.push({ ref, brand, name: name || 'Onbekend product', qty, price: naarGetal(mPrijs && mPrijs[1]), zeker: zeker && !!name });
  }
  return voegSamen(regels);
}

/* ===========================================================
   2. Tabellen (EMZ en de meeste andere leveranciers)
   =========================================================== */

const TABELRIJ = new RegExp(
  '^\\s*([A-Z0-9][A-Z0-9._/\\-]{2,20})' +      // artikelnummer
  '\\s+(.{3,}?)' +                              // productnaam
  '\\s+(\\d{1,4})' +                            // aantal
  '\\s+€\\s*([\\d.]*\\d(?:,\\d{2})?)' +         // eenheidsprijs
  '(?:\\s+€\\s*([\\d.]*\\d(?:,\\d{2})?))?\\s*$', // totaal (soms onleesbaar)
  'i'
);

const OVERSLAAN = /totaal\s*artikelen|extra\s*opties|ordernummer|^\s*algemeen|btw|subtotaal|verzend|levering/i;

export function parseerTabel(tekst) {
  const lijnen = String(tekst || '').replace(/\r/g, '').split('\n');
  const regels = [];

  for (const ruw of lijnen) {
    const lijn = ruw.replace(/\s{2,}/g, ' ').trim();
    if (!lijn || OVERSLAAN.test(lijn)) continue;

    const m = lijn.match(TABELRIJ);
    if (m) {
      const qty = parseInt(m[3], 10);
      const prijs = naarGetal(m[4]);
      const totaal = naarGetal(m[5]);
      // Klopt aantal × prijs met het totaal? Dan is de regel zeker goed
      // gelezen. Ontbrekende komma's in het totaal rekenen we mee.
      let zeker = true;
      if (totaal) {
        const verwacht = qty * prijs;
        const afwijking = Math.abs(verwacht - totaal);
        zeker = afwijking < Math.max(0.02, verwacht * 0.02) || Math.abs(verwacht * 100 - totaal) < 1;
      }
      regels.push({
        ref: m[1].toUpperCase(),
        brand: '',
        name: m[2].trim().replace(/\s{2,}/g, ' '),
        qty,
        price: prijs,
        zeker
      });
      continue;
    }

    // Vervolgregel van de productnaam ("1/2 - 16 alu-pex", "en rood 50lm").
    // Die begint altijd klein of met een cijfer; begint de regel met een
    // hoofdletter of staat er een dubbele punt in, dan is het paginarommel.
    const vorige = regels[regels.length - 1];
    if (vorige && lijn.length < 60 && /^[a-z0-9(]/.test(lijn) && /[a-zA-Z]{2}/.test(lijn) &&
        !/[€:]/.test(lijn) && !/^\W+$/.test(lijn)) {
      vorige.name = (vorige.name + ' ' + lijn).replace(/\s{2,}/g, ' ').trim();
    }
  }
  return voegSamen(regels);
}

/**
 * Wie heeft deze bon gestuurd? Eerst kijken of het een Cebeo-kaartjeslijst
 * is, dan of er een bekende leverancier in de tekst staat, en anders de
 * naam boven het ordernummer gebruiken als voorstel.
 * @returns {{naam:string, zeker:boolean, formaat:'cebeo'|'tabel'}}
 */
export function raadLeverancier(tekst, bekende = []) {
  const t = String(tekst || '');
  if (/ref\s*[c(]eb/i.test(t)) {
    const cebeo = bekende.find(l => /cebeo/i.test(l.naam));
    return { naam: cebeo?.naam || 'Cebeo', zeker: true, formaat: 'cebeo' };
  }

  const klein = t.toLowerCase();
  for (const l of bekende) {
    const n = l.naam.toLowerCase();
    // ook op het eerste, meest kenmerkende woord matchen ("EMZ")
    const eerste = n.split(/\s+/)[0];
    if (klein.includes(n) || (eerste.length >= 3 && klein.includes(eerste))) {
      return { naam: l.naam, zeker: true, formaat: l.formaat || 'tabel' };
    }
  }

  // "EMZ Maarten Paulissen Ordernummer: 24768"
  const m = t.match(/([A-ZÀ-Þ][\wÀ-ÿ&.'-]*(?:[ ][A-ZÀ-Þ][\wÀ-ÿ&.'-]*){0,3})\s+(?:ordernummer|orderbevestiging|leveringsbon|bestelbon|factuur)/i);
  if (m) return { naam: poetsBedrijf(m[1]), zeker: false, formaat: 'tabel' };

  // anders: de eerste zinnige regel
  const regel = t.split('\n').map(r => r.trim())
    .find(r => r.length > 3 && /[A-Za-zÀ-ÿ]{3}/.test(r) && !/^\d/.test(r));
  return { naam: (regel || '').slice(0, 40).replace(/[^\wÀ-ÿ&.' -]/g, '').trim(), zeker: false, formaat: 'tabel' };
}

/** "Van Marcke Orderbevestiging" → "Van Marcke": woorden als
    orderbevestiging of leveringsbon horen niet bij de bedrijfsnaam. */
function poetsBedrijf(naam) {
  const papier = /^(order(bevestiging|nummer)?|bestel(bon|ling)?|leveringsbon|leverbon|factuur|offerte|nota|bon|document|klant|datum)$/i;
  const woorden = String(naam).trim().split(/\s+/);
  while (woorden.length > 1 && papier.test(woorden[woorden.length - 1])) woorden.pop();
  while (woorden.length > 1 && papier.test(woorden[0])) woorden.shift();
  return woorden.join(' ');
}

/** Ordernummer uit de kop van een tabel, voor het label van de order. */
export function haalOrdernummer(tekst) {
  const m = String(tekst || '').match(/ordernummer\s*[:\s]\s*([A-Z0-9\-]{3,})/i);
  return m ? m[1] : '';
}

/* ===========================================================
   Slimme keuze + foto's
   =========================================================== */

/** Kiest zelf het juiste soort lijst. */
export function parseer(tekst, formaat = '') {
  if (formaat === 'tabel') {
    const t = parseerTabel(tekst);
    return t.length ? t : parseerKaarten(tekst);
  }
  const k = parseerKaarten(tekst);
  return k.length ? k : parseerTabel(tekst);
}

/* --- Productfoto's uit de Cebeo-kaartjes --------------------
   In de Cebeo-app staat de foto altijd op dezelfde plek: links
   van de producttitel, met vaste verhoudingen ten opzichte van
   de schermbreedte. Die maten zijn opgemeten op de
   schermafbeeldingen van Cédric.
------------------------------------------------------------ */

const FOTO = { x0: 0.082, x1: 0.218, boven: 0.062, onder: 0.082 };

/**
 * Knipt per referentie de productfoto uit de schermafbeelding.
 * @returns {Map<string,string>} sleutel = fuzzKey(ref), waarde = dataURL
 */
export function haalFotos(paginas) {
  const uit = new Map();
  for (const pagina of paginas) {
    try { verwerkPagina(pagina, uit); } catch (e) { console.warn('foto overslaan:', e); }
  }
  return uit;
}

function verwerkPagina(pagina, uit) {
  const { woorden, canvas } = pagina;
  if (!woorden?.length || !canvas) return;
  const W = canvas.width, H = canvas.height;

  const midden = w => (w.y0 + w.y1) / 2;
  const cebeos = woorden.filter(w => /^cebeo$/i.test(w.t));
  const geleverd = woorden.filter(w => /^geleverd/i.test(w.t));

  for (const c of cebeos) {
    // de referentie is het woord rechts van "Cebeo" op dezelfde regel
    const zelfdeRegel = woorden
      .filter(w => w.x0 > c.x1 && Math.abs(midden(w) - midden(c)) < (c.y1 - c.y0))
      .sort((a, b) => a.x0 - b.x0);
    const ref = zelfdeRegel[0]?.t?.replace(/[^A-Za-z0-9\-\.\/]/g, '');
    if (!ref || ref.length < 3) continue;
    const sleutel = fuzzKey(ref);
    if (uit.has(sleutel)) continue;

    // bovenrand van de kaart = onderkant van de vorige "Geleverd"-regel
    const boven = geleverd.filter(g => g.y1 < c.y0 - 20).map(g => g.y1);
    const bandTop = Math.max(boven.length ? Math.max(...boven) : 0, H * 0.035);

    // de titel begint rechts van de fotokolom
    const titels = woorden.filter(w => w.x0 > W * 0.22 && midden(w) > bandTop && midden(w) < c.y0 - 5);
    if (!titels.length) continue;
    const titelTop = Math.min(...titels.map(w => w.y0));

    const box = {
      x: Math.round(W * FOTO.x0),
      y: Math.round(titelTop - W * FOTO.boven),
      w: Math.round(W * (FOTO.x1 - FOTO.x0)),
      h: Math.round(W * (FOTO.boven + FOTO.onder))
    };
    if (box.y < H * 0.03 || box.y + box.h > H || box.w < 20) continue;

    const foto = knip(canvas, box);
    if (foto) uit.set(sleutel, foto);
  }
}

/** Knipt een stuk uit het canvas, verkleint het en geeft een dataURL terug. */
function knip(bron, box) {
  const doel = document.createElement('canvas');
  const maat = 240;
  const schaal = Math.min(maat / box.w, maat / box.h, 1);
  doel.width = Math.max(1, Math.round(box.w * schaal));
  doel.height = Math.max(1, Math.round(box.h * schaal));
  const ctx = doel.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, doel.width, doel.height);
  ctx.drawImage(bron, box.x, box.y, box.w, box.h, 0, 0, doel.width, doel.height);

  // bijna helemaal wit? dan staat er geen product op
  const d = ctx.getImageData(0, 0, doel.width, doel.height).data;
  let inkt = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i] < 246 || d[i + 1] < 246 || d[i + 2] < 246) inkt++;
  }
  if (inkt / (d.length / 16) < 0.03) return '';

  return doel.toDataURL('image/jpeg', 0.75);
}
