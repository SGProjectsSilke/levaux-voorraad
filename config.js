/* ===========================================================
   config.js — cloudinstellingen
   -----------------------------------------------------------
   Laat je dit leeg, dan werkt de app gewoon lokaal op het
   toestel. Vul je het in, dan verschijnt er een aanmeldscherm
   bij Instellingen en wordt de voorraad gedeeld tussen
   toestellen.

   De twee waarden vind je in Supabase onder
   Project Settings → API:
     - Project URL
     - anon public key   (de publieke sleutel, geen service key!)

   Deze sleutel mag in de code staan: hij geeft op zichzelf
   geen toegang. De beveiliging zit in de regels op de tabellen
   (zie supabase/schema.sql), waardoor je enkel bij de voorraad
   van je eigen team kan nadat je bent aangemeld.
   =========================================================== */

window.LEVAUX_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
