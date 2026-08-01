// =====================================================================
//  INSTAGRAT
//
//  A photo app riding on the same login as Neo Message. First visit
//  asks the player to pick a screen name; after that it is feed,
//  profiles, posting, following, likes and comments — with every post
//  passing through a GM's approval queue before anyone else sees it.
//
//  Everything here trusts the database to decide what a person may see.
//  The queries ask plainly for "approved posts"; row level security is
//  what makes a private account's posts invisible to a stranger. The
//  interface never has to enforce that itself.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource,
  paintAvatar, uploadFile, shrinkImage, lightbox, esc, toast,
  shortTime, fullStamp, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { attachEmoji } from './emoji.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));

if (me.is_admin) $('.ig-admin-tab').hidden = false;

const main = $('#igMain');

/* Instagrat identity is separate from the Neo Message account. Load it
   if it exists; if not, the first thing the player sees is setup. */
let ig = await loadMyIg();

async function loadMyIg() {
  const { data } = await supa.from('ig_profiles').select('*').eq('id', me.id).maybeSingle();
  return data || null;
}

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

const igCache = new Map();          // id -> ig_profile
function remember(p) { if (p) igCache.set(p.id, p); return p; }

async function getIg(id) {
  if (igCache.has(id)) return igCache.get(id);
  const { data } = await supa.from('ig_profiles').select('*').eq('id', id).maybeSingle();
  return remember(data);
}

function handle(p)  { return p ? '@' + p.screen_name : '@unknown'; }
function name(p)    { return p?.display_name || p?.screen_name || 'unknown'; }

/* The date shown on a post. story_at is stamped from the GM's story
   clock when the post is made, so it reads as the in-fiction day. Older
   posts without one fall back to when they were really created. */
function storyDateOf(post) {
  const iso = post.story_at || post.created_at;
  return new Date(iso).toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/* A small modal in #modalRoot. Returns { root, close } so callers can
   wire their own controls. Used by the admin tools and the followers
   list; the post composer and profile editor predate it and build their
   own. */
function sheet({ title, body, footer }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => {
    if (e.target.classList.contains('scrim')) close();
  });
  return { root, close };
}

/* ------------------------------------------------------------------ */
/*  onboarding — pick a screen name                                   */
/* ------------------------------------------------------------------ */

function showSetup() {
  main.innerHTML = `
    <div class="ig-setup">
      <h2>Set up Instagrat</h2>
      <p class="muted">This name is yours on Instagrat only. Your phone number
        and Neo Message name stay private.</p>

      <div class="field">
        <label for="sName">Screen name</label>
        <div class="at-input">
          <span>@</span>
          <input id="sName" maxlength="24" autocomplete="off"
                 placeholder="lowercase, letters numbers . _">
        </div>
        <div class="hint" id="sNameHint">2–24 characters.</div>
      </div>

      <div class="field">
        <label for="sDisplay">Display name <span class="muted">(optional)</span></label>
        <input id="sDisplay" maxlength="40" placeholder="e.g. Hazel N.">
      </div>

      <label class="check">
        <input type="checkbox" id="sPrivate">
        <span>Private account — you approve who follows you</span>
      </label>

      <button class="btn btn-primary" id="sGo" style="width:100%">Create profile</button>
    </div>`;

  const nameEl = $('#sName');
  nameEl.addEventListener('input', () => {
    nameEl.value = nameEl.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
  });

  $('#sGo').addEventListener('click', async (e) => {
    const screen_name  = nameEl.value.trim();
    const display_name = $('#sDisplay').value.trim() || null;
    const is_private   = $('#sPrivate').checked;

    if (!/^[a-z0-9._]{2,24}$/.test(screen_name)) {
      $('#sNameHint').innerHTML = '<span style="color:var(--danger)">Use 2–24 lowercase letters, numbers, dots or underscores.</span>';
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Creating…';

    const { data, error } = await supa.from('ig_profiles')
      .insert({ id: me.id, screen_name, display_name, is_private })
      .select().single();

    if (error) {
      e.target.disabled = false;
      e.target.textContent = 'Create profile';
      toast(/duplicate|unique/i.test(error.message)
        ? 'That screen name is taken.' : error.message, 'error');
      return;
    }
    ig = remember(data);
    toast('Welcome to Instagrat.', 'ok');
    show('feed');
  });
}

/* ------------------------------------------------------------------ */
/*  views                                                             */
/* ------------------------------------------------------------------ */

async function show(view, arg) {
  if (!ig) return showSetup();

  $$('.ig-tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === view));
  main.scrollTop = 0;
  main.innerHTML = '<div class="ig-loading">Loading…</div>';

  try {
    if (view === 'feed')     await viewFeed();
    else if (view === 'explore')  await viewExplore();
    else if (view === 'me')       await viewProfile(me.id);
    else if (view === 'profile')  await viewProfile(arg);
    else if (view === 'activity') await viewActivity();
    else if (view === 'review')   await viewReview();
    else if (view === 'post')     await viewPost(arg);
  } catch (err) {
    main.innerHTML = `<div class="ig-empty">Something went wrong: ${esc(err.message)}</div>`;
  }
}

/* ---- feed: approved posts from people you can see ---- */
async function viewFeed() {
  const { data: posts } = await supa
    .from('ig_posts').select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(60);

  if (!posts?.length) {
    main.innerHTML = `
      <div class="ig-empty">
        <p>Nothing in your feed yet.</p>
        <p class="muted">Follow some people, or make the first post.</p>
        <button class="btn btn-primary" id="emptyPost">New post</button>
      </div>`;
    $('#emptyPost')?.addEventListener('click', openComposer);
    return;
  }

  await Promise.all([...new Set(posts.map(p => p.author_id))].map(getIg));
  main.innerHTML = `<div class="ig-feed">${posts.map(cardHtml).join('')}</div>`;
  await hydrateCards(main);
}

/* ---- explore: find people ---- */
async function viewExplore() {
  main.innerHTML = `
    <div class="ig-explore">
      <div class="field">
        <input id="expFind" placeholder="Search screen names" autocomplete="off">
      </div>
      <div id="expResults" class="ig-people"></div>
    </div>`;

  const box = $('#expResults');
  const draw = async (q) => {
    let query = supa.from('ig_profiles').select('*')
      .neq('id', me.id).order('screen_name').limit(30);
    if (q) query = query.ilike('screen_name', `%${q}%`);
    const { data } = await query;

    if (!data?.length) { box.innerHTML = '<div class="ig-empty muted">Nobody found.</div>'; return; }
    data.forEach(remember);
    box.innerHTML = data.map(personRow).join('');
    wirePeople(box);
  };

  let timer;
  $('#expFind').addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(() => draw(q), 200);
  });
  await draw('');
}

