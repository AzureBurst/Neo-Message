// =====================================================================
//  GM: who's in this conversation?
//  One panel, used from Messages, NPC Studio and NeoAdmin. Tick anyone
//  in, untick anyone out, rename the group, Save. Needs
//  sql/groups.sql.
// =====================================================================

import { supa, esc, toast, initials, $, $$ } from './supa.js';
import { loadCategoryList, filterBar, wireFilter } from './directory.js';

/**
 * Opens the members panel for a conversation.
 * Resolves true if anything changed, false if cancelled.
 */
export async function openMembers(convId) {
  const [{ data: conv }, { data: mem }, { data: people }, { data: npcRows }] = await Promise.all([
    supa.from('conversations').select('id, is_group, title').eq('id', convId).maybeSingle(),
    supa.from('conversation_members').select('user_id').eq('conversation_id', convId),
    supa.from('profiles').select('*'),
    supa.from('npcs').select('id')            // only works once npc.sql is run; fine if not
  ]);
  if (!conv) { toast('That conversation no longer exists.', 'error'); return false; }

  const { data: { user } } = await supa.auth.getUser();
  const npcIds = new Set((npcRows || []).map(n => n.id));
  const before = new Set((mem || []).map(m => m.user_id));
  // In the chat first, then players, then by category, then by name.
  const cats = await loadCategoryList();
  const order = new Map(cats.map((c, i) => [c.id, i]));
  const list = (people || []).sort((a, b) =>
    (before.has(b.id) - before.has(a.id)) || (npcIds.has(a.id) - npcIds.has(b.id)) ||
    ((order.get(a.category_id) ?? 99) - (order.get(b.category_id) ?? 99)) || a.username.localeCompare(b.username));

  const tag = p => p.id === user?.id ? '<i class="mb-tag">You</i>'
    : p.is_admin ? '<i class="mb-tag">GM</i>'
    : npcIds.has(p.id) ? '<i class="mb-tag npc">NPC</i>' : '<i class="mb-tag">Player</i>';
  const av = p => `<span class="mb-av">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p.username))}</span>`;

  const host = document.createElement('div');
  host.innerHTML = `
    <div class="scrim scrim-top"><div class="modal modal-wide mb-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Members</h3><button class="icon-btn" data-x title="Close">✕</button></div>
      <div class="modal-body">
        <div class="field"><label for="mbTitle">Chat name ${conv.is_group ? '' : '<span class="muted">(used if it becomes a group)</span>'}</label>
          <input type="text" id="mbTitle" maxlength="60" value="${esc(conv.title || '')}" placeholder="${conv.is_group ? 'Group chat' : 'Optional'}"></div>
        <div class="mb-bar">
          <input type="search" id="mbFind" placeholder="Search everyone">
          <span class="mb-count" id="mbCount"></span>
        </div>
        ${filterBar(list.filter(p => !p.is_admin), p => p.category_id, 'members', cats)}
        <div class="mb-list" id="mbList">${list.map(p => `
          <label class="mb-row" data-cat="${esc(p.is_admin ? 'gm-row' : (p.category_id || 'none'))}" data-name="${esc(p.username.toLowerCase())}">
            <input type="checkbox" value="${esc(p.id)}" ${before.has(p.id) ? 'checked' : ''}>
            ${av(p)}<span class="mb-name">${esc(p.username)}</span>${tag(p)}
            <span class="mb-change"></span>
          </label>`).join('')}</div>
        <p class="muted small" id="mbNote" style="margin:10px 0 0"></p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-x>Cancel</button>
        <button class="btn btn-primary" id="mbSave" disabled>Save</button>
      </div>
    </div></div>`;
  document.body.appendChild(host);

  return new Promise((resolve) => {
    const close = (changed) => { host.remove(); resolve(changed); };
    $$('[data-x]', host).forEach(b => b.addEventListener('click', () => close(false)));
    $('.scrim', host).addEventListener('click', (e) => { if (e.target === e.currentTarget) close(false); });

    const diff = () => {
      const now = new Set($$('#mbList input:checked', host).map(i => i.value));
      return {
        now,
        add: [...now].filter(id => !before.has(id)),
        remove: [...before].filter(id => !now.has(id)),
        title: $('#mbTitle', host).value.trim()
      };
    };
    const paint = () => {
      const d = diff();
      $$('.mb-row', host).forEach(r => {
        const id = r.querySelector('input').value;
        const s = r.querySelector('.mb-change');
        s.textContent = d.add.includes(id) ? 'adding' : d.remove.includes(id) ? 'removing' : '';
        s.className = 'mb-change ' + (d.add.includes(id) ? 'add' : d.remove.includes(id) ? 'remove' : '');
      });
      $('#mbCount', host).textContent = `${d.now.size} in chat`;
      const notes = [];
      if (!conv.is_group && d.now.size > 2) notes.push('This one-on-one chat will become a group.');
      if (user && d.remove.includes(user.id)) notes.push('You\'re removing yourself — it will leave your Messages (you can still manage it from NeoAdmin).');
      if (d.now.size === 0) notes.push('Nobody will be left in this chat.');
      $('#mbNote', host).textContent = notes.join(' ');
      $('#mbSave', host).disabled = !d.add.length && !d.remove.length && d.title === (conv.title || '');
    };
    wireFilter(host, 'members', { items: '.mb-row:not([data-cat="gm-row"])' });
    host.addEventListener('change', paint);
    $('#mbTitle', host).addEventListener('input', paint);
    $('#mbFind', host).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.mb-row', host).forEach(r => { r.hidden = q && !r.dataset.name.includes(q); });
    });
    paint();

    $('#mbSave', host).addEventListener('click', async (e) => {
      const d = diff();
      if (d.remove.length && !confirm(`Remove ${d.remove.length} ${d.remove.length === 1 ? 'person' : 'people'}? They lose access to the chat straight away (their old messages stay).`)) return;
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
      const fail = (err) => {
        btn.disabled = false; btn.textContent = 'Save';
        toast(/admin_(add|remove)_members|admin_set_group_title/.test(err.message)
          ? 'Run sql/groups.sql in Supabase first.' : err.message, 'error');
      };
      if (d.add.length) {
        const { error } = await supa.rpc('admin_add_members', { conv: convId, user_ids: d.add });
        if (error) return fail(error);
      }
      if (d.remove.length) {
        const { error } = await supa.rpc('admin_remove_members', { conv: convId, user_ids: d.remove });
        if (error) return fail(error);
      }
      if (d.title !== (conv.title || '')) {
        const { error } = await supa.rpc('admin_set_group_title', { conv: convId, new_title: d.title });
        if (error) return fail(error);
      }
      const bits = [];
      if (d.add.length) bits.push(`added ${d.add.length}`);
      if (d.remove.length) bits.push(`removed ${d.remove.length}`);
      if (d.title !== (conv.title || '')) bits.push('renamed');
      toast(`Members updated — ${bits.join(', ')}.`, 'ok');
      close(true);
    });
  });
}
