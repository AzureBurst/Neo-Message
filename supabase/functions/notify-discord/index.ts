// =====================================================================
//  notify-discord — Supabase Edge Function
//
//  Fired by a database webhook whenever a row is inserted into
//  public.messages. It works out who should hear about the message,
//  looks up their Discord IDs, and sends each of them a DM through the
//  Discord bot.
//
//  It deliberately does NOT send the message text. Players get a nudge
//  ("you have a new message from X"), not the contents — the contents
//  can be private, and a prop that copied every message into Discord
//  would defeat the point. Add a snippet here if your table wants one.
//
//  Secrets this function needs (set them in the dashboard, see README):
//    DISCORD_BOT_TOKEN    the bot's token
//    NEO_WEBHOOK_SECRET   a shared password the webhook must send
//    NEO_APP_URL          your site's URL, put in the DM as a link (optional)
//  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DISCORD_API = "https://discord.com/api/v10";
const THROTTLE_MS = 2 * 60 * 1000;   // one DM per thread per two minutes
const ACTIVE_MS   = 2 * 60 * 1000;   // seen on the site this recently = skip

Deno.serve(async (req) => {
  // 1. Only accept calls carrying our shared secret. The database
  //    webhook is configured to send it; nobody else knows it.
  if (req.headers.get("x-neo-secret") !== Deno.env.get("NEO_WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  // A Supabase webhook sends { type, table, record, ... }. Accept either
  // that or a bare message row.
  const msg = body.record ?? body;
  const conversationId = msg?.conversation_id;
  const senderId = msg?.sender_id;
  if (!conversationId || !senderId) return new Response("ignored", { status: 200 });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return new Response("no bot token", { status: 500 });
  const appUrl = Deno.env.get("NEO_APP_URL") ?? "";

  // 2. Who sent it (for the DM text).
  const { data: sender } = await supa
    .from("profiles").select("username").eq("id", senderId).single();

  // 3. Everyone else in the thread.
  const { data: members } = await supa
    .from("conversation_members").select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", senderId);

  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return new Response("no recipients", { status: 200 });

  // 4. Of those, the ones who linked a Discord account.
  const { data: profs } = await supa
    .from("profiles").select("id, discord_id, last_seen").in("id", ids);

  const recipients = (profs ?? []).filter((p) => p.discord_id);
  if (!recipients.length) return new Response("nobody linked", { status: 200 });

  const now = Date.now();

  for (const r of recipients) {
    // 5a. Skip anyone who is looking at the site right now — no point
    //     buzzing their phone about a message on the screen in front of
    //     them.
    if (r.last_seen && now - new Date(r.last_seen).getTime() < ACTIVE_MS) continue;

    // 5b. Throttle: skip if we pinged them about this thread very recently.
    const { data: last } = await supa
      .from("discord_throttle").select("last_notified")
      .eq("user_id", r.id).eq("conversation_id", conversationId).maybeSingle();

    if (last && now - new Date(last.last_notified).getTime() < THROTTLE_MS) continue;

    try {
      // 6. Open a DM channel with the user, then post into it.
      const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: r.discord_id }),
      });
      const dm = await dmRes.json();
      if (!dm?.id) continue;   // bot can't DM them (no shared server, or DMs closed)

      const line = `📱 New message from **${sender?.username ?? "someone"}** in Neo Message.` +
                   (appUrl ? `\n${appUrl}` : "");

      await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: line }),
      });

      // 7. Remember we told them, so a busy thread does not spam.
      await supa.from("discord_throttle").upsert({
        user_id: r.id,
        conversation_id: conversationId,
        last_notified: new Date().toISOString(),
      });
    } catch (_e) {
      // One bad recipient should not stop the others.
      continue;
    }
  }

  return new Response("ok", { status: 200 });
});
