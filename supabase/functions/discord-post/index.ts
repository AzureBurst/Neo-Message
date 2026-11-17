// =====================================================================
//  discord-post — Supabase Edge Function
//
//  Lets the GM push an update to one Discord channel through the same
//  bot that sends DMs (DISCORD_BOT_TOKEN, already set for notify-discord):
//    * an Instagrat post: picture, caption, who posted it, its in-story
//      date and time, and a link to the post
//    * the story clock: "it's now Monday, Sep 1, 2160 · 9:15 PM"
//    * a plain announcement: title, text, optional picture and link
//    * a test message
//
//  Only the GM (profiles.is_admin) can call it. The channel is the one
//  saved on the GM Desk (app_settings 'discord_channel'), or the
//  DISCORD_CHANNEL_ID secret if you'd rather set it there.
//  The bot needs View Channel, Send Messages and Embed Links in it.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DISCORD_API = "https://discord.com/api/v10";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const https = (u: unknown) => typeof u === "string" && /^https:\/\/\S+$/.test(u) ? u : undefined;
const cut = (s: unknown, n: number) => typeof s === "string" && s.trim() ? s.trim().slice(0, n) : undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. The GM only.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return reply({ error: "Sign in first." }, 401);
  const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return reply({ error: "Only the GM can post to Discord." }, 403);

  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return reply({ error: "DISCORD_BOT_TOKEN isn't set on this project." }, 500);

  let p: any = {};
  try { p = await req.json(); } catch { /* empty */ }

  // 2. Which channel.
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "discord_channel").maybeSingle();
  const channel = String(p.channel ?? setting?.value?.id ?? Deno.env.get("DISCORD_CHANNEL_ID") ?? "").trim();
  if (!/^\d{15,22}$/.test(channel)) return reply({ error: "Set the Discord channel on the GM Desk first." }, 400);

  // 3. The message.
  const note = cut(p.note, 1800);
  let embed: Record<string, unknown> = {};

  if (p.kind === "ig_post") {
    const { data: post } = await admin.from("ig_posts")
      .select("id, author_id, image_url, caption, story_at, created_at, fake_likes").eq("id", p.post_id).maybeSingle();
    if (!post) return reply({ error: "That post is gone." }, 404);
    const [{ data: ig }, { data: prof }, { count: likes }] = await Promise.all([
      admin.from("ig_profiles").select("screen_name, display_name").eq("id", post.author_id).maybeSingle(),
      admin.from("profiles").select("username, avatar_url").eq("id", post.author_id).maybeSingle(),
      admin.from("ig_likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
    ]);
    const handle = ig?.screen_name ?? prof?.username ?? "someone";
    const total = (likes ?? 0) + (post.fake_likes ?? 0);
    embed = {
      color: 0xE1306C,
      author: { name: `${ig?.display_name ? `${ig.display_name} ` : ""}@${handle}`, icon_url: https(prof?.avatar_url), url: https(p.link) },
      title: "New on Instagrat",
      url: https(p.link),
      description: cut(post.caption, 3500),
      image: https(post.image_url) ? { url: post.image_url } : undefined,
      fields: [
        { name: "📅 When", value: cut(p.when, 200) ?? "—", inline: true },
        ...(total ? [{ name: "♥ Likes", value: total.toLocaleString("en-US"), inline: true }] : []),
      ],
      footer: { text: "Instagrat" },
    };
  } else if (p.kind === "clock") {
    embed = {
      color: 0x6EA0FF,
      title: "🕓 Story time",
      description: `**${cut(p.when, 200) ?? "Now"}**`,
      footer: { text: "Neo Message · story clock" },
    };
  } else if (p.kind === "announce") {
    if (!cut(p.title, 256) && !note && !https(p.image)) return reply({ error: "Write something first." }, 400);
    embed = {
      color: 0xCFF23A,
      title: cut(p.title, 256),
      url: https(p.link),
      image: https(p.image) ? { url: p.image } : undefined,
      footer: { text: "Neo Message" },
    };
  } else if (p.kind === "test") {
    embed = { color: 0x4ADE80, title: "✅ Neo Message is connected", description: "Updates the GM pushes will show up in this channel." };
  } else {
    return reply({ error: "Unknown kind of update." }, 400);
  }
  if (note) embed.description = [embed.description, note].filter(Boolean).join("\n\n");

  // 4. Post it.
  const res = await fetch(`${DISCORD_API}/channels/${channel}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const why = err?.code === 50001 ? "The bot can't see that channel. Invite it, or give it View Channel there."
      : err?.code === 50013 ? "The bot needs Send Messages and Embed Links in that channel."
      : err?.code === 10003 ? "Discord doesn't know that channel ID."
      : err?.message ?? `Discord said ${res.status}.`;
    return reply({ error: why }, 400);
  }
  return reply({ ok: true });
});
