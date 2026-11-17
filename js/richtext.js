// =====================================================================
//  Rich text for plain textareas — the "Aa" toolbar.
//  Writes simple marks you could also type by hand, and renders them:
//    **bold**  *italic*  ~~strike~~  {{blue|blue text}}
//    [label](https://link)   bare https:// links
//    "- " bullets   "1. " numbered   "> " quoted lines
// =====================================================================

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(t) {
  return esc(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\{\{blue\|(.+?)\}\}/g, '<span class="rt-blue">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

/** Marked-up text → safe HTML. */
export function renderRich(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*[-*•]\s+/.test(l)) {
      html += '<ul>';
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*[-*•]\s+/, ''))}</li>`;
      html += '</ul>'; continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      html += '<ol>';
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>`;
      html += '</ol>'; continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      html += `<blockquote>${renderRich(q.join('\n'))}</blockquote>`; continue;
    }
    html += l.trim() ? `<div>${inline(l)}</div>` : '<div><br></div>';
    i++;
  }
  return html;
}

/** Plain text for previews: marks removed. */
export function plainText(text) {
  return String(text ?? '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1').replace(/\{\{blue\|(.+?)\}\}/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/^\s*([-*•]|\d+[.)]|>)\s?/gm, '');
}

const TOOLS = {
  bold:   { label: '<b>B</b>', title: 'Bold (Ctrl+B)', wrap: ['**', '**', 'bold'] },
  italic: { label: '<i>I</i>', title: 'Italic (Ctrl+I)', wrap: ['*', '*', 'italic'] },
  strike: { label: '<s>S</s>', title: 'Strikethrough', wrap: ['~~', '~~', 'struck'] },
  blue:   { label: '<span class="rt-blue">A</span>', title: 'Blue text', wrap: ['{{blue|', '}}', 'blue text'] },
  link:   { label: '🔗', title: 'Link (Ctrl+K)', link: true },
  ul:     { label: '•', title: 'Bulleted list', line: '- ' },
  ol:     { label: '1.', title: 'Numbered list', line: n => `${n + 1}. ` },
  quote:  { label: '❝', title: 'Quote', line: '> ' }
};

export function toolbarHtml(keys = ['bold', 'italic', 'strike', 'blue', 'link', 'ul', 'ol', 'quote']) {
  return `<div class="rt-bar">${keys.map(k => `<button type="button" data-rt="${k}" title="${esc(TOOLS[k].title)}">${TOOLS[k].label}</button>`).join('')}</div>`;
}

function apply(el, key) {
  const f = TOOLS[key];
  const v = el.value, a = el.selectionStart ?? v.length, z = el.selectionEnd ?? v.length, sel = v.slice(a, z);
  el.focus();
  if (f.wrap) {
    const [L, R, ph] = f.wrap;
    if (sel && v.slice(a - L.length, a) === L && v.slice(z, z + R.length) === R) {
      el.setRangeText(sel, a - L.length, z + R.length, 'select');
    } else {
      const t = sel || ph;
      el.setRangeText(L + t + R, a, z, 'end');
      el.setSelectionRange(a + L.length, a + L.length + t.length);
    }
  } else if (f.link) {
    const url = prompt('Link address', 'https://');
    if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
    const t = sel || 'link';
    el.setRangeText(`[${t}](${url.trim()})`, a, z, 'end');
  } else if (f.line) {
    const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', z), end = le < 0 ? v.length : le;
    const lines = v.slice(ls, end).split('\n');
    const pre = i => typeof f.line === 'function' ? f.line(i) : f.line;
    const strip = l => l.replace(/^(\s*[-*•]\s+|\s*\d+[.)]\s+|>\s?)/, '');
    const same = lines.every((l, i) => l.startsWith(pre(i)));
    el.setRangeText(lines.map((l, i) => same ? strip(l) : pre(i) + strip(l)).join('\n'), ls, end, 'end');
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Wires a toolbar to its textarea, plus Ctrl+B / I / K. */
export function wireToolbar(bar, el) {
  if (!bar || !el) return;
  bar.addEventListener('mousedown', e => { if (e.target.closest('[data-rt]')) e.preventDefault(); });
  bar.querySelectorAll('[data-rt]').forEach(b => b.addEventListener('click', () => apply(el, b.dataset.rt)));
  el.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); apply(el, k); }
  });
}
