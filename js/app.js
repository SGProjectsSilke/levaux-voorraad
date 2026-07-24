/* ===========================================================
   app.js — schermen en interactie
   =========================================================== */

import { Store, VERSIE, normRef, fuzzKey, HOOFDCATEGORIEEN, EENHEDEN, labelVanCat } from './store.js';
import { leesAfbeeldingen, herlees, parseer, parseerKaarten, parseerTabel, haalFotos, haalOrdernummer, raadLeverancier } from './ocr.js';
import { Cloud } from './cloud.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* Rustige lijnicoontjes per soort materiaal, als er (nog) geen foto is. */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
  stroke-linecap="round" stroke-linejoin="round" style="width:60%;height:60%">${d}</svg>`;
const ICONEN = {
  afdekplaat:  svg('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
  automaat:    svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 7v5M9 15h6"/>'),
  stopcontact: svg('<circle cx="12" cy="12" r="9"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><path d="M12 6.5v2"/>'),
  doos:        svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  schakelaar:  svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8"/>'),
  kabelgoot:   svg('<path d="M2 8h20v8H2z"/><path d="M2 11h20"/>'),
  verdeelkast: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h5"/>'),
  lamp:        svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9V15h-7v-1.1A6 6 0 0 1 12 3Z"/>'),
  module:      svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 13h10M7 17h6"/>'),
  sensor:      svg('<circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 7-7M19 12a7 7 0 0 1-7 7"/>'),
  gereedschap: svg('<path d="M14.5 5.5a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4l9-9Z"/>'),
  verbruik:    svg('<path d="M8 3h8v4l-1 1v12a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8L8 7z"/>'),
  toestel:     svg('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 7h.01"/>'),
  kost:        svg('<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3.5 3.5 0 1 0 0 5M8.5 11h5M8.5 13h5"/>')
};
/* Valt een product buiten de fijne soorten (eigen materiaal), dan tonen we
   een icoon van zijn hoofdcategorie. */
const HOOFDICONEN = {
  elektra:    ICONEN.automaat,
  sanitair:   svg('<path d="M12 3.2c.8 1 5 5.6 5 9.1a5 5 0 0 1-10 0c0-3.5 4.2-8.1 5-9.1Z"/>'),
  ruwbouw:    svg('<rect x="2" y="6" width="20" height="5" rx="1"/><rect x="2" y="13" width="20" height="5" rx="1"/><path d="M9 6v5M15 13v5"/>'),
  materialen: svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>')
};
const icoonVoor = p => ICONEN[p.cat] || HOOFDICONEN[p.hoofdcat] || HOOFDICONEN.materialen;

const euro = n => '€ ' + Number(n || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Toestand van het scherm ------------------------ */

const ui = {
  scherm: 'voorraad',
  zoek: '',
  cat: '',
  lev: '',
  productId: null,
  importRegels: [],
  importLabel: 'Order',
  importLev: 'Cebeo',
  importLevNieuw: false,
  importFormaat: 'cebeo',
  importFotos: new Map()
};

/* ===========================================================
   Start
   =========================================================== */

init();

async function init() {
  await Store.init('data/seed.json');
  $('#versie').textContent = 'v' + VERSIE;

  bindNavigatie();
  bindVoorraad();
  bindProductModal();
  bindBewerkModal();
  bindInboeken();
  bindBestellen();
  bindHistoriek();
  bindInstellingen();

  Store.bijWijziging(tekenAlles);
  Store.bijFout(msg => melding(msg));
  bindCloud();
  tekenAlles();

  if (Cloud.ingesteld()) {
    Store.bijWijziging(planSync);
    if (await Cloud.herstel()) {
      Store.gebruiker = Cloud.naam;
      await haalCloudOp();
    }
    tekenCloud();
  }

  // enkel zinvol op een echte website, niet in de demo-versie
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function tekenAlles() {
  tekenVoorraad();
  tekenBestellen();
  tekenHistoriek();
  tekenLeveranciers();
  tekenBadge();
  tekenOpslag();
}

/* ===========================================================
   Navigatie
   =========================================================== */

function bindNavigatie() {
  $$('#nav button').forEach(b => b.addEventListener('click', () => toon(b.dataset.scherm)));
}

function toon(naam) {
  ui.scherm = naam;
  $$('.scherm').forEach(s => { s.hidden = s.id !== 'scherm-' + naam; });
  $$('#nav button').forEach(b => {
    if (b.dataset.scherm === naam) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  const zoekZichtbaar = naam === 'voorraad';
  $('#zoekbalk').style.display = zoekZichtbaar ? '' : 'none';
  $('#chips').style.display = zoekZichtbaar ? '' : 'none';
  $('#chips-lev').style.display = (zoekZichtbaar && !$('#chips-lev').dataset.leeg) ? '' : 'none';

  const titels = {
    voorraad: 'Voorraad werkbus',
    inboeken: 'Order inboeken',
    controle: 'Controleer de order',
    bestellen: 'Bij te bestellen',
    historiek: 'Historiek',
    instellingen: 'Instellingen'
  };
  $('#header-sub').textContent = titels[naam] || '';
  window.scrollTo({ top: 0 });
}

/* ===========================================================
   Voorraad
   =========================================================== */

function bindVoorraad() {
  const veld = $('#zoek');
  const wis = $('#zoek-wis');
  const bijWijziging = () => {
    ui.zoek = veld.value;
    wis.hidden = !veld.value;
    tekenVoorraad();
  };
  veld.addEventListener('input', bijWijziging);
  veld.addEventListener('search', bijWijziging);          // kruisje van iOS
  wis.addEventListener('click', () => {
    veld.value = '';
    bijWijziging();
    veld.focus();
  });
}

function chip(label, waarde, huidig, opKlik) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = label;
  b.setAttribute('aria-pressed', huidig === waarde);
  b.addEventListener('click', () => opKlik(huidig === waarde ? '' : waarde));
  return b;
}

function tekenChips() {
  // rij 1: de vier hoofdcategorieën
  const el = $('#chips');
  el.innerHTML = '';
  const kiesCat = w => { ui.cat = w; tekenVoorraad(); };
  el.appendChild(chip('Alles', '', ui.cat, kiesCat));
  el.appendChild(chip('Bijbestellen', '__laag', ui.cat, kiesCat));
  HOOFDCATEGORIEEN.forEach(c => {
    if (Store.producten().some(p => p.hoofdcat === c.key) || c.key === 'elektra') {
      el.appendChild(chip(c.label, c.key, ui.cat, kiesCat));
    }
  });

  // rij 2: leveranciers — enkel zinvol zodra er meer dan één is
  const lev = Store.gebruikteLeveranciers();
  const el2 = $('#chips-lev');
  el2.dataset.leeg = lev.length < 2 ? '1' : '';
  el2.style.display = (lev.length < 2 || ui.scherm !== 'voorraad') ? 'none' : '';
  el2.innerHTML = '';
  if (lev.length >= 2) {
    const kiesLev = w => { ui.lev = w; tekenVoorraad(); };
    el2.appendChild(chip('Alle leveranciers', '', ui.lev, kiesLev));
    lev.forEach(l => el2.appendChild(chip(l, l, ui.lev, kiesLev)));
  } else if (ui.lev) {
    ui.lev = '';
  }
}

function tekenVoorraad() {
  tekenChips();
  const c = Store.cijfers();
  $('#st-soorten').textContent = c.soorten;
  $('#st-stuks').textContent = c.stuks.toLocaleString('nl-BE');
  $('#st-laag').textContent = c.laag;

  let lijst = Store.zoek(ui.zoek);
  if (ui.cat === '__laag') {
    const ids = new Set(Store.teBestellen().map(p => p.id));
    lijst = lijst.filter(p => ids.has(p.id));
  } else if (ui.cat) {
    lijst = lijst.filter(p => p.hoofdcat === ui.cat);
  }
  if (ui.lev) lijst = lijst.filter(p => p.leverancier === ui.lev);
  lijst = [...lijst].sort((a, b) => (a.brand + a.name).localeCompare(b.brand + b.name, 'nl'));

  const el = $('#lijst');
  el.innerHTML = '';
  if (!lijst.length) {
    el.innerHTML = `<div class="leeg"><span>🔎</span>Niets gevonden.<br>Probeer een ander zoekwoord of voeg het product toe via <b>Inboeken</b>.</div>`;
    return;
  }
  lijst.forEach(p => el.appendChild(kaart(p)));
}

function kaart(p) {
  const laag = p.type !== 'kost' && p.min > 0 && p.qty <= p.min;
  const op = p.qty === 0;
  const div = document.createElement('div');
  div.className = 'kaart' + (op ? ' kaart--op' : laag ? ' kaart--laag' : '');
  div.innerHTML = `
    <div class="kaart__foto">${p.foto ? `<img src="${p.foto}" alt="">` : icoonVoor(p)}</div>
    <div class="kaart__info">
      <div class="kaart__merk">${ontsnap(p.brand || p.leverancier || labelVanCat(p.hoofdcat))}</div>
      <div class="kaart__naam">${ontsnap(p.name)}</div>
      <div class="kaart__ref">${ontsnap(p.ref)}${p.leverancier && p.brand ? ' · ' + ontsnap(p.leverancier) : ''}${p.price ? ' · ' + euro(p.price) : ''}</div>
    </div>
    <div class="kaart__aantal">
      <div class="aantal-bol ${op ? 'aantal-bol--op' : laag ? 'aantal-bol--laag' : ''}">${p.qty}${p.eenheid && p.eenheid !== 'stuk' ? ' <small>' + ontsnap(p.eenheid) + '</small>' : ''}</div>
      <button class="mini-min" title="1 afboeken">−</button>
    </div>`;
  div.addEventListener('click', () => opendProduct(p.id));
  div.querySelector('.mini-min').addEventListener('click', async e => {
    e.stopPropagation();
    if (p.qty <= 0) return melding('Deze zit al op 0.');
    await Store.muteer(p.id, -1, 'afname');
    melding(`1 × ${p.name.slice(0, 26)} afgeboekt · nog ${p.qty}`);
  });
  return div;
}

const ontsnap = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

/* ===========================================================
   Productmodal (af- en bijboeken)
   =========================================================== */

function bindProductModal() {
  $('#m-min').addEventListener('click', () => wijzigAantal(-1));
  $('#m-plus').addEventListener('click', () => wijzigAantal(1));
  $('#m-aantal').addEventListener('input', tekenResultaat);
  $('#m-sluit').addEventListener('click', () => { $('#modal-product').hidden = true; });
  $('#modal-product').addEventListener('click', e => { if (e.target.id === 'modal-product') $('#modal-product').hidden = true; });

  $('#m-snelkeuze').innerHTML = [1, 2, 5, 10, 25, 50].map(n => `<button data-n="${n}">${n}</button>`).join('');
  $('#m-snelkeuze').addEventListener('click', e => {
    const n = e.target.dataset.n;
    if (n) { $('#m-aantal').value = n; tekenResultaat(); }
  });

  // minimum meteen instellen waar je de voorraad ziet
  $('#m-drempel').addEventListener('change', async e => {
    const p = Store.viaId(ui.productId);
    if (!p) return;
    const n = Math.max(0, parseInt(e.target.value, 10) || 0);
    await Store.bewerkProduct(p.id, { min: n });
    tekenResultaat();
    melding(n ? `Bijbestellen vanaf ${n} ${p.eenheid || ''}`.trim() : 'Geen waarschuwing meer voor dit product.');
  });

  $('#m-kopieer-naam').addEventListener('click', () => {
    const p = Store.viaId(ui.productId);
    if (p) kopieer([p.brand, p.name].filter(Boolean).join(' '), 'Naam gekopieerd.');
  });
  $('#m-kopieer-ref').addEventListener('click', () => {
    const p = Store.viaId(ui.productId);
    if (p) kopieer(p.ref, 'Referentie gekopieerd.');
  });

  $('#m-bevestig').addEventListener('click', () => boek(-1));
  $('#m-bijtel').addEventListener('click', () => boek(1));
  $('#m-bewerk').addEventListener('click', () => { $('#modal-product').hidden = true; openBewerk(ui.productId); });
}

function opendProduct(pid) {
  const p = Store.viaId(pid);
  if (!p) return;
  ui.productId = pid;
  $('#m-foto').innerHTML = p.foto ? `<img src="${p.foto}" alt="">` : icoonVoor(p);
  $('#m-merk').textContent = p.brand;
  $('#m-naam').textContent = p.name;
  $('#m-ref').innerHTML = `<b>${ontsnap(p.ref)}</b>${p.leverancier ? ' · ' + ontsnap(p.leverancier) : ''}`
    + `${p.price ? ' · ' + euro(p.price) : ''}`;
  $('#m-aantal').value = 1;

  $('#m-drempel').value = p.min;

  tekenResultaat();
  $('#modal-product').hidden = false;
}

function wijzigAantal(stap) {
  const i = $('#m-aantal');
  i.value = Math.max(1, (parseInt(i.value, 10) || 0) + stap);
  tekenResultaat();
}

function tekenResultaat() {
  const p = Store.viaId(ui.productId);
  if (!p) return;
  const n = Math.max(0, parseInt($('#m-aantal').value, 10) || 0);
  const na = Math.max(0, p.qty - n);
  const el = $('#m-resultaat');
  const eenheid = p.eenheid && p.eenheid !== 'stuk' ? ' ' + ontsnap(p.eenheid) : '';
  el.innerHTML = `Nu <b>${p.qty}${eenheid}</b> in de bus · na afboeken <b>${na}${eenheid}</b>`;
  el.classList.toggle('negatief', na === 0);
  $('#m-bevestig').textContent = `Afboeken (−${n})`;
  $('#m-bijtel').textContent = `Bijtellen (+${n})`;
  $('#m-bevestig').disabled = n < 1 || p.qty < 1;
}

async function boek(richting) {
  const p = Store.viaId(ui.productId);
  const n = Math.max(1, parseInt($('#m-aantal').value, 10) || 1);
  await Store.muteer(p.id, richting * n, richting < 0 ? 'afname' : 'correctie');
  $('#modal-product').hidden = true;
  melding(`${richting < 0 ? '−' : '+'}${n} · ${p.name.slice(0, 24)} · nog ${p.qty}`);
}

/* ===========================================================
   Product bewerken / nieuw
   =========================================================== */

let bewerkId = null;
let bewerkFoto = '';

function bindBewerkModal() {
  $('#b-hoofdcat').innerHTML = HOOFDCATEGORIEEN.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
  $('#b-eenheid').innerHTML = EENHEDEN.map(e => `<option>${e}</option>`).join('');

  $('#b-foto-knop').addEventListener('click', () => $('#b-foto').click());
  $('#b-foto-weg').addEventListener('click', () => { bewerkFoto = ''; tekenFotoVoorbeeld(); });
  // leverancier wisselen zet meteen de juiste categorie klaar
  $('#b-lev').addEventListener('change', e => {
    if (!bewerkId) $('#b-hoofdcat').value = Store.catVanLeverancier(e.target.value);
  });

  $('#b-annuleer').addEventListener('click', () => { $('#modal-bewerk').hidden = true; });
  $('#b-bewaar').addEventListener('click', bewaarBewerk);
  $('#b-verwijder').addEventListener('click', async () => {
    if (!bewerkId) return;
    if (!confirm('Dit product definitief verwijderen uit de voorraad?')) return;
    await Store.verwijderProduct(bewerkId);
    $('#modal-bewerk').hidden = true;
    melding('Product verwijderd.');
  });
  $('#b-foto').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    bewerkFoto = await verkleinFoto(f);
    tekenFotoVoorbeeld();
  });
}

function tekenFotoVoorbeeld() {
  const el = $('#b-voorbeeld');
  el.innerHTML = bewerkFoto
    ? `<img src="${bewerkFoto}" alt="">`
    : svg('<path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2Z"/><circle cx="12" cy="13" r="3.5"/>');
  $('#b-foto-weg').hidden = !bewerkFoto;
  $('#b-foto-knop').textContent = bewerkFoto ? 'Andere foto' : 'Foto nemen';
}

function openBewerk(pid, metCamera = false) {
  bewerkId = pid;
  const p = pid ? Store.viaId(pid) : null;
  bewerkFoto = p?.foto || '';

  const levs = Store.leveranciers().map(l => l.naam);
  const gekozen = p?.leverancier || levs[0] || '';
  $('#b-lev').innerHTML = '<option value="">— geen —</option>' +
    levs.map(l => `<option${l === gekozen ? ' selected' : ''}>${ontsnap(l)}</option>`).join('');

  $('#b-titel').textContent = p ? 'Product bewerken' : 'Eigen materiaal toevoegen';
  $('#b-merk').value = p?.brand || '';
  $('#b-naam').value = p?.name || '';
  $('#b-ref').value = p?.ref || '';
  $('#b-qty').value = p?.qty ?? 0;
  $('#b-min').value = p?.min ?? 0;
  $('#b-prijs').value = p?.price ?? '';
  $('#b-hoofdcat').value = p?.hoofdcat || Store.catVanLeverancier(gekozen);
  $('#b-eenheid').value = p?.eenheid || 'stuk';
  $('#b-foto').value = '';
  $('#b-verwijder').style.display = p ? '' : 'none';
  tekenFotoVoorbeeld();
  $('#modal-bewerk').hidden = false;
  if (metCamera) $('#b-foto').click();
}

async function bewaarBewerk() {
  const velden = {
    brand: $('#b-merk').value.trim(),
    name: $('#b-naam').value.trim(),
    ref: $('#b-ref').value.trim(),
    qty: Math.max(0, parseInt($('#b-qty').value, 10) || 0),
    min: Math.max(0, parseInt($('#b-min').value, 10) || 0),
    price: parseFloat($('#b-prijs').value) || 0,
    hoofdcat: $('#b-hoofdcat').value,
    leverancier: $('#b-lev').value,
    eenheid: $('#b-eenheid').value,
    foto: bewerkFoto
  };
  if (!velden.name) return melding('Geef minstens een omschrijving in.');

  if (bewerkId) {
    if (!velden.ref) delete velden.ref;                 // bestaande referentie behouden
    await Store.bewerkProduct(bewerkId, velden);
  } else {
    const dubbel = velden.ref && Store.viaRef(velden.ref);
    if (dubbel) return melding('Deze Ref Cebeo bestaat al: ' + dubbel.name.slice(0, 30));
    await Store.voegProductToe(velden);
  }
  $('#modal-bewerk').hidden = true;
  melding('Bewaard.');
}

/** Verkleint naar max 320px en slaat op als JPEG — anders loopt localStorage vol. */
function verkleinFoto(bestand) {
  return new Promise(async ok => {
    try {
      const bm = await createImageBitmap(bestand);
      const max = 320;
      const f = Math.min(1, max / Math.max(bm.width, bm.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bm.width * f);
      c.height = Math.round(bm.height * f);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      bm.close?.();
      ok(c.toDataURL('image/jpeg', 0.72));
    } catch { ok(''); }
  });
}

/* ===========================================================
   Inboeken (OCR / plakken / handmatig)
   =========================================================== */

function bindInboeken() {
  $('#ocr-bestanden').addEventListener('change', async e => {
    const bestanden = [...e.target.files];
    e.target.value = '';
    if (!bestanden.length) return;

    $('#ocr-voortgang').hidden = false;
    const zetVoortgang = (pct, tekst) => {
      $('#ocr-balk').style.width = Math.round(pct) + '%';
      $('#ocr-status').textContent = tekst;
    };

    try {
      // Eerste poging: gewone leesmodus. Die is het beste voor de
      // kaartjeslijst van Cebeo.
      let { tekst, paginas } = await leesAfbeeldingen(bestanden, zetVoortgang);
      let formaat = 'cebeo';
      let regels = parseerKaarten(tekst);

      if (!regels.length) {
        // Geen kaartjes gevonden → het is een tabel, en die moet in
        // "één blok"-modus gelezen worden.
        zetVoortgang(8, 'Andere opmaak — even opnieuw lezen…');
        ({ tekst, paginas } = await herlees(paginas, 'tabel', zetVoortgang));
        formaat = 'tabel';
        regels = parseerTabel(tekst);
      }

      $('#ocr-voortgang').hidden = true;
      if (!regels.length) {
        return melding('Geen productregels herkend. Probeer scherpere afbeeldingen, of plak de tekst.');
      }

      const geraden = raadLeverancier(tekst, Store.leveranciers());
      ui.importLev = geraden.naam;
      ui.importLevNieuw = !Store.leverancier(geraden.naam);
      ui.importFormaat = formaat;
      ui.importFotos = formaat === 'cebeo' ? haalFotos(paginas) : new Map();
      const nr = haalOrdernummer(tekst);
      ui.importLabel = `${geraden.naam} ${nr || new Date().toLocaleDateString('nl-BE')}`;
      toonControle(regels);
    } catch (err) {
      $('#ocr-voortgang').hidden = true;
      melding(err.message || 'Uitlezen mislukt.');
    }
  });

  $('#btn-plak').addEventListener('click', () => {
    const tekst = $('#plak-tekst').value;
    const kaarten = parseerKaarten(tekst);
    const regels = kaarten.length ? kaarten : parseerTabel(tekst);
    if (!regels.length) return melding('Geen regels herkend in die tekst.');
    const geraden = raadLeverancier(tekst, Store.leveranciers());
    ui.importLev = geraden.naam;
    ui.importLevNieuw = !Store.leverancier(geraden.naam);
    ui.importFormaat = kaarten.length ? 'cebeo' : 'tabel';
    ui.importFotos = new Map();
    const nr = haalOrdernummer(tekst);
    ui.importLabel = `${geraden.naam} ${nr || new Date().toLocaleDateString('nl-BE')}`;
    toonControle(regels);
  });

  // leverancier op het controlescherm
  $('#controle-lev').addEventListener('change', e => {
    ui.importLevNieuw = e.target.value === '__nieuw';
    if (!ui.importLevNieuw) ui.importLev = e.target.value;
    tekenControleLev();
  });
  $('#controle-lev-naam').addEventListener('input', e => { ui.importLev = e.target.value.trim(); });

  $('#btn-nieuw-product').addEventListener('click', () => openBewerk(null));
  $('#btn-nieuw-foto').addEventListener('click', () => openBewerk(null, true));
  $('#btn-bevestig-import').addEventListener('click', bevestigImport);
  $('#btn-annuleer-import').addEventListener('click', () => { ui.importRegels = []; toon('inboeken'); });
}

function tekenControleLev() {
  const sel = $('#controle-lev');
  const bekend = Store.leveranciers().map(l => l.naam);
  const opties = bekend.map(n =>
    `<option${!ui.importLevNieuw && n === ui.importLev ? ' selected' : ''}>${ontsnap(n)}</option>`).join('');
  sel.innerHTML = opties + `<option value="__nieuw"${ui.importLevNieuw ? ' selected' : ''}>+ Nieuwe leverancier toevoegen…</option>`;

  $('#controle-lev-nieuw').hidden = !ui.importLevNieuw;
  if (ui.importLevNieuw) {
    if (!$('#controle-lev-naam').value) $('#controle-lev-naam').value = ui.importLev;
    $('#controle-lev-cat').innerHTML = HOOFDCATEGORIEEN.map(c =>
      `<option value="${c.key}">${c.label}</option>`).join('');
    $('#controle-lev-hulp').textContent = 'Deze leverancier kende de app nog niet. Kijk de naam na en kies waar zijn materiaal onder valt.';
  } else {
    $('#controle-lev-hulp').textContent = 'Herkend op de bon. Klopt het niet, kies dan hier de juiste.';
  }
}

function toonControle(regels) {
  ui.importRegels = regels;
  tekenControleLev();
  const el = $('#controle-regels');
  el.innerHTML = '';
  // fotokolom enkel tonen als er effectief foto's zijn (tabellen hebben er geen)
  const heeftFotos = regels.some(r => ui.importFotos.get(fuzzKey(r.ref)) || Store.viaRefBijna(r.ref)?.product?.foto);
  el.classList.toggle('met-fotos', heeftFotos);

  const metFoto = regels.filter(r => ui.importFotos.get(fuzzKey(r.ref))).length;
  const onzeker = regels.filter(r => !r.zeker || !r.qty).length;
  const w = $('#controle-waarschuwing');
  w.classList.toggle('waarschuwing--ok', onzeker === 0);
  w.innerHTML = onzeker
    ? `<b>${onzeker}</b> van de ${regels.length} regels zijn niet zeker gelezen — ze staan in het rood. Vul het juiste aantal in; regels op 0 worden overgeslagen.`
    : `${regels.length} regels herkend${metFoto ? `, met ${metFoto} productfoto${metFoto === 1 ? '' : "'s"}` : ''}. Kijk ze snel na — daarna worden ze bij je voorraad geteld.`;

  regels.forEach((r, i) => {
    const treffer = Store.viaRefBijna(r.ref);
    const bestaand = treffer?.product || null;
    r.bestaandId = bestaand?.id || null;
    if (treffer && !treffer.exact) r.ref = bestaand.ref;   // leesfout in de referentie rechtzetten
    r.foto = ui.importFotos.get(fuzzKey(r.ref)) || '';

    const twijfel = !r.zeker || !r.qty;
    const div = document.createElement('div');
    div.className = 'regel' + (bestaand ? '' : ' regel--nieuw') + (twijfel ? ' regel--twijfel' : '');
    div.innerHTML = `
      ${heeftFotos ? `<div class="regel__foto">${r.foto ? `<img src="${r.foto}" alt="">` : (bestaand?.foto ? `<img src="${bestaand.foto}" alt="">` : '')}</div>` : ''}
      <div style="min-width:0">
        <div class="regel__label ${bestaand ? 'regel__label--bestaat' : 'regel__label--nieuw'}">
          ${bestaand ? `bijtellen bij ${bestaand.qty}` : 'nieuw product'} · ref ${ontsnap(r.ref)}${treffer && !treffer.exact ? ' (verbeterd)' : ''}
        </div>
        <input type="text" value="${ontsnap((r.brand ? r.brand + ' - ' : '') + r.name)}" data-veld="naam" data-i="${i}">
      </div>
      <input type="number" value="${r.qty}" min="0" data-veld="qty" data-i="${i}" inputmode="numeric">
      <button class="regel__weg" data-weg="${i}" title="Regel weglaten">×</button>`;
    el.appendChild(div);
  });

  el.oninput = e => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    const r = ui.importRegels[i];
    if (e.target.dataset.veld === 'qty') r.qty = parseInt(e.target.value, 10) || 0;
    if (e.target.dataset.veld === 'naam') {
      const v = e.target.value;
      const m = v.match(/^(.{2,28}?)\s+-\s+(.+)$/);
      if (m) { r.brand = m[1]; r.name = m[2]; } else { r.brand = ''; r.name = v; }
    }
  };

  el.onclick = e => {
    const i = e.target.dataset.weg;
    if (i === undefined) return;
    ui.importRegels.splice(i, 1);
    toonControle(ui.importRegels);
  };

  toon('controle');
}

async function bevestigImport() {
  const regels = ui.importRegels.filter(r => r.qty > 0);
  if (!regels.length) return melding('Er staat niets meer in de lijst.');

  if (ui.importLevNieuw) {
    const naam = $('#controle-lev-naam').value.trim();
    if (!naam) return melding('Geef de leverancier een naam.');
    await Store.voegLeverancierToe(naam, $('#controle-lev-cat').value, ui.importFormaat);
    ui.importLev = naam;
    ui.importLevNieuw = false;
  }

  const { bij, nieuw } = await Store.boekOrderIn(regels, ui.importLabel, ui.importLev);
  ui.importRegels = [];
  $('#plak-tekst').value = '';
  toon('voorraad');
  melding(`${bij} bijgeteld · ${nieuw} nieuw toegevoegd`);
}

/* ===========================================================
   Bestellen
   =========================================================== */

function bindBestellen() {
  $('#btn-kopieer-bestel').addEventListener('click', () => kopieer(bestelTekst(), 'Lijst gekopieerd.'));
  $('#btn-mail-bestel').addEventListener('click', () => toonMailKeuze());
}

/** Voorstel: aanvullen tot het dubbele van het minimum. */
const bestelAantal = p => Math.max(p.min * 2 - p.qty, p.min);

function perLeverancier(lijst) {
  const groepen = new Map();
  lijst.forEach(p => {
    const k = p.leverancier || 'Zonder leverancier';
    if (!groepen.has(k)) groepen.set(k, []);
    groepen.get(k).push(p);
  });
  return [...groepen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
}

/**
 * Leesbare bestellijst. Blijft leesbaar in een mail, waar tabs en
 * uitlijning toch verloren gaan: één product per blokje van twee regels.
 */
function bestelTekst(alleenLeverancier = '') {
  let lijst = Store.teBestellen();
  if (alleenLeverancier) lijst = lijst.filter(p => (p.leverancier || '') === alleenLeverancier);
  if (!lijst.length) return '';

  const datum = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  let t = `BESTELLING — Levaux Bouw\n${datum}\n`;

  for (const [lev, producten] of perLeverancier(lijst)) {
    t += `\n${'='.repeat(34)}\n${lev.toUpperCase()}  (${producten.length} ${producten.length === 1 ? 'product' : 'producten'})\n${'='.repeat(34)}\n\n`;
    producten.forEach((p, i) => {
      const eenheid = p.eenheid && p.eenheid !== 'stuk' ? ' ' + p.eenheid : ' stuk';
      t += `${i + 1}. ${bestelAantal(p)}${eenheid} — ${[p.brand, p.name].filter(Boolean).join(' ')}\n`;
      t += `   ref ${p.ref}   (nu ${p.qty}, minimum ${p.min})\n\n`;
    });
  }
  t += `${'-'.repeat(34)}\nOpgemaakt met de voorraadapp van Levaux Bouw.\n`;
  return t;
}

/** Eén mail per leverancier: die stuur je toch naar verschillende adressen. */
function toonMailKeuze() {
  const groepen = perLeverancier(Store.teBestellen());
  if (!groepen.length) return melding('Niets bij te bestellen.');

  const stuur = lev => {
    const t = bestelTekst(lev === '__alle' ? '' : lev);
    const onderwerp = lev === '__alle' ? 'Bestelling Levaux Bouw' : `Bestelling Levaux Bouw — ${lev}`;
    location.href = `mailto:?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(t)}`;
  };

  if (groepen.length === 1) return stuur(groepen[0][0]);

  const el = $('#mail-keuze');
  el.innerHTML = groepen.map(([lev, p]) =>
    `<button class="knop knop--leeg" data-lev="${ontsnap(lev)}">${ontsnap(lev)} · ${p.length}</button>`
  ).join('') + '<button class="knop knop--zwart" data-lev="__alle">Alles in één mail</button>';
  el.onclick = e => {
    const lev = e.target.dataset.lev;
    if (!lev) return;
    $('#modal-mail').hidden = true;
    stuur(lev);
  };
  $('#modal-mail').hidden = false;
}

async function kopieer(tekst, bevestiging) {
  if (!tekst) return melding('Er valt niets te kopiëren.');
  try {
    await navigator.clipboard.writeText(tekst);
    melding(bevestiging);
  } catch {
    // oudere browsers en pagina's zonder https
    const t = document.createElement('textarea');
    t.value = tekst;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); melding(bevestiging); }
    catch { melding('Kopiëren lukt niet op dit toestel.'); }
    t.remove();
  }
}

function tekenBestellen() {
  const lijst = Store.teBestellen();
  const el = $('#bestellijst');
  el.innerHTML = '';
  if (!lijst.length) {
    el.innerHTML = `<div class="leeg"><span>✅</span>Alles zit boven het minimum.</div>`;
    return;
  }
  // per leverancier gegroepeerd — je bestelt nu eenmaal per leverancier
  for (const [lev, producten] of perLeverancier(lijst)) {
    const kop = document.createElement('div');
    kop.className = 'log__dag';
    kop.textContent = `${lev} · ${producten.length} ${producten.length === 1 ? 'product' : 'producten'}`;
    el.appendChild(kop);
    producten.forEach(p => el.appendChild(kaart(p)));
  }
}

function tekenBadge() {
  const n = Store.teBestellen().length;
  const b = $('#badge-bestellen');
  b.hidden = n === 0;
  b.textContent = n;
}

/* ===========================================================
   Historiek
   =========================================================== */

function bindHistoriek() {
  $('#btn-export-csv').addEventListener('click', () => {
    const csv = Store.exportCsv();
    download('levaux-historiek-' + datumStempel() + '.csv', csv, 'text/csv;charset=utf-8');
  });
}

function tekenHistoriek() {
  const mut = Store.mutaties().slice(0, 300);
  const el = $('#log');
  el.innerHTML = '';
  if (!mut.length) {
    el.innerHTML = `<div class="leeg"><span>🕓</span>Nog geen bewegingen.</div>`;
    return;
  }

  let vorigeDag = '';
  mut.forEach(m => {
    const d = new Date(m.ts);
    const dag = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (dag !== vorigeDag) {
      vorigeDag = dag;
      const h = document.createElement('div');
      h.className = 'log__dag';
      h.textContent = dag;
      el.appendChild(h);
    }
    const div = document.createElement('div');
    div.className = 'log__item';
    div.innerHTML = `
      <div class="log__delta ${m.delta < 0 ? 'log__delta--min' : 'log__delta--plus'}">${m.delta > 0 ? '+' : ''}${m.delta}</div>
      <div>
        <div class="log__naam">${ontsnap(m.naam)}</div>
        <div class="log__meta">${ontsnap(m.reden)}${m.door ? ' · ' + ontsnap(m.door) : ''} · nog ${m.restant}</div>
      </div>
      <div class="log__tijd">${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</div>`;
    el.appendChild(div);
  });
}

/* ===========================================================
   Instellingen
   =========================================================== */

function bindInstellingen() {
  $('#nieuwe-lev-cat').innerHTML = HOOFDCATEGORIEEN.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
  $('#btn-lev-toevoegen').addEventListener('click', async () => {
    const n = $('#nieuwe-lev').value.trim();
    if (!n) return;
    await Store.voegLeverancierToe(n, $('#nieuwe-lev-cat').value, 'tabel');
    $('#nieuwe-lev').value = '';
    melding('Leverancier toegevoegd.');
  });

  $('#btn-backup').addEventListener('click', () => {
    download('levaux-voorraad-backup-' + datumStempel() + '.json', Store.exportJson(), 'application/json');
    melding('Back-up gedownload.');
  });

  $('#btn-herstel').addEventListener('click', () => $('#herstel-bestand').click());
  $('#herstel-bestand').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!confirm('De huidige voorraad wordt vervangen door de back-up. Doorgaan?')) return;
    try {
      await Store.importJson(await f.text());
      melding('Back-up teruggezet.');
      toon('voorraad');
    } catch (err) { melding(err.message); }
  });

  $('#btn-reset-seed').addEventListener('click', async () => {
    if (!confirm('Alles terugzetten naar de startlijst van de Cebeo-order? Je historiek gaat verloren.')) return;
    await Store.zetStartlijst('data/seed.json');
    melding('Startlijst teruggezet.');
    toon('voorraad');
  });

  $('#btn-wis-alles').addEventListener('click', async () => {
    if (!confirm('Alles wissen? Dit kan niet ongedaan gemaakt worden.')) return;
    await Store.wisAlles();
    melding('Alles gewist.');
    toon('voorraad');
  });
}

function tekenOpslag() {
  const el = $('#opslag');
  if (!el) return;
  const pct = Store.opslagGebruik();
  el.innerHTML = `<div class="balk" style="margin:0 0 6px"><i style="width:${Math.max(pct, 1)}%;background:${pct > 80 ? 'var(--rood)' : 'var(--zwart)'}"></i></div>
    <div class="veld__hulp" style="margin:0">Opslag op dit toestel: ${pct < 1 ? 'minder dan 1' : pct}% gebruikt${pct > 80 ? ' — tijd voor een back-up en minder foto’s.' : '.'}</div>`;
}

function tekenLeveranciers() {
  const el = $('#lev-lijst');
  if (!el) return;
  const lijst = Store.leveranciers();

  el.innerHTML = lijst.map(l => {
    const n = Store.aantalBijLeverancier(l.naam);
    return `
    <div class="beheerrij">
      <input type="text" value="${ontsnap(l.naam)}" data-lev-naam="${ontsnap(l.naam)}" aria-label="Naam leverancier">
      <select data-lev-cat="${ontsnap(l.naam)}">
        ${HOOFDCATEGORIEEN.map(c => `<option value="${c.key}"${c.key === l.cat ? ' selected' : ''}>${c.label}</option>`).join('')}
      </select>
      <select data-lev-formaat="${ontsnap(l.naam)}" class="beheerrij__formaat">
        <option value="cebeo"${l.formaat === 'cebeo' ? ' selected' : ''}>Kaartjes (Cebeo-app)</option>
        <option value="tabel"${l.formaat !== 'cebeo' ? ' selected' : ''}>Tabel</option>
      </select>
      <button class="beheerrij__weg" data-lev-weg="${ontsnap(l.naam)}" title="${n ? n + ' product(en) — eerst verplaatsen' : 'Verwijderen'}"${n ? ' data-vast="1"' : ''}>×</button>
      <small>${n ? n + (n === 1 ? ' product' : ' producten') : 'nog niet gebruikt'}</small>
    </div>`;
  }).join('') || '<div class="veld__hulp">Nog geen leveranciers.</div>';

  el.onchange = async e => {
    const fmt = e.target.dataset.levFormaat;
    if (fmt) { await Store.zetLeverancierFormaat(fmt, e.target.value); melding('Soort orderlijst aangepast.'); return; }
    const cat = e.target.dataset.levCat;
    if (cat) { await Store.zetLeverancierCat(cat, e.target.value); melding('Standaardcategorie aangepast.'); return; }
    const oud = e.target.dataset.levNaam;
    if (oud) {
      const ok = await Store.hernoemLeverancier(oud, e.target.value);
      melding(ok ? 'Naam aangepast — ook bij de producten.' : 'Die naam kan niet (leeg of bestaat al).');
      if (!ok) tekenLeveranciers();
    }
  };
  el.onclick = async e => {
    const naam = e.target.dataset.levWeg;
    if (!naam) return;
    if (e.target.dataset.vast) return melding('Er hangen nog producten aan deze leverancier.');
    await Store.verwijderLeverancier(naam);
    melding('Leverancier verwijderd.');
  };
}

/* ===========================================================
   Cloud
   =========================================================== */

let syncTimer = null;
let syncBezig = false;

/** Na elke wijziging: even wachten en dan één keer wegschrijven. */
function planSync() {
  if (!Cloud.aangemeld() || !Cloud.team) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(duwNaarCloud, 2500);
}

async function duwNaarCloud() {
  if (!Cloud.aangemeld() || !Cloud.team || syncBezig) return;
  syncBezig = true;
  try {
    await Cloud.bewaar(Store.staat);
    tekenCloud();
  } catch (e) {
    melding('Cloud: ' + e.message);
  } finally {
    syncBezig = false;
  }
}

async function haalCloudOp() {
  try {
    const ver = await Cloud.haalOp();
    if (ver?.data) {
      const veranderd = Store.samenvoegen(ver.data);
      if (veranderd) await Store.bewaar();
    } else {
      await Cloud.bewaar(Store.staat);      // eerste keer: wat hier staat wordt de basis
    }
    tekenCloud();
  } catch (e) {
    melding('Cloud: ' + e.message);
  }
}

function bindCloud() {
  $('#log-annuleer').addEventListener('click', () => { $('#modal-login').hidden = true; });
  $('#team-annuleer').addEventListener('click', () => { $('#modal-team').hidden = true; });

  $('#log-aanmelden').addEventListener('click', async () => {
    const email = $('#log-email').value.trim();
    const ww = $('#log-ww').value;
    if (!email || !ww) return melding('Vul je e-mailadres en wachtwoord in.');
    try {
      await Cloud.meldAan(email, ww);
      $('#log-ww').value = '';
      $('#modal-login').hidden = true;
      Store.gebruiker = Cloud.naam;
      if (!Cloud.team) {
        $('#team-naam').value = Cloud.naam || '';
        $('#modal-team').hidden = false;
      } else {
        await haalCloudOp();
        melding('Aangemeld als ' + Cloud.naam);
      }
      tekenCloud();
    } catch (e) { melding(e.message); }
  });

  $('#team-nieuw').addEventListener('click', async () => {
    try {
      await Cloud.maakTeam('Levaux Bouw', $('#team-naam').value.trim());
      Store.gebruiker = Cloud.naam;
      $('#modal-team').hidden = true;
      await haalCloudOp();
      melding('Gedeelde voorraad aangemaakt.');
    } catch (e) { melding(e.message); }
  });

  $('#team-aansluiten').addEventListener('click', async () => {
    try {
      await Cloud.sluitAan($('#team-code').value, $('#team-naam').value.trim());
      Store.gebruiker = Cloud.naam;
      $('#modal-team').hidden = true;
      await haalCloudOp();
      melding('Aangesloten bij de gedeelde voorraad.');
    } catch (e) { melding(e.message); }
  });
}

function tekenCloud() {
  const paneel = $('#paneel-cloud');
  if (!paneel) return;
  paneel.hidden = !Cloud.ingesteld();
  if (!Cloud.ingesteld()) return;

  const status = $('#cloud-status');
  const knoppen = $('#cloud-knoppen');
  knoppen.innerHTML = '';

  if (!Cloud.aangemeld()) {
    $('#cloud-uitleg').textContent = 'Meld je aan om de voorraad te delen tussen toestellen en automatisch in de cloud te bewaren.';
    status.innerHTML = '';
    const b = document.createElement('button');
    b.className = 'knop';
    b.textContent = 'Aanmelden';
    b.onclick = () => { $('#modal-login').hidden = false; };
    knoppen.appendChild(b);
    return;
  }

  if (!Cloud.team) {
    $('#cloud-uitleg').textContent = 'Je bent aangemeld, maar er is nog geen gedeelde voorraad.';
    status.innerHTML = `<table class="tabel-mini"><tr><td>Aangemeld als</td><td>${ontsnap(Cloud.sessie.email)}</td></tr></table>`;
    const maak = document.createElement('button');
    maak.className = 'knop';
    maak.textContent = 'Gedeelde voorraad instellen';
    maak.onclick = () => { $('#team-naam').value = Cloud.naam || ''; $('#modal-team').hidden = false; };
    knoppen.appendChild(maak);
    const af0 = document.createElement('button');
    af0.className = 'knop knop--leeg';
    af0.textContent = 'Afmelden';
    af0.onclick = async () => { await Cloud.meldAf(); Store.gebruiker = ''; tekenCloud(); };
    knoppen.appendChild(af0);
    return;
  }

  $('#cloud-uitleg').textContent = 'De voorraad wordt automatisch bewaard in de cloud en gedeeld met je team.';
  const sync = Cloud.laatsteSync
    ? Cloud.laatsteSync.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
    : 'nog niet';
  status.innerHTML = `
    <table class="tabel-mini">
      <tr><td>Aangemeld als</td><td>${ontsnap(Cloud.naam || Cloud.sessie.email)}</td></tr>
      <tr><td>Team</td><td>${ontsnap(Cloud.team?.naam || '—')}</td></tr>
      <tr><td>Laatst gesynchroniseerd</td><td>${sync}</td></tr>
    </table>
    ${Cloud.team ? `<div class="veld__hulp" style="margin-top:8px">Teamcode om iemand toe te voegen:<br><code style="font-size:.72rem;word-break:break-all">${ontsnap(Cloud.team.id)}</code></div>` : ''}`;

  const nu = document.createElement('button');
  nu.className = 'knop knop--zwart';
  nu.textContent = 'Nu synchroniseren';
  nu.onclick = async () => { await haalCloudOp(); await duwNaarCloud(); melding('Gesynchroniseerd.'); };
  knoppen.appendChild(nu);

  if (Cloud.team) {
    const code = document.createElement('button');
    code.className = 'knop knop--leeg';
    code.textContent = 'Teamcode kopiëren';
    code.onclick = () => kopieer(Cloud.team.id, 'Teamcode gekopieerd.');
    knoppen.appendChild(code);
  }

  const af = document.createElement('button');
  af.className = 'knop knop--leeg';
  af.textContent = 'Afmelden';
  af.onclick = async () => {
    await Cloud.meldAf();
    Store.gebruiker = '';
    tekenCloud();
    melding('Afgemeld. De voorraad blijft op dit toestel staan.');
  };
  knoppen.appendChild(af);
}

/* ===========================================================
   Hulpjes
   =========================================================== */

let toastTimer;
function melding(tekst) {
  const t = $('#toast');
  t.textContent = tekst;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function download(naam, inhoud, type) {
  // BOM enkel voor CSV, zodat Excel de accenten juist toont.
  const stukken = type.startsWith('text/csv') ? ['﻿', inhoud] : [inhoud];
  const blob = new Blob(stukken, { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function datumStempel() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/* handig tijdens het testen vanuit de console */
window.LevauxStore = Store;
window.LevauxParse = parseer;
window.normRef = normRef;
