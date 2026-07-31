// =====================================================================
//  NEO — shared emoji
//
//  One list, used by both apps. The picker attaches to any button and
//  drops the chosen emoji into a target text field at the cursor.
// =====================================================================

export const EMOJI = {
  '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
         '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
         '😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','🥱','😴','🤤','😪','😵','🤯',
         '🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮‍💨','😢','😭','😤','😠','😡','🤬','😱',
         '😨','😰','😥','🥶','🥵','😳','🤢','🤮','🤧','😷','🤒','🤕','💀','☠️','👻','👽'],
  '👋': ['👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇',
         '☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','✍️',
         '💅','👀','👁️','👄','🧠','🫀','🦴','👤','🚶','🏃','💃','🕺','🧍','🧎','🤷','🤦'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
         '💘','💝','💟','☮️','✝️','🔥','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗯️',
         '♠️','♥️','♦️','♣️','🃏','🎴','🀄','⭐','🌟','✨','⚡','☄️','💡','🔮','🎯','🧿'],
  '📱': ['📱','💻','⌨️','🖥️','🖨️','🕹️','💾','💿','📷','📸','🎥','📞','☎️','📟','📠','📺',
         '📻','🎙️','⏱️','⏰','🔋','🔌','💡','🔦','🧭','⚙️','🔧','🔨','🗝️','🔒','🔓','🛡️',
         '🔫','🗡️','💊','💉','🧪','🧬','🔬','🔭','📡','💰','💳','💎','📦','📄','📁','🗂️'],
  '🚗': ['🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🏍️','🛵','🚲','✈️','🚀',
         '🛸','🚁','⛵','🚤','🛳️','🚂','🚇','🗺️','🧳','⛰️','🌋','🏕️','🏖️','🏙️','🌃','🌉',
         '🏠','🏢','🏥','🏦','🏨','🏪','🏫','⛪','🕌','🏰','🗿','🗽','🎡','🎢','🎪','⛲'],
  '🍕': ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍣','🍤','🍱','🥟','🍚',
         '🍞','🥐','🥨','🧀','🥓','🍳','🥞','🧇','🍗','🍖','🥩','🥙','🍿','🧂','🍩','🍪',
         '🎂','🍰','🧁','🍫','🍬','🍭','☕','🍵','🥤','🧃','🍺','🍻','🍷','🥃','🍸','🥂']
};

/**
 * Wire an emoji button to a text field.
 *
 *   attachEmoji(button, () => currentInputEl)
 *
 * The picker is placed in a fixed layer on document.body, positioned
 * against the button. That deliberately escapes any overflow:hidden
 * ancestor (a rounded post card, say) which would otherwise clip it —
 * the bug where the popup showed on tall mobile cards but was cut off on
 * short desktop ones. Inserts at the cursor and fires an 'input' event.
 */
export function attachEmoji(button, getTarget) {
  let pop = null;

  const close = () => {
    if (!pop) return;
    pop.remove();
    pop = null;
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };

  const place = () => {
    const r = button.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    // Prefer above the button; drop below if there is not room up top.
    const opensUp = r.top > 260;
    pop.style.width = w + 'px';
    let left = Math.min(r.right - w, window.innerWidth - w - 8);
    left = Math.max(8, left);
    pop.style.left = left + 'px';
    if (opensUp) {
      pop.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      pop.style.top = 'auto';
    } else {
      pop.style.top = (r.bottom + 8) + 'px';
      pop.style.bottom = 'auto';
    }
  };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop) return close();

    const target = typeof getTarget === 'function' ? getTarget() : getTarget;
    if (!target) return;

    pop = document.createElement('div');
    pop.className = 'emoji-pop emoji-pop-fixed';
    const cats = Object.keys(EMOJI);
    pop.innerHTML = `
      <div class="emoji-cats">
        ${cats.map((c, i) => `<button type="button" data-cat="${c}" class="${i === 0 ? 'active' : ''}">${c}</button>`).join('')}
      </div>
      <div class="emoji-grid"></div>`;

    document.body.appendChild(pop);
    place();
    pop.addEventListener('click', ev => ev.stopPropagation());
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);

    const paint = (cat) => {
      pop.querySelector('.emoji-grid').innerHTML =
        EMOJI[cat].map(x => `<button type="button">${x}</button>`).join('');
      pop.querySelectorAll('.emoji-grid button').forEach(b =>
        b.addEventListener('click', () => {
          insertAtCursor(target, b.textContent);
          target.focus();
        }));
    };

    pop.querySelectorAll('.emoji-cats button').forEach(b =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pop.querySelectorAll('.emoji-cats button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        paint(b.dataset.cat);
      }));

    paint(cats[0]);
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

export function insertAtCursor(el, text) {
  const pos = el.selectionStart ?? el.value.length;
  el.value = el.value.slice(0, pos) + text + el.value.slice(pos);
  el.selectionStart = el.selectionEnd = pos + text.length;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