/* ---- a profile ---- */
async function viewProfile(id) {
  const p = await getIg(id);
  if (!p) { main.innerHTML = '<div class="ig-empty">No such profile.</div>'; return; }

  const mine = id === me.id;

  // Follower / following counts (accepted only).
  const [{ count: followers }, { count: following }] = await Promise.all([
    supa.from('ig_follows').select('*', { count: 'exact', head: true })
        .eq('followee_id', id).eq('accepted', true),
    supa.from('ig_follows').select('*', { count: 'exact', head: true })
        .eq('follower_id', id).eq('accepted', true)
  ]);

  // My relationship to them.
  let rel = 'none';
  if (!mine) {
    const { data: f } = await supa.from('ig_follows').select('accepted')
      .eq('follower_id', me.id).eq('followee_id', id).maybeSingle();
    rel = f ? (f.accepted ? 'following' : 'requested') : 'none';
  }

  // Their posts. RLS returns an empty list rather than an error if this
  // is a private account I do not follow, so the "locked" state is just
  // "private and I am not in".
  const { data: posts } = await supa.from('ig_posts').select('*')
    .eq('author_id', id).eq('status', 'approved')
    .order('created_at', { ascending: false });

  const locked = p.is_private && !mine && rel !== 'following' && !me.is_admin;

  let action = '';
  if (mine) {
    action = `<button class="btn btn-ghost" id="editIg">Edit profile</button>`;
  } else if (rel === 'following') {
    action = `<button class="btn btn-ghost" data-follow="${esc(id)}" data-state="following">Following</button>`;
  } else if (rel === 'requested') {
    action = `<button class="btn btn-ghost" data-follow="${esc(id)}" data-state="requested" disabled>Requested</button>`;
  } else {
    action = `<button class="btn btn-primary" data-follow="${esc(id)}" data-state="none">Follow</button>`;
  }

  main.innerHTML = `
    <div class="ig-profile">
      <div class="ig-profile-head">
        <span class="avatar avatar-lg" id="igAvatar"></span>
        <div class="ig-stats">
          <div><strong>${fmt(posts?.length ?? 0)}</strong><span>posts</span></div>
          <button class="ig-stat-btn" data-list="followers">
            <strong>${fmt((followers ?? 0) + (Number(p.fake_followers) || 0))}</strong><span>followers</span></button>
          <button class="ig-stat-btn" data-list="following">
            <strong>${fmt(following ?? 0)}</strong><span>following</span></button>
        </div>
      </div>
      <div class="ig-bio">
        <strong>${esc(name(p))}</strong>
        <span class="muted">${esc(handle(p))}${p.is_private ? ' · 🔒 private' : ''}</span>
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
      </div>
      <div class="ig-profile-actions">
        ${action}
        ${me.is_admin && !mine ? `<button class="btn btn-ghost" id="padFollowers">Set fake followers</button>` : ''}
      </div>

      ${locked
        ? `<div class="ig-locked">🔒 This account is private. Follow to see their posts.</div>`
        : `<div class="ig-grid" id="pGrid">${
            (posts || []).map(gridCell).join('') ||
            '<div class="ig-empty muted">No posts yet.</div>'}</div>`}
    </div>`;

  paintAvatar($('#igAvatar'), p.avatar_url, name(p));

  if (mine) $('#editIg')?.addEventListener('click', openEditProfile);
  wireFollowButtons(main);

  // Tapping a count lists the real accounts behind it — padding never
  // appears here, because padding is a number, not a follow row.
  $$('.ig-stat-btn', main).forEach(b =>
    b.addEventListener('click', () => showFollowList(id, b.dataset.list, p)));

  if (me.is_admin && !mine) {
    $('#padFollowers')?.addEventListener('click', () =>
      sheetSetFollowers(id, Number(p.fake_followers) || 0, followers ?? 0));
  }

  $$('#pGrid [data-post]', main).forEach(c =>
    c.addEventListener('click', () => show('post', c.dataset.post)));
}

/* The real accounts on either side of a follow. Padding is invisible
   here by construction. */
async function showFollowList(profileId, which, profile) {
  const col   = which === 'followers' ? 'followee_id' : 'follower_id';
  const other = which === 'followers' ? 'follower_id' : 'followee_id';

  const { data: rows } = await supa.from('ig_follows')
    .select(other).eq(col, profileId).eq('accepted', true);

  const ids = (rows || []).map(r => r[other]);
  await Promise.all(ids.map(getIg));

  const pad = which === 'followers' ? (Number(profile.fake_followers) || 0) : 0;

  const { root } = sheet({
    title: which === 'followers' ? 'Followers' : 'Following',
    body: `
      ${pad ? `<p class="muted small">Showing ${ids.length} real
        account${ids.length === 1 ? '' : 's'}. The profile displays
        ${fmt(ids.length + pad)} with padding.</p>` : ''}
      <div class="ig-people">
        ${ids.length ? ids.map(id => personRow(igCache.get(id))).join('')
          : '<div class="ig-empty muted">Nobody yet.</div>'}
      </div>`
  });
  wirePeople(root);
}

