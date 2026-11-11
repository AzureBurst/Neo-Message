// =====================================================================
//  GM: account categories (sql/categories.sql)
//  Make, rename and set the rules for each category. Used from
//  NeoAdmin and the NPC Studio.
// =====================================================================

import { supa, esc, toast, $, $$ } from './supa.js';

export const NEEDS_SQL = 'Run sql/categories.sql in Supabase first.';

export async function loadCategories() {
  const { data, error } = await supa.from('account_categories').select('*').order('sort').order('name');
  if (error) return null;               // not set up yet
  return data || [];
}

/** <select> of categories. */
export function categorySelect(cats, current, attrs = '') {
  return `<select ${attrs}>${(cats || []).map(c =>
    `<option value="${esc(c.id)}" ${c.id === current ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
}

export async function setCategory(userId, categoryId) {
  const { error } = await supa.from('profiles').update({ category_id: categoryId }).eq('id', userId);
  if (error) toast(/category_id|column/.test(error.message) ? NEEDS_SQL : error.message, 'error');
  return !error;
}

const RULES = [
  ['seen_by',  'See them in the directory'],
  ['add_by',   'Add them to contacts from the directory'],
  ['email_by', 'Email them from the directory']
];

/** The manager. Resolves when closed. */
export async function openCategoryManager() {
  let cats = await loadCategories();
  if (!cats) { toast(NEEDS_SQL, 'error'); return; }
  const { data: counts } = await supa.from('profiles').select('category_id');
  const members = new Map();
  (counts || []).forEach(r => members.set(r.category_id, (members.get(r.category_id) || 0) + 1));

  const host = document.createElement('div');
  document.body.appendChild(host);
  return new Promise(resolve => {
    const close = () => { host.remove(); resolve(); };
    const paint = () => {
      host.innerHTML = `
        <div class="scrim scrim-top"><div class="modal modal-wide cat-modal" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>Account categories</h3><button class="icon-btn" data-x title="Close">✕</button></div>
          <div class="modal-body">
            <p class="muted small">Every account and NPC is in one category. For each one, tick which categories can see, add and email its members. Anyone can email people already in their contacts. Changes save as you go.</p>
            ${cats.map(c => `
              <section class="cat-card" data-cat="${esc(c.id)}" style="--cc:${esc(c.color)}">
                <div class="cat-top">
                  <input type="color" value="${esc(c.color)}" data-f="color" title="Colour">
                  <input type="text" value="${esc(c.name)}" data-f="name" maxlength="60" class="cat-name">
                  <span class="muted small">${members.get(c.id) || 0} member${members.get(c.id) === 1 ? '' : 's'}</span>
                  ${c.key ? '<span class="cat-builtin">built in</span>' : `<button class="icon-btn danger-icon" data-del="${esc(c.id)}" title="Delete">🗑</button>`}
                </div>
                <div class="cat-flags">
                  <label><input type="checkbox" data-f="hidden" ${c.hidden ? 'checked' : ''}> Hidden from players</label>
                  <label><input type="checkbox" data-f="phone_add" ${c.phone_add ? 'checked' : ''}> Anyone can add them by phone number</label>
                </div>
                ${c.hidden ? '<p class="muted small">Hidden: players never see these accounts unless they share a chat.</p>' : `
                <table class="cat-matrix">
                  <tr><th></th>${cats.filter(x => !x.hidden).map(x => `<th title="${esc(x.name)}">${esc(x.name.replace(/^Justice University\s+/i, 'JU '))}</th>`).join('')}</tr>
                  ${RULES.map(([f, label]) => `<tr><td>${label}</td>${cats.filter(x => !x.hidden).map(x =>
                    `<td><input type="checkbox" data-rule="${f}" value="${esc(x.id)}" ${(c[f] || []).includes(x.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}
                </table>`}
              </section>`).join('')}
            <div class="cat-new"><input type="text" id="catNew" maxlength="60" placeholder="New category name, e.g. Heroes for Hire">
              <button class="btn btn-primary btn-sm" id="catAdd">＋ Add category</button></div>
          </div>
        </div></div>`;
      $$('[data-x]', host).forEach(b => b.addEventListener('click', close));
      $('.scrim', host).addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
      $$('.cat-card', host).forEach(card => {
        const id = card.dataset.cat;
        const save = async (patch) => {
          const { error } = await supa.from('account_categories').update(patch).eq('id', id);
          if (error) return toast(/unique/i.test(error.message) ? 'There\'s already a category with that name.' : error.message, 'error');
          cats = cats.map(c => c.id === id ? { ...c, ...patch } : c);
          if ('hidden' in patch) paint();
        };
        $$('[data-f]', card).forEach(i => i.addEventListener('change', () => {
          const f = i.dataset.f;
          if (f === 'name' && !i.value.trim()) { i.value = cats.find(c => c.id === id).name; return; }
          save({ [f]: i.type === 'checkbox' ? i.checked : i.value.trim() });
        }));
        $$('[data-rule]', card).forEach(i => i.addEventListener('change', () => {
          const f = i.dataset.rule;
          save({ [f]: $$(`[data-rule="${f}"]:checked`, card).map(x => x.value) });
        }));
        $('[data-del]', card)?.addEventListener('click', async () => {
          const n = members.get(id) || 0;
          if (!confirm(`Delete “${cats.find(c => c.id === id).name}”?${n ? `\n\n${n} account${n === 1 ? '' : 's'} in it will have no category until you move them.` : ''}`)) return;
          const { error } = await supa.from('account_categories').delete().eq('id', id);
          if (error) return toast(error.message, 'error');
          cats = cats.filter(c => c.id !== id); paint();
        });
      });
      $('#catAdd', host).addEventListener('click', async () => {
        const name = $('#catNew', host).value.trim();
        if (!name) return;
        const { data, error } = await supa.from('account_categories')
          .insert({ name, color: '#' + Math.floor(Math.random() * 0xaaaaaa + 0x333333).toString(16).padStart(6, '0') })
          .select().single();
        if (error) return toast(/unique/i.test(error.message) ? 'There\'s already a category with that name.' : error.message, 'error');
        cats.push(data); toast(`Added ${name}. Set who can see it below.`, 'ok'); paint();
      });
    };
    paint();
  });
}
