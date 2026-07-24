/* ===========================================================
   store.js — datalaag
   -----------------------------------------------------------
   De app praat NOOIT rechtstreeks met localStorage. Alles gaat
   via deze Store. Wil je later naar de cloud (Supabase), dan
   schrijf je enkel een nieuwe adapter met dezelfde vier
   methodes (laden / bewaren / beschikbaar / naam) en zet je
   hem onderaan in `kiesAdapter()`. De rest van de app blijft
   ongewijzigd.
   =========================================================== */

const SLEUTEL = 'levaux.voorraad.v1';
export const VERSIE = '1.9.0';
const DATAVERSIE = 7;

/** De vier hoofdcategorieën waarin Cédric zijn materiaal opdeelt. */
export const HOOFDCATEGORIEEN = [
  { key: 'elektra',    label: 'Elektra' },
  { key: 'sanitair',   label: 'Chauffage & Sanitair' },
  { key: 'ruwbouw',    label: 'Ruwbouw' },
  { key: 'hout',       label: 'Hout' },
  { key: 'materialen', label: 'Gebruiksmaterialen' }
];

export const EENHEDEN = ['stuk', 'm', 'm²', 'zak', 'pallet', 'rol', 'kg', 'doos', 'liter'];

/* --- Minimumvoorraad per soort product ---------------------
   Cédric heeft per soort materiaal bepaald wanneer hij wil
   bijbestellen. Deze regels gelden ook voor producten die er
   later bijkomen, zodat hij dat niet elke keer moet invullen.
   De eerste regel die past wint, dus staat het meest
   specifieke bovenaan.
------------------------------------------------------------ */

/* Op een bestelbon staat het even vaak voluit als afgekort: "Differentieel",
   "Differentieelschakelaar", "Diff. 30mA". Eén herkenner voor alledrie. */
const isDiff = t => /differentie/.test(t) || /\bdiff\.?\b/.test(t);

/* Nederlandse meervouden veranderen de klinker: automaat → automaten,
   kabelgoot → kabelgoten, doos → dozen. Zoeken op het enkelvoud alleen
   laat die dus liggen. Daarom staat het meervoud er telkens bij. */
const OPBOUWDOOS  = /opbouwdo(os|zen)/;
const INBOUWDOOS  = /inbouwdo(os|zen)/;

export const MINIMUMREGELS = [
  { key: 'diff300',     label: 'Differentieel 300mA', min: 5,  test: t => isDiff(t) && /300\s*ma/.test(t) },
  { key: 'diff30',      label: 'Differentieel 30mA',  min: 10, test: t => isDiff(t) && /(^|[^0])30\s*ma/.test(t) },
  { key: 'hydrodoos',   label: 'Hydro opbouwdoos',    min: 10, test: t => /hydro/.test(t) && OPBOUWDOOS.test(t) },
  { key: 'inbouwdoos',  label: 'Inbouwdoos',          min: 10, test: t => INBOUWDOOS.test(t) },
  { key: 'automaat',    label: 'Automaat',            min: 15, test: t => /automa(at|ten)/.test(t) },
  // Vangnet: staat er "differentieel" zonder dat er 30 of 300 mA bij staat,
  // dan geldt dit aantal. Bewust ná 'automaat', zodat een
  // differentieelautomaat bij de automaten blijft horen.
  { key: 'diff',        label: 'Differentieel (rest)', min: 10, test: isDiff },
  { key: 'afdekplaat',  label: 'Afdekplaat',          min: 25, test: t => /afdekpla(at|ten)/.test(t) },
  { key: 'stopcontact', label: 'Stopcontact',         min: 10, test: t => /stopcontact/.test(t) },
  // geen woordgrens: op een bon staat evengoed "bedieningstoets"
  { key: 'toets',       label: 'Toets',               min: 20, test: t => /toets/.test(t) },
  { key: 'kabelgoot',   label: 'Kabelgoot',           min: 5,  test: t => /kabelgo(ot|ten)/.test(t) },
  { key: 'infrarood',   label: 'Infrarood',           min: 2,  test: t => /infrarood|\bir\b/.test(t) },
  { key: 'dimmer',      label: 'Dimmermodule',        min: 2,  test: t => /dimmermodule/.test(t) },
  { key: 'verdeelkast', label: 'Verdeelkast',         min: 2,  test: t => /verdeelkast/.test(t) }
];

/* Productnamen komen uit tekstherkenning en uit vier verschillende
   leverancierscatalogi. Voor we ze langs de regels sturen, halen we de
   verschillen eruit die niets betekenen: accenten, koppeltekens,
   dubbele spaties. Zo past "afdek-plaat" en "AFDEKPLAAT" evengoed. */