function sheetSetFollowers(profileId, current, real) {
  const { root, close } = sheet({
    title: 'Fake followers',
    body: `
      <p class="muted small">Extra followers shown on top of the
        ${fmt(real)} real one${real === 1 ? '' : 's'}. Tapping the count
        still lists only real accounts.</p>
      <div class="field">
        <label for="ff">Padding</label>
        <input type="number" id="ff" min="0" value="${current}">
      </div>
      <p class="muted small">Displayed total: <strong id="ffTotal">${fmt(real + current)}</strong></p>`,
    footer: `<button class="btn btn-primary" id="ffSave">Apply</button>`
  });
  const inp = $('#ff', root);
  inp.addEventListener('input', () => {
    $('#ffTotal', root).textContent = fmt(real + (parseInt(inp.value, 10) || 0));
  });
  $('#ffSave', root).addEventListener('click', async (e) => {
    const n = Math.max(0, parseInt(inp.value, 10) || 0);
    e.target.disabled = true;
    const { error } = await supa.rpc('ig_admin_set_followers', { target: profileId, extra: n });
    if (error) { toast(error.message, 'error'); e.target.disabled = false; return; }
    igCache.delete(profileId);         // force fresh padding next read
    close();
    toast('Followers updated.', 'ok');
    show('profile', profileId);
  });
}

/* ---- one post, full size, with comments ---- */
async function viewPost(id) {
  const { data: post } = await supa.from('ig_posts').select('*').eq('id', id).maybeSingle();
  if (!post) { main.innerHTML = '<div class="ig-empty">This post is not available.</div>'; return; }
  await getIg(post.author_id);
  main.innerHTML = `<div class="ig-feed">${cardHtml(post, { expanded: true })}</div>`;
  await hydrateCards(main);
}

/* ---- activity: follow requests to approve ---- */
async function viewActivity() {
  const { data: reqs } = await supa.from('ig_follows').select('*')
    .eq('followee_id', me.id).eq('accepted', false)
    .order('created_at', { ascending: false });

  await Promise.all((reqs || []).map(r => getIg(r.follower_id)));

  main.innerHTML = `
    <div class="ig-activity">
      <h3>Follow requests</h3>
      ${reqs?.length ? reqs.map(r => {
        const p = igCache.get(r.follower_id);
        return `<div class="ig-req" data-req="${esc(r.follower_id)}">
          <span class="avatar avatar-sm" data-av="${esc(r.follower_id)}"></span>
          <span class="ig-req-id"><strong>${esc(name(p))}</strong>
            <span class="muted">${esc(handle(p))}</span></span>
          <button class="btn btn-sm btn-primary" data-act="accept">Accept</button>
          <button class="btn btn-sm btn-ghost" data-act="decline">Decline</button>
        </div>`;
      }).join('') : '<div class="ig-empty muted">No pending requests.</div>'}
    </div>`;

  (reqs || []).forEach(r =>
    paintAvatar(main.querySelector(`[data-av="${r.follower_id}"]`),
                igCache.get(r.follower_id)?.avatar_url, name(igCache.get(r.follower_id))));

  $$('.ig-req [data-act]', main).forEach(btn => btn.addEventListener('click', async () => {
    const row = btn.closest('.ig-req');
    const who = row.dataset.req;
    if (btn.dataset.act === 'accept') {
      await supa.from('ig_follows').update({ accepted: true })
        .eq('follower_id', who).eq('followee_id', me.id);
    } else {
      await supa.from('ig_follows').delete()
        .eq('follower_id', who).eq('followee_id', me.id);
    }
    row.remove();
    paintReqBadge();
  }));
}

/* ---- admin: moderation queue ---- */
async function viewReview() {
  if (!me.is_admin) { main.innerHTML = '<div class="ig-empty">Not available.</div>'; return; }

  const { data: posts } = await supa.from('ig_posts').select('*')
    .eq('status', 'pending').order('created_at', { ascending: true });

  await Promise.all((posts || []).map(p => getIg(p.author_id)));

  main.innerHTML = `
    <div class="ig-review">
      <h3>Pending posts</h3>
      <p class="muted small">Approved posts go live for everyone allowed to see the poster.
        Rejected posts stay visible only to their author, marked as such.</p>
      ${posts?.length ? posts.map(p => {
        const a = igCache.get(p.author_id);
        return `<div class="ig-review-card" data-review="${esc(p.id)}">
          <img src="${esc(p.image_url)}" alt="" loading="lazy">
          <div class="ig-review-meta">
            <strong>${esc(name(a))}</strong> <span class="muted">${esc(handle(a))}</span>
            <span class="muted mono">${esc(fullStamp(p.created_at))}</span>
            ${p.caption ? `<p>${esc(p.caption)}</p>` : ''}
          </div>
          <div class="ig-review-actions">
            <button class="btn btn-sm btn-primary" data-act="approved">Approve</button>
            <button class="btn btn-sm btn-danger" data-act="rejected">Reject</button>
          </div>
        </div>`;
      }).join('') : '<div class="ig-empty muted">Queue is empty.</div>'}
    </div>`;

  $$('.ig-review-card img', main).forEach(im =>
    im.addEventListener('click', () => lightbox(im.src)));

  $$('.ig-review-card [data-act]', main).forEach(btn => btn.addEventListener('click', async () => {
    const card = btn.closest('.ig-review-card');
    btn.disabled = true;
    const { error } = await supa.rpc('ig_review_post',
      { post: card.dataset.review, decision: btn.dataset.act });
    if (error) { toast(error.message, 'error'); btn.disabled = false; return; }
    card.remove();
    paintQueueBadge();
    if (!$$('.ig-review-card', main).length)
      $('.ig-review').insertAdjacentHTML('beforeend', '<div class="ig-empty muted">Queue is empty.</div>');
  }));
}

/* ------------------------------------------------------------------ */
/*  post cards                                                        */
/* ------------------------------------------------------------------ */

