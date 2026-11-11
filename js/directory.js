// =====================================================================
//  Directory — who you can see, add and email (sql/categories.sql).
//  Students see students and faculty; outsiders are added by number
//  only; the GM never shows up. The server enforces all of it — this
//  only draws what it says.
// =====================================================================

import { supa, esc } from './supa.js';

let cache = null;

/**
 * [{ id, username, avatar_url, category_id, category, color, about,
 *    is_npc, can_add, can_email, in_contacts }]
 * Falls back to "everyone but the GM" until categories.sql is run.
 */
export async function loadDirectory({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  const { data, error } = await supa.rpc('directory');
  if (!error) { cache = data || []; return cache; }
  const { data: me } = await supa.auth.getUser();
  const { data: ppl } = await supa.from('profiles').select('id, username, avatar_url, is_admin').order('username');
  cache = (ppl || []).filter(p => !p.is_admin && p.id !== me?.user?.id).map(p => ({
    ...p, category: null, color: null, about: null, can_add: true, can_email: false, in_contacts: false, legacy: true }));
  return cache;
}

export function categoryChip(row) {
  if (!row?.category) return '';
  return `<span class="cat-chip" style="--cc:${esc(row.color || '#6b7280')}">${esc(shortCat(row.category))}</span>`;
}

/** "Justice University Students" → "JU Student" on small chips. */
export function shortCat(name) {
  return String(name || '')
    .replace(/^Justice University\s+/i, 'JU ')
    .replace(/Students$/i, 'Student').replace(/Faculty$/i, 'Faculty');
}

/** Groups rows by category, in the directory's order. */
export function byCategory(rows) {
  const out = [];
  for (const r of rows) {
    const k = r.category || 'People';
    let g = out.find(x => x.name === k);
    if (!g) out.push(g = { name: k, color: r.color, rows: [] });
    g.rows.push(r);
  }
  return out;
}
