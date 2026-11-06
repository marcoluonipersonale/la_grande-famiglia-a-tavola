/* Sigillo Marco Luoni animato.
   Un puntino luminoso percorre i tratti di una lettera di MARCO LUONI, scelta a caso,
   e lascia dietro di sé una scia nel colore d'accento dell'app; poi passa a un'altra lettera.
   Si applica da solo a ogni sigillo (svg.ml-sigillo o svg.sigillo) largo almeno 16 px:
   quelli minuscoli restano fermi. Chi ha chiesto al telefono di ridurre
   le animazioni vede il sigillo fermo. */
(function () {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var NS = 'http://www.w3.org/2000/svg';
  var MIN_PX = 16, SPEED = 700, HOLD = 140, FADE = 120;
  // ogni lettera = tratti nell'ordine in cui il puntino li percorre
  var LET = [
    ['M34 97.95V22.05', 'M34 22.05L60 60', 'M60 60L86 22.05', 'M86 22.05V97.95'],                         // M
    ['M34 97.95V22.05', 'M34 22.05A46 46 0 0 1 86 22.05', 'M86 22.05V97.95', 'M86 60H34'],                // A
    ['M34 97.95V22.05', 'M34 22.05A46 46 0 0 1 86 22.05', 'M86 22.05V60', 'M86 60H34', 'M60 60L86 97.95'], // R
    ['M86 22.05A46 46 0 1 0 86 97.95'],                                                                   // C
    ['M60 14A46 46 0 1 1 59.99 14'],                                                                      // O
    ['M34 22.05V97.95', 'M34 97.95A46 46 0 0 0 86 97.95'],                                                // L
    ['M34 22.05V97.95', 'M34 97.95A46 46 0 0 0 86 97.95', 'M86 97.95V22.05'],                             // U
    ['M34 97.95V22.05', 'M34 22.05L86 97.95', 'M86 97.95V22.05'],                                         // N
    ['M86 22.05V97.95']                                                                                   // I
  ];
  var live = [];

  function pick(prev) { var n; do { n = Math.floor(Math.random() * LET.length); } while (n === prev); return n; }

  function attach(svg) {
    if (svg.__mlAnim) return;
    var w = svg.getBoundingClientRect().width;
    if (w < MIN_PX) return; // troppo piccolo (o ancora nascosto): riprovo al prossimo controllo
    var base = svg.querySelector('g');
    var dotEl = svg.querySelector('.ml-punto, .punto');
    if (!base) return;
    var color = dotEl ? getComputedStyle(dotEl).fill : 'currentColor';
    var lit = document.createElementNS(NS, 'g');
    lit.setAttribute('fill', 'none');
    lit.setAttribute('stroke', color);
    lit.setAttribute('stroke-width', '10');
    lit.setAttribute('stroke-linecap', 'round');
    lit.setAttribute('stroke-linejoin', 'round');
    lit.style.filter = 'drop-shadow(0 0 3px ' + color + ') drop-shadow(0 0 6px ' + color + ')';
    lit.style.transition = 'opacity .12s';
    svg.insertBefore(lit, dotEl || null);
    var spark = document.createElementNS(NS, 'circle');
    spark.setAttribute('r', '6');
    spark.setAttribute('fill', '#fff');
    spark.style.filter = 'drop-shadow(0 0 4px #fff) drop-shadow(0 0 8px ' + color + ')';
    spark.style.opacity = '0';
    svg.appendChild(spark);
    base.style.transition = 'opacity .4s';
    base.style.opacity = '.45';
    var st = { svg: svg, lit: lit, spark: spark, li: pick(-1), segs: [], total: 0, t0: performance.now() + Math.random() * 600, phase: 'draw', pt: 0 };
    svg.__mlAnim = st;
    setup(st, st.t0);
    live.push(st);
  }

  function setup(st, now) {
    st.lit.style.opacity = '1';
    while (st.lit.firstChild) st.lit.removeChild(st.lit.firstChild);
    st.segs = []; st.total = 0;
    LET[st.li].forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      st.lit.appendChild(p);
      var len = p.getTotalLength();
      p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      st.segs.push({ p: p, len: len, start: st.total }); st.total += len;
    });
    st.t0 = now; st.phase = 'draw';
  }

  function step(st, now) {
    if (st.phase === 'draw') {
      if (now < st.t0) return;
      var dist = (now - st.t0) / 1000 * SPEED, cur = null;
      st.segs.forEach(function (s) {
        var k = Math.min(s.len, Math.max(0, dist - s.start));
        s.p.style.strokeDashoffset = s.len - k;
        if (dist >= s.start && dist < s.start + s.len) cur = { s: s, k: k };
      });
      if (!cur) { var last = st.segs[st.segs.length - 1]; cur = { s: last, k: last.len }; }
      var q = cur.s.p.getPointAtLength(cur.k);
      st.spark.setAttribute('cx', q.x); st.spark.setAttribute('cy', q.y); st.spark.style.opacity = '1';
      if (dist >= st.total) { st.phase = 'hold'; st.pt = now; }
    } else if (st.phase === 'hold') {
      if (now - st.pt > HOLD) { st.lit.style.opacity = '0'; st.spark.style.opacity = '0'; st.phase = 'fade'; st.pt = now; }
    } else if (now - st.pt > FADE) {
      st.li = pick(st.li); setup(st, now);
    }
  }

  function loop(now) {
    live = live.filter(function (st) { return st.svg.isConnected; });
    live.forEach(function (st) { step(st, now); });
    requestAnimationFrame(loop);
  }

  var pending = false;
  function scan() {
    pending = false;
    var all = document.querySelectorAll('svg.ml-sigillo, svg.sigillo');
    for (var i = 0; i < all.length; i++) attach(all[i]);
  }
  function later() { if (!pending) { pending = true; requestAnimationFrame(scan); } }

  function start() {
    scan();
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', later);
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