function cardHtml(post, { expanded = false } = {}) {
  const a = igCache.get(post.author_id);
  const pending  = post.status === 'pending';
  const rejected = post.status === 'rejected';
  const canDelete = me.is_admin || post.author_id === me.id;
  return `
    <article class="ig-card" data-card="${esc(post.id)}" data-author="${esc(post.author_id)}"
             data-fakelikes="${Number(post.fake_likes) || 0}">
      <header class="ig-card-top">
        <span class="avatar avatar-sm" data-av="${esc(post.author_id)}"></span>
        <button class="ig-card-name" data-open-profile="${esc(post.author_id)}">
          ${esc(name(a))} <span class="muted">${esc(handle(a))}</span>
        </button>
        ${pending  ? '<span class="ig-flag pending">Pending review</span>' : ''}
        ${rejected ? '<span class="ig-flag rejected">Not approved</span>' : ''}
        ${canDelete ? `<button class="ig-card-menu" data-menu title="Manage">⋯</button>` : ''}
      </header>

      <div class="ig-card-media" data-media="${esc(post.id)}">
        <img src="${esc(post.image_url)}" alt="${esc(post.caption || 'Post')}" loading="lazy">
        <div class="ig-tag-layer" data-taglayer="${esc(post.id)}"></div>
      </div>

      <div class="ig-card-actions">
        <button class="ig-like" data-like="${esc(post.id)}" aria-pressed="false">♡</button>
        <span class="ig-like-count" data-likes="${esc(post.id)}">0</span>
        <span class="ig-postdate">${esc(storyDateOf(post))}</span>
      </div>

      ${post.caption ? `<div class="ig-caption"><strong>${esc(handle(a))}</strong> ${esc(post.caption)}</div>` : ''}

      <div class="ig-comments" data-comments="${esc(post.id)}"></div>
      ${!pending && !rejected ? `
      <div class="ig-add-comment">
        <input placeholder="Add a comment…" maxlength="500" data-comment-input="${esc(post.id)}">
        <button class="ig-emoji-btn" data-emoji title="Emoji">☺</button>
        <button class="ig-comment-send" data-comment-send="${esc(post.id)}">Post</button>
      </div>` : ''}
    </article>`;
}

function gridCell(post) {
  return `<button class="ig-grid-cell" data-post="${esc(post.id)}">
    <img src="${esc(post.image_url)}" alt="${esc(post.caption || 'Post')}" loading="lazy">
  </button>`;
}

/* Fill in avatars, like state, and comments once cards are in the DOM. */
async function hydrateCards(root) {
  const cards = $$('.ig-card', root);

  cards.forEach(c => {
    const a = igCache.get(c.dataset.author);
    paintAvatar(c.querySelector('[data-av]'), a?.avatar_url, name(a));
  });

  $$('[data-open-profile]', root).forEach(b =>
    b.addEventListener('click', () => show('profile', b.dataset.openProfile)));

  // Media: a single tap toggles the tag markers (like the real app);
  // the ⛶ button opens it full size. Load and draw the tags for each.
  await Promise.all(cards.map(c => loadTags(c.dataset.card, root)));

  $$('.ig-card-media', root).forEach(media => {
    const img = media.querySelector('img');
    media.addEventListener('click', (e) => {
      // Clicking a tag dot or its label should not toggle or zoom.
      if (e.target.closest('.ig-tag')) return;
      const layer = media.querySelector('.ig-tag-layer');
      if (layer && layer.children.length) media.classList.toggle('show-tags');
      else lightbox(img.src);
    });
  });

  // Likes + comments per post.
  await Promise.all(cards.map(async (c) => {
    const id = c.dataset.card;

    const [{ data: likes }, { data: mine }, { data: comments }] = await Promise.all([
      supa.from('ig_likes').select('*', { count: 'exact', head: false }).eq('post_id', id),
      supa.from('ig_likes').select('post_id').eq('post_id', id).eq('liker_id', me.id).maybeSingle(),
      supa.from('ig_comments').select('*').eq('post_id', id).order('created_at').limit(50)
    ]);

    const likeBtn = c.querySelector(`[data-like="${id}"]`);
    const likeNum = c.querySelector(`[data-likes="${id}"]`);
    if (likeBtn) {
      const real = likes?.length ?? 0;
      const pad  = Number(c.dataset.fakelikes) || 0;   // the GM's padding
      let liked = !!mine, mineDelta = 0;
      const paint = () => {
        likeBtn.textContent = liked ? '♥' : '♡';
        likeBtn.classList.toggle('is-liked', liked);
        likeBtn.setAttribute('aria-pressed', String(liked));
        // Shown count is real likes + padding, moving with your own tap.
        likeNum.textContent = fmt(real + pad + mineDelta);
      };
      // mineDelta accounts for my own toggle relative to whether I
      // already liked, so the number never double-counts me.
      likeBtn.addEventListener('click', async () => {
        liked = !liked;
        mineDelta = liked === !!mine ? 0 : (liked ? 1 : -1);
        paint();
        if (liked) await supa.from('ig_likes').insert({ post_id: id, liker_id: me.id });
        else await supa.from('ig_likes').delete().eq('post_id', id).eq('liker_id', me.id);
      });
      paint();
    }

    // The ⋯ manage menu (author or admin).
    const menu = c.querySelector('[data-menu]');
    if (menu) menu.addEventListener('click', () => openManage(c, id));

    await renderComments(c, id, comments || []);
  }));
}

/** Thousands separators so a padded 4200 reads like a real number. */
function fmt(n) { return Number(n).toLocaleString(); }

/* ------------------------------------------------------------------ */
/*  photo tags                                                        */
/* ------------------------------------------------------------------ */

async function loadTags(postId, root) {
  const layer = root.querySelector(`[data-taglayer="${postId}"]`);
  if (!layer) return;

  const { data: tags } = await supa.from('ig_post_tags')
    .select('tagged_id, x, y').eq('post_id', postId);
  if (!tags?.length) { layer.innerHTML = ''; return; }

  await Promise.all(tags.map(t => getIg(t.tagged_id)));
  layer.innerHTML = tags.map(t => {
    const p = igCache.get(t.tagged_id);
    return `<button class="ig-tag" data-open-profile="${esc(t.tagged_id)}"
              style="left:${(t.x * 100).toFixed(2)}%;top:${(t.y * 100).toFixed(2)}%">
        <span class="ig-tag-dot"></span>
        <span class="ig-tag-label">${esc(handle(p))}</span>
      </button>`;
  }).join('');

  layer.querySelectorAll('[data-open-profile]').forEach(b =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      show('profile', b.dataset.openProfile);
    }));
}

