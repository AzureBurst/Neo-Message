// =====================================================================
//  QUEREE — parsing and matching
//  Pure functions (no imports) so they can be tested on their own.
//
//  The GM writes everything as plain text; these turn it into a wiki
//  article or a forum thread. All text is escaped before any markup is
//  added, so nothing a GM types can inject HTML.
// =====================================================================

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Inline marks for wiki text:
     **bold**  *italic*  [[Link]] or [[Link|label]] (blue; tapping searches)
     {{blue|text}} (blue, not a link)  [^1] or [^citation needed] (a
     superscript reference like Wikipedia's [1]).
   Links carry data-q so tapping one searches for it. */
export function inline(text) {
  return escHtml(text)
    .replace(/\[\^([^\]]+?)\]/g, (_, n) => /^\d+$/.test(n.trim())
      ? `<sup class="qr-ref">[${n.trim()}]</sup>`
      : `<sup class="qr-ref qr-cn">[<i>${n.trim()}</i>]</sup>`)
    .replace(/\{\{blue\|(.+?)\}\}/g, '<span class="qr-blue">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
      (_, target, label) => `<a class="qr-wikilink" data-q="${target.trim()}">${(label || target).trim()}</a>`);
}

/* Wiki body:
     "## Heading" starts a section, "### Sub-heading" a sub-section
     blank lines split paragraphs
     "- " bullet lists, "1. " numbered lists
     ": text" an italic note line, like Wikipedia's "For other uses, see…"
     "{{notice|text}}" a boxed notice, like "This article needs more citations" */
