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

/* ------------------------------------------------------------------ */
/*  Category filter chips — "All · Group H · Group A · … · Faculty"    */
/*  Players (accounts that aren't NPCs) always come first.             */
/* ------------------------------------------------------------------ */

let catList = null;
/** Every category, in order (readable by everyone). */
export async function loadCategoryList() {
  if (catList) return catList;
  const { data, error } = await supa.from('account_categories').select('id, name, color, sort, hidden').order('sort');
  catList = error ? [] : (data || []);
  return catList;
}

/** "Group H Students" → "Group H", "Justice University Faculty" → "Faculty". */
export function chipLabel(name) {
  return String(name || '')
    .replace(/^Justice University\s+/i, '')
    .replace(/^Heroics\s+(Sophomores?)/i, '$1')
    .replace(/\s+Students$/i, '').trim() || name;
}

/** Players first, then by category order, then by name. */
export function sortPeople(rows, { catOf, isNpc, nameOf }, cats = catList || []) {
  const order = new Map(cats.map((c, i) => [c.id, i]));
  return [...rows].sort((a, b) =>
    (isNpc(a) - isNpc(b)) ||
    ((order.get(catOf(a)) ?? 99) - (order.get(catOf(b)) ?? 99)) ||
    String(nameOf(a)).localeCompare(String(nameOf(b))));
}

const KEY = k => `neo.catFilter.${k}`;
export function savedFilter(key) {
  try { return localStorage.getItem(KEY(key)) || 'all'; } catch { return 'all'; }
}

/**
 * The chip bar. rows need a category id via catOf(row).
 * Only categories somebody in the list belongs to get a chip.
 */
export function filterBar(rows, catOf, key, cats = catList || []) {
  const counts = new Map();
  rows.forEach(r => { const c = catOf(r) || 'none'; counts.set(c, (counts.get(c) || 0) + 1); });
  const cur = savedFilter(key);
  const chips = cats.filter(c => counts.has(c.id)).map(c => ({ id: c.id, label: chipLabel(c.name), color: c.color, n: counts.get(c.id) }));
  if (counts.has('none')) chips.push({ id: 'none', label: 'No category', color: '#6b7280', n: counts.get('none') });
  if (chips.length < 2) return '';
  const on = chips.some(c => c.id === cur) ? cur : 'all';
  return `<div class="cat-filter" data-filter-key="${esc(key)}" role="tablist">
    <button type="button" data-cat-filter="all" class="${on === 'all' ? 'on' : ''}">All <i>${rows.length}</i></button>
    ${chips.map(c => `<button type="button" data-cat-filter="${esc(c.id)}" class="${on === c.id ? 'on' : ''}" style="--cc:${esc(c.color)}">${esc(c.label)} <i>${c.n}</i></button>`).join('')}
  </div>`;
}

/**
 * Wires a chip bar. Items are elements with data-cat; hides the ones
 * outside the chosen category (and any heading whose items are all hidden).
 */
export function wireFilter(scope, key, { items = '[data-cat]', onChange } = {}) {
  const bar = scope.querySelector(`.cat-filter[data-filter-key="${key}"]`);
  const apply = () => {
    const cur = bar?.querySelector('.on')?.dataset.catFilter || 'all';
    scope.querySelectorAll(items).forEach(el => {
      el.classList.toggle('cat-out', cur !== 'all' && (el.dataset.cat || 'none') !== cur);
    });
    onChange?.(cur);
  };
  bar?.querySelectorAll('[data-cat-filter]').forEach(b => b.addEventListener('click', () => {
    bar.querySelectorAll('[data-cat-filter]').forEach(x => x.classList.toggle('on', x === b));
    try { localStorage.setItem(KEY(key), b.dataset.catFilter); } catch {}
    apply();
  }));
  apply();
  return apply;
}