/* The tagging overlay: shows the image, lets you place a marker by
   tapping, search a person, and save. Used both while composing (before
   the post exists, working on a preview) and afterwards on a real post. */
function openTagger({ imageUrl, postId = null, existing = [], onSave }) {
  let tags = existing.slice();   // { tagged_id, screen_name, x, y }

  const { root, close } = sheet({
    title: 'Tag people',
    body: `
      <p class="muted small">Tap the photo where someone is, then pick who.</p>
      <div class="tagger" id="tagWrap">
        <img src="${esc(imageUrl)}" alt="">
        <div class="tagger-layer" id="tagLayer"></div>
      </div>
      <div class="tagger-search" id="tagSearchWrap" hidden>
        <input id="tagSearch" placeholder="Search screen names" autocomplete="off">
        <div class="ig-people" id="tagResults"></div>
      </div>
      <div id="tagList" class="tagger-list"></div>`,
    footer: `<button class="btn btn-primary" id="tagSave">Save tags</button>`
  });

  const wrap = $('#tagWrap', root);
  const layer = $('#tagLayer', root);
  let pending = null;       // { x, y } awaiting a person choice

  const drawMarkers = () => {
    layer.innerHTML = tags.map((t, i) => `
      <span class="tagger-mark" style="left:${(t.x*100).toFixed(2)}%;top:${(t.y*100).toFixed(2)}%">
        <span class="tagger-dot"></span>
        <span class="tagger-name">@${esc(t.screen_name)}<button data-untag="${i}">✕</button></span>
      </span>`).join('') + (pending
        ? `<span class="tagger-mark pending" style="left:${(pending.x*100).toFixed(2)}%;top:${(pending.y*100).toFixed(2)}%"><span class="tagger-dot"></span></span>`
        : '');
    layer.querySelectorAll('[data-untag]').forEach(b =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        tags.splice(Number(b.dataset.untag), 1);
        renderList(); drawMarkers();
      }));
  };

  const renderList = () => {
    $('#tagList', root).innerHTML = tags.length
      ? '<div class="muted small">Tagged: ' + tags.map(t => '@' + esc(t.screen_name)).join(', ') + '</div>'
      : '';
  };

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.tagger-mark')) return;
    const r = wrap.getBoundingClientRect();
    pending = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    };
    drawMarkers();
    $('#tagSearchWrap', root).hidden = false;
    $('#tagSearch', root).focus();
  });

  let timer;
  $('#tagSearch', root).addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(async () => {
      let query = supa.from('ig_profiles').select('id, screen_name, display_name, avatar_url')
        .order('screen_name').limit(20);
      if (q) query = query.ilike('screen_name', `%${q}%`);
      const { data } = await query;
      const box = $('#tagResults', root);
      box.innerHTML = (data || [])
        .filter(p => !tags.some(t => t.tagged_id === p.id))
        .map(p => `<button class="ig-person" data-pick="${esc(p.id)}" data-sn="${esc(p.screen_name)}">
          <span class="ig-person-id"><strong>@${esc(p.screen_name)}</strong></span>
        </button>`).join('') || '<div class="ig-empty muted">Nobody found.</div>';
      box.querySelectorAll('[data-pick]').forEach(b =>
        b.addEventListener('click', () => {
          if (!pending) return;
          tags.push({ tagged_id: b.dataset.pick, screen_name: b.dataset.sn, x: pending.x, y: pending.y });
          pending = null;
          $('#tagSearchWrap', root).hidden = true;
          $('#tagSearch', root).value = '';
          box.innerHTML = '';
          drawMarkers(); renderList();
        }));
    }, 200);
  });

  $('#tagSave', root).addEventListener('click', async (e) => {
    e.target.disabled = true;
    await onSave(tags);
    close();
  });

  drawMarkers(); renderList();
}

/** Writes the tag set for a post: clears what was there, inserts anew. */
async function saveTags(postId, tags) {
  await supa.from('ig_post_tags').delete().eq('post_id', postId);
  if (tags.length) {
    const rows = tags.map(t => ({ post_id: postId, tagged_id: t.tagged_id, x: t.x, y: t.y }));
    const { error } = await supa.from('ig_post_tags').insert(rows);
    if (error) toast(error.message, 'error');
  }
}

/* ------------------------------------------------------------------ */
/*  the ⋯ manage sheet on a post                                      */
/* ------------------------------------------------------------------ */

function openManage(card, postId) {
  const isAuthor = card.dataset.author === me.id;
  const pad = Number(card.dataset.fakelikes) || 0;
  const imageUrl = card.querySelector('.ig-card-media img')?.src;

  const adminBits = me.is_admin ? `
    <button class="menu-item" data-do="likes">Set fake likes
      <span class="muted">(currently +${pad})</span></button>
    <button class="menu-item" data-do="ghost">Add a comment as someone…</button>` : '';

  const { root, close } = sheet({
    title: 'Manage post',
    body: `<div class="menu-list">
      <button class="menu-item" data-do="tag">Tag people</button>
      ${adminBits}
      <button class="menu-item danger" data-do="delete">Delete post</button>
    </div>`
  });

  $('[data-do="delete"]', root).addEventListener('click', async () => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const { error } = await supa.from('ig_posts').delete().eq('id', postId);
    if (error) return toast(error.message, 'error');
    close();
    card.remove();
    toast('Post deleted.', 'ok');
    // If that was the only thing on screen (single-post view), go back
    // somewhere with content.
    if (!$$('.ig-card', main).length) show('feed');
  });

  $('[data-do="tag"]', root).addEventListener('click', async () => {
    close();
    // Load current tags so the overlay opens with them in place.
    const { data } = await supa.from('ig_post_tags')
      .select('tagged_id, x, y').eq('post_id', postId);
    await Promise.all((data || []).map(t => getIg(t.tagged_id)));
    const existing = (data || []).map(t => ({
      tagged_id: t.tagged_id, x: t.x, y: t.y,
      screen_name: igCache.get(t.tagged_id)?.screen_name || '?'
    }));
    openTagger({
      imageUrl, postId, existing,
      onSave: async (tags) => {
        await saveTags(postId, tags);
        toast('Tags saved.', 'ok');
        // Redraw this card's tag layer in place.
        await loadTags(postId, main);
      }
    });
  });

  $('[data-do="likes"]', root)?.addEventListener('click', () => {
    close();
    sheetSetLikes(card, postId, pad);
  });

  $('[data-do="ghost"]', root)?.addEventListener('click', () => {
    close();
    sheetGhostComment(card, postId);
  });
}

