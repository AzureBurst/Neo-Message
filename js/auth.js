// =====================================================================
//  NEO MESSAGE — sign in / sign up
// =====================================================================

import { supa, usernameToEmail, mountCarrier, $, esc, formatNumber } from './supa.js';

mountCarrier($('#carrier'));

// Already signed in? Go straight through.
const { data: { session } } = await supa.auth.getSession();
if (session) location.replace('app.html');

const tabIn  = $('#tabIn');
const tabUp  = $('#tabUp');
const formIn = $('#formIn');
const formUp = $('#formUp');
const alertBox = $('#alert');

function say(msg, kind = 'error') {
  alertBox.innerHTML = msg
    ? `<div class="notice notice-${kind}">${esc(msg)}</div>`
    : '';
}

function showTab(which) {
  const signup = which === 'up';
  tabUp.classList.toggle('active', signup);
  tabIn.classList.toggle('active', !signup);
  tabUp.setAttribute('aria-selected', String(signup));
  tabIn.setAttribute('aria-selected', String(!signup));
  formUp.classList.toggle('hidden', !signup);
  formIn.classList.toggle('hidden', signup);
  say('');
}

tabIn.addEventListener('click', () => showTab('in'));
tabUp.addEventListener('click', () => showTab('up'));


/* ---------- number field: roll one, and tidy as you type ---------- */

const numField = $('#upNum');

$('#rollNum').addEventListener('click', () => {
  const line = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const mid  = String(Math.floor(Math.random() * 900) + 100);
  numField.value = `(555) ${mid}-${line}`;
});

numField.addEventListener('input', () => {
  const d = numField.value.replace(/\D/g, '').slice(0, 10);
  if (d.length === 10) numField.value = formatNumber(d);
});


/* ---------- sign in ---------- */

formIn.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnIn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  say('');

  const { error } = await supa.auth.signInWithPassword({
    email: usernameToEmail($('#inUser').value),
    password: $('#inPass').value
  });

  if (error) {
    say(/invalid/i.test(error.message)
      ? 'That username and password do not match an account.'
      : error.message);
    btn.disabled = false;
    btn.textContent = 'Sign in';
    return;
  }
  location.replace('app.html');
});


/* ---------- sign up ---------- */

formUp.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnUp');
  const username = $('#upUser').value.trim();
  const number   = numField.value.trim();
  const password = $('#upPass').value;

  if (!/^[A-Za-z0-9_.-]{2,24}$/.test(username)) {
    return say('Usernames can use letters, numbers, dots, dashes and underscores, 2–24 characters.');
  }
  const digits = number.replace(/\D/g, '');
  if (digits.length < 7) {
    return say('Give your number at least 7 digits.');
  }

  btn.disabled = true;
  btn.textContent = 'Creating…';
  say('');

  // Check both fields up front so people get a clear message instead of
  // a database constraint error.
  const { data: taken } = await supa
    .from('profiles').select('username, phone_number')
    .or(`username.eq.${username},phone_number.eq.${formatNumber(digits)}`);

  if (taken?.length) {
    const clash = taken[0];
    say(clash.username?.toLowerCase() === username.toLowerCase()
      ? 'That username is taken.'
      : 'Someone at the table already has that number. Try another.');
    btn.disabled = false;
    btn.textContent = 'Create account';
    return;
  }

  const { error } = await supa.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username, phone_number: formatNumber(digits) } }
  });

  if (error) {
    say(/already registered/i.test(error.message)
      ? 'That username is taken.'
      : error.message);
    btn.disabled = false;
    btn.textContent = 'Create account';
    return;
  }

  // With email confirmation switched off, signUp signs you in as well.
  const { data: { session: fresh } } = await supa.auth.getSession();
  if (fresh) {
    location.replace('app.html');
  } else {
    say('Account created. Sign in to continue.', 'ok');
    showTab('in');
    $('#inUser').value = username;
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
});

// Show the logo image only if the file actually loads, so a missing
// placeholder never leaves a broken icon on the page.
const logo = $('#brandLogo');
logo.addEventListener('load', () => logo.classList.remove('hidden'));
