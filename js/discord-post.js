// =====================================================================
//  Push an update to the game's Discord channel
//  (supabase/functions/discord-post). GM only.
// =====================================================================

import { supa, toast } from './supa.js';

/** The in-story moment the way the app shows it: "Mon, Sep 1, 2160 · 9:15 PM". */
export function whenLabel(d) {
  d = new Date(d);
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** A link to a page of this site, for Discord to point at. */
export function siteLink(path) {
  return new URL(path, location.href).href;
}

/** payload: { kind: 'ig_post' | 'clock' | 'announce' | 'test', … } */
export async function postToDiscord(payload, { quiet = false } = {}) {
  const { data, error } = await supa.functions.invoke('discord-post', { body: payload });
  if (error || !data?.ok) {
    let why = data?.error || '';
    try { why = (await error?.context?.json())?.error || why; } catch {}
    if (!why && (error?.context?.status === 404 || error?.name === 'FunctionsFetchError'))
      why = 'Deploy the discord-post function in Supabase first (README → Discord channel posts).';
    toast(why || error?.message || 'Couldn’t post to Discord.', 'error');
    return false;
  }
  if (!quiet) toast('Posted to Discord.', 'ok');
  return true;
}
