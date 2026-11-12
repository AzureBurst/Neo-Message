// =====================================================================
//  view-as — Supabase Edge Function
//
//  Lets the GM open the site as a player sees it. The GM's browser asks
//  for a one-time sign-in token for that player; the site redeems it in
//  a separate tab that keeps its own session (the GM stays signed in
//  everywhere else) and blocks every change, so it's a look, not a
//  takeover.
//
//  Only an account with is_admin can get a token, and never for another
//  GM account. Nothing is emailed and the player's password and own
//  sessions are untouched.
//
//  Needs no secrets of its own: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//  are provided automatically. The service key only ever lives here, on
//  Supabase's side.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1. Who is asking? Must be a signed-in GM.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return reply({ error: "Sign in first." }, 401);

  const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return reply({ error: "Only the GM can do that." }, 403);

  // 2. Who do they want to look at?
  let target = "";
  try { target = (await req.json())?.target ?? ""; } catch { /* empty body */ }
  if (!target) return reply({ error: "Pick someone." }, 400);

  const { data: who } = await admin.from("profiles").select("id, username, is_admin").eq("id", target).single();
  if (!who) return reply({ error: "No such account." }, 404);
  if (who.is_admin) return reply({ error: "You can't view as another GM account." }, 400);

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(target);
  if (uErr || !u?.user?.email) return reply({ error: "That account has no sign-in." }, 400);

  // 3. A one-time sign-in token (nothing is sent anywhere).
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (error || !link?.properties?.hashed_token) return reply({ error: error?.message ?? "Couldn't make a token." }, 500);

  return reply({ token_hash: link.properties.hashed_token, username: who.username });
});
