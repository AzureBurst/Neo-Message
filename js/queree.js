// =====================================================================
//  QUEREE — the in-fiction search engine
//
//  Players search; the GM answers. Every search is a tab, answers arrive
//  live, and pages the GM has indexed in advance answer matching
//  searches instantly. Results come in four shapes: a wiki article, an
//  imageboard thread, a plain answer, or an image.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource, startPresence,
  esc, toast, uploadFile, shrinkImage, lightbox, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { playSound } from './sfx.js';
import {
  inline, parseWiki, parseInfobox, parseForum, forumLine, postNumber,
  matchPages, snippet
} from './queree-render.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'queree'); } catch {}

if (me.is_admin) $$('.qr-admin').forEach(b => b.hidden = false);

const main = $('#qrMain');
let mine = [];            // my searches, newest first
let pages = [];           // the GM's indexed pages
let view = { name: 'home' };

const KINDS = {
  wiki:  { label: 'Wiki article',   icon: '📖', source: t => `heropedia.net/wiki/${slug(t)}` },
  forum: { label: 'Forum thread',   icon: '💬', source: () => 'boards.knotchan.net/x/' },
  text:  { label: 'Plain answer',   icon: '✎',  source: () => 'queree.net/answer' },
  image: { label: 'Image',          icon: '🖼', source: () => 'images.queree.net' }
};
const slug = t => String(t || 'Page').trim().replace(/\s+/g, '_').replace(/[^\w()_-]/g, '');

/* ------------------------------------------------------------------ */
/*  data                                                              */
/* ------------------------------------------------------------------ */

async function loadMine() {
  const { data, error } = await supa.from('qr_searches').select('*')
    .eq('user_id', me.id).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(/does not exist/i.test(error.message)
    ? 'Queree is not set up yet — run sql/queree.sql in Supabase.' : error.message);
  mine = data || [];
}

async function loadPages() {
  const { data } = await supa.from('qr_pages').select('*').order('title');
  pages = data || [];
}

/* ------------------------------------------------------------------ */
/*  tabs                                                              */
/* ------------------------------------------------------------------ */

