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
 * The target is resolved fresh on each open, so one button can serve a
 * field that moves around the page (like the currently focused comment
 * box). Inserts at the cursor and fires an 'input' event so any
 * listeners on the field react.
 */
export function attachEmoji(button, getTarget, { mount } = {}) {
  let pop = null;

  const close = () => { pop?.remove(); pop = null; };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop) return close();

    const target = typeof getTarget === 'function' ? getTarget() : getTarget;
    if (!target) return;

    pop = document.createElement('div');
    pop.className = 'emoji-pop';
    const cats = Object.keys(EMOJI);
    pop.innerHTML = `
      <div class="emoji-cats">
        ${cats.map((c, i) => `<button type="button" data-cat="${c}" class="${i === 0 ? 'active' : ''}">${c}</button>`).join('')}
      </div>
      <div class="emoji-grid"></div>`;

    (mount || button.parentElement).appendChild(pop);
    pop.addEventListener('click', ev => ev.stopPropagation());

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