export function normNaam(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')     // é → e
    .replace(/[-_/\\.,;:()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Een koppelteken kan twee dingen betekenen: een echt streepje tussen twee
   woorden ("3-voudig") of een gebroken samenstelling ("afdek-plaat"). We
   weten niet welk van de twee, dus proberen we het allebei: één keer met
   spaties en één keer aaneengeschreven. */
export function naamVarianten(...delen) {
  const t = normNaam(delen.filter(Boolean).join(' '));
  return t ? [t, t.replace(/ /g, '')] : [];
}

function past(regel, varianten) {
  return varianten.some(v => regel.test(v));
}

/** Welke regel past bij deze productnaam? (zonder eigen aantallen) */
function zoekRegel(...delen) {
  const v = naamVarianten(...delen);
  if (!v.length) return null;
  return MINIMUMREGELS.find(r => past(r, v)) || null;
}

export const labelVanCat = k => HOOFDCATEGORIEEN.find(c => c.key === k)?.label || 'Gebruiksmaterialen';

/* ---------- Adapter: dit toestel (localStorage) ------------ */

const LokaleAdapter = {
  naam: 'lokaal',
  beschikbaar() {
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
      return true;
    } catch { return false; }
  },
  async laden() {
    const ruw = localStorage.getItem(SLEUTEL);
    return ruw ? JSON.parse(ruw) : null;
  },
  async bewaren(staat) {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify(staat));
    } catch (e) {
      // Browsers geven ongeveer 5 MB per site. Met foto's van ~30 kB
      // per product loopt dat rond de 120 à 150 foto's vol.
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        throw new Error('De opslag op dit toestel zit vol. Maak een back-up en verwijder enkele foto’s, of stap over op cloudopslag.');
      }
      throw e;
    }
  },
  /** Ruwe schatting van hoeveel opslag al gebruikt is (0–1). */
  gebruik() {
    try { return Math.min(1, (localStorage.getItem(SLEUTEL) || '').length / (4.6 * 1024 * 1024)); }
    catch { return 0; }
  }
};

/* ---------- Adapter: geheugen (noodgeval / privémodus) ----- */

const GeheugenAdapter = {
  naam: 'geheugen',
  _s: null,
  beschikbaar() { return true; },
  async laden() { return this._s; },
  async bewaren(staat) { this._s = staat; }
};

/* ---------- Adapter: cloud (later) -------------------------
   Zo ziet een Supabase-adapter er straks uit. Vul de twee
   methodes in, zet hem in kiesAdapter() en klaar.

const CloudAdapter = {
  naam: 'cloud',
  beschikbaar() { return !!window.SUPABASE_URL; },
  async laden()  { ... select uit tabel, geef zelfde object terug ... },
  async bewaren(staat) { ... upsert ... }
};
------------------------------------------------------------ */

function kiesAdapter() {
  return LokaleAdapter.beschikbaar() ? LokaleAdapter : GeheugenAdapter;
}

/* ---------- Hulpjes ---------------------------------------- */