function renderTabs() {
  const open = mine.filter(s => !s.closed).slice(0, 14);
  const activeId = view.name === 'search' || view.name === 'result' ? view.searchId : null;
  $('#qrTabs').innerHTML = `
    ${view.name === 'home' ? '<span class="qr-tab is-on"><span class="qr-tab-q">New search</span></span>' : ''}
    ${open.map(s => `
      <span class="qr-tab ${s.id === activeId ? 'is-on' : ''}" data-tab="${esc(s.id)}" title="${esc(s.query)}">
        <i class="qr-tab-dot ${s.status}"></i>
        <span class="qr-tab-q">${esc(s.query)}</span>
        <button class="qr-tab-x" data-close="${esc(s.id)}" title="Close tab">✕</button>
      </span>`).join('')}`;

  $$('[data-tab]').forEach(t => t.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return;
    go('search', { searchId: t.dataset.tab });
  }));
  $$('[data-close]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.close;
    await supa.from('qr_searches').update({ closed: true }).eq('id', id);
    const s = mine.find(x => x.id === id); if (s) s.closed = true;
    if (view.searchId === id) {
      const next = mine.find(x => !x.closed);
      return next ? go('search', { searchId: next.id }) : go('home');
    }
    renderTabs();
  }));
  $('.qr-tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ------------------------------------------------------------------ */
/*  router                                                            */
/* ------------------------------------------------------------------ */

async function go(name, opts = {}) {
  view = { name, ...opts };
  main.innerHTML = '<div class="ig-loading">Loading…</div>';
  window.scrollTo(0, 0);
  try {
    if (name === 'home') viewHome();
    else if (name === 'search') await viewSearch(opts.searchId);
    else if (name === 'result') await viewResult(opts);
    else if (name === 'history') viewHistory();
    else if (name === 'inbox') await viewInbox();
    else if (name === 'answer') await viewAnswer(opts.searchId);
    else if (name === 'index') await viewIndex();
  } catch (err) {
    main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  }
  renderTabs();
}

/* ------------------------------------------------------------------ */
/*  searching                                                         */
/* ------------------------------------------------------------------ */

async function runSearch(q) {
  q = String(q || '').trim();
  if (!q) return;
  const { data, error } = await supa.from('qr_searches').insert({ query: q }).select().single();
  if (error) return toast(error.message, 'error');
  playSound('sent');
  mine.unshift(data);
  go('search', { searchId: data.id });
}

/* The search box, with suggestions drawn from indexed page titles and
   the player's own past searches. */
function searchBox({ value = '', big = false } = {}) {
  return `
    <form class="qr-box ${big ? 'big' : ''}" id="qrForm" autocomplete="off">
      <span class="qr-box-icon">⌕</span>
      <input type="search" id="qrInput" enterkeyhint="search" value="${esc(value)}" placeholder="Search the network" maxlength="300" aria-label="Search">
      ${value ? '<button type="button" class="qr-box-clear" id="qrClear" title="Clear">✕</button>' : ''}
      <div class="qr-suggest" id="qrSuggest" hidden></div>
    </form>`;
}

function wireSearchBox() {
  const form = $('#qrForm'), input = $('#qrInput'), sug = $('#qrSuggest');
  form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(input.value); });
  $('#qrClear')?.addEventListener('click', () => { input.value = ''; input.focus(); });

  let picks = [], sel = -1;
  const paint = () => {
    sug.hidden = !picks.length;
    sug.innerHTML = picks.map((p, i) => `<button type="button" class="qr-sug ${i === sel ? 'on' : ''}" data-sug="${esc(p.text)}">
      <span>${p.past ? '⟲' : '⌕'}</span>${esc(p.text)}</button>`).join('');
    $$('[data-sug]', sug).forEach(b => b.addEventListener('mousedown', (e) => {
      e.preventDefault(); runSearch(b.dataset.sug);
    }));
  };
  input.addEventListener('input', () => {
    const v = input.value.trim().toLowerCase();
    sel = -1;
    if (!v) { picks = []; return paint(); }
    const past = [...new Set(mine.map(s => s.query))].filter(q => q.toLowerCase().startsWith(v) && q.toLowerCase() !== v).slice(0, 3);
    const found = matchPages(pages, v, 5).map(p => p.title).filter(t => !past.includes(t));
    picks = [...past.map(text => ({ text, past: true })), ...found.map(text => ({ text }))].slice(0, 7);
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (!picks.length) return;
    if (e.key === 'ArrowDown') { sel = (sel + 1) % picks.length; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + picks.length) % picks.length; paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); runSearch(picks[sel].text); }
    else if (e.key === 'Escape') { picks = []; paint(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
}

/* ------------------------------------------------------------------ */
/*  views: home, results, history                                     */
/* ------------------------------------------------------------------ */

function viewHome() {
  const recent = [...new Set(mine.map(s => s.query))].slice(0, 6);
  main.innerHTML = `
    <div class="qr-home">
      <img class="qr-logo" src="assets/queree-logo.png" alt="Queree">
      ${searchBox({ big: true })}
      <div class="qr-home-actions">
        <button class="btn btn-ghost" id="qrGo">Queree Search</button>
      </div>
      ${recent.length ? `<div class="qr-recent">
        <span class="muted small">Recent</span>
        ${recent.map(q => `<button class="qr-chip" data-q="${esc(q)}">⟲ ${esc(q)}</button>`).join('')}
      </div>` : ''}
    </div>`;
  wireSearchBox();
  $('#qrInput').focus();
  $('#qrGo').addEventListener('click', () => runSearch($('#qrInput').value));
  $$('[data-q]', main).forEach(b => b.addEventListener('click', () => runSearch(b.dataset.q)));
}

function resultCard(r, source) {
  const k = KINDS[r.kind] || KINDS.text;
  const addr = r.source || k.source(r.title);
  const host = addr.split('/')[0];
  return `
    <button class="qr-result" data-open="${source}:${esc(r.id)}">
      <span class="qr-result-src"><i class="qr-fav">${k.icon}</i>
        <span><b>${esc(host)}</b><small>${esc(addr)}</small></span></span>
      <span class="qr-result-title">${esc(r.title || (r.kind === 'text' ? 'Answer' : k.label))}</span>
      ${r.kind === 'image' && r.body?.image_url
        ? `<img class="qr-result-thumb" src="${esc(r.body.image_url)}" alt="" loading="lazy">` : ''}
      <span class="qr-result-snip">${esc(snippet(r))}</span>
    </button>`;
}

async function viewSearch(id) {
  let s = mine.find(x => x.id === id);
  if (!s && me.is_admin) {
    const { data } = await supa.from('qr_searches').select('*').eq('id', id).maybeSingle();
    s = data;
  }
  if (!s) { main.innerHTML = '<div class="ig-empty">That search is gone.</div>'; return; }
  if (s.closed && s.user_id === me.id) {
    await supa.from('qr_searches').update({ closed: false }).eq('id', id);
    s.closed = false;
  }
  clearNotificationsFor(id);

  const { data: results } = await supa.from('qr_results').select('*')
    .eq('search_id', id).order('created_at');
  const indexed = matchPages(pages, s.query);
  const total = (results?.length || 0) + indexed.length;
  const secs = (0.18 + (s.query.length % 7) * 0.07).toFixed(2);

  main.innerHTML = `
    <div class="qr-results">
      <div class="qr-results-bar">
        <button class="qr-mini-logo" id="qrHomeLogo" title="New search"><img src="assets/queree-logo.png" alt="Queree"></button>
        ${searchBox({ value: s.query })}
      </div>
      <p class="qr-count">${total
        ? `About ${total} result${total === 1 ? '' : 's'} (${secs} seconds)` : ''}</p>

      ${s.status === 'pending' ? `
        <div class="qr-crawling">
          <span class="qr-dots"><i></i><i></i><i></i><i></i></span>
          <div><strong>Queree is loading…</strong></div>
        </div>` : ''}

      ${(results || []).map(r => resultCard(r, 'result')).join('')}

      ${indexed.length ? `
        ${results?.length ? '<h4 class="qr-subhead">More from the index</h4>' : ''}
        ${indexed.map(p => resultCard(p, 'page')).join('')}` : ''}

      ${!total && s.status !== 'pending' ? '<div class="qr-none">No results found for this search.</div>' : ''}

      ${me.is_admin ? `<div class="qr-admin-strip"><button class="btn btn-sm btn-primary" id="qrAnswerThis">Answer this search</button></div>` : ''}
    </div>`;

  wireSearchBox();
  $('#qrHomeLogo').addEventListener('click', () => go('home'));
  $$('[data-open]', main).forEach(b => b.addEventListener('click', () => {
    const [source, rid] = b.dataset.open.split(':');
    go('result', { source, id: rid, searchId: id });
  }));
  $('#qrAnswerThis')?.addEventListener('click', () => go('answer', { searchId: id }));
}

function viewHistory() {
  main.innerHTML = `
    <div class="qr-history">
      <div class="fl-section-head"><h3>Search history</h3>
        ${mine.length ? '<button class="btn btn-sm btn-ghost" id="qrClearAll">Clear history</button>' : ''}</div>
      ${mine.map(s => `
        <div class="qr-hist-row">
          <button class="qr-hist-q" data-open="${esc(s.id)}">
            <i class="qr-tab-dot ${s.status}"></i>${esc(s.query)}
            <small>${new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              · ${s.status === 'pending' ? 'waiting on results' : 'answered'}${s.closed ? '' : ' · open tab'}</small>
          </button>
          <button class="icon-btn" data-del="${esc(s.id)}" title="Delete">🗑</button>
        </div>`).join('') || '<div class="ig-empty muted">No searches yet.</div>'}
    </div>`;
  $$('[data-open]', main).forEach(b => b.addEventListener('click', () => go('search', { searchId: b.dataset.open })));
  $$('[data-del]', main).forEach(b => b.addEventListener('click', async () => {
    await supa.from('qr_searches').delete().eq('id', b.dataset.del);
    mine = mine.filter(s => s.id !== b.dataset.del);
    viewHistory(); renderTabs();
  }));
  $('#qrClearAll')?.addEventListener('click', async () => {
    if (!confirm('Delete every search in your history, and their results?')) return;
    await supa.from('qr_searches').delete().eq('user_id', me.id);
    mine = []; go('home');
  });
}

/* ------------------------------------------------------------------ */
/*  a single result, full page                                        */
/* ------------------------------------------------------------------ */

async function viewResult({ source, id, searchId }) {
  const table = source === 'page' ? 'qr_pages' : 'qr_results';
  const { data: r } = await supa.from(table).select('*').eq('id', id).maybeSingle();
  if (!r) { main.innerHTML = '<div class="ig-empty">This page could not be reached.</div>'; return; }
  const k = KINDS[r.kind] || KINDS.text;
  const addr = r.source || k.source(r.title);

  main.innerHTML = `
    <div class="qr-page-view">
      <div class="qr-addressbar">
        <button class="icon-btn" id="qrBack" title="Back">‹</button>
        <span class="qr-url">🔒 ${esc(addr)}</span>
      </div>
      <div class="qr-doc qr-doc-${r.kind}">${renderBody(r)}</div>
    </div>`;

  $('#qrBack').addEventListener('click', () => searchId ? go('search', { searchId }) : go('home'));
  $$('.qr-wikilink', main).forEach(a => a.addEventListener('click', () => runSearch(a.dataset.q)));
  $$('.qr-doc img[data-zoom]', main).forEach(im => im.addEventListener('click', () => lightbox(im.src)));
}

function renderBody(r) {
  const b = r.body || {};
  if (r.kind === 'wiki') {
    const info = parseInfobox(b.infobox);
    const sections = parseWiki(b.text);
    const toc = sections.filter(s => s.heading);
    const blocks = s => s.blocks.map(x => x.type === 'ul'
      ? `<ul>${x.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>` : `<p>${inline(x.text)}</p>`).join('');
    return `
      <div class="qr-wiki-head"><span class="qr-wiki-brand">Heropedia</span><span>The Free Hero Encyclopedia</span></div>
      <h1>${esc(r.title || 'Untitled')}</h1>
      <p class="qr-wiki-from">From Heropedia, the free hero encyclopedia</p>
      ${(info.length || b.image_url) ? `<aside class="qr-infobox">
        <div class="qr-infobox-title">${esc(r.title || '')}</div>
        ${b.image_url ? `<img src="${esc(b.image_url)}" alt="" data-zoom>` : ''}
        ${b.image_caption ? `<div class="qr-infobox-cap">${esc(b.image_caption)}</div>` : ''}
        ${info.length ? `<table>${info.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${inline(v)}</td></tr>`).join('')}</table>` : ''}
      </aside>` : ''}
      ${sections.filter(s => !s.heading).map(blocks).join('')}
      ${toc.length > 1 ? `<nav class="qr-toc"><b>Contents</b><ol>${toc.map(s => `<li>${esc(s.heading)}</li>`).join('')}</ol></nav>` : ''}
      ${sections.filter(s => s.heading).map(s => `<h2>${esc(s.heading)}</h2>${blocks(s)}`).join('')}
      <div class="qr-wiki-foot">This page was last edited on ${esc(storyNow().toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }))}.</div>`;
  }

  if (r.kind === 'forum') {
    const posts = parseForum(b.posts);
    const now = storyNow();
    const stamp = (i) => {
      const d = new Date(now.getTime() - (posts.length - i) * 7 * 60000 - 3600000);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)}(${d.toLocaleDateString('en', { weekday: 'short' })})${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    return `
      <div class="qr-board-head">${esc(b.board || '/x/ - Paranormal')}</div>
      <hr>
      ${posts.map((p, i) => `
        <div class="qr-post ${i === 0 ? 'op' : 'reply'}">
          ${i === 0 && b.image_url ? `<img class="qr-post-img" src="${esc(b.image_url)}" alt="" data-zoom>` : ''}
          <div class="qr-post-info">
            ${i === 0 && r.title ? `<span class="qr-post-subject">${esc(r.title)}</span>` : ''}
            <span class="qr-post-name">${esc(p.name)}</span>
            <span>${stamp(i)}</span>
            <span class="qr-post-no">No.${postNumber(r.id, i)}</span>
          </div>
          <blockquote>${p.lines.map(forumLine).join('<br>')}</blockquote>
        </div>`).join('')}`;
  }

  if (r.kind === 'image') {
    return `
      <figure class="qr-figure">
        ${b.image_url ? `<img src="${esc(b.image_url)}" alt="" data-zoom>` : ''}
        <figcaption>${r.title ? `<strong>${esc(r.title)}</strong>` : ''}${b.caption ? `<span>${esc(b.caption)}</span>` : ''}</figcaption>
      </figure>`;
  }

  // plain answer
  return `
    <div class="qr-answer">
      <div class="qr-answer-badge"><img src="assets/apps/queree.png" alt=""> Queree answer</div>
      ${r.title ? `<h2>${esc(r.title)}</h2>` : ''}
      ${String(b.text || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  GM: inbox, answering, the index                                   */
/* ------------------------------------------------------------------ */

let names = new Map();
async function loadNames() {
  const { data } = await supa.from('profiles').select('id, username');
  names = new Map((data || []).map(p => [p.id, p.username]));
}

async function paintInboxBadge() {
  if (!me.is_admin) return;
  const { count } = await supa.from('qr_searches')
    .select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const b = $('#qrInboxBadge');
  b.hidden = !count; b.textContent = count > 9 ? '9+' : String(count || '');
}

async function viewInbox() {
  await loadNames();
  const { data } = await supa.from('qr_searches').select('*')
    .order('created_at', { ascending: false }).limit(120);
  const all = data || [];
  const pending = all.filter(s => s.status === 'pending').reverse();   // oldest first
  const done = all.filter(s => s.status === 'answered').slice(0, 30);
  const row = s => `
    <button class="qr-hist-q qr-inbox-row" data-ans="${esc(s.id)}">
      <i class="qr-tab-dot ${s.status}"></i>${esc(s.query)}
      <small>${esc(names.get(s.user_id) || 'someone')} · ${new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
    </button>`;
  main.innerHTML = `
    <div class="qr-history">
      <div class="fl-section-head"><h3>Waiting on you · ${pending.length}</h3>
        <button class="btn btn-sm btn-ghost" id="qrToIndex">Indexed pages</button></div>
      ${pending.map(row).join('') || '<div class="fl-empty">Every search has an answer.</div>'}
      <div class="fl-section-head" style="margin-top:22px"><h3>Recently answered</h3></div>
      ${done.map(row).join('') || '<div class="fl-empty">Nothing yet.</div>'}
    </div>`;
  $$('[data-ans]', main).forEach(b => b.addEventListener('click', () => go('answer', { searchId: b.dataset.ans })));
  $('#qrToIndex').addEventListener('click', () => go('index'));
}

async function viewAnswer(searchId) {
  if (!names.size) await loadNames();
  const { data: s } = await supa.from('qr_searches').select('*').eq('id', searchId).maybeSingle();
  if (!s) { main.innerHTML = '<div class="ig-empty">That search is gone.</div>'; return; }
  const { data: results } = await supa.from('qr_results').select('*').eq('search_id', searchId).order('created_at');
  const suggested = matchPages(pages, s.query);

  main.innerHTML = `
    <div class="qr-history">
      <button class="btn btn-ghost btn-sm" id="qrBackInbox">‹ Inbox</button>
      <div class="qr-ask">
        <small>${esc(names.get(s.user_id) || 'someone')} searched</small>
        <h2>“${esc(s.query)}”</h2>
        <span class="muted small">${s.status === 'pending' ? 'Waiting on you' : 'Answered — you can add more'}</span>
      </div>

      <div class="fl-section-head"><h3>Answer with…</h3></div>
      <div class="qr-kinds">
        ${Object.entries(KINDS).map(([k, v]) => `<button class="qr-kind" data-kind="${k}"><span>${v.icon}</span>${v.label}</button>`).join('')}
      </div>

      ${suggested.length ? `
        <div class="fl-section-head" style="margin-top:18px"><h3>Or send an indexed page</h3></div>
        ${suggested.map(p => `<div class="qr-hist-row"><span class="qr-hist-q static">${KINDS[p.kind].icon} ${esc(p.title)}</span>
          <button class="btn btn-sm btn-ghost" data-send="${esc(p.id)}">Send</button></div>`).join('')}` : ''}

      <div class="fl-section-head" style="margin-top:18px"><h3>Results sent · ${results?.length || 0}</h3></div>
      ${(results || []).map(r => `<div class="qr-hist-row">
          <span class="qr-hist-q static">${KINDS[r.kind].icon} ${esc(r.title || KINDS[r.kind].label)}<small>${esc(snippet(r, 90))}</small></span>
          <button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">✎</button>
          <button class="icon-btn" data-delres="${esc(r.id)}" title="Remove">🗑</button></div>`).join('')
        || '<div class="fl-empty">Nothing sent yet.</div>'}
    </div>`;

  $('#qrBackInbox').addEventListener('click', () => go('inbox'));
  $$('[data-kind]', main).forEach(b => b.addEventListener('click',
    () => openComposer({ kind: b.dataset.kind, target: 'result', searchId, query: s.query })));
  $$('[data-send]', main).forEach(b => b.addEventListener('click', async () => {
    const p = pages.find(x => x.id === b.dataset.send);
    const { error } = await supa.from('qr_results').insert(
      { search_id: searchId, kind: p.kind, title: p.title, source: p.source, body: p.body });
    if (error) return toast(error.message, 'error');
    playSound('sent'); toast('Sent.', 'ok'); go('answer', { searchId });
  }));
  $$('[data-edit]', main).forEach(b => b.addEventListener('click', () => {
    const r = results.find(x => x.id === b.dataset.edit);
    openComposer({ kind: r.kind, target: 'result', searchId, existing: r });
  }));
  $$('[data-delres]', main).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Remove this result from the player\'s search?')) return;
    await supa.from('qr_results').delete().eq('id', b.dataset.delres);
    go('answer', { searchId });
  }));
}