function sheetSetLikes(card, postId, current) {
  const { root, close } = sheet({
    title: 'Fake likes',
    body: `
      <p class="muted small">Extra likes added on top of the real ones.
        Real likes still count and still move.</p>
      <div class="field">
        <label for="fl">Padding</label>
        <input type="number" id="fl" min="0" value="${current}">
      </div>`,
    footer: `<button class="btn btn-primary" id="flSave">Apply</button>`
  });
  $('#flSave', root).addEventListener('click', async (e) => {
    const n = Math.max(0, parseInt($('#fl', root).value, 10) || 0);
    e.target.disabled = true;
    const { error } = await supa.rpc('ig_admin_set_likes', { post: postId, extra: n });
    if (error) { toast(error.message, 'error'); e.target.disabled = false; return; }
    card.dataset.fakelikes = String(n);
    // Repaint the count without a full reload.
    const { data: likes } = await supa.from('ig_likes').select('post_id').eq('post_id', postId);
    const mineLiked = card.querySelector('.ig-like')?.getAttribute('aria-pressed') === 'true';
    card.querySelector('.ig-like-count').textContent = fmt((likes?.length ?? 0) + n);
    close();
    toast('Likes updated.', 'ok');
  });
}

/* Remembered dummy personas, so the GM can reply as the same made-up
   account across different posts. Names live in this browser only. */
const GHOSTS_KEY = 'ig.ghosts';
function ghostNames() {
  try { return JSON.parse(localStorage.getItem(GHOSTS_KEY)) || []; }
  catch { return []; }
}
function rememberGhost(nameStr) {
  const list = [nameStr, ...ghostNames().filter(n => n !== nameStr)].slice(0, 12);
  localStorage.setItem(GHOSTS_KEY, JSON.stringify(list));
}

function sheetGhostComment(card, postId, { parent = null, into = null, asReply = false } = {}) {
  const box = into || card.querySelector(`[data-comments="${postId}"]`);
  const saved = ghostNames();

  const { root, close } = sheet({
    title: asReply ? 'Reply as a dummy account' : 'Comment as someone',
    body: `
      <p class="muted small">${asReply
        ? 'Replies under a made-up name.'
        : 'Posts a comment under a made-up name.'} Add as many as you like —
        the sheet stays open.</p>

      ${saved.length ? `<div class="ghost-chips" id="gChips">
        ${saved.map(n => `<button type="button" class="ghost-chip" data-ghost-name="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>` : ''}

      <div class="field">
        <label for="gName">Name</label>
        <input id="gName" maxlength="24" placeholder="e.g. hazel_irl" autocomplete="off">
      </div>
      <div class="field">
        <label for="gBody">${asReply ? 'Reply' : 'Comment'}</label>
        <div class="ig-cap-wrap">
          <textarea id="gBody" rows="2" maxlength="500"></textarea>
          <button class="ig-emoji-btn" id="gEmoji" title="Emoji">☺</button>
        </div>
      </div>
      <div id="gMsg"></div>`,
    footer: `<button class="btn btn-ghost" data-close>Done</button>
             <button class="btn btn-primary" id="gAdd">${asReply ? 'Add reply' : 'Add comment'}</button>`
  });

  attachEmoji($('#gEmoji', root), () => $('#gBody', root));

  $$('.ghost-chip', root).forEach(chip =>
    chip.addEventListener('click', () => {
      $('#gName', root).value = chip.dataset.ghostName;
      $('#gBody', root).focus();
    }));

  $('#gAdd', root).addEventListener('click', async (e) => {
    const ghost = $('#gName', root).value.trim();
    const body  = $('#gBody', root).value.trim();
    if (!ghost || !body) {
      $('#gMsg', root).innerHTML = '<div class="notice notice-error">Name and text are both needed.</div>';
      return;
    }
    e.target.disabled = true;
    const { error } = await supa.rpc('ig_admin_comment',
      { post: postId, ghost, body, parent });
    e.target.disabled = false;
    if (error) {
      $('#gMsg', root).innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`;
      return;
    }
    rememberGhost(ghost);
    if (box) box.insertAdjacentHTML('beforeend',
      `<div class="ig-comment ${asReply ? 'is-reply' : ''}"><div class="ig-comment-line"><strong>${esc(ghost)}</strong> ${esc(body)}</div></div>`);
    $('#gBody', root).value = '';
    $('#gMsg', root).innerHTML = '<div class="notice notice-ok">Added.</div>';
  });
}

function commentLabel(c) {
  return c.ghost_name ? esc(c.ghost_name) : esc(handle(igCache.get(c.author_id)));
}

function canDeleteComment(c) {
  // A real comment: its author or an admin. A ghost belongs to the admin
  // who made it, so admins can remove ghosts too.
  return me.is_admin || c.author_id === me.id;
}

function commentHtml(c, { isReply = false } = {}) {
  return `
    <div class="ig-comment ${isReply ? 'is-reply' : ''}" data-comment-id="${esc(c.id)}">
      <div class="ig-comment-line">
        <strong>${commentLabel(c)}</strong> ${esc(c.body)}
      </div>
      <button class="ig-reply-btn" data-reply="${esc(c.id)}" data-reply-to="${commentLabel(c)}">Reply</button>
      ${me.is_admin ? `<button class="ig-reply-btn ghost" data-ghost-reply="${esc(c.id)}">Reply as…</button>` : ''}
      ${canDeleteComment(c) ? `<button class="ig-reply-btn danger" data-del-comment="${esc(c.id)}">Delete</button>` : ''}
      <div class="ig-replies" data-replies="${esc(c.id)}"></div>
    </div>`;
}

