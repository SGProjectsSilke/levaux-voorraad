/* ===========================================================
   config.js — cloudinstellingen
   -----------------------------------------------------------
   Laat je dit leeg, dan werkt de app gewoon lokaal op het
   toestel. Vul je het in, dan verschijnt er een aanmeldscherm
   bij Instellingen en wordt de voorraad gedeeld tussen
   toestellen.

   De twee waarden vind je in Supabase onder
   Project Settings → API Keys:
     - Project URL
     - de publieke sleutel: "anon public" of "publishable"

   Die sleutel mag in de code staan: hij geeft op zichzelf geen
   toegang. De beveiliging zit in de regels op de tabellen (zie
   supabase/schema.sql), waardoor je enkel bij de voorraad van
   je eigen team kan nadat je bent aangemeld.

   De "service_role" of "secret" key hoort hier NOOIT in.
   =========================================================== */

window.LEVAUX_CONFIG = {
  supabaseUrl: 'https://faenaisbfvctszplivtk.supabase.co',
  supabaseKey: 'sb_publishable_pIAD5kyACvmJaQQzAWV80A_OhNQwMlc'
};
