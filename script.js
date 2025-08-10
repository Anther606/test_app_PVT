(() => {
  // ---- Config
  const TRIALS = 10;
  const MIN_DELAY = 2000;  // 2 s
  const MAX_DELAY = 5000;  // 5 s
  const LAPSE_MS = 500;

  // ---- DOM
  const canvas = document.getElementById('pvtCanvas');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('status');
  const attemptEl = document.getElementById('attempt');
  const totalEl = document.getElementById('total');
  const currentEl = document.getElementById('current');
  const avgEl = document.getElementById('avg');
  const bestEl = document.getElementById('best');
  const worstEl = document.getElementById('worst');
  const errorsEl = document.getElementById('errors');
  const lapsesEl = document.getElementById('lapses');
  totalEl.textContent = TRIALS;

  // ---- HiDPI canvas
  function fitHiDPI() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Recompute radius on resize
    radius = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18; // malo manji da stane u kutove
  }
  new ResizeObserver(fitHiDPI).observe(canvas);
  fitHiDPI();

  // ---- State
  let state = 'idle'; // idle | waiting | target | done
  let trial = 0;
  let timerId = null;
  let readyAt = 0; // when it turned target
  let rtList = [];
  let errors = 0;
  let lapses = 0;

  // current circle geometry
  let radius = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18;
  let curX = canvas.clientWidth / 2;
  let curY = canvas.clientHeight / 2;

  // ---- Helpers for random position (keeps circle fully visible)
  function pickRandomPosition() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const pad = 16; // sigurnosni rub
    const minX = radius + pad;
    const maxX = cw - radius - pad;
    const minY = radius + pad;
    const maxY = ch - radius - pad;
    curX = minX + Math.random() * Math.max(1, (maxX - minX));
    curY = minY + Math.random() * Math.max(1, (maxY - minY));
  }

  // ---- Drawing
  function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  function drawCircle(color, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawUI(textTop = '', hint = '') {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'center';
    // naslov gore iznad kruga (centriramo na ekran)
    ctx.fillText(textTop, canvas.clientWidth / 2, (canvas.clientHeight / 2) - radius - 24);

    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(hint, canvas.clientWidth / 2, (canvas.clientHeight / 2) + radius + 24);
  }

  function renderWaiting() {
    drawBackground();
    // neutralni krug ostaje u centru dok čeka
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    drawCircle('#2a3142', cx, cy);
    drawUI('Priprema…', 'ČEKAJ… krug će uskoro postati crven.');
  }

  function renderTarget() {
    drawBackground();
    // krug na random poziciji
    drawCircle('#ef4444', curX, curY);
    drawUI('Tapni SADA!', 'Pogodi crveni krug što brže možeš.');
  }

  function setStatus(msg) { statusEl.textContent = msg; }

  function setStats(current = null) {
    attemptEl.textContent = trial;
    currentEl.textContent = current !== null ? Math.round(current) : '—';

    if (rtList.length) {
      const sum = rtList.reduce((a, b) => a + b, 0);
      const avg = sum / rtList.length;
      const best = Math.min(...rtList);
      const worst = Math.max(...rtList);
      avgEl.textContent = Math.round(avg);
      bestEl.textContent = Math.round(best);
      worstEl.textContent = Math.round(worst);
    } else {
      avgEl.textContent = bestEl.textContent = worstEl.textContent = '—';
    }
    errorsEl.textContent = errors;
    lapsesEl.textContent = lapses;
  }

  // ---- Flow
  function startTest() {
    state = 'waiting';
    trial = 1;
    rtList = [];
    errors = 0;
    lapses = 0;
    setStats();
    setStatus('Test u tijeku… Pokušaj 1 od ' + TRIALS);
    startBtn.disabled = true;
    resetBtn.disabled = false;
    scheduleTarget();
  }

  function scheduleTarget() {
    renderWaiting();
    const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      // prije uključivanja signala odredi novu poziciju
      pickRandomPosition();
      state = 'target';
      readyAt = performance.now();
      renderTarget();
    }, delay);
  }

  function registerFalseStart() {
    errors++;
    setStatus(`Prerani klik (greška). Ponovno za pokušaj ${trial}…`);
    flash('#ef4444');
    state = 'waiting';
    scheduleTarget();
    setStats();
  }

  function recordReaction() {
    const rt = performance.now() - readyAt;
    rtList.push(rt);
    if (rt > LAPSE_MS) lapses++;
    setStats(rt);
    setStatus(`Pokušaj ${trial} završen: ${Math.round(rt)} ms`);
    flash('#16a34a');

    if (trial >= TRIALS) {
      finishTest();
    } else {
      trial++;
      setTimeout(() => {
        if (state !== 'done') {
          state = 'waiting';
          setStatus(`Pokušaj ${trial} od ${TRIALS}…`);
          scheduleTarget();
        }
      }, 700);
    }
  }

  function finishTest() {
    state = 'done';
    // završni ekran
    drawBackground();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    drawCircle('#2a3142', cx, cy);
    drawUI('Gotovo!', '');
    setStatus('Test završen.');
    startBtn.disabled = false;
  }

  function reset() {
    clearTimeout(timerId);
    state = 'idle';
    trial = 0;
    rtList = [];
    errors = 0;
    lapses = 0;
    setStats();
    setStatus('Spreman.');
    startBtn.disabled = false;
    resetBtn.disabled = true;

    // inicijalni prikaz
    drawBackground();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    drawCircle('#2a3142', cx, cy);
    drawUI('PVT spreman', 'Klikni Započni test.');
  }

  function flash(color) {
    canvas.style.boxShadow = `0 0 0 2px ${color}`;
    setTimeout(() => canvas.style.boxShadow = 'none', 250);
  }

  // ---- Input
  function onUserTap(ev) {
    if (state === 'waiting') {
      registerFalseStart();
    } else if (state === 'target') {
      // provjeri je li tap/klik unutar kruga (jer je pomičan)
      const rect = canvas.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
      const dx = x - curX;
      const dy = y - curY;
      const inside = (dx*dx + dy*dy) <= (radius*radius);
      if (inside) {
        recordReaction();
      } else {
        // klik mimo kruga tretiramo kao grešku (po želji možeš ignorirati)
        registerFalseStart();
      }
    }
  }

  canvas.addEventListener('click', (e) => onUserTap(e));
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onUserTap(e); }, { passive: false });

  startBtn.addEventListener('click', startTest);
  resetBtn.addEventListener('click', reset);

  // initial draw
  reset();
})();
