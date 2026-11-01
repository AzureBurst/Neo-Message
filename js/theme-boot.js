/* =====================================================================
   OVERDRIVE — boot (a plain script in <head>, runs before first paint)

   Turns the theme on if this device chose it, then keeps the page
   hidden until it has finished loading — signed in, data fetched, fonts
   and visible pictures ready — and fades it in in one smooth motion.
   That way nothing pops, flashes or jumps while the page assembles.
   Never waits longer than 3.5 seconds.
   ===================================================================== */
(function () {
  var root = document.documentElement, on = false;
  try { on = localStorage.getItem('neo.theme') === 'overdrive'; } catch (e) {}
  if (!on) return;

  root.dataset.theme = 'overdrive';
  root.classList.add('od-wait');

  // Smooth cross-fade between pages (Chrome/Edge; others just load).
  var vt = document.createElement('style');
  vt.textContent = '@view-transition { navigation: auto; }';
  document.head.appendChild(vt);

  var started = Date.now(), done = false, steady = 0;

  function reveal() {
    if (done) return;
    done = true;
    root.classList.remove('od-wait');
    root.classList.add('od-ready');
  }

  function visibleImagesLoaded() {
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.complete) continue;
      var r = im.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < innerHeight) return false;
    }
    return true;
  }

  function settled() {
    var b = document.body;
    if (!b || b.classList.contains('gated')) return false;     // still checking sign-in
    var loaders = document.querySelectorAll('.ig-loading');     // still fetching data
    for (var i = 0; i < loaders.length; i++) if (loaders[i].getClientRects().length) return false;
    return visibleImagesLoaded();
  }

  function tick() {
    if (done) return;
    if (Date.now() - started > 3500) return reveal();
    if (settled()) {
      // Wait for a few calm frames in a row, then for fonts.
      if (++steady >= 3) {
        var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        fonts.then(function () { requestAnimationFrame(reveal); });
        return;
      }
    } else {
      steady = 0;
    }
    setTimeout(tick, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
  else tick();
})();