const id = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function normRef(ref) {
  return String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* --- Referenties vergelijken ondanks leesfouten -------------
   Tekstherkenning haalt O en 0, I en 1, S en 5, B en 8 door
   elkaar. Zo belandt "IS2140EC0B" als "IS2140ECOB" in een
   tweede, dubbel product. Daarom vergelijken we referenties
   met die verwarring weggerekend, plus één te veel gelezen
   teken ("7000-84202" ↔ "700-84202").
   Eén ANDER teken laten we bewust niet toe: 403138 en 403139
   zijn twee verschillende automaten.
------------------------------------------------------------ */

const VERWARRING = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', G: '6', Z: '2' };

export function fuzzKey(ref) {
  return normRef(ref).split('').map(c => VERWARRING[c] || c).join('');
}

function eenTekenTeveel(lang, kort) {
  if (lang.length - kort.length !== 1) return false;
  let i = 0, j = 0, over = 0;
  while (i < lang.length && j < kort.length) {
    if (lang[i] === kort[j]) { i++; j++; }
    else { i++; if (++over > 1) return false; }
  }
  return true;
}

export function lijktOp(a, b) {
  const x = fuzzKey(a), y = fuzzKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length > y.length ? eenTekenTeveel(x, y) : eenTekenTeveel(y, x);
}

function legeStaat() {
  return {
    versie: DATAVERSIE,
    producten: [],
    mutaties: [],
    // Per leverancier onthouden we in welke hoofdcategorie zijn materiaal
    // meestal valt. Alles van Cebeo is elektra, dus dat hoeft Cédric
    // nooit meer aan te duiden — hij kan het per product wel wijzigen.
    // formaat = hoe hun orderlijst eruitziet:
    //   'cebeo' = kaartjes met "Ref Cebeo" (de Cebeo-app)
    //   'tabel' = artikelnummer | naam | aantal | prijs (de meeste anderen)
    leveranciers: [
      { naam: 'Cebeo', cat: 'elektra', formaat: 'cebeo' },
      { naam: 'EMZ Maarten Paulissen', cat: 'sanitair', formaat: 'tabel' }
    ],
    orders: [],
    minima: {},          // eigen aantallen per minimumregel
    eigenRegels: [],     // zelf toegevoegde regels: { key, woord, min }
    // Verwijderde producten laten een spoor na. Zonder dat spoor komt een
    // product dat je hier wist gewoon terug zodra een ander toestel zijn
    // versie naar de cloud stuurt.
    verwijderd: [],
    instellingen: {}
  };
}

/** Oudere opgeslagen gegevens bijwerken naar het huidige model. */
function migreer(staat) {
  if (!staat.leveranciers) staat.leveranciers = [{ naam: 'Cebeo', cat: 'elektra', formaat: 'cebeo' }];
  if ((staat.versie || 1) < 2) {
    staat.producten.forEach(p => {
      if (!p.hoofdcat) p.hoofdcat = 'elektra';        // alles tot nu toe kwam van Cebeo
      if (!p.leverancier) p.leverancier = 'Cebeo';
      if (!p.eenheid) p.eenheid = 'stuk';
    });
    staat.versie = 2;
  }
  if (staat.versie < 3) {
    staat.leveranciers.forEach(l => {
      if (!l.formaat) l.formaat = /cebeo/i.test(l.naam) ? 'cebeo' : 'tabel';
    });
    if (!staat.leveranciers.some(l => /EMZ/i.test(l.naam))) {
      staat.leveranciers.push({ naam: 'EMZ Maarten Paulissen', cat: 'sanitair', formaat: 'tabel' });
    }
    staat.versie = 3;
  }
  if (!Array.isArray(staat.verwijderd)) staat.verwijderd = [];
  if (staat.versie < 4) {
    staat.producten.forEach(p => {
      const regel = zoekRegel(p.brand, p.name);
      if (regel) { p.min = staat.minima?.[regel.key] ?? regel.min; p.minAuto = true; }
    });
    staat.versie = 4;
  }
  if (!staat.minima) staat.minima = {};
  if (staat.versie < 5) {
    staat.verwijderd = staat.verwijderd || [];
    staat.versie = 5;
  }
  if (staat.versie < 6) {
    staat.minima = staat.minima || {};
    staat.versie = 6;
  }
  // Er is een regel bijgekomen ("Differentieel (rest)"). Producten die nog geen
  // eigen minimum hebben gekregen, laten we ze opnieuw langs de regels lopen.
  if (staat.versie < 7) {
    staat.producten.forEach(p => {
      if (p.minAuto === false) return;
      const regel = zoekRegel(p.brand, p.name);
      if (regel) { p.min = staat.minima?.[regel.key] ?? regel.min; p.minAuto = true; }
    });
    staat.versie = 7;
  }
  if (!Array.isArray(staat.eigenRegels)) staat.eigenRegels = [];
  return staat;
}

/* ===========================================================
   Store
   =========================================================== */

export const Store = {
  adapter: kiesAdapter(),
  staat: legeStaat(),
  gebruiker: '',            // naam van wie is aangemeld (voor de historiek)
  _luisteraars: new Set(),

  async init(seedUrl) {
    const opgeslagen = await this.adapter.laden();
    if (opgeslagen && Array.isArray(opgeslagen.producten)) {
      this.staat = migreer({ ...legeStaat(), ...opgeslagen });
      await this.bewaar();
    } else {
      await this.zetStartlijst(seedUrl);
    }
    return this.staat;
  },

  /** Laadt de startlijst (de Cebeo-order uit de screenshots). */
  async zetStartlijst(seedUrl) {
    this.staat = legeStaat();
    try {
      // window.__SEED__ wordt gebruikt door de demo-versie in één bestand
      const seed = window.__SEED__ || await fetch(seedUrl).then(r => r.json());
      const nu = new Date().toISOString();
      seed.products.forEach(p => {
        const regel = this.regelVoor(p.brand, p.name);
        this.staat.producten.push({
          id: id(),
          ref: p.ref,
          refKey: normRef(p.ref),
          brand: p.brand,
          name: p.name,
          qty: p.qty,
          min: regel?.min ?? p.min ?? 0,
          minAuto: !!regel,
          price: p.price ?? 0,
          cat: p.cat || '',
          hoofdcat: p.hoofdcat || 'elektra',
          leverancier: p.leverancier || seed.order?.leverancier || 'Cebeo',
          eenheid: p.eenheid || 'stuk',
          type: p.type || 'stock',
          foto: '',
          gewijzigd: nu
        });
      });
      if (seed.products.length) {
        this.staat.orders.push({
          id: id(), ts: nu, label: seed.order?.label || 'Startvoorraad', regels: seed.products.length
        });
      }
      this.staat.uitStartlijst = true;   // nog niets van de gebruiker zelf
    } catch (e) {
      console.warn('Startlijst niet gevonden:', e);
    }
    await this.bewaar();
  },

  async wisAlles() {
    this.staat = legeStaat();
    await this.bewaar();
  },

  _foutmelders: new Set(),

  async bewaar() {
    this.staat.gewijzigd = new Date().toISOString();
    try {
      await this.adapter.bewaren(this.staat);
    } catch (e) {
      this._foutmelders.forEach(fn => fn(e.message));
      throw e;
    }
    this._luisteraars.forEach(fn => fn(this.staat));
  },

  bijWijziging(fn) { this._luisteraars.add(fn); },
  bijFout(fn) { this._foutmelders.add(fn); },

  /** Hoe vol de opslag zit, als percentage. */
  opslagGebruik() { return Math.round((this.adapter.gebruik?.() || 0) * 100); },

  /* ---------- Producten ------------------------------------ */

  producten() { return this.staat.producten; },

  zoek(term) {
    const t = String(term || '').trim().toLowerCase();
    if (!t) return this.staat.producten;
    const tRef = normRef(t);
    return this.staat.producten.filter(p =>
      p.name.toLowerCase().includes(t) ||
      p.brand.toLowerCase().includes(t) ||
      (p.leverancier || '').toLowerCase().includes(t) ||
      (tRef && p.refKey.includes(tRef))
    );
  },

  viaRef(ref) {
    const k = normRef(ref);
    return k ? this.staat.producten.find(p => p.refKey === k) : undefined;
  },

  viaId(pid) { return this.staat.producten.find(p => p.id === pid); },

  /** Zoekt een product waarvan de referentie op een leesfout na klopt. */
  viaRefBijna(ref) {
    const exact = this.viaRef(ref);
    if (exact) return { product: exact, exact: true };
    const p = this.staat.producten.find(x => lijktOp(x.ref, ref));
    return p ? { product: p, exact: false } : null;
  },

  async voegProductToe(data) {
    const leverancier = data.leverancier || '';
    const ref = data.ref || this.eigenRef(leverancier);
    // Geen eigen minimum meegegeven? Dan kijkt de app zelf: eerst de regels,
    // en anders wat gelijkaardige producten in de voorraad al hebben staan.
    const gevonden = this.minimumVoor(data.brand, data.name);
    const p = {
      id: id(),
      ref,
      refKey: normRef(ref),
      brand: data.brand || '',
      name: data.name || 'Naamloos product',
      qty: Number(data.qty) || 0,
      // niets ingevuld? dan geldt de afgesproken regel voor dit soort product
      min: Number(data.min) || gevonden.min || 0,
      // minAuto = "de gebruiker heeft hier zelf niets ingesteld", ook als er
      // (nog) geen regel op past. Anders volgt het product later niet mee
      // wanneer de naam verandert of er een regel bijkomt.
      minAuto: data.minAuto !== undefined ? !!data.minAuto : !Number(data.min),
      price: Number(data.price) || 0,
      cat: data.cat || '',
      hoofdcat: data.hoofdcat || this.catVanLeverancier(leverancier),
      leverancier,
      eenheid: data.eenheid || 'stuk',
      type: data.type || 'stock',
      foto: data.foto || '',
      gewijzigd: new Date().toISOString()
    };
    this.staat.producten.push(p);
    await this.bewaar();
    return p;
  },

  async bewerkProduct(pid, velden) {
    const p = this.viaId(pid);
    if (!p) return;
    const oudAantal = p.qty;
    if (velden.min !== undefined && Number(velden.min) !== p.min) p.minAuto = false;
    const naamWijzigt = (velden.name !== undefined && velden.name !== p.name)
                     || (velden.brand !== undefined && velden.brand !== p.brand);
    Object.assign(p, velden);
    if (velden.ref !== undefined) p.refKey = normRef(velden.ref);

    // Andere naam kan een ander soort product betekenen: dan geldt de regel
    // van dat soort weer — tenzij je het minimum zelf hebt ingesteld.
    if (naamWijzigt && p.minAuto !== false) {
      const gevonden = this.minimumVoor(p.brand, p.name, p.id);
      if (gevonden.bron !== 'geen') { p.min = gevonden.min; p.minAuto = true; }
    }
    p.qty = Math.max(0, Number(p.qty) || 0);
    p.gewijzigd = new Date().toISOString();
    if (velden.qty !== undefined && p.qty !== oudAantal) {
      this._log(p, p.qty - oudAantal, 'correctie', { note: 'handmatig aangepast' });
    }
    await this.bewaar();
    return p;
  },

  async verwijderProduct(pid) {
    this._noteerVerwijderd([pid]);
    this.staat.producten = this.staat.producten.filter(p => p.id !== pid);
    await this.bewaar();
  },

  /** Meerdere producten tegelijk verwijderen. */
  async verwijderProducten(ids) {
    const set = new Set(ids);
    if (!set.size) return 0;
    this._noteerVerwijderd([...set]);
    this.staat.producten = this.staat.producten.filter(p => !set.has(p.id));
    await this.bewaar();
    return set.size;
  },

  /** Alles weg, maar leveranciers, regels en instellingen blijven. */
  async wisProducten() {
    const n = this.staat.producten.length;
    this._noteerVerwijderd(this.staat.producten.map(p => p.id));
    this.staat.producten = [];
    this.staat.mutaties = [];
    this.staat.orders = [];
    this.staat.uitStartlijst = false;
    await this.bewaar();
    return n;
  },

  _noteerVerwijderd(ids) {
    const nu = new Date().toISOString();
    ids.forEach(pid => {
      const p = this.viaId(pid);
      if (p) this.staat.verwijderd.push({ id: p.id, refKey: p.refKey, ts: nu });
    });
    // een half jaar bewaren is ruim genoeg om terugkeer te voorkomen
    const grens = Date.now() - 183 * 24 * 3600 * 1000;
    this.staat.verwijderd = this.staat.verwijderd
      .filter(v => new Date(v.ts).getTime() > grens)
      .slice(-1000);
  },

  /* ---------- Bewegingen ----------------------------------- */

  /** delta < 0 = afname uit de bus, delta > 0 = bijtellen. */
  async muteer(pid, delta, reden = 'afname', extra = {}) {
    const p = this.viaId(pid);
    if (!p || !delta) return;
    p.qty = Math.max(0, p.qty + delta);
    p.gewijzigd = new Date().toISOString();
    this._log(p, delta, reden, extra);
    await this.bewaar();
    return p;
  },

  _log(p, delta, reden, extra = {}) {
    this.staat.mutaties.unshift({
      id: id(),
      ts: new Date().toISOString(),
      productId: p.id,
      ref: p.ref,
      naam: `${p.brand} - ${p.name}`,
      delta,
      reden,
      note: extra.note || '',
      door: this.gebruiker || '',
      orderId: extra.orderId || '',
      restant: p.qty
    });
    if (this.staat.mutaties.length > 2000) this.staat.mutaties.length = 2000;
  },

  mutaties() { return this.staat.mutaties; },

  /* ---------- Order inboeken ------------------------------- */

  /**
   * regels: [{ ref, brand, name, qty, price, bestaandId }]
   * Bestaat de referentie al? Dan telt het aantal erbij.
   * Zo niet, dan komt het product er nieuw bij.
   */
  async boekOrderIn(regels, label = 'Cebeo-order', leverancier = 'Cebeo') {
    const order = { id: id(), ts: new Date().toISOString(), label, regels: regels.length };
    let bij = 0, nieuw = 0;

    for (const r of regels) {
      const aantal = Number(r.qty) || 0;
      if (aantal <= 0) continue;
      const bestaand = r.bestaandId ? this.viaId(r.bestaandId) : this.viaRefBijna(r.ref)?.product;

      if (bestaand) {
        bestaand.qty += aantal;
        bestaand.gewijzigd = order.ts;
        if (r.price) bestaand.price = Number(r.price);
        // foto uit de screenshot, maar nooit een zelf genomen foto overschrijven
        if (r.foto && !bestaand.foto) bestaand.foto = r.foto;
        this._log(bestaand, aantal, 'order', { orderId: order.id, note: label });
        bij++;
      } else {
        const p = await this.voegProductToe({
          ref: r.ref, brand: r.brand, name: r.name, qty: 0,
          price: r.price, min: r.min ?? 0, cat: r.cat || '', foto: r.foto || '',
          leverancier, hoofdcat: this.catVanLeverancier(leverancier)
        });
        p.qty = aantal;
        this._log(p, aantal, 'order', { orderId: order.id, note: label });
        nieuw++;
      }
    }

    this.staat.orders.unshift(order);
    await this.bewaar();
    return { bij, nieuw, order };
  },

  /**
   * Alle regels die nu gelden: eerst de vaste, dan die van jou.
   * Eigen regels staan achteraan: ze vullen de gaten op, ze duwen de vaste
   * regels niet opzij. Anders zou een eigen regel "schakelaar" ook een
   * differentieelschakelaar inpikken.
   */
  regels() {
    const vast = MINIMUMREGELS.map(r => ({ ...r, min: this.staat.minima?.[r.key] ?? r.min, eigen: false }));
    const eigen = (this.staat.eigenRegels || []).map(r => ({
      key: r.key,
      label: r.woord,
      woord: r.woord,
      min: this.staat.minima?.[r.key] ?? r.min,
      eigen: true,
      test: t => t.includes(normNaam(r.woord))
    }));
    return [...vast, ...eigen];
  },

  /** Het afgesproken minimum bij een productnaam — vaste én eigen regels. */
  regelVoor(...delen) {
    const v = naamVarianten(...delen);
    if (!v.length) return null;
    return this.regels().find(r => v.some(x => r.test(x))) || null;
  },

  /**
   * Producten die op geen enkele regel passen. Handig om te zien welk woord
   * er nog ontbreekt — daar kan je dan zelf een regel voor maken.
   */
  zonderRegel() {
    return this.staat.producten.filter(p => !this.regelVoor(p.brand, p.name));
  },

  /**
   * Geen regel gevonden? Kijk dan naar wat er al in de voorraad staat.
   * Typ je "Schakelaar" en je hebt al schakelaars met minimum 12 liggen,
   * dan is 12 een beter antwoord dan 0. We nemen het aantal dat het
   * vaakst voorkomt bij de gelijkaardige producten.
   */
  geleerdMinimum(naam, negeerId = '') {
    const buren = this.gelijkaardig(naam, negeerId).filter(p => p.min > 0);
    if (!buren.length) return null;
    const tel = {};
    buren.forEach(p => { tel[p.min] = (tel[p.min] || 0) + 1; });
    const beste = Object.entries(tel).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0];
    return { min: Number(beste[0]), aantal: buren.length, voorbeeld: buren[0] };
  },

  /**
   * Waar komt het minimum voor dit product vandaan?
   * @returns {{min:number, bron:'regel'|'geleerd'|'geen', regel?:object, geleerd?:object}}
   */
  minimumVoor(merk, naam, negeerId = '') {
    const regel = this.regelVoor(merk, naam);
    if (regel) return { min: regel.min, bron: 'regel', regel };
    const geleerd = this.geleerdMinimum([merk, naam].filter(Boolean).join(' '), negeerId);
    if (geleerd) return { min: geleerd.min, bron: 'geleerd', geleerd };
    return { min: 0, bron: 'geen' };
  },

  /** Een minimum aanpassen; producten die op die regel draaien volgen mee. */
  async zetMinimum(key, waarde) {
    const regel = this.regels().find(r => r.key === key);
    if (!regel) return 0;
    const standaard = MINIMUMREGELS.find(r => r.key === key)?.min
                   ?? (this.staat.eigenRegels || []).find(r => r.key === key)?.min;
    const n = Math.max(0, parseInt(waarde, 10) || 0);
    const nu = new Date().toISOString();
    this.staat.minima = this.staat.minima || {};
    this.staat.minimaTs = this.staat.minimaTs || {};
    if (n === standaard) delete this.staat.minima[key];
    else this.staat.minima[key] = n;
    // tijdstip erbij, zodat bij het synchroniseren de laatste wijziging wint
    // en niet gewoon het toestel dat toevallig als laatste opstart
    this.staat.minimaTs[key] = nu;

    let bij = 0;
    this.staat.producten.forEach(p => {
      if (p.minAuto === false) return;
      if (this.regelVoor(p.brand, p.name)?.key === key && p.min !== n) {
        p.min = n; p.minAuto = true; p.gewijzigd = nu; bij++;   // stempel, anders reist het niet mee
      }
    });
    await this.bewaar();
    return bij;
  },

  /** Een eigen regel: een woord en het aantal dat daarbij hoort. */
  async voegRegelToe(woord, waarde) {
    const w = String(woord || '').trim();
    if (!w) throw new Error('Geef een woord in, bijvoorbeeld "schakelaar".');
    if (w.length < 3) throw new Error('Neem een woord van minstens drie letters, anders past het overal op.');
    const bestaat = this.regels().some(r => (r.woord || r.label).toLowerCase() === w.toLowerCase());
    if (bestaat) throw new Error(`Er is al een regel voor "${w}".`);

    this.staat.eigenRegels = this.staat.eigenRegels || [];
    const regel = { key: 'eigen-' + normRef(w).toLowerCase() + '-' + Math.random().toString(36).slice(2, 6),
                    woord: w, min: Math.max(0, parseInt(waarde, 10) || 0) };
    this.staat.eigenRegels.push(regel);

    // meteen toepassen op wat er al ligt en nog geen eigen minimum heeft
    let bij = 0;
    this.staat.producten.forEach(p => {
      if (p.minAuto === false) return;
      if (this.regelVoor(p.brand, p.name)?.key === regel.key && p.min !== regel.min) {
        p.min = regel.min; p.minAuto = true; bij++;
      }
    });
    await this.bewaar();
    return { regel, bij };
  },

  async verwijderRegel(key) {
    this.staat.eigenRegels = (this.staat.eigenRegels || []).filter(r => r.key !== key);
    if (this.staat.minima) delete this.staat.minima[key];
    await this.bewaar();
  },

  /** Past de minimumregels opnieuw toe. Zelf ingestelde minimums blijven. */
  async pasRegelsToe({ ookHandmatig = false } = {}) {
    let n = 0;
    this.staat.producten.forEach(p => {
      if (!ookHandmatig && p.minAuto === false) return;
      const regel = this.regelVoor(p.brand, p.name);
      if (regel && p.min !== regel.min) { p.min = regel.min; p.minAuto = true; n++; }
    });
    if (n) await this.bewaar();
    return n;
  },

  /**
   * Producten met een gelijkaardige naam — om dubbels te vermijden.
   * We vergelijken in twee richtingen: hoeveel van de getypte woorden komen
   * voor, én hoeveel woorden telt het bestaande product. Anders lijkt een
   * lange naam al snel op een korte omdat er toevallig één woord in staat.
   */
  gelijkaardig(naam, negeerId = '') {
    const splits = t => String(t).toLowerCase()
      .replace(/[^a-z0-9à-ÿ ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const woorden = splits(naam);
    if (woorden.length < 1) return [];

    return this.staat.producten
      .filter(p => p.id !== negeerId)
      .map(p => {
        const andere = splits(p.brand + ' ' + p.name);
        const gemeen = woorden.filter(w => andere.some(a => a === w || a.includes(w) || w.includes(a)));
        const score = gemeen.length / Math.max(woorden.length, andere.length);
        // minstens één echt woord gemeenschappelijk, geen toevallige "wit"
        const stevig = gemeen.some(w => w.length >= 4);
        return { p, score: stevig ? score : 0 };
      })
      .filter(x => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.p);
  },

  /**
   * Typ-terwijl-je-zoekt: bestaande producten waar de getypte tekst letterlijk
   * in voorkomt. Bewust simpel — dit is het lijstje onder het invulveld, niet
   * de dubbelcontrole. Wie "schakel" typt wil ook "Schakelaar" zien.
   * Wat met de tekst begint komt bovenaan.
   */
  zoekNaam(tekst, negeerId = '', limiet = 6) {
    const t = String(tekst).toLowerCase().trim();
    if (t.length < 2) return [];
    return this.staat.producten
      .filter(p => p.id !== negeerId)
      .map(p => {
        // We rangschikken op de omschrijving zelf, niet op merk + omschrijving:
        // anders staat "Schakelaar enkelpolig" achteraan omdat er "NIKO" voor
        // staat en het woord dus niet meer vooraan lijkt te komen.
        const naam = String(p.name || '').toLowerCase();
        const pos = naam.indexOf(t);
        const elders = ((p.brand || '') + ' ' + (p.ref || '')).toLowerCase().includes(t);
        if (pos < 0 && !elders) return null;
        if (pos < 0) return { p, rang: 3 };                          // enkel in merk of referentie
        if (pos === 0) return { p, rang: 0 };                        // begint ermee
        return { p, rang: naam[pos - 1] === ' ' ? 1 : 2 };           // woordbegin, of ergens middenin
      })
      .filter(Boolean)
      .sort((a, b) => a.rang - b.rang || a.p.name.localeCompare(b.p.name, 'nl'))
      .slice(0, limiet)
      .map(x => x.p);
  },

  /* ---------- Leveranciers --------------------------------- */

  leveranciers() { return this.staat.leveranciers; },

  /** Leveranciers die effectief in de voorraad voorkomen. */
  gebruikteLeveranciers() {
    return [...new Set(this.staat.producten.map(p => p.leverancier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
  },

  catVanLeverancier(naam) {
    return this.staat.leveranciers.find(l => l.naam.toLowerCase() === String(naam).toLowerCase())?.cat || 'materialen';
  },

  async voegLeverancierToe(naam, cat = 'materialen', formaat = 'tabel') {
    const n = String(naam || '').trim();
    if (!n || this.staat.leveranciers.some(l => l.naam.toLowerCase() === n.toLowerCase())) return;
    this.staat.leveranciers.push({ naam: n, cat, formaat });
    await this.bewaar();
  },

  leverancier(naam) {
    return this.staat.leveranciers.find(l => l.naam.toLowerCase() === String(naam).toLowerCase());
  },

  formaatVanLeverancier(naam) {
    return this.leverancier(naam)?.formaat || 'tabel';
  },

  async zetLeverancierFormaat(naam, formaat) {
    const l = this.leverancier(naam);
    if (l) { l.formaat = formaat; await this.bewaar(); }
  },

  async zetLeverancierCat(naam, cat) {
    const l = this.staat.leveranciers.find(x => x.naam === naam);
    if (l) { l.cat = cat; await this.bewaar(); }
  },

  /** Naam wijzigen en meteen bij alle producten die eraan hangen. */
  async hernoemLeverancier(oud, nieuw) {
    const n = String(nieuw || '').trim();
    const l = this.staat.leveranciers.find(x => x.naam === oud);
    if (!l || !n || n === oud) return false;
    if (this.staat.leveranciers.some(x => x.naam.toLowerCase() === n.toLowerCase())) return false;
    l.naam = n;
    this.staat.producten.forEach(p => { if (p.leverancier === oud) p.leverancier = n; });
    await this.bewaar();
    return true;
  },

  async verwijderLeverancier(naam) {
    this.staat.leveranciers = this.staat.leveranciers.filter(l => l.naam !== naam);
    await this.bewaar();
  },

  /** Hoeveel producten hangen er aan deze leverancier? */
  aantalBijLeverancier(naam) {
    return this.staat.producten.filter(p => p.leverancier === naam).length;
  },

  /** Eigen materiaal zonder leveranciersreferentie: EIGEN-001, EIGEN-002, … */
  eigenRef(leverancier = '') {
    const prefix = (leverancier ? leverancier.slice(0, 4) : 'EIGEN').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'EIGEN';
    let n = 1, kandidaat;
    do { kandidaat = `${prefix}-${String(n++).padStart(3, '0')}`; } while (this.viaRef(kandidaat));
    return kandidaat;
  },

  /* ---------- Back-up -------------------------------------- */

  exportJson() {
    return JSON.stringify({ ...this.staat, geexporteerd: new Date().toISOString(), app: 'levaux-voorraad', versie_app: VERSIE }, null, 2);
  },

  async importJson(tekst) {
    const data = JSON.parse(tekst);
    if (!Array.isArray(data.producten)) throw new Error('Dit lijkt geen back-up van deze app.');
    this.staat = { ...legeStaat(), ...data };
    this.staat.producten.forEach(p => { p.refKey = normRef(p.ref); });
    await this.bewaar();
  },

  /* ---------- Samenvoegen met de cloud --------------------
     Twee toestellen die tegelijk werken: per product wint de
     laatst gewijzigde versie, en de historiek van beide kanten
     wordt samengevoegd. Boekt iemand op hetzelfde moment op
     een ander toestel iets af van hetzelfde product, dan kan
     die ene afboeking verloren gaan — de historiek toont dat
     wel. Voor één man met af en toe een tweede toestel is dat
     ruim voldoende; wil je het waterdicht, dan moet elke
     afboeking apart naar de server.
  --------------------------------------------------------- */
  samenvoegen(ander) {
    if (!ander || !Array.isArray(ander.producten)) return false;
    const nieuwer = (a, b) => new Date(a || 0) > new Date(b || 0);

    // sporen van beide kanten samenleggen
    const sporen = [...(this.staat.verwijderd || [])];
    (ander.verwijderd || []).forEach(v => {
      if (!sporen.some(x => x.id === v.id && x.ts === v.ts)) sporen.push(v);
    });
    this.staat.verwijderd = sporen;
    const gewist = (p) => sporen.find(v => v.id === p.id || (v.refKey && v.refKey === p.refKey));

    // hier verwijderd, elders nog niet → hier verwijderd houden
    // elders verwijderd, hier nog wel → ook hier weghalen
    this.staat.producten = this.staat.producten.filter(p => {
      const spoor = gewist(p);
      return !(spoor && nieuwer(spoor.ts, p.gewijzigd));
    });

    const perId = new Map(this.staat.producten.map(p => [p.id, p]));
    // ook op referentie matchen: hetzelfde product kan op twee
    // toestellen apart zijn aangemaakt
    const perRef = new Map(this.staat.producten.filter(p => p.refKey).map(p => [p.refKey, p]));

    ander.producten.forEach(rp => {
      const spoor = gewist(rp);
      if (spoor && nieuwer(spoor.ts, rp.gewijzigd)) return;      // bewust verwijderd
      const mijn = perId.get(rp.id) || (rp.refKey && perRef.get(rp.refKey));
      if (!mijn) {
        this.staat.producten.push(rp);
      } else if (nieuwer(rp.gewijzigd, mijn.gewijzigd)) {
        Object.assign(mijn, rp, { id: mijn.id });
      }
    });

    const gezien = new Set(this.staat.mutaties.map(m => m.id));
    (ander.mutaties || []).forEach(m => { if (!gezien.has(m.id)) this.staat.mutaties.push(m); });
    this.staat.mutaties.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    if (this.staat.mutaties.length > 2000) this.staat.mutaties.length = 2000;

    (ander.leveranciers || []).forEach(l => {
      if (!this.staat.leveranciers.some(x => x.naam.toLowerCase() === l.naam.toLowerCase())) {
        this.staat.leveranciers.push(l);
      }
    });
    // Ingestelde aantallen: per regel wint de laatste wijziging, niet het
    // toestel dat toevallig het laatst synchroniseert.
    this.staat.minima = this.staat.minima || {};
    this.staat.minimaTs = this.staat.minimaTs || {};
    Object.keys({ ...(ander.minima || {}), ...(ander.minimaTs || {}) }).forEach(k => {
      const hunTs = ander.minimaTs?.[k] || '';
      const mijnTs = this.staat.minimaTs[k] || '';
      const ikKen = k in this.staat.minima;
      if (!ikKen || hunTs > mijnTs) {
        if (k in (ander.minima || {})) this.staat.minima[k] = ander.minima[k];
        else delete this.staat.minima[k];
        if (hunTs) this.staat.minimaTs[k] = hunTs;
      }
    });

    // eigen regels van het andere toestel erbij, op sleutel ontdubbeld
    (ander.eigenRegels || []).forEach(r => {
      if (!(this.staat.eigenRegels || []).some(x => x.key === r.key)) {
        (this.staat.eigenRegels = this.staat.eigenRegels || []).push(r);
      }
    });

    // Na het samenvoegen kunnen er regels bij zijn gekomen of aantallen
    // gewijzigd. Alles wat nog op automatisch staat, loopt er opnieuw langs —
    // zo staat na een sync overal hetzelfde, ongeacht de volgorde.
    this.staat.producten.forEach(p => {
      if (p.minAuto === false) return;
      const regel = this.regelVoor(p.brand, p.name);
      if (regel && p.min !== regel.min) { p.min = regel.min; p.minAuto = true; }
    });
    (ander.orders || []).forEach(o => {
      if (!this.staat.orders.some(x => x.id === o.id)) this.staat.orders.push(o);
    });
    return true;
  },

  exportCsv() {
    const kop = ['Datum', 'Tijd', 'Beweging', 'Aantal', 'Eenheid', 'Merk + product', 'Referentie', 'Leverancier', 'Categorie', 'Restant', 'Door', 'Opmerking'];
    const rijen = this.mutaties().map(m => {
      const d = new Date(m.ts);
      const p = this.viaId(m.productId);
      return [
        d.toLocaleDateString('nl-BE'),
        d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        m.reden,
        m.delta > 0 ? '+' + m.delta : m.delta,
        p?.eenheid || 'stuk',
        m.naam,
        m.ref,
        p?.leverancier || '',
        labelVanCat(p?.hoofdcat),
        m.restant,
        m.door || '',
        m.note
      ];
    });
    return [kop, ...rijen]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
  },

  /* ---------- Afgeleide gegevens --------------------------- */

  teBestellen() {
    return this.staat.producten
      .filter(p => p.type !== 'kost' && p.min > 0 && p.qty <= p.min)
      .sort((a, b) => (a.qty / (a.min || 1)) - (b.qty / (b.min || 1)));
  },

  cijfers() {
    const echte = this.staat.producten.filter(p => p.type !== 'kost');
    return {
      soorten: echte.length,
      stuks: echte.reduce((s, p) => s + p.qty, 0),
      laag: this.teBestellen().length,
      waarde: echte.reduce((s, p) => s + p.qty * (p.price || 0), 0)
    };
  },

  categorieen() {
    return [...new Set(this.staat.producten.map(p => p.cat).filter(Boolean))].sort();
  }
};