async function viewIndex() {
  await loadPages();
  main.innerHTML = `
    <div class="qr-history">
      <div class="fl-section-head"><h3>Indexed pages · ${pages.length}</h3></div>
      <p class="muted small">Pages here show up instantly for any search that matches their title or keywords,
        for every player — good for lore you've written ahead of time.</p>
      <div class="qr-kinds">
        ${Object.entries(KINDS).map(([k, v]) => `<button class="qr-kind" data-kind="${k}"><span>${v.icon}</span>New ${v.label.toLowerCase()}</button>`).join('')}
      </div>
      <div style="margin-top:16px">
      ${pages.map(p => `<div class="qr-hist-row">
          <button class="qr-hist-q" data-view="${esc(p.id)}">${KINDS[p.kind].icon} ${esc(p.title)}
            <small>${esc(p.keywords || 'no keywords')}</small></button>
          <button class="icon-btn" data-edit="${esc(p.id)}" title="Edit">✎</button>
          <button class="icon-btn" data-delpage="${esc(p.id)}" title="Delete">🗑</button></div>`).join('')
        || '<div class="fl-empty">Nothing indexed yet.</div>'}
      </div>
    </div>`;
  $$('[data-kind]', main).forEach(b => b.addEventListener('click', () => openComposer({ kind: b.dataset.kind, target: 'page' })));
  $$('[data-view]', main).forEach(b => b.addEventListener('click', () => go('result', { source: 'page', id: b.dataset.view })));
  $$('[data-edit]', main).forEach(b => b.addEventListener('click', () =>
    openComposer({ kind: pages.find(p => p.id === b.dataset.edit).kind, target: 'page', existing: pages.find(p => p.id === b.dataset.edit) })));
  $$('[data-delpage]', main).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this indexed page?')) return;
    await supa.from('qr_pages').delete().eq('id', b.dataset.delpage);
    go('index');
  }));
}