export function parseWiki(text) {
  const sections = [{ heading: null, level: 0, blocks: [] }];
  let para = [], list = [], ol = [];
  const cur = () => sections[sections.length - 1];
  const flush = () => {
    if (para.length) { cur().blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
    if (list.length) { cur().blocks.push({ type: 'ul', items: list }); list = []; }
    if (ol.length) { cur().blocks.push({ type: 'ol', items: ol }); ol = []; }
  };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const h = line.match(/^(#{2,3})\s+(.+)/);
    if (h) { flush(); sections.push({ heading: h[2].trim(), level: h[1].length, blocks: [] }); continue; }
    if (!line) { flush(); continue; }
    const notice = line.match(/^\{\{notice\|(.+)\}\}$/i);
    if (notice) { flush(); cur().blocks.push({ type: 'box', text: notice[1].trim() }); continue; }
    if (/^:\s*/.test(line)) { flush(); cur().blocks.push({ type: 'hat', text: line.replace(/^:\s*/, '') }); continue; }
    if (/^[-*]\s+/.test(line)) { if (para.length || ol.length) flush(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (/^\d+[.)]\s+/.test(line)) { if (para.length || list.length) flush(); ol.push(line.replace(/^\d+[.)]\s+/, '')); continue; }
    if (list.length || ol.length) flush();
    para.push(line);
  }
  flush();
  return sections.filter((s, i) => i === 0 ? s.blocks.length : true);
}

/* One section's blocks as HTML. */
export function wikiBlocks(sec) {
  return sec.blocks.map(x =>
      x.type === 'ul'  ? `<ul>${x.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`
    : x.type === 'ol'  ? `<ol>${x.items.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`
    : x.type === 'hat' ? `<div class="qr-hatnote">${inline(x.text)}</div>`
    : x.type === 'box' ? `<div class="qr-notice"><span class="qr-notice-icon" aria-hidden="true">📖</span><div>${inline(x.text)}</div></div>`
    : `<p>${inline(x.text)}</p>`).join('');
}

/* Infobox rows: "Label: Value", "## Header" for a centered header row,
   and a line without a label continues the row above on a new line. */
export function parseInfoboxRows(text) {
  const rows = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(?:#{1,3}\s+(.+)|==\s*(.+?)\s*==)$/);
    if (h) { rows.push({ type: 'head', text: (h[1] || h[2]).trim() }); continue; }
    const m = line.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (m && !/^\[\[|^\{\{|^https?$/i.test(m[1])) { rows.push({ type: 'row', label: m[1], values: [m[2]] }); continue; }
    const last = rows[rows.length - 1];
    if (last?.type === 'row') last.values.push(line);
    else rows.push({ type: 'row', label: '', values: [line] });
  }
  return rows;
}

/* Infobox: one "Label: Value" per line. */
export function parseInfobox(text) {
  return String(text || '').split('\n')
    .map(l => l.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/))
    .filter(Boolean).map(m => [m[1], m[2]]);
}

/* Forum thread: posts separated by a line of three or more dashes.
   A post may open with "Name: Something" to override Anonymous. Lines
   starting ">" are greentext; ">>number" are reply links. */
export function parseForum(text) {
  return String(text || '').split(/\n\s*-{3,}\s*\n/).map(chunk => {
    const lines = chunk.replace(/^\n+|\n+$/g, '').split('\n');
    let name = 'Anonymous';
    const m = lines[0]?.match(/^\s*name:\s*(.+)$/i);
    if (m) { name = m[1].trim(); lines.shift(); }
    return { name, lines };
  }).filter(p => p.lines.some(l => l.trim()));
}

export function forumLine(line) {
  const e = escHtml(line);
  if (/^&gt;&gt;\d+/.test(e)) return `<span class="qr-quotelink">${e}</span>`;
  if (/^&gt;/.test(e)) return `<span class="qr-greentext">${e}</span>`;
  return e;
}

/* Stable fake post numbers from a seed, so a thread reads the same every
   time it is opened. */
export function postNumber(seed, i) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 40000000 + ((h >>> 0) % 9000000) + i * (37 + ((h >>> 3) % 211));
}

/* ------------------------------------------------------------------ */
/*  matching indexed pages to a search                                */
/* ------------------------------------------------------------------ */

const STOP = new Set(('a an and are as at be by do does for from how i in is it me my of on or ' +
  'that the this to was what when where which who why will with you your').split(' '));

/* A light singular form so "universities" finds "University" and
   "heroes" finds "Hero". */
function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|xes|sses|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokens(s) {
  return (String(s || '').toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9]+/g) || [])
    .filter(w => !STOP.has(w) && w.length > 1).map(stem);
}

/* Score a page against a query: whole-phrase hits on the title count
   most, then title words, then keywords. 0 means not a match. */
export function scorePage(page, query) {
  const q = tokens(query);
  if (!q.length) return 0;
  const title = String(page.title || '').toLowerCase();
  const tw = new Set(tokens(page.title));
  const kw = new Set(tokens(page.keywords));
  let score = 0;
  if (title && String(query).toLowerCase().includes(title)) score += 6;
  for (const w of q) {
    if (tw.has(w)) score += 3;
    else if (kw.has(w)) score += 2;
    else if ([...kw, ...tw].some(k => k.length > 3 && (k.startsWith(w) || w.startsWith(k)))) score += 1;
  }
  return score;
}

export function matchPages(pages, query, limit = 6) {
  return pages.map(p => ({ p, s: scorePage(p, query) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.p);
}

/* A plain-text snippet for a result card. */
export function snippet(result, n = 180) {
  const b = result.body || {};
  const raw = result.kind === 'wiki' ? b.text
    : result.kind === 'forum' ? (parseForum(b.posts)[0]?.lines.join(' ') || '')
    : result.kind === 'image' ? (b.caption || '')
    : b.text;
  const t = String(raw || '').replace(/^\{\{notice\|.*\}\}$/gim, '').replace(/^:\s*.*$/gm, '')
    .replace(/\[\^[^\]]+\]/g, '').replace(/\{\{blue\|(.+?)\}\}/g, '$1').replace(/^#+\s+/gm, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, l) => l || a)
    .replace(/\*\*?/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}