async function renderComments(card, postId, comments) {
  const box = card.querySelector(`[data-comments="${postId}"]`);
  if (!box) return;

  await Promise.all([...new Set(comments.filter(c => !c.ghost_name)
    .map(c => c.author_id))].map(getIg));

  // Split into top-level comments and replies grouped by parent.
  const tops = comments.filter(c => !c.parent_id);
  const kids = new Map();
  comments.filter(c => c.parent_id).forEach(c => {
    if (!kids.has(c.parent_id)) kids.set(c.parent_id, []);
    kids.get(c.parent_id).push(c);
  });

  box.innerHTML = tops.map(c => commentHtml(c)).join('');
  // Hang replies under their parent.
  tops.forEach(c => {
    const rbox = box.querySelector(`[data-replies="${c.id}"]`);
    (kids.get(c.id) || []).forEach(r =>
      rbox.insertAdjacentHTML('beforeend', commentHtml(r, { isReply: true })));
  });

  const input = card.querySelector(`[data-comment-input="${postId}"]`);
  const send  = card.querySelector(`[data-comment-send="${postId}"]`);
  const emoji = card.querySelector('[data-emoji]');
  if (!send) return;

  // Emoji drops into the comment box at the cursor.
  if (emoji) attachEmoji(emoji, () => input);

  /* A pending reply target. null means the next post is a top-level
     comment; an id means it answers that comment. */
  let replyTo = null;
  const setReply = (id, who) => {
    replyTo = id;
    if (id) {
      input.placeholder = `Replying to ${who}…`;
      input.focus();
      input.dataset.replying = '1';
    } else {
      input.placeholder = 'Add a comment…';
      delete input.dataset.replying;
    }
  };

  // Clicking a comment's Reply aims the composer at it.
  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-reply]');
    if (btn) { setReply(btn.dataset.reply, btn.dataset.replyTo); return; }

    // Admin: reply as a dummy account under this comment.
    const ghostBtn = e.target.closest('[data-ghost-reply]');
    if (ghostBtn) {
      const parentId = ghostBtn.dataset.ghostReply;
      const rbox = box.querySelector(`[data-replies="${parentId}"]`);
      sheetGhostComment(card, postId, { parent: parentId, into: rbox, asReply: true });
      return;
    }

    // Delete a comment (its author, or an admin). Replies cascade.
    const delBtn = e.target.closest('[data-del-comment]');
    if (delBtn) {
      const cid = delBtn.dataset.delComment;
      if (!confirm('Delete this comment? Any replies to it go too.')) return;
      const { error } = await supa.from('ig_comments').delete().eq('id', cid);
      if (error) { toast(error.message, 'error'); return; }
      delBtn.closest('.ig-comment')?.remove();
    }
  });
  // Escape cancels a reply and returns to a plain comment.
  input.addEventListener('keydown', e => { if (e.key === 'Escape') setReply(null); });

  const submit = async () => {
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const parent = replyTo;

    const row = { post_id: postId, author_id: me.id, body };
    if (parent) row.parent_id = parent;

    const { data, error } = await supa.from('ig_comments').insert(row).select().single();
    if (error) { toast(error.message, 'error'); return; }
    remember(await getIg(me.id));

    const html = commentHtml(data);
    if (parent) {
      const rbox = box.querySelector(`[data-replies="${parent}"]`);
      if (rbox) rbox.insertAdjacentHTML('beforeend', commentHtml(data, { isReply: true }));
    } else {
      box.insertAdjacentHTML('beforeend', html);
    }
    setReply(null);
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
}

/* ------------------------------------------------------------------ */
/*  people rows + follow buttons                                      */
/* ------------------------------------------------------------------ */

function personRow(p) {
  return `<button class="ig-person" data-open-profile="${esc(p.id)}">
    <span class="avatar avatar-sm" data-av="${esc(p.id)}"></span>
    <span class="ig-person-id">
      <strong>${esc(name(p))}</strong>
      <span class="muted">${esc(handle(p))}${p.is_private ? ' · 🔒' : ''}</span>
    </span>
  </button>`;
}

function wirePeople(root) {
  $$('.ig-person', root).forEach(b => {
    const id = b.dataset.openProfile;
    paintAvatar(b.querySelector('[data-av]'), igCache.get(id)?.avatar_url, name(igCache.get(id)));
    b.addEventListener('click', () => show('profile', id));
  });
}

function wireFollowButtons(root) {
  $$('[data-follow]', root).forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.follow;
    const state = btn.dataset.state;

    if (state === 'following') {
      // Unfollow.
      await supa.from('ig_follows').delete()
        .eq('follower_id', me.id).eq('followee_id', id);
      btn.dataset.state = 'none';
      btn.textContent = 'Follow';
      btn.className = 'btn btn-primary';
      return;
    }

    btn.disabled = true;
    const { data, error } = await supa.rpc('ig_follow', { target: id });
    btn.disabled = false;
    if (error) { toast(error.message, 'error'); return; }

    if (data === 'following') {
      btn.dataset.state = 'following'; btn.textContent = 'Following'; btn.className = 'btn btn-ghost';
    } else {
      btn.dataset.state = 'requested'; btn.textContent = 'Requested';
      btn.className = 'btn btn-ghost'; btn.disabled = true;
    }
  }));
}

/* ------------------------------------------------------------------ */
/*  composing a post                                                  */
/* ------------------------------------------------------------------ */

