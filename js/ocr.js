/* ===========================================================
   ocr.js — Cebeo-order uitlezen
   -----------------------------------------------------------
   1. leesAfbeeldingen(): OCR in de browser met Tesseract.js.
      Geen server, geen kosten, niets verlaat de telefoon.
      Wel internet nodig de eerste keer (taalbestand ~2 MB,
      daarna gecachet door de browser).
   2. parseer(): haalt uit ruwe tekst de productregels.
      Werkt evengoed op geplakte tekst als op OCR-tekst.
   =========================================================== */

import { fuzzKey, lijktOp } from './store.js';

const TESSERACT_CDN ='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let tesseractGeladen = null;

function laadTesseract() {
  if (tesseractGeladen) return tesseractGeladen;
  tesseractGeladen = new Promise((ok, nok) => {
    const s = document.createElement('script');
    s.src = TESSERACT_CDN;
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => nok(new Error('Tesseract kon niet geladen worden — geen internet?'));
    document.head.appendChild(s);
  });
  return tesseractGeladen;
}

/** Schaalt een screenshot op naar minstens 1400px breed: OCR leest kleine tekst anders slecht. */
async function voorbewerk(bestand) {
  const bitmap = await createImageBitmap(bestand);
  const factor = Math.min(3, Math.max(1, 1400 / bitmap.width));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * factor);
  c.height = Math.round(bitmap.height * factor);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  return c;
}

/**
 * @param {File[]} bestanden
 * @param {(pct:number, tekst:string)=>void} opVoortgang
 * @returns {Promise<string>} alle herkende tekst
 */
export async function leesAfbeeldingen(bestanden, opVoortgang = () => {}) {
  opVoortgang(2, 'Tekstherkenning laden…');
  const T = await laadTesseract();

  opVoortgang(6, 'Taalbestand klaarzetten…');
  const worker = await T.createWorker('nld', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        opVoortgang(10 + m.progress * 80, 'Tekst lezen…');
      }
    }
  });

  let alles = '';
  try {
    for (let i = 0; i < bestanden.length; i++) {
      opVoortgang(10 + (i / bestanden.length) * 80, `Afbeelding ${i + 1} van ${bestanden.length}…`);
      const canvas = await voorbewerk(bestanden[i]);
      const { data } = await worker.recognize(canvas);
      alles += '\n' + data.text;
    }
  } finally {
    await worker.terminate();
  }
  opVoortgang(100, 'Klaar');
  return alles;
}

/* =========================================================== */
/*  Parser                                                     */
/* =========================================================== */

const REF = /Ref\s*[C(][eE][bB][eE][o0]\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,})/gi;

/** "€ 1.085,72" → 1085.72 ; "6,76" → 6.76 */
function naarGetal(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/* Grens tussen twee productkaartjes: de "Geleverd"-regel van de vorige kaart,
   of een los "28/28". OCR gooit de twee kolommen soms door elkaar, dus we
   knippen op het laatste van die twee signalen. */
const GRENS = /geleverd|(?:^|\s)\d{1,4}\s*[\/l|]\s*\d{1,4}(?=\s|$)/gi;

function poetsNaam(blok) {
  return blok
    .split(/\n/)
    .map(r => r.trim())
    .filter(r =>
      r &&
      !/^geleverd/i.test(r) &&
      !/^\d{1,2}[:.]\d{2}\b/.test(r) &&          // klok in de statusbalk
      !/^\d+\s*[\/l|]\s*\d+$/.test(r) &&         // "28/28"
      !/^\d+\s*producten?$/i.test(r) &&
      !/^(5G|4G|LTE|Wi-?Fi|\d{1,3}%?)$/i.test(r)
    )
    .join(' ')
    .replace(/[x×]\s*\d{1,4}\b/gi, ' ')          // aantal weg
    .replace(/€\s*[\d.\s]*,\d{2}/g, ' ')         // prijs weg
    .replace(/\bgeleverd\b/gi, ' ')
    .replace(/\bref\s*cebeo\b/gi, ' ')
    // losse OCR-rommel: tekens zonder betekenis, streepjescodes van pijltjes…
    .replace(/(^|\s)[^\wÀ-ÿ€\-]{1,4}(?=\s|$)/g, ' ')
    .replace(/(^|\s)[a-z]{1,2}[^\wÀ-ÿ\s\-]{1,3}(?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—.,:]+|[\s\-–—.,:]+$/g, '')
    .trim();
}

/* "1%4Rverd AY esis 3 Vynckier (ABB) - Verdeelkast …"
   → merk "Vynckier (ABB)", naam "Verdeelkast …"
   We splitsen op het eerste " - " en houden vóór dat streepje
   hoogstens drie woorden over die er als een merknaam uitzien. */
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
  return geldig
    ? { brand: merk, name: m[2].trim() }
    : { brand: '', name: (merk ? merk + ' ' : '') + m[2].trim() };
}

