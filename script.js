(() => {
  // ---- Config
  const TOTAL_TRIALS = 25;
  const PRACTICE_TRIALS = 5;                 // prvih 5 se NE računaju
  const COUNTED_TRIALS = TOTAL_TRIALS - PRACTICE_TRIALS;
  const DURATION_MS = 60_000;                // 1 minuta ukupno
  const MIN_DELAY = 2000;                    // 2–5 s random čekanje
  const MAX_DELAY = 5000;
  const LAPSE_MS  = 500;

  // ---- DOM
  const canvas   = document.getElementById('pvtCanvas');
  const ctx      = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('status');
  const attemptEl= document.getElementById('attempt');
  const totalEl  = document.getElementById('total');
  const currentEl= document.getElementById('current');
  const avgEl    = document.getElementById('avg');
  const bestEl   = document.getElementById('best');
  const worstEl  = document.getElementById('worst');
  const errorsEl = document.getElementById('errors');
  const lapsesEl = document.getElementById('lapses');
  totalEl.textContent = TOTAL_TRIALS;

  // ---- Geometry (declare before fitHiDPI)
  let radius = 0;
  let curX = 0, curY = 0;

  // ---- HiDPI canvas
  function fitHiDPI() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width  = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    radius = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18;
  }
  new ResizeObserver(fitHiDPI).observe(canvas);
  fitHiDPI();

  // ---- State
  let state = 'idle'; // idle | waiting | target | done
  let trial = 0;
  let timerId = null;
  let readyAt = 0;
  let testStartedAt = 0;
  let countdownId = null;

  // rezultati
  let rtAll = [];           // sva vremena (uklj. probne)
  let rtEffective = [];     // samo 20 “pravih”
  let errors = 0;
  let lapses = 0;

  // ---- Helpers
  function isPractice(t) { return t <= PRACTICE_TRIALS; }

  function pickRandomPosition() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight, pad = 16;
    const minX = radius + pad, maxX = cw - radius - pad;
    const minY = radius + pad, maxY = ch - radius - pad;
    curX = minX + Math.random() * Math.max(1, (maxX - minX));
    curY = minY + Math.random() * Math.max(1, (maxY - minY));
  }

  function drawBackground() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);
  }
  function drawCircle(color,x,y){ ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); }
  function drawUI(top='',hint=''){
    ctx.fillStyle='#cbd5e1'; ctx.textAlign='center';
    ctx.font='18px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(top, canvas.clientWidth/2, (canvas.clientHeight/2)-radius-24);
    ctx.font='14px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(hint, canvas.clientWidth/2, (canvas.clientHeight/2)+radius+24);
  }

  function renderWaiting() {
    drawBackground();
    const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2;
    drawCircle('#2a3142', cx, cy);
    const label = isPractice(trial) ? `Probni pokušaj ${trial}/${PRACTICE_TRIALS}` :
                                      `Pokušaj ${trial}/${TOTAL_TRIALS}`;
    drawUI(label, 'ČEKAJ… krug će uskoro postati crven.');
  }

  function renderTarget() {
    drawBackground();
    drawCircle('#ef4444', curX, curY);
    drawUI('Tapni SADA!', isPractice(trial) ? 'Probni klik – ne računa se u rezultat.' :
                                              'Pogodi crveni krug što brže možeš.');
  }

  function setStatus(msg){ statusEl.textContent = msg; }
  function avg(arr){ return arr.reduce((a,b)=>a+b,0) / (arr.length || 1); }

  function setStats(current=null){
    attemptEl.textContent = trial;
    currentEl.textContent = current !== null ? Math.round(current) : '—';

    if (rtEffective.length){
      const a = avg(rtEffective);
      const best = Math.min(...rtEffective);
      const worst = Math.max(...rtEffective);
      avgEl.textContent   = Math.round(a);
      bestEl.textContent  = Math.round(best);
      worstEl.textContent = Math.round(worst);
    } else {
      avgEl.textContent = bestEl.textContent = worstEl.textContent = '—';
    }
    errorsEl.textContent = errors;
    lapsesEl.textContent = lapses;
  }

  // Ocjena
  function evaluate(){
    const a = avg(rtEffective);
    const e = errors;
    const l = lapses;
    if (rtEffective.length === 0) return {label:'Nedovoljno podataka', color:'#9aa3af'};
    if (a < 280 && e <= 1 && l <= 1) return {label:'Odličan', color:'#16a34a'};
    if (a < 380 && e <= 3 && l <= 3) return {label:'Normalan', color:'#fbbf24'};
    return {label:'Potrebno poboljšanje', color:'#ef4444'};
  }

  // ---- Flow
  function startTest(){
    state = 'waiting';
    trial = 1;
    rtAll = [];
    rtEffective = [];
    errors = 0; lapses = 0;
    setStats();
    setStatus('Test start. Trajanje 60 s. Prvih 5 pokušaja je probno.');
    startBtn.disabled = true; resetBtn.disabled = false;

    testStartedAt = performance.now();
    startCountdown();
    scheduleTarget();
  }

  function startCountdown(){
    updateTimeLeft(); // odmah
    clearInterval(countdownId);
    countdownId = setInterval(()=>{
      if (!updateTimeLeft()) { clearInterval(countdownId); finishTest('Vrijeme isteklo.'); }
    }, 200);
  }

  function timeLeftMs(){
    return Math.max(0, DURATION_MS - (performance.now() - testStartedAt));
  }

  function updateTimeLeft(){
    const ms = timeLeftMs();
    const s = Math.ceil(ms/1000);
    const phase = trial<=PRACTICE_TRIALS ? `Probni ${trial<=0?0:trial}/${PRACTICE_TRIALS}` :
                   (rtEffective.length<COUNTED_TRIALS ? `Pokušaj ${trial}/${TOTAL_TRIALS}` : `Završavanje…`);
    setStatus(`${phase} • Preostalo: ${s}s`);
    return ms > 0;
  }

  function scheduleTarget(){
    if (timeLeftMs() <= 0) return finishTest('Vrijeme isteklo.');
    renderWaiting();
    const delay = MIN_DELAY + Math.random()*(MAX_DELAY - MIN_DELAY);
    clearTimeout(timerId);
    timerId = setTimeout(()=>{
      if (timeLeftMs() <= 0) return finishTest('Vrijeme isteklo.');
      pickRandomPosition();
      state = 'target';
      readyAt = performance.now();
      renderTarget();
    }, delay);
  }

  function registerFalseStart(){
    errors++;
    setStats();
    state='waiting';
    scheduleTarget();
  }

  function recordReaction(){
    const rt = performance.now() - readyAt;
    rtAll.push(rt);
    if (rt > LAPSE_MS) lapses++;

    if (!isPractice(trial)) rtEffective.push(rt);

    setStats(rt);

    const countedDone = rtEffective.length >= COUNTED_TRIALS;
    const totalDone   = trial >= TOTAL_TRIALS;

    if (countedDone || totalDone || timeLeftMs() <= 0) {
      finishTest(countedDone ? 'Dovršeno.' : 'Vrijeme isteklo.');
      return;
    }

    trial++;
    setTimeout(()=>{
      if (state!=='done'){ state='waiting'; scheduleTarget(); }
    }, 650);
  }

  function finishTest(reason=''){
    state='done';
    clearTimeout(timerId);
    clearInterval(countdownId);

    drawBackground();
    const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2;
    drawCircle('#2a3142', cx, cy);

    const verdict = evaluate();
    drawUI('Gotovo!', `Rezultat: ${verdict.label}`);

    startBtn.disabled = false;

    const avgMs = rtEffective.length ? Math.round(avg(rtEffective)) : '—';
    setStatus(`${reason} • Prosjek: ${avgMs} ms • Greške: ${errors} • Lapses: ${lapses}`);
  }

  function reset(){
    clearTimeout(timerId);
    clearInterval(countdownId);
    state='idle'; trial=0;
    rtAll=[]; rtEffective=[]; errors=0; lapses=0;
    setStats(); setStatus('Spreman.');
    startBtn.disabled=false; resetBtn.disabled=true;

    drawBackground();
    const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2;
    drawCircle('#2a3142', cx, cy);
    drawUI('PVT spreman', 'Klikni Započni test.');
  }

  // ---- Visual flashes (green/red)
  function flashColor(color){
    canvas.style.boxShadow = `0 0 30px ${color}`;
    setTimeout(()=>canvas.style.boxShadow='none', 180);
  }

  // ---- Input
  function onUserTap(ev){
    if (state==='waiting'){
      flashColor('#7f1d1d'); // crvena
      registerFalseStart();
    } else if (state==='target'){
      const rect = canvas.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
      const dx = x - curX, dy = y - curY;
      const inside = (dx*dx + dy*dy) <= (radius*radius);
      if (inside) { flashColor('#16a34a'); recordReaction(); }
      else        { flashColor('#7f1d1d'); registerFalseStart(); }
    }
  }

  canvas.addEventListener('click', (e)=>onUserTap(e));
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); onUserTap(e); }, {passive:false});
  startBtn.addEventListener('click', startTest);
  resetBtn.addEventListener('click', reset);

  // initial
  reset();
})();