function openComposer() {
  if (!ig) return showSetup();
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>New post</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">
          <div class="ig-drop" id="igDrop">
            <input type="file" id="igFile" accept="image/*" hidden>
            <div id="igPreviewWrap"><span class="muted">Tap to choose a photo</span></div>
          </div>
          <div class="field">
            <label for="igCap">Caption</label>
            <div class="ig-cap-wrap">
              <textarea id="igCap" rows="2" maxlength="600" placeholder="Say something…"></textarea>
              <button class="ig-emoji-btn" id="igCapEmoji" title="Emoji">☺</button>
            </div>
          </div>
          <p class="muted small">Posts are reviewed by the GM before anyone else sees them.</p>
          <button class="btn btn-ghost btn-sm" id="igTag" hidden>Tag people</button>
          <div id="igTagList" class="muted small"></div>
          <div id="igPostMsg"></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-primary" id="igSubmit" disabled>Share</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => { if (e.target.classList.contains('scrim')) close(); });

  const file = $('#igFile'), drop = $('#igDrop'), submit = $('#igSubmit');
  let picked = null;
  let pendingTags = [];       // held until the post is created
  let previewUrl = null;

  attachEmoji($('#igCapEmoji'), () => $('#igCap'));

  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    picked = file.files[0];
    if (!picked) return;
    previewUrl = URL.createObjectURL(picked);
    $('#igPreviewWrap').innerHTML = `<img src="${previewUrl}" alt="preview">`;
    submit.disabled = false;
    $('#igTag').hidden = false;
  });

  $('#igTag').addEventListener('click', () => {
    openTagger({
      imageUrl: previewUrl,
      existing: pendingTags,
      onSave: (tags) => {
        pendingTags = tags;
        $('#igTagList').textContent = tags.length
          ? 'Tagged: ' + tags.map(t => '@' + t.screen_name).join(', ') : '';
      }
    });
  });

  submit.addEventListener('click', async () => {
    if (!picked) return;
    submit.disabled = true;
    submit.textContent = 'Uploading…';
    const msg = $('#igPostMsg');
    try {
      const small = await shrinkImage(picked, 1600, 0.85);
      const url   = await uploadFile('ig_media', me.id, small);
      // Stamp the post with the app's current date — the very same
      // storyNow() the status bar shows — so the post reads as happening
      // on whatever day the app is set to, not the real calendar date.
      const { data: post, error } = await supa.from('ig_posts')
        .insert({
          author_id: me.id,
          image_url: url,
          caption: $('#igCap').value.trim() || null,
          story_at: storyNow().toISOString()
        })
        .select().single();
      if (error) throw error;
      // Attach any tags now that the post has an id.
      if (pendingTags.length) await saveTags(post.id, pendingTags);
      close();
      toast('Posted. It will appear once the GM approves it.', 'ok');
      show('me');
    } catch (err) {
      msg.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
      submit.disabled = false;
      submit.textContent = 'Share';
    }
  });
}

/* ------------------------------------------------------------------ */
/*  editing your own profile                                          */
/* ------------------------------------------------------------------ */

function openEditProfile() {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>Edit profile</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">
          <div class="ig-edit-avatar">
            <span class="avatar avatar-lg" id="eAvatar"></span>
            <button class="btn btn-ghost btn-sm" id="ePick">Change photo</button>
            <input type="file" id="eFile" accept="image/*" hidden>
          </div>
          <div class="field">
            <label for="eDisplay">Display name</label>
            <input id="eDisplay" maxlength="40" value="${esc(ig.display_name || '')}">
          </div>
          <div class="field">
            <label for="eBio">Bio</label>
            <textarea id="eBio" rows="3" maxlength="300">${esc(ig.bio || '')}</textarea>
          </div>
          <label class="check">
            <input type="checkbox" id="ePrivate" ${ig.is_private ? 'checked' : ''}>
            <span>Private account</span>
          </label>
          <div id="eMsg"></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-primary" id="eSave">Save</button>
        </div>
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => { if (e.target.classList.contains('scrim')) close(); });
  paintAvatar($('#eAvatar'), ig.avatar_url, name(ig));

  let newAvatar = null;
  $('#ePick').addEventListener('click', () => $('#eFile').click());
  $('#eFile').addEventListener('change', () => {
    newAvatar = $('#eFile').files[0];
    if (newAvatar) $('#eAvatar').style.backgroundImage = `url('${URL.createObjectURL(newAvatar)}')`,
                   $('#eAvatar').textContent = '';
  });

  $('#eSave').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    const patch = {
      display_name: $('#eDisplay').value.trim() || null,
      bio: $('#eBio').value.trim() || null,
      is_private: $('#ePrivate').checked
    };
    try {
      if (newAvatar) {
        const small = await shrinkImage(newAvatar, 600, 0.85);
        patch.avatar_url = await uploadFile('ig_media', me.id, small);
      }
      const { data, error } = await supa.from('ig_profiles')
        .update(patch).eq('id', me.id).select().single();
      if (error) throw error;
      ig = remember(data);
      close();
      toast('Profile updated.', 'ok');
      show('me');
    } catch (err) {
      $('#eMsg').innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
      e.target.disabled = false; e.target.textContent = 'Save';
    }
  });
}

/* ------------------------------------------------------------------ */
/*  badges                                                            */
/* ------------------------------------------------------------------ */

async function paintReqBadge() {
  const { count } = await supa.from('ig_follows')
    .select('*', { count: 'exact', head: true })
    .eq('followee_id', me.id).eq('accepted', false);
  const b = $('#reqBadge');
  if (count) { b.hidden = false; b.textContent = count > 9 ? '9+' : count; }
  else b.hidden = true;
}

async function paintQueueBadge() {
  if (!me.is_admin) return;
  const { count } = await supa.from('ig_posts')
    .select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const b = $('#queueBadge');
  if (count) { b.hidden = false; b.textContent = count > 9 ? '9+' : count; }
  else b.hidden = true;
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

$$('.ig-tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
$('#newPostBtn').addEventListener('click', openComposer);

// Live: a decision on your pending post, or a new request coming in.
supa.channel('ig-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ig_posts' }, () => {
    paintQueueBadge();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ig_follows',
      filter: `followee_id=eq.${me.id}` }, () => {
    paintReqBadge();
  })
  .subscribe();

paintReqBadge();
paintQueueBadge();

// First paint.
show(ig ? 'feed' : 'setup');
