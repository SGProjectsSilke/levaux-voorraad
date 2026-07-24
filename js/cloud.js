/* ===========================================================
   cloud.js — Supabase: aanmelden en synchroniseren
   -----------------------------------------------------------
   Werkt zonder de Supabase-bibliotheek: alles gaat via gewone
   webverzoeken. Zo blijft de app één map met bestanden.

   Zet je gegevens in config.js. Staat daar niets, dan draait
   de app gewoon lokaal verder — de cloud is optioneel.

   Opzet in Supabase (zie supabase/schema.sql):
     teams     — één team = één gedeelde voorraad
     leden     — wie hoort bij welk team, met zijn naam
     voorraad  — de volledige voorraad als JSON, per team

   De sleutel in config.js is de publieke "anon key". Die mág
   in de app staan: de beveiliging zit in de regels (RLS) op de
   tabellen, waardoor je enkel bij de voorraad van je eigen
   team kan. Zonder aanmelden kom je er niet in.
   =========================================================== */

const cfg = () => (typeof window !== 'undefined' && window.LEVAUX_CONFIG) || {};
const SESSIE = 'levaux.sessie.v1';

export const Cloud = {
  sessie: null,          // { access_token, refresh_token, verlooptOp, gebruiker }
  team: null,            // { id, naam }
  naam: '',              // naam van de aangemelde persoon
  laatsteSync: null,

  /** Is de cloud ingesteld? Zo niet, dan blijft alles lokaal. */
  ingesteld() {
    const c = cfg();
    return !!(c.supabaseUrl && c.supabaseKey);
  },

  aangemeld() { return !!this.sessie?.access_token; },

  /* ---------- Verzoeken ------------------------------------ */

  _url(pad) { return cfg().supabaseUrl.replace(/\/+$/, '') + pad; },

  async _vraag(pad, opties = {}, metToken = true) {
    const c = cfg();
    const kop = {
      apikey: c.supabaseKey,
      'Content-Type': 'application/json',
      ...(opties.headers || {})
    };
    // Zonder aanmelding stuurt Supabase je door als "anon"; met een sessie
    // ben je jezelf. In beide gevallen wil PostgREST een Authorization-kop.
    kop.Authorization = 'Bearer ' + ((metToken && this.sessie?.access_token) || c.supabaseKey);

    const roep = async () => {
      try {
        return await fetch(this._url(pad), { ...opties, headers: kop });
      } catch {
        throw new Error('Geen verbinding met de cloud. Werkt je internet?');
      }
    };

    const r = await roep();
    if (r.status === 401 && metToken && this.sessie?.refresh_token) {
      await this.vernieuw();
      kop.Authorization = 'Bearer ' + this.sessie.access_token;
      return this._afhandelen(await roep());
    }
    return this._afhandelen(r);
  },

  async _afhandelen(r) {
    const tekst = await r.text();
    const data = tekst ? JSON.parse(tekst) : null;
    if (!r.ok) {
      const m = data?.msg || data?.message || data?.error_description || data?.error || 'Er ging iets mis (' + r.status + ')';
      throw new Error(vertaal(m));
    }
    return data;
  },

  /* ---------- Aanmelden ------------------------------------ */

  async meldAan(email, wachtwoord) {
    const data = await this._vraag('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: String(email).trim(), password: wachtwoord })
    }, false);
    this._bewaarSessie(data);
    await this.zoekTeam();
    return this.sessie;
  },

  async vernieuw() {
    const data = await this._vraag('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.sessie.refresh_token })
    }, false);
    this._bewaarSessie(data);
  },

  async meldAf() {
    try { await this._vraag('/auth/v1/logout', { method: 'POST' }); } catch { /* ook goed */ }
    this.sessie = null;
    this.team = null;
    this.naam = '';
    try { localStorage.removeItem(SESSIE); } catch {}
  },

  _bewaarSessie(data) {
    this.sessie = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      verlooptOp: Date.now() + (data.expires_in || 3600) * 1000,
      gebruiker: data.user?.id,
      email: data.user?.email
    };
    try { localStorage.setItem(SESSIE, JSON.stringify(this.sessie)); } catch {}
  },

  /** Vorige sessie terughalen bij het opstarten van de app. */
  async herstel() {
    if (!this.ingesteld()) return false;
    try {
      const ruw = localStorage.getItem(SESSIE);
      if (!ruw) return false;
      this.sessie = JSON.parse(ruw);
      if (this.sessie.verlooptOp < Date.now() + 60000) await this.vernieuw();
      await this.zoekTeam();
      return true;
    } catch (e) {
      console.warn('sessie niet hersteld:', e);
      this.sessie = null;
      return false;
    }
  },

  /* ---------- Team ----------------------------------------- */

  async zoekTeam() {
    const leden = await this._vraag(`/rest/v1/leden?gebruiker=eq.${this.sessie.gebruiker}&select=team,naam,teams(naam)`);
    if (leden?.length) {
      this.team = { id: leden[0].team, naam: leden[0].teams?.naam || 'Levaux Bouw' };
      this.naam = leden[0].naam || this.sessie.email;
    } else {
      this.team = null;
    }
    return this.team;
  },

  /** Eerste keer: een eigen team aanmaken. */
  async maakTeam(teamnaam, mijnNaam) {
    const teams = await this._vraag('/rest/v1/teams', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ naam: teamnaam || 'Levaux Bouw' })
    });
    const team = teams[0];
    await this._vraag('/rest/v1/leden', {
      method: 'POST',
      body: JSON.stringify({ team: team.id, gebruiker: this.sessie.gebruiker, naam: mijnNaam || this.sessie.email })
    });
    this.team = { id: team.id, naam: team.naam };
    this.naam = mijnNaam || this.sessie.email;
    return this.team;
  },

  /** Meedoen met een bestaand team via de teamcode. */
  async sluitAan(teamcode, mijnNaam) {
    const code = String(teamcode || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(code)) throw new Error('Dat is geen geldige teamcode.');
    await this._vraag('/rest/v1/leden', {
      method: 'POST',
      body: JSON.stringify({ team: code, gebruiker: this.sessie.gebruiker, naam: mijnNaam || this.sessie.email })
    });
    return this.zoekTeam();
  },

  /* ---------- Voorraad ------------------------------------- */

  async haalOp() {
    if (!this.team) return null;
    const rijen = await this._vraag(`/rest/v1/voorraad?team=eq.${this.team.id}&select=data,gewijzigd`);
    this.laatsteSync = new Date();
    return rijen?.length ? { data: rijen[0].data, gewijzigd: rijen[0].gewijzigd } : null;
  },

  async bewaar(staat) {
    if (!this.team) return;
    await this._vraag('/rest/v1/voorraad', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ team: this.team.id, data: staat, gewijzigd: new Date().toISOString() })
    });
    this.laatsteSync = new Date();
  }
};

/** Supabase antwoordt in het Engels; de gebruiker leest Nederlands. */
function vertaal(m) {
  const t = String(m).toLowerCase();
  if (t.includes('invalid login')) return 'E-mailadres of wachtwoord klopt niet.';
  if (t.includes('email not confirmed')) return 'Dit e-mailadres is nog niet bevestigd. Kijk je mailbox na.';
  if (t.includes('duplicate key')) return 'Je bent al lid van dit team.';
  if (t.includes('violates row-level security')) return 'Geen toegang — klopt de teamcode?';
  if (t.includes('failed to fetch')) return 'Geen verbinding met de cloud.';
  return m;
}