/**
 * Haalt productregels uit ruwe tekst.
 * @returns {{ref:string,brand:string,name:string,qty:number,price:number,zeker:boolean}[]}
 */
export function parseer(tekst) {
  const t = String(tekst || '').replace(/\r/g, '');
  const regels = [];
  let vorigEind = 0;
  let m;

  REF.lastIndex = 0;
  while ((m = REF.exec(t)) !== null) {
    const blok = t.slice(vorigEind, m.index);
    const na = m.index + m[0].length;
    vorigEind = na;

    // Staart = wat er na deze referentie komt, maar nooit voorbij de
    // volgende "Ref Cebeo": anders lees je de cijfers van het volgende
    // kaartje mee. OCR husselt de twee kolommen soms door elkaar.
    const rest = t.slice(na, na + 400);
    const volgende = rest.search(/Ref\s*[C(]eb/i);
    const staart = volgende > -1 ? rest.slice(0, volgende) : rest.slice(0, 160);

    const ref = m[1].toUpperCase().replace(/[.,;:]+$/, '');

    // Een blok bevat de staart van de vorige kaart ("Geleverd 28/28") plus de
    // nieuwe kaart. Alles tot en met de laatste "Geleverd n/n" hoort bij de
    // vorige kaart en gooien we weg. Zo blijven regels zonder Ref Cebeo
    // (bv. "Km heffing") niet aan de volgende productnaam plakken.
    GRENS.lastIndex = 0;
    const grens = [...blok.matchAll(GRENS)].pop();
    const kern = grens ? blok.slice(grens.index + grens[0].length) : blok;

    // aantal: "x 28" binnen deze kaart — anders uit "Geleverd 28/28" erna
    const mQty = kern.match(/[x×]\s*(\d{1,4})\b/i);
    // enkel de eerste "Geleverd" in de staart telt — dat is die van dit kaartje
    const iGel = staart.search(/geleverd/i);
    const mGeleverd = iGel > -1
      ? staart.slice(iGel, iGel + 30).match(/(\d{1,4})\s*[\/l|]\s*(\d{1,4})/)
      : null;
    let qty = mQty ? parseInt(mQty[1], 10) : 0;
    let zeker = !!mQty;
    if (mGeleverd) {
      const gel = parseInt(mGeleverd[1], 10);
      if (!qty) { qty = gel; zeker = true; }
      else if (gel !== qty) zeker = false;   // twee bronnen, twee antwoorden → nakijken
    }
    // Niets gevonden? Dan liever eerlijk 0 tonen dan een verkeerd aantal
    // dat er van het vorige kaartje is ingeslopen.
    if (!qty) zeker = false;

    const mPrijs = kern.match(/€\s*([\d.\s]*\d,\d{2})/);
    const volledig = poetsNaam(kern);
    const { brand, name } = splitsMerk(volledig);

    if (!name && !qty) continue;
    // kosten- en transportregels horen niet in de voorraad
    if (/km\s*heffing|transportkost|leveringskost|verzendkost|toeslag/i.test(volledig)) continue;

    regels.push({
      ref,
      brand,
      name: name || 'Onbekend product',
      qty,
      price: naarGetal(mPrijs && mPrijs[1]),
      zeker: zeker && !!name
    });
  }

  // Dubbels samenvoegen: dezelfde ref komt vaak op twee screenshots voor
  // (overlappende schermafbeeldingen). We nemen dan het hoogste aantal,
  // niet de som — anders tel je dubbel.
  const perRef = new Map();
  for (const r of regels) {
    const k = fuzzKey(r.ref);
    let bestaand = perRef.get(k);
    if (!bestaand) {
      // ook een leesfout van één teken telt als dezelfde referentie
      for (const [, kandidaat] of perRef) {
        if (lijktOp(kandidaat.ref, r.ref)) { bestaand = kandidaat; break; }
      }
    }
    if (!bestaand) { perRef.set(k, r); continue; }

    // Een half afgesneden kaartje (aantal 0) mag een goede lezing niet bederven.
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
