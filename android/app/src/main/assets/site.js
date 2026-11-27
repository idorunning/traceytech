/* Conductor IO: added to traceytech.app pages inside the app only (the website itself is unchanged).
   - Tells the app when the page is scrolled to the top, so pull-down-to-refresh only starts there.
   - Gives the chat bar its own clear space: cards fade out above it instead of running underneath.
   - One button style: rounded rectangles of one height, lined up in a neat grid. */
(function () {
  if (window.__ttApp) return; window.__ttApp = 1;
  var P = window.ConductorPage;
  function scroller(el) {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      var s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2) return el;
    }
    return document.scrollingElement || document.documentElement;
  }
  function report(t) { try { if (P) P.top(scroller(t).scrollTop <= 0 && (window.scrollY || 0) <= 0); } catch (e) {} }
  document.addEventListener('touchstart', function (e) { report(e.target); }, { passive: true, capture: true });
  document.addEventListener('scroll', function (e) { report(e.target === document ? document.body : e.target); }, { passive: true, capture: true });

  var css = [
    '#ttfade{position:fixed;left:0;right:0;bottom:0;height:calc(var(--ttdock,96px) + 56px);pointer-events:none;',
    'background:linear-gradient(to bottom,rgba(9,9,10,0) 0,rgba(9,9,10,.92) 44px,#09090a 56px)}',
    'body{padding-bottom:calc(var(--ttdock,96px) + 28px)!important}',
    '.dock form,.dock #cmd{background:rgba(20,20,22,.96)!important}',
    /* buttons */
    '.rsvp,.btns,.btnrow{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px!important;align-items:stretch}',
    'button.act,a.act,.btns>button,.btnrow>button,.btnrow>a{border-radius:12px!important;min-height:44px;display:inline-flex!important;',
    'align-items:center;justify-content:center;text-align:center;padding:0 14px!important;font-size:15px!important;line-height:1.2;',
    'border:1px solid rgba(239,237,232,.18)!important;background:rgba(255,255,255,.05)!important;color:#efede8!important;',
    'text-decoration:none!important;box-sizing:border-box;margin:0!important}',
    'button.act.primary,a.act.primary{background:#efede8!important;color:#09090a!important;border-color:#efede8!important;font-weight:600}',
    'p>a.act,p>button.act{display:flex!important;width:100%;margin-top:10px!important}',
    'button.act:active,a.act:active{transform:scale(.98)}'
  ].join('');
  try {
    var sh = new CSSStyleSheet(); sh.replaceSync(css);
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sh]);
  } catch (e) {
    var st = document.createElement('style'); var n = document.querySelector('[nonce]');
    if (n) st.nonce = n.nonce || n.getAttribute('nonce'); st.textContent = css; document.head.appendChild(st);
  }
  function fit() {
    var d = document.querySelector('.dock'); if (!d) return;
    var r = d.getBoundingClientRect(); if (!r.height) return;
    document.documentElement.style.setProperty('--ttdock', Math.max(0, innerHeight - r.top) + 'px');
    var f = document.getElementById('ttfade');
    if (!f) { f = document.createElement('div'); f.id = 'ttfade'; d.parentNode.insertBefore(f, d); }
    var z = parseInt(getComputedStyle(d).zIndex, 10); f.style.zIndex = isNaN(z) ? '' : String(z - 1);
  }
  fit(); addEventListener('resize', fit);
  try { new ResizeObserver(fit).observe(document.body); } catch (e) {}
  setInterval(fit, 1500);
})();