/* ------------------------------------------------------------------ */
/*  the composer — one form for every kind of result                  */
/* ------------------------------------------------------------------ */

function openComposer({ kind, target, searchId = null, existing = null, query = '' }) {
  const k = KINDS[kind];
  const e = existing || {};
  const b = e.body || {};
  const field = (id, label, html) => `<div class="field"><label for="${id}">${label}</label>${html}</div>`;
  const imageField = (label) => field('cImg', label, `
    <div class="inline-row"><input type="text" id="cImg" value="${esc(b.image_url || '')}" placeholder="Paste an image address, or upload →">
      <button type="button" class="btn btn-sm btn-ghost" id="cImgPick">Upload</button></div>
    <input type="file" id="cImgFile" accept="image/*" hidden>`);

  const kindFields = {
    wiki: `
      ${imageField('Infobox image (optional)')}
      ${field('cCap', 'Image caption (optional)', `<input type="text" id="cCap" value="${esc(b.image_caption || '')}">`)}
      ${field('cInfo', 'Infobox — one "Label: Value" per line (optional)',
        `<textarea id="cInfo" rows="4" placeholder="Born: 2131&#10;Alias: The Phoenix&#10;Affiliation: [[Justice University]]">${esc(b.infobox || '')}</textarea>`)}
      ${field('cText', 'Article',
        `<textarea id="cText" rows="12" placeholder="Opening paragraph…&#10;&#10;## Early life&#10;Text with **bold**, *italic* and [[Links]] that search when tapped.&#10;- bullet points start with a dash">${esc(b.text || '')}</textarea>`)}`,
    forum: `
      ${field('cBoard', 'Board', `<input type="text" id="cBoard" value="${esc(b.board || '/x/ - Paranormal')}">`)}
      ${imageField('Image on the first post (optional)')}
      ${field('cPosts', 'Posts — separate each post with a line of ---',
        `<textarea id="cPosts" rows="12" placeholder="anyone else see the lights over the overpass last night&#10;&gt;be me&#10;&gt;walking home&#10;---&#10;Name: definitely_not_a_villain&#10;&gt;&gt;40000001&#10;swamp gas">${esc(b.posts || '')}</textarea>`)}
      <p class="muted small">Start a post with <code>Name: …</code> to sign it. Lines starting <code>&gt;</code> turn green.</p>`,
    text: field('cText', 'Answer', `<textarea id="cText" rows="10">${esc(b.text || '')}</textarea>`),
    image: `
      ${imageField('Image')}
      ${field('cCaption', 'Caption (optional)', `<textarea id="cCaption" rows="2">${esc(b.caption || '')}</textarea>`)}`
  };

  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${existing ? 'Edit' : 'New'} ${k.label.toLowerCase()}${target === 'page' ? ' · indexed page' : ''}</h3>
        <button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        ${query ? `<p class="muted small">Answering “${esc(query)}”</p>` : ''}
        ${field('cTitle', kind === 'forum' ? 'Thread subject' : 'Title' + (kind === 'text' ? ' (optional)' : ''),
          `<input type="text" id="cTitle" value="${esc(e.title || (kind === 'wiki' && !existing ? query : ''))}" maxlength="140">`)}
        ${field('cSource', 'Address shown on the result', `<input type="text" id="cSource" class="mono" value="${esc(e.source || '')}" placeholder="${esc(k.source(e.title || query || 'Page'))}">`)}
        ${target === 'page' ? field('cKeys', 'Keywords — words a search should match',
          `<input type="text" id="cKeys" value="${esc(e.keywords || '')}" placeholder="phoenix, campus, school, university">`) : ''}
        ${kindFields[kind]}
        <div id="cMsg"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="cPreview">Preview</button>
        <button class="btn btn-primary" id="cSave">${target === 'result' ? (existing ? 'Save' : 'Send to player') : 'Save page'}</button>
      </div>
    </div></div>`;

  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(x => x.addEventListener('click', close));

  $('#cImgPick', root)?.addEventListener('click', () => $('#cImgFile', root).click());
  $('#cImgFile', root)?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const btn = $('#cImgPick', root); btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const url = await uploadFile('attachments', me.id, await shrinkImage(file, 1600, 0.85));
      $('#cImg', root).value = url;
    } catch (err) { toast(err.message || 'Upload failed.', 'error'); }
    btn.disabled = false; btn.textContent = 'Upload';
  });

  // What the form currently holds, shaped like a stored row.
  const collect = () => {
    const v = id => $(id, root)?.value.trim() || '';
    const body = {
      wiki:  { text: v('#cText'), infobox: v('#cInfo'), image_url: v('#cImg'), image_caption: v('#cCap') },
      forum: { board: v('#cBoard'), posts: v('#cPosts'), image_url: v('#cImg') },
      text:  { text: v('#cText') },
      image: { image_url: v('#cImg'), caption: v('#cCaption') }
    }[kind];
    return { id: e.id || 'preview', kind, title: v('#cTitle') || null, source: v('#cSource') || null, body };
  };

  // Preview: the page exactly as the player will see it, over the form.
  $('#cPreview', root).addEventListener('click', () => {
    const r = collect();
    const addr = r.source || k.source(r.title || query || 'Page');
    const layer = document.createElement('div');
    layer.className = 'qr-preview';
    layer.innerHTML = `
      <div class="qr-preview-bar">
        <span class="qr-preview-tag">Preview</span>
        <span class="muted small">This is what ${target === 'page' ? 'players' : 'the player'} will see.</span>
        <span class="jr-spacer"></span>
        <button class="btn btn-ghost btn-sm" data-back>‹ Keep editing</button>
        <button class="btn btn-primary btn-sm" data-send>${target === 'result' ? (existing ? 'Save' : 'Send to player') : 'Save page'}</button>
      </div>
      <div class="qr-preview-scroll">
        <div class="qr-preview-label">In the results list</div>
        <div class="qr-results">${resultCard({ ...r, source: addr }, 'preview')}</div>
        <div class="qr-preview-label">Opened</div>
        <div class="qr-page-view">
          <div class="qr-addressbar"><span class="qr-url">🔒 ${esc(addr)}</span></div>
          <div class="qr-doc qr-doc-${r.kind}">${renderBody(r)}</div>
        </div>
      </div>`;
    document.body.appendChild(layer);
    $$('.qr-doc img[data-zoom]', layer).forEach(im => im.addEventListener('click', () => lightbox(im.src)));
    $$('a.qr-wikilink, .qr-result', layer).forEach(a => a.addEventListener('click', (ev) => ev.preventDefault()));
    $('[data-back]', layer).addEventListener('click', () => layer.remove());
    $('[data-send]', layer).addEventListener('click', () => { layer.remove(); $('#cSave', root).click(); });
  });

  $('#cSave', root).addEventListener('click', async (ev) => {
    const v = id => $(id, root)?.value.trim() || '';
    const body = {
      wiki:  { text: v('#cText'), infobox: v('#cInfo'), image_url: v('#cImg'), image_caption: v('#cCap') },
      forum: { board: v('#cBoard'), posts: v('#cPosts'), image_url: v('#cImg') },
      text:  { text: v('#cText') },
      image: { image_url: v('#cImg'), caption: v('#cCaption') }
    }[kind];
    const title = v('#cTitle') || null;
    const msg = t => {
      const box = $('#cMsg', root);
      box.innerHTML = `<div class="notice notice-error">${esc(t)}</div>`;
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      toast(t, 'error');
    };
    if (kind === 'wiki' && !title) return msg('A wiki article needs a title.');
    if ((kind === 'wiki' || kind === 'text') && !body.text) return msg('Write something first.');
    if (kind === 'forum' && !parseForum(body.posts).length) return msg('Write at least one post.');
    if (kind === 'image' && !body.image_url) return msg('Add an image.');
    if (target === 'page' && !title) return msg('Indexed pages need a title so searches can find them.');

    const row = { kind, title, source: v('#cSource') || null, body };
    const btn = ev.currentTarget, label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sending…';
    let error;
    try {
    if (target === 'page') {
      row.keywords = v('#cKeys') || null;
      ({ error } = existing ? await supa.from('qr_pages').update(row).eq('id', existing.id)
                            : await supa.from('qr_pages').insert(row));
    } else {
      ({ error } = existing ? await supa.from('qr_results').update(row).eq('id', existing.id)
                            : await supa.from('qr_results').insert({ ...row, search_id: searchId }));
    }
    } catch (err) { error = err; }
    if (error) {
      console.error('[queree] save failed', error);
      btn.disabled = false; btn.textContent = label;
      return msg(error.message || String(error));
    }
    close();
    playSound('sent');
    toast(target === 'page' ? 'Page saved to the index.' : existing ? 'Saved.' : 'Sent — the player has been notified.', 'ok');
    if (target === 'page') go('index'); else go('answer', { searchId });
  });
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

$('#qrNew').addEventListener('click', () => go('home'));
$('#qrHistory').addEventListener('click', () => go('history'));
$('#qrInbox').addEventListener('click', () => go('inbox'));
$('#qrIndex').addEventListener('click', () => go('index'));

// Live: answers land in the open tab, tab dots update, the GM's inbox
// refreshes. Nothing re-renders while a form is open.
let liveTimer = null;
const live = (fn) => { clearTimeout(liveTimer); liveTimer = setTimeout(fn, 350); };
supa.channel('queree-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_results' }, () => live(async () => {
    await loadMine();
    // Don't wipe a form or a half-typed search.
    if ($('#modalRoot').children.length || main.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return renderTabs();
    if (view.name === 'search' || view.name === 'answer' || view.name === 'inbox') go(view.name, view);
    else renderTabs();
  }))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_searches' }, () => live(async () => {
    await loadMine(); paintInboxBadge();
    if (view.name === 'inbox' && !$('#modalRoot').children.length) go('inbox'); else renderTabs();
  }))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_pages' }, () => live(loadPages))
  .subscribe();

try {
  await Promise.all([loadMine(), loadPages()]);
} catch (err) {
  main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  throw err;
}
paintInboxBadge();

const params = new URLSearchParams(location.search);
if (params.get('s')) go('search', { searchId: params.get('s') });
else if (params.get('admin') && me.is_admin) go('inbox');
else go('home');
