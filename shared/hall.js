/* Game Hall framework: one shell for every game.
   A game supplies its rules (setup, act, over, cpu) and a render function; this file
   supplies the room around it: players, hint visibility, computer seats, pass-and-play,
   undo, saving, chat, and 2–4 player online tables over direct browser connections. */
window.Hall = (() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const store = {
  get(k, d){ try{ const v = localStorage.getItem('gamehall.' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('gamehall.' + k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem('gamehall.' + k); }catch(e){} }
};
const prefs = Object.assign({sound:true, anim:true, name:'', hints:true, level:1, mode:{}, players:{}, opts:{}}, store.get('prefs', {}));
if (!prefs.name){ try{ const c = JSON.parse(localStorage.getItem('chesshall.prefs') || '{}'); if (c.name) prefs.name = String(c.name).slice(0, 24); }catch(e){} }
const savePrefs = () => store.set('prefs', prefs);
let PID = store.get('pid', null);
if (!PID){ PID = Math.random().toString(36).slice(2, 12); store.set('pid', PID); }
const myName = () => (prefs.name || '').trim().slice(0, 24) || 'Player';
const LEVELS = ['Easy', 'Medium', 'Hard', 'Expert'];
const ICON = {
  grid:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  plus:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  undo:'<svg class="i" viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  flag:'<svg class="i" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  book:'<svg class="i" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  bulb:'<svg class="i" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  copy:'<svg class="i" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  send:'<svg class="i" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-7z"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  again:'<svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/></svg>'
};

/* ---------- sound ---------- */
let AC = null;
function actx(){
  if (!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
document.addEventListener('pointerdown', actx, {passive:true});
function tone(f, dur, type, g, when){
  const a = actx(); if (!a || !prefs.sound) return;
  const t = a.currentTime + (when || 0), o = a.createOscillator(), v = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + .006); v.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(v); v.connect(a.destination); o.start(t); o.stop(t + dur + .03);
}
function noise(f, g, when, len, q){
  const a = actx(); if (!a || !prefs.sound) return;
  const t = a.currentTime + (when || 0), n = Math.floor(a.sampleRate * (len || .07)), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
  const s = a.createBufferSource(), bp = a.createBiquadFilter(), v = a.createGain();
  s.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q || 1.4; v.gain.value = g;
  s.connect(bp); bp.connect(v); v.connect(a.destination); s.start(t);
}
const SND = {
  place(){ noise(1300, .6); tone(190, .09, 'sine', .3); },
  move(){ noise(1250, .55); tone(185, .09, 'sine', .28); },
  capture(){ noise(980, .8); tone(140, .1, 'sine', .4); noise(1700, .4, .05); },
  flip(){ noise(2600, .35, 0, .05, 2); tone(520, .05, 'triangle', .06); },
  seed(i){ tone(900 + (i || 0) * 40, .05, 'triangle', .07); noise(3000, .15, 0, .03, 3); },
  card(){ noise(3200, .45, 0, .06, .8); },
  deal(n){ for (let i = 0; i < (n || 3); i++) noise(3200, .35, i * .07, .05, .8); },
  dice(){ for (let i = 0; i < 6; i++) noise(1800 + Math.random() * 1400, .45, i * .045 + Math.random() * .02, .04, 2); },
  good(){ tone(784, .12, 'triangle', .1); tone(1047, .2, 'triangle', .1, .09); },
  win(){ [523, 659, 784, 1047].forEach((f, i) => tone(f, .55, 'triangle', .11, i * .09)); },
  lose(){ [392, 330, 262].forEach((f, i) => tone(f, .5, 'triangle', .1, i * .13)); },
  bad(){ tone(130, .16, 'square', .05); },
  start(){ tone(659, .12, 'triangle', .09); tone(880, .2, 'triangle', .09, .1); },
  notify(){ tone(1175, .07, 'sine', .08); tone(1568, .1, 'sine', .07, .08); }
};

/* ---------- toast, overlays, copy, confetti ---------- */
let toastT = 0;
function toast(msg){ const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
const openOv = id => $('#' + id).classList.add('show');
const closeOv = id => $('#' + id).classList.remove('show');
function showCopy(text){ $('#cpTxt').value = text; openOv('ovCopy'); setTimeout(() => { $('#cpTxt').focus(); $('#cpTxt').select(); }, 50); }
function copyText(text, ok){ try{ navigator.clipboard.writeText(text).then(() => toast(ok || 'Copied'), () => showCopy(text)); }catch(e){ showCopy(text); } }
function confetti(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ['#e3b75c', '#f6ecef', '#e5484d', '#7fd3ff', '#9be29b', '#c79bff'];
  const ps = Array.from({length:160}, () => ({x:W / 2 + (Math.random() - .5) * W * .3, y:H * .35, vx:(Math.random() - .5) * 14, vy:-Math.random() * 14 - 4, r:Math.random() * 6 + 4, a:Math.random() * 6, va:(Math.random() - .5) * .3, c:cols[Math.floor(Math.random() * cols.length)]}));
  const t0 = performance.now();
  const step = now => {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps){ p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (now - t0 < 3200) requestAnimationFrame(step); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(step);
}

/* ---------- network constants ---------- */
const NETP = 'gamehall-v1-';
const PEER_OPTS = {debug:0, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}, {urls:'stun:stun1.l.google.com:19302'}, {urls:'stun:global.stun.twilio.com:3478'}]}};
{ const bk = /^([a-z0-9.-]+):(\d{2,5})$/i.exec(new URLSearchParams(location.search).get('broker') || ''); if (bk) Object.assign(PEER_OPTS, {host:bk[1], port:+bk[2], path:'/', secure:location.protocol === 'https:' && bk[1] !== 'localhost'}); }
const genCode = () => Array.from({length:6}, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
function tableIndex(code, game, role){ const ix = store.get('tables', {}); ix[code] = {game, role, at:Date.now()}; const ks = Object.keys(ix).sort((a, b) => ix[b].at - ix[a].at); for (const k of ks.slice(30)){ delete ix[k]; store.del('host.' + k); } store.set('tables', ix); }

/* =====================================================================
   run(G): build the page for one game and play it.
   ===================================================================== */
function run(G){
  const N_MIN = G.min || 2, N_MAX = G.max || 2;
  let T = null;            // the table
  let H = [];              // undo history (offline only)
  let role = null;         // null offline, 'host', 'guest'
  let peer = null, hostConn = null, conns = new Map(), netState = '', retryT = 0, hostSeen = 0, skew = 0;
  let curCode = null;
  let cpuTok = 0, cpuSeat = null, shown = null, lastView = null, overShown = false, chatN = 0, chatInit = false, prevPhase = null;

  /* ---------- shell ---------- */
  document.title = G.name + ' · Game Hall';
  const optHtml = (G.options || []).map(o => `<div class="fld" data-opt="${o.key}"><div class="lbl">${esc(o.label)}</div><div class="chips">${o.choices.map(([v, l]) => `<button data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>${o.note ? `<div style="font-size:13px;color:var(--mut);margin-top:6px">${o.note}</div>` : ''}</div>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `
<header class="top">
  <a class="ib ic" href="../" aria-label="All games" title="All games">${ICON.grid}</a>
  <div class="brand"><span class="gi">${G.icon || ''}</span>${esc(G.name)}</div>
  <span class="modetag" id="modetag"></span><span class="sp"></span>
  <button class="ib pri" id="bNew">${ICON.plus}<span class="lt">New game</span></button>
  <button class="ib ic" id="bSet" aria-label="Settings">${ICON.gear}</button>
</header>
<main class="app ${G.layout === 'wide' ? 'wide' : ''}" id="app">
  <section class="gstage" id="gstage"></section>
  <aside class="side">
    <div class="st"><h2 id="stT"></h2><p id="stS"></p></div>
    <div class="invite" id="invite" hidden><div style="font-weight:800">Invite players</div><div style="font-size:14px;color:var(--mut)">Send the link or code. Keep this page open while you play.</div><div class="code" id="invCode"></div>
      <div class="row"><button class="ib" id="bShare">${ICON.copy}<span>Copy invite</span></button><button class="ib" id="bCode">Copy code</button></div><div id="famInv"></div></div>
    <div class="plist" id="plist"></div>
    <div class="acts" id="acts"></div>
    <div class="tabs" role="tablist" id="tabs"><button role="tab" id="tLog" aria-selected="true">${esc(G.logLabel || 'Moves')}</button><button role="tab" id="tChat" aria-selected="false">Chat<span class="badge" id="chatBadge"></span></button></div>
    <div class="pane" id="pLog"><div class="log" id="log"></div></div>
    <div class="pane" id="pChat" hidden><div class="chat"><div class="chatlog" id="chatlog"></div>
      <div class="quick" id="quick">${['Good luck!', 'Nice one', 'Oops', 'Your turn!', 'Good game'].map(q => `<button type="button">${q}</button>`).join('')}</div>
      <form class="chatin" id="chatForm"><input id="chatIn" maxlength="200" placeholder="Say something nice" autocomplete="off" aria-label="Chat message"><button class="ib pri" aria-label="Send">${ICON.send}</button></form></div></div>
  </aside>
</main>
<div class="ov" id="ovNew"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ngT">
  <button class="ib ic x" data-close aria-label="Close">${ICON.x}</button>
  <h2 id="ngT">New game of ${esc(G.name)}</h2><p class="lead">${esc(G.tagline || 'Choose who to play.')}</p>
  <div class="fld"><div class="seg" id="ngMode"><button data-v="cpu">Computer</button><button data-v="local">Pass &amp; play</button><button data-v="online">Online</button></div></div>
  <div class="fld" id="ngPl" ${N_MAX > N_MIN ? '' : 'hidden'}><div class="lbl">Players <span id="plNote"></span></div><div class="chips" id="ngPlayers">${Array.from({length:N_MAX - N_MIN + 1}, (_, i) => `<button data-v="${N_MIN + i}">${N_MIN + i}</button>`).join('')}</div></div>
  <div class="fld" id="ngLv"><div class="lbl">Computer strength</div><div class="chips" id="ngLevel">${LEVELS.map((l, i) => `<button data-v="${i}">${l}</button>`).join('')}</div></div>
  ${optHtml}
  <div id="ngOnline" class="fld" hidden>
    <div class="lbl">Your name</div><input id="myName" class="txt" maxlength="24" placeholder="So the others know who you are" autocomplete="nickname">
    <div class="note" id="onNote"></div>
    <div class="lbl" style="margin-top:18px">Join a game</div>
    <form class="row2" id="joinForm"><input id="joinCode" maxlength="8" placeholder="Code" autocomplete="off" aria-label="Game code"><button class="ib" style="min-height:48px">Join</button></form>
    <div class="lbl" style="margin-top:18px">Your games</div><div class="games" id="myGames"></div>
  </div>
  ${G.hintable ? `<div class="tog" style="border:0;margin-top:10px"><div>${esc(G.hintLabel || 'Show my moves')}<small>Everyone can see whether this is on.</small></div><button class="sw" role="switch" id="ngHints" aria-label="${esc(G.hintLabel || 'Show my moves')}"></button></div>` : ''}
  <button class="ib pri go" id="ngGo">Start game</button>
</div></div>
<div class="ov" id="ovSet"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="setT">
  <button class="ib ic x" data-close aria-label="Close">${ICON.x}</button><h2 id="setT">Settings</h2>
  <div class="fld"><div class="lbl">Your name</div><input id="setName" class="txt" maxlength="24" placeholder="Shown to other players online"></div>
  <div class="fld"><div class="tog"><div>Sound effects</div><button class="sw" role="switch" data-pref="sound" aria-label="Sound effects"></button></div>
  <div class="tog"><div>Animations</div><button class="sw" role="switch" data-pref="anim" aria-label="Animations"></button></div></div>
  <p class="note">${esc(G.credit || '')} Online connections: PeerJS (MIT).</p>
</div></div>
<div class="ov" id="ovRules"><div class="modal rules" role="dialog" aria-modal="true" aria-labelledby="ruT">
  <button class="ib ic x" data-close aria-label="Close">${ICON.x}</button><h2 id="ruT">How to play ${esc(G.name)}</h2>${G.rules || ''}
</div></div>
<div class="ov" id="ovEnd"><div class="modal res" role="dialog" aria-modal="true" aria-labelledby="endT">
  <button class="ib ic x" data-close aria-label="Close">${ICON.x}</button>
  <div class="big" id="endT"></div><div class="why" id="endWhy"></div><div class="stats" id="endStats"></div>
  <div class="btns"><button class="ib pri" id="eAgain">${ICON.again}Play again</button><button class="ib" id="eNew">New game</button><a class="ib" href="../">${ICON.grid}All games</a><button class="ib" data-close>Look at the board</button></div>
</div></div>
<div class="ov" id="ovCopy"><div class="modal" role="dialog" aria-modal="true"><button class="ib ic x" data-close aria-label="Close">${ICON.x}</button>
  <h2>Copy this</h2><p class="lead">Select the text below and copy it.</p><textarea id="cpTxt" readonly style="width:100%;min-height:120px;margin-top:12px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:10px;font:14px ui-monospace,monospace"></textarea></div></div>
<div id="toast" role="status" aria-live="polite"></div><canvas id="confetti"></canvas>`);
  const stage = $('#gstage');
  document.querySelectorAll('.ov').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) ov.classList.remove('show'); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.ov.show').forEach(o => o.classList.remove('show')); });

  /* ---------- seats & views ---------- */
  const seatName = i => (G.seatNames && G.seatNames[i]) || 'Player ' + (i + 1);
  const cpuNames = ['Computer', 'Pip', 'Juno', 'Max'];
  const cpuName = (i, n) => n === 2 ? 'Computer' : cpuNames[i] || 'Computer ' + i;
  function mySeats(){
    if (!T) return [];
    if (role === 'guest') return T.you == null ? [] : [T.you];
    return T.players.map((p, i) => i).filter(i => T.players[i].kind === 'human' && (T.mode === 'local' || T.players[i].pid === PID));
  }
  const current = () => T && T.state && T.phase === 'play' ? G.current(T.state) : null;
  function viewerSeat(){
    if (!T) return null;
    if (T.mode === 'local'){ if (G.hidden) return shown; return G.localView != null ? G.localView : 0; }
    const m = mySeats(); return m.length ? m[0] : null;
  }
  function actorSeat(){
    if (!T || T.phase !== 'play') return null;
    const c = current();
    if (T.mode === 'local'){
      if (c == null || T.players[c].kind !== 'human') return null;
      if (G.hidden && shown !== c) return null;
      return c;
    }
    const v = viewerSeat(); return v != null && mySeats().includes(v) && (G.anyTurn || c === v) ? v : null;
  }
  function viewState(){
    if (!T || !T.state) return null;
    if (role === 'guest' || !G.view) return T.state;
    return G.view(clone(T.state), viewerSeat());
  }

  /* ---------- table lifecycle ---------- */
  function newTable(mode, n, level, opts){
    const players = [];
    for (let i = 0; i < n; i++){
      if (i === 0) players.push({name:mode === 'local' ? seatName(0) : mode === 'cpu' ? (prefs.name || '').trim().slice(0, 24) || 'You' : myName(), kind:'human', pid:mode === 'local' ? 'local' : PID, hints:prefs.hints});
      else if (mode === 'cpu') players.push({name:cpuName(i, n), kind:'cpu', level});
      else if (mode === 'local') players.push({name:seatName(i), kind:'human', pid:'local', hints:prefs.hints});
      else players.push({name:'', kind:'open', pid:null, level});
    }
    return {v:1, game:G.id, mode, code:null, players, opts:clone(opts || {}), first:0, state:null, phase:'lobby', over:null, meta:null, log:[], chat:[], round:1, updated:Date.now()};
  }
  function startPlay(){
    if (G.noCpu && T.players.some(p => p.kind === 'open')){
      const map = {}; const keep = [];
      T.players.forEach((p, i) => { if (p.kind !== 'open'){ map[i] = keep.length; keep.push(p); } });
      if (keep.length < N_MIN){ toast(`You need at least ${N_MIN} players`); return; }
      T.players = keep; for (const [, info] of conns) if (info.seat != null) info.seat = map[info.seat];
    }
    T.players.forEach(p => { if (p.kind === 'open'){ p.kind = 'cpu'; p.level = p.level ?? prefs.level; p.name = cpuName(T.players.indexOf(p), T.players.length); } });
    T.state = G.setup({n:T.players.length, opts:T.opts || {}, first:T.first || 0, players:T.players});
    T.phase = 'play'; T.over = null;
    T.meta = {hints:T.players.map(p => p.kind === 'human' ? !!(p.hints ?? prefs.hints) : false), used:T.players.map(() => 0), acts:T.players.map(() => 0)};
    T.log = [{s:-1, t:T.round > 1 ? 'New round' : 'Game started'}];
    H = []; shown = null; overShown = false; lastView = null;
    SND.start();
    afterChange();
  }
  function doAct(seat, a){
    if (!T || T.phase !== 'play') throw new Error('The game isn’t running');
    const prev = T.state;
    const next = G.act(clone(prev), seat, a);
    if (seat >= 0 && role !== 'host' && T.mode !== 'online' && T.players[seat].kind === 'human' && !G.noUndo){ H.push(clone(T)); if (H.length > 60) H.shift(); }
    T.state = next;
    if (seat >= 0){
      T.meta.acts[seat]++;
      if (G.hintable && T.meta.hints[seat] && T.players[seat].kind === 'human' && !(G.countHint && !G.countHint(a))) T.meta.used[seat]++;
    }
    const d = G.describe ? G.describe(a, prev, next, seat) : null;
    if (d) T.log.push({s:seat, t:d});
    if (T.log.length > 160) T.log.splice(1, T.log.length - 160);
    const o = G.over(next);
    if (o){ T.phase = 'over'; T.over = o; }
    afterChange();
  }
  function afterChange(){
    T.updated = Date.now();
    save();
    if (role === 'host') broadcast();
    render();
    if (T.phase === 'over' && !overShown){ overShown = true; setTimeout(showEnd, G.endDelay ?? 900); }
    if (T.phase !== 'over') overShown = false;
    scheduleCpu(); scheduleAuto(); lobbyUpdate();
  }
  let autoT = 0;
  function scheduleAuto(){
    clearTimeout(autoT);
    if (!T || T.phase !== 'play' || role === 'guest' || !G.auto) return;
    const x = G.auto(T.state, Date.now());
    if (!x) return;
    autoT = setTimeout(() => { try{ if (T && T.phase === 'play') doAct(-1, x.a); }catch(e){ console.error(e); } }, Math.max(0, x.at - Date.now()));
  }
  function scheduleCpu(){
    if (!T || T.phase !== 'play' || role === 'guest') return;
    const seats = G.cpuSeats ? G.cpuSeats(T.state) : [G.current(T.state)];
    const s = seats.find(x => x != null && T.players[x] && T.players[x].kind === 'cpu');
    if (s == null){ if (cpuSeat != null){ cpuSeat = null; renderSide(); } return; }
    if (cpuSeat === s) return;
    const tok = ++cpuTok; cpuSeat = s; renderSide();
    const delay = G.cpuDelay ? G.cpuDelay(T.state, s) : 650;
    setTimeout(async () => {
      if (tok !== cpuTok) return;
      let a = null;
      try{ a = await G.cpu(clone(T.state), s, T.players[s].level ?? 1); }catch(e){ console.error(e); }
      if (tok !== cpuTok) return;
      cpuSeat = null;
      try{ doAct(s, a); }catch(e){ console.error('computer move refused', e, a); }
    }, delay);
  }
  function cancelCpu(){ cpuTok++; cpuSeat = null; }
  function uiAct(a){
    const s = actorSeat();
    if (s == null) return false;
    if (role === 'guest'){ if (!send({t:'act', a})) toast('Not connected right now'); return true; }
    try{ doAct(s, a); return true; }catch(e){ SND.bad(); toast(e.message || 'That move isn’t allowed'); return false; }
  }
  function save(){
    if (!T) return;
    if (role === 'host'){ store.set('host.' + T.code, T); tableIndex(T.code, G.id, 'host'); }
    else if (!role) store.set('save.' + G.id, {T, H:H.slice(-25)});
  }

  /* ---------- rendering ---------- */
  function render(){
    const vs = viewState(), viewer = viewerSeat(), actor = actorSeat();
    const c = current();
    const needCover = T && T.mode === 'local' && G.hidden && T.phase === 'play' && c != null && T.players[c].kind === 'human' && shown !== c;
    const ctx = {T, state:vs, prev:lastView, viewer, actor, mine:mySeats(), act:uiAct, hints:actor != null && T.meta ? !!T.meta.hints[actor] : false,
      players:T ? T.players : [], phase:T ? T.phase : null, over:T ? T.over : null, sfx:SND, toast, anim:prefs.anim, opts:T ? T.opts || {} : {},
      thinking:cpuSeat, current:c, covered:needCover, mode:T ? T.mode : null, now:() => Date.now() + (role === 'guest' ? skew : 0), live:sendLive, role};
    if (vs) G.render(ctx, stage);
    else if (!T && !role && G.onlineOnly){ stage.innerHTML = `<div class="intro" style="background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:clamp(20px,4vw,40px);box-shadow:var(--sh)">${G.intro || ''}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px"><button class="ib pri" data-intro="new">${ICON.plus}Create a game</button><button class="ib" data-intro="join">Join with a code</button></div></div>`; stage.querySelectorAll('[data-intro]').forEach(b => b.onclick = () => { openNew('online'); if (b.dataset.intro === 'join') setTimeout(() => $('#joinCode').focus(), 60); }); }
    else stage.innerHTML = '<div style="aspect-ratio:1;display:grid;place-items:center;color:var(--mut);font-weight:700">Waiting for the game…</div>';
    const old = stage.querySelector('.cover'); if (old) old.remove();
    if (needCover){
      const cv = document.createElement('div'); cv.className = 'cover';
      cv.innerHTML = `<div><h3></h3><p>Pass the device. Everyone else, look away!</p><button class="ib pri">Show my ${esc(G.handWord || 'cards')}</button></div>`;
      cv.querySelector('h3').textContent = T.players[c].name + '’s turn';
      cv.querySelector('button').onclick = () => { shown = c; render(); };
      stage.appendChild(cv);
    }
    lastView = vs;
    renderSide();
  }
  function endTitle(){
    const w = (T.over && T.over.winners) || [];
    if (!w.length) return T.over && T.over.title || 'Draw';
    const mine = mySeats();
    if (T.mode !== 'local' && mine.length && w.some(x => mine.includes(x))) return w.length > 1 ? 'You share the win!' : 'You win!';
    return w.map(x => T.players[x].name || seatName(x)).join(' & ') + (w.length > 1 ? ' win' : ' wins');
  }
  function statusText(vs){
    if (!T && !role && G.onlineOnly) return ['Play with family and friends', G.onlineNote || 'This game is played online, each person on their own device.'];
    if (!T) return role === 'guest' ? (netState === 'nohost' ? ['Can’t reach that game yet', 'The player who created it needs to have the game open. Retrying…'] : netState === 'offline' ? ['Connection trouble', 'Check your internet connection. Retrying…'] : ['Connecting…', 'Finding the game']) : ['', ''];
    if (T.phase === 'lobby') return role === 'host' ? ['Waiting for players', G.noCpu ? 'Share the invite, then press Start when everyone is in.' : 'Share the invite, then press Start. Empty seats are played by the computer.'] : ['Waiting to start', (T.players[0].name || 'The host') + ' will start the game soon'];
    if (T.phase === 'over') return [endTitle(), T.over.text || ''];
    const c = current(); if (c == null) return ['', ''];
    const p = T.players[c], mine = mySeats();
    let t = p.kind === 'cpu' ? p.name + ' is thinking…' : (T.mode !== 'local' && mine.includes(c) ? 'Your turn' : (p.name || seatName(c)) + '’s turn');
    let s = G.status ? G.status(vs, {viewer:viewerSeat(), actor:actorSeat(), T, now:() => Date.now() + (role === 'guest' ? skew : 0)}) || '' : '';
    if (G.statusTitle){ const tt = G.statusTitle(vs, {viewer:viewerSeat(), actor:actorSeat(), T, mine}); if (tt) t = tt; }
    if (role === 'guest' && !(hostConn && hostConn.open)) s = 'Lost touch with the host. Reconnecting…';
    else if (T.mode === 'online' && T.online && T.players.some((q, i) => q.kind === 'human' && !T.online[i] && i === c)) s = (p.name || 'This player') + ' isn’t connected right now';
    return [t, s];
  }
  function renderSide(){
    const vs = T && T.state ? (lastView || viewState()) : null;
    const [t, s] = statusText(vs);
    $('#stT').textContent = t; $('#stS').textContent = s;
    $('#modetag').textContent = !T && role === 'guest' ? 'Online' : !T ? '' : T.mode === 'online' ? 'Online · ' + String(T.code || '').toUpperCase() : T.mode === 'cpu' ? 'Versus computer' : 'Pass & play';
    // invite
    const inv = role === 'host' && T && (T.phase === 'lobby' || T.players.some(p => p.kind === 'open'));
    $('#invite').hidden = !inv; if (inv){ $('#invCode').textContent = T.code.toUpperCase(); famInvite(); }
    // players
    const pl = $('#plist'); pl.innerHTML = '';
    if (T){
      const mine = mySeats(), c = current();
      T.players.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'prow' + (c === i ? ' turn' : '');
        const online = T.mode === 'online' && T.online && T.online[i];
        let meta = '';
        if (p.kind === 'cpu') meta += `<span class="pill">Computer · ${LEVELS[p.level ?? 1]}</span>`;
        else if (p.kind === 'open') meta += `<span>Waiting for a player…</span>` + (role === 'host' && !G.noCpu ? `<button class="mini" data-cpu="${i}">Computer plays</button>` : '');
        else {
          if (T.mode === 'online' && !online && T.online) meta += `<span>Not connected</span>` + (role === 'host' && T.phase === 'play' && !G.noCpu ? `<button class="mini" data-cpu="${i}">Computer takes over</button>` : '');
          if (G.hintable && T.meta){
            const on = !!T.meta.hints[i], edit = T.mode === 'local' || mine.includes(i);
            meta += edit ? `<button class="pill ${on ? 'on' : ''}" data-hint="${i}" aria-pressed="${on}">${ICON.bulb}${esc(G.hintShort || 'Hints')}</button>` : `<span class="pill ${on ? 'on' : ''}">${ICON.bulb}${esc(G.hintShort || 'Hints')} ${on ? 'on' : 'off'}</span>`;
            meta += `<span title="Turns played with hints on">${T.meta.used[i]}/${T.meta.acts[i]} with hints</span>`;
          }
        }
        const sc = vs && G.score ? G.score(vs, i) : '';
        const base = p.name || (p.kind === 'open' ? 'Open seat' : seatName(i));
        const nm = base + (T.mode !== 'local' && mine.includes(i) && base !== 'You' ? ' (you)' : '');
        row.innerHTML = `<div class="sw8 ${online ? 'on' : ''}" style="background:${G.colors ? G.colors[i] : '#888'}"><b></b></div><div><div class="pnm"></div><div class="pmeta">${meta}</div></div><div class="psc"></div>`;
        row.querySelector('.pnm').textContent = nm;
        if (sc !== '' && sc != null){ const scEl = row.querySelector('.psc'); if (typeof sc === 'object'){ scEl.textContent = sc.v; const sm = document.createElement('small'); sm.textContent = sc.l; scEl.appendChild(sm); } else scEl.textContent = sc; }
        pl.appendChild(row);
      });
    }
    // actions
    const acts = [];
    const offline = T && !role;
    if (role === 'host' && T && T.phase === 'lobby') acts.push(`<button class="ib pri" id="aStart">${ICON.play}Start game</button>`);
    if (T && T.phase === 'over' && (!role || role === 'host' || mySeats().length)) acts.push(`<button class="ib pri" id="aAgain">${ICON.again}<span class="lt">Play again</span></button>`);
    if (offline && T.phase !== 'lobby') acts.push(`<button class="ib" id="aUndo" ${H.length ? '' : 'disabled'}>${ICON.undo}<span class="lt">Undo</span></button>`);
    if (G.resign && T && T.phase === 'play' && (T.mode === 'local' ? actorSeat() != null : mySeats().length)) acts.push(`<button class="ib warn" id="aResign">${ICON.flag}<span class="lt" id="resLbl">Resign</span></button>`);
    if (G.extraActions) acts.push(G.extraActions({T, actor:actorSeat(), role}) || '');
    acts.push(`<button class="ib" id="aRules">${ICON.book}<span class="lt">Rules</span></button>`);
    $('#acts').innerHTML = acts.join('');
    // log
    const lg = $('#log');
    if (T && T.log.length){
      lg.innerHTML = '';
      for (const e of T.log.slice(-80)){
        const d = document.createElement('div'), dot = document.createElement('i'), sp = document.createElement('span');
        dot.style.background = e.s >= 0 && G.colors ? G.colors[e.s] : 'transparent';
        sp.textContent = (e.s >= 0 ? (T.players[e.s].name || seatName(e.s)) + ' ' : '') + e.t;
        d.append(dot, sp); lg.appendChild(d);
      }
      const pane = $('#pLog'); pane.scrollTop = pane.scrollHeight;
    } else lg.innerHTML = '<p class="empty">Moves appear here.</p>';
    // chat
    const online = T && T.mode === 'online' || role === 'guest';
    $('#tChat').hidden = !online; $('#tabs').hidden = !online;
    if (!online && $('#tChat').getAttribute('aria-selected') === 'true') selTab('log');
    if (T && online) renderChat(T.chat || []);
  }
  function renderChat(list){
    const log = $('#chatlog'); log.textContent = '';
    for (const m of list){
      const div = document.createElement('div'), mine = mySeats().includes(m.s);
      div.className = 'msg' + (mine ? ' me' : '');
      const sm = document.createElement('small'); sm.textContent = mine ? 'You' : (m.n || 'Player');
      div.append(sm, document.createTextNode(String(m.t || '').slice(0, 200)));
      log.appendChild(div);
    }
    if (list.length > chatN && chatInit && $('#pChat').hidden && list.length && !mySeats().includes(list[list.length - 1].s)){ $('#chatBadge').classList.add('show'); SND.notify(); }
    chatN = list.length; chatInit = true; log.scrollTop = log.scrollHeight;
  }
  function selTab(w){
    $('#tLog').setAttribute('aria-selected', w === 'log'); $('#tChat').setAttribute('aria-selected', w === 'chat');
    $('#pLog').hidden = w !== 'log'; $('#pChat').hidden = w !== 'chat';
    if (w === 'chat'){ $('#chatBadge').classList.remove('show'); const l = $('#chatlog'); l.scrollTop = l.scrollHeight; }
  }
  $('#tLog').onclick = () => selTab('log'); $('#tChat').onclick = () => selTab('chat');
  function showEnd(){
    if (!T || T.phase !== 'over') return;
    $('#endT').textContent = endTitle(); $('#endWhy').textContent = T.over.text || '';
    const vs = viewState();
    $('#endStats').innerHTML = T.players.map((p, i) => {
      const sc = vs && G.score ? G.score(vs, i) : '';
      const scs = sc && typeof sc === 'object' ? sc.v + ' ' + sc.l : sc;
      return `<div><b>${esc(scs === '' || scs == null ? '—' : scs)}</b><small>${esc(p.name || seatName(i))}${G.hintable && p.kind === 'human' && T.meta ? ` · hints ${T.meta.used[i]}/${T.meta.acts[i]}` : ''}</small></div>`;
    }).join('');
    $('#eAgain').hidden = role === 'guest' && !mySeats().length;
    const w = T.over.winners || [], mine = mySeats();
    const iWon = w.length && (T.mode === 'local' ? T.players.some((p, i) => w.includes(i) && p.kind === 'human') : w.some(x => mine.includes(x)));
    if (iWon){ SND.win(); confetti(); } else if (w.length && mine.length) SND.lose(); else SND.good();
    openOv('ovEnd');
  }

  /* ---------- side panel events ---------- */
  document.addEventListener('click', e => {
    const hb = e.target.closest('[data-hint]');
    if (hb){ toggleHints(+hb.dataset.hint); return; }
    const cb = e.target.closest('[data-cpu]');
    if (cb && role === 'host'){ const i = +cb.dataset.cpu, p = T.players[i]; p.kind = 'cpu'; p.level = p.level ?? prefs.level; if (!p.name) p.name = cpuName(i, T.players.length); if (T.meta) T.meta.hints[i] = false; afterChange(); return; }
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'aStart' && role === 'host') startPlay();
    else if (id === 'aAgain' || id === 'eAgain'){ closeOv('ovEnd'); playAgain(); }
    else if (id === 'aUndo') undo();
    else if (id === 'aRules') openOv('ovRules');
    else if (id === 'aResign') resign();
    else if (id === 'eNew'){ closeOv('ovEnd'); openNew(); }
  });
  function toggleHints(i){
    if (!T || !T.meta) return;
    const editable = T.mode === 'local' || mySeats().includes(i);
    if (!editable) return;
    const on = !T.meta.hints[i];
    if (T.mode !== 'local'){ prefs.hints = on; savePrefs(); }
    toast(on ? 'Hints on · everyone can see this' : 'Hints off');
    if (role === 'guest'){ send({t:'hint', on}); return; }
    T.meta.hints[i] = on; T.players[i].hints = on; afterChange();
  }
  function playAgain(){
    if (role === 'guest'){ if (send({t:'again'})) toast('Asked the host to play again'); return; }
    if (!T) return;
    cancelCpu(); T.round = (T.round || 1) + 1; T.first = ((T.first || 0) + 1) % T.players.length;
    startPlay();
  }
  function undo(){
    if (role || !H.length) return;
    cancelCpu(); T = H.pop(); shown = null; overShown = T.phase === 'over'; lastView = null; closeOv('ovEnd');
    afterChange();
  }
  let resignArm = 0;
  function resign(){
    if (Date.now() - resignArm > 3000){ resignArm = Date.now(); toast('Tap Resign again to confirm'); return; }
    resignArm = 0;
    const s = T.mode === 'local' ? actorSeat() : mySeats()[0];
    if (s == null) return;
    if (role === 'guest'){ send({t:'resign'}); return; }
    doResign(s);
  }
  function doResign(s){
    if (!T || T.phase !== 'play') return;
    cancelCpu();
    const others = T.players.map((p, i) => i).filter(i => i !== s);
    T.phase = 'over'; T.over = {winners:others, text:(T.players[s].name || seatName(s)) + ' resigned'};
    T.log.push({s, t:'resigned'}); afterChange();
  }

  /* ---------- new game dialog ---------- */
  const NG = {mode:prefs.mode[G.id] || 'cpu', players:prefs.players[G.id] || G.defaultPlayers || N_MIN, opts:Object.assign({}, Object.fromEntries((G.options || []).map(o => [o.key, o.def])), prefs.opts[G.id] || {})};
  const pressed = (el, v) => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v) === String(v)));
  function renderNew(){
    if (G.onlineOnly){ NG.mode = 'online'; $('#ngMode').hidden = true; }
    pressed($('#ngMode'), NG.mode);
    const minP = NG.mode === 'cpu' ? Math.max(N_MIN, G.soloOk ? 1 : 2) : Math.max(N_MIN, 2);
    $('#ngPlayers').querySelectorAll('button').forEach(b => { b.hidden = +b.dataset.v < minP; });
    if (NG.players < minP) NG.players = minP;
    pressed($('#ngPlayers'), NG.players);
    $('#plNote').textContent = NG.mode === 'cpu' ? (NG.players === 1 ? 'Just you' : 'You + ' + (NG.players - 1) + ' computer' + (NG.players > 2 ? 's' : '')) : NG.mode === 'online' ? (G.noCpu ? 'Up to this many; unused seats are dropped when you start' : 'Empty seats can be computer players') : '';
    $('#ngPl').hidden = N_MAX === N_MIN || (N_MAX === 2 && NG.mode !== 'cpu');
    $('#ngLv').hidden = NG.mode === 'local' || (NG.mode === 'cpu' && NG.players === 1) || G.noCpu;
    pressed($('#ngLevel'), prefs.level);
    for (const o of G.options || []){ const el = document.querySelector(`[data-opt="${o.key}"] .chips`); pressed(el, NG.opts[o.key]); }
    if ($('#ngHints')) $('#ngHints').setAttribute('aria-checked', prefs.hints);
    $('#ngOnline').hidden = NG.mode !== 'online';
    const ok = typeof window.Peer === 'function';
    $('#myName').value = prefs.name || '';
    $('#onNote').textContent = !ok ? 'Online play couldn’t load. Check your internet connection and reload the page.'
      : `Create a game, then send the link or code${N_MAX > 2 ? ' to up to ' + (N_MAX - 1) + ' others' : ''}. No accounts needed. Everyone keeps the game open while you play.`;
    $('#ngGo').textContent = NG.mode === 'online' ? 'Create online game' : 'Start game';
    $('#ngGo').disabled = NG.mode === 'online' && !ok;
    if (NG.mode === 'online') loadMyGames();
  }
  function openNew(mode){ if (mode) NG.mode = mode; renderNew(); openOv('ovNew'); }
  $('#bNew').onclick = () => openNew();
  $('#ngMode').onclick = e => { const b = e.target.closest('button'); if (b){ NG.mode = b.dataset.v; renderNew(); } };
  $('#ngPlayers').onclick = e => { const b = e.target.closest('button'); if (b){ NG.players = +b.dataset.v; renderNew(); } };
  $('#ngLevel').onclick = e => { const b = e.target.closest('button'); if (b){ prefs.level = +b.dataset.v; savePrefs(); renderNew(); } };
  for (const o of G.options || []) document.querySelector(`[data-opt="${o.key}"] .chips`).onclick = e => { const b = e.target.closest('button'); if (!b) return; const ch = o.choices.find(c => String(c[0]) === b.dataset.v); NG.opts[o.key] = ch ? ch[0] : o.def; renderNew(); };
  if ($('#ngHints')) $('#ngHints').onclick = () => { prefs.hints = !prefs.hints; savePrefs(); renderNew(); };
  $('#myName').oninput = e => { prefs.name = e.target.value.slice(0, 24); savePrefs(); };
  $('#ngGo').onclick = () => {
    prefs.mode[G.id] = NG.mode; prefs.players[G.id] = NG.players; prefs.opts[G.id] = NG.opts; savePrefs();
    closeOv('ovNew');
    if (NG.mode === 'online'){ hostCreate(N_MAX === 2 ? 2 : NG.players); return; }
    leaveOnline(); cancelCpu();
    T = newTable(NG.mode, NG.mode === 'cpu' || N_MAX > 2 ? NG.players : 2, prefs.level, NG.opts);
    startPlay();
  };
  $('#joinForm').onsubmit = e => { e.preventDefault(); const v = $('#joinCode').value; if (v.trim()){ closeOv('ovNew'); join(v); } };
  function loadMyGames(){
    const el = $('#myGames'), ix = store.get('tables', {});
    const rows = Object.entries(ix).filter(([, v]) => v.game === G.id).sort((a, b) => b[1].at - a[1].at).slice(0, 10);
    if (!rows.length){ el.innerHTML = '<p class="empty">No online games yet.</p>'; return; }
    el.textContent = '';
    for (const [code, v] of rows){
      const b = document.createElement('button'), l = document.createElement('span'), r = document.createElement('small');
      const t = v.role === 'host' ? store.get('host.' + code, null) : null;
      l.textContent = (v.role === 'host' ? 'You host' : 'You joined') + ' · ' + code.toUpperCase() + (t ? ' · ' + t.players.filter(p => p.kind !== 'open').map(p => p.name).join(', ') : '');
      r.textContent = t ? (t.phase === 'over' ? 'Finished' : t.phase === 'lobby' ? 'Not started' : 'In progress') : 'Rejoin';
      b.append(l, r); b.onclick = () => { closeOv('ovNew'); join(code); };
      el.appendChild(b);
    }
  }
  // settings
  $('#bSet').onclick = () => {
    $('#setName').value = prefs.name || '';
    document.querySelectorAll('[data-pref]').forEach(b => b.setAttribute('aria-checked', !!prefs[b.dataset.pref]));
    openOv('ovSet');
  };
  $('#setName').oninput = e => { prefs.name = e.target.value.slice(0, 24); savePrefs(); };
  document.querySelectorAll('[data-pref]').forEach(b => b.onclick = () => { const k = b.dataset.pref; prefs[k] = !prefs[k]; savePrefs(); b.setAttribute('aria-checked', prefs[k]); if (k === 'sound' && prefs.sound) SND.move(); if (T) render(); });

  /* ---------- online: hosting ---------- */
  function send(m){ try{ if (hostConn && hostConn.open){ hostConn.send(m); return true; } }catch(e){} return false; }
  function leaveOnline(){
    clearTimeout(retryT);
    for (const [c] of conns){ try{ c.close(); }catch(e){} }
    conns.clear();
    if (hostConn){ try{ hostConn.close(); }catch(e){} hostConn = null; }
    if (peer){ try{ peer.destroy(); }catch(e){} peer = null; }
    role = null; netState = ''; curCode = null;
    if (location.hash.startsWith('#g-')){ try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){ location.hash = ''; } }
  }
  function hostCreate(n){
    leaveOnline(); cancelCpu();
    T = newTable('online', n, prefs.level, NG.opts);
    T.code = genCode();
    hostResume(T);
  }
  function hostResume(t){
    leaveOnline(); cancelCpu();
    T = t; role = 'host'; curCode = T.code; T.players[0].name = (prefs.name || '').trim() ? myName() : 'Player 1'; H = [];
    overShown = T.phase === 'over'; shown = null; lastView = null; chatInit = false; chatN = 0;
    try{ location.hash = 'g-' + T.code; }catch(e){}
    hostPeer();
    afterChange();
  }
  function onlineFlags(){
    const f = T.players.map(() => false);
    T.players.forEach((p, i) => { if (p.pid === PID) f[i] = true; });
    for (const [c, info] of conns) if (c.open && info.seat != null && Date.now() - info.last < 12000) f[info.seat] = true;
    return f;
  }
  function viewFor(seat){
    const v = Object.assign({}, T, {players:T.players.map(p => ({name:p.name, kind:p.kind, level:p.level})), state:T.state && G.view ? G.view(clone(T.state), seat) : T.state, you:seat, online:T.online});
    return v;
  }
  function broadcast(){
    T.online = onlineFlags();
    for (const [c, info] of conns){ if (c.open && info.seat != null){ try{ c.send({t:'table', T:viewFor(info.seat)}); }catch(e){} } }
  }
  function hostPeer(){
    const code = T.code;
    netState = 'starting';
    const p = peer = new Peer(NETP + code, PEER_OPTS);
    p.on('open', () => { if (peer === p){ netState = 'ready'; renderSide(); } });
    p.on('connection', conn => {
      conn.on('data', m => { if (peer === p) hostMsg(conn, m); });
      conn.on('close', () => { if (conns.has(conn)){ conns.delete(conn); if (T && role === 'host'){ broadcast(); renderSide(); } } });
      conn.on('error', () => {});
    });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) setTimeout(() => { try{ p.reconnect(); }catch(e){} }, 2000); });
    p.on('error', err => {
      if (peer !== p) return;
      if (err.type === 'unavailable-id' || ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)){
        netState = err.type === 'unavailable-id' ? 'waitid' : 'offline'; renderSide(); p.destroy();
        retryT = setTimeout(() => { if (role === 'host' && T && T.code === code) hostPeer(); }, 5000);
      }
    });
  }
  function hostMsg(conn, m){
    if (!m || typeof m !== 'object' || !T) return;
    const info = conns.get(conn);
    if (info) info.last = Date.now();
    if (m.t === 'which'){ try{ conn.send({t:'game', id:G.id}); }catch(e){} return; }
    if (m.t === 'hello'){
      if (m.game && m.game !== G.id){ try{ conn.send({t:'game', id:G.id}); }catch(e){} return; }
      const pid = String(m.pid || '').slice(0, 20); let name = String(m.name || '').trim().slice(0, 24);
      let seat = T.players.findIndex(p => p.pid === pid && p.kind !== 'open');
      if (seat < 0 && T.phase === 'lobby') seat = T.players.findIndex(p => p.kind === 'open');
      if (seat < 0){ try{ conn.send({t:'full'}); }catch(e){} setTimeout(() => conn.close(), 400); return; }
      if (!name || name === 'Player') name = 'Player ' + (seat + 1);
      for (const [c, inf] of conns) if (inf.seat === seat && c !== conn){ conns.delete(c); try{ c.close(); }catch(e){} }
      conns.set(conn, {pid, seat, last:Date.now()});
      const was = T.players[seat];
      T.players[seat] = Object.assign({}, was, {name, kind:'human', pid, hints:!!m.hints});
      if (T.meta) T.meta.hints[seat] = was.kind === 'human' ? T.meta.hints[seat] : !!m.hints;
      try{ conn.send({t:'time', h:Date.now(), g:+m.g || 0}); }catch(e){}
      if (was.kind === 'open') T.log.push({s:seat, t:'joined'});
      SND.notify();
      if (T.phase === 'lobby' && !T.players.some(p => p.kind === 'open') && N_MAX === 2) startPlay();
      else { if (was.kind === 'cpu' && T.phase === 'play') cancelCpu(); afterChange(); }
      return;
    }
    if (!info) return;
    const seat = info.seat;
    if (m.t === 'act'){ try{ doAct(seat, m.a); }catch(e){ try{ conn.send({t:'err', msg:e.message || 'That move isn’t allowed'}); }catch(x){} } }
    else if (m.t === 'chat'){ const text = String(m.text || '').trim().slice(0, 200); if (text){ T.chat = (T.chat || []).concat([{s:seat, n:T.players[seat].name, t:text}]).slice(-50); afterChange(); } }
    else if (m.t === 'hint' && T.meta){ T.meta.hints[seat] = !!m.on; T.players[seat].hints = !!m.on; afterChange(); }
    else if (m.t === 'again' && T.phase === 'over') playAgain();
    else if (m.t === 'resign') doResign(seat);
    else if (m.t === 'ping'){ try{ conn.send({t:'pong'}); }catch(e){} }
    else if (m.t === 'live' && G.onLive){ relayLive(seat, m.d, conn); }
  }
  function relayLive(seat, d, except){
    let txt = ''; try{ txt = JSON.stringify(d); }catch(e){ return; }
    if (txt.length > 12000) return;
    for (const [c, info] of conns) if (c !== except && c.open && info.seat != null){ try{ c.send({t:'live', s:seat, d}); }catch(e){} }
    if (seat !== (mySeats()[0] ?? -2)) { try{ G.onLive(d, seat, liveCtx()); }catch(e){} }
  }
  const liveCtx = () => ({viewer:viewerSeat(), stage, T});
  function sendLive(d){
    if (role === 'guest') send({t:'live', d});
    else if (role === 'host') relayLive(mySeats()[0] ?? 0, d, null);
  }

  /* ---------- online: joining ---------- */
  function join(raw){
    const code = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (code.length < 4){ toast('That code looks too short'); return; }
    const mine = store.get('host.' + code, null);
    if (mine && mine.game === G.id){ hostResume(mine); return; }
    if (typeof window.Peer !== 'function'){ toast('Online play couldn’t load. Check your connection.'); return; }
    leaveOnline(); cancelCpu();
    role = 'guest'; curCode = code; T = null; netState = 'connecting'; lastView = null; overShown = false; chatInit = false; chatN = 0;
    try{ location.hash = 'g-' + code; }catch(e){}
    tableIndex(code, G.id, 'guest');
    render();
    const p = peer = new Peer(PEER_OPTS);
    p.on('open', () => { if (peer === p) connectHost(code); });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) setTimeout(() => { try{ p.reconnect(); }catch(e){} }, 2000); });
    p.on('error', err => {
      if (peer !== p) return;
      if (err.type === 'peer-unavailable'){ netState = 'nohost'; render(); retryHost(code); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)){ netState = 'offline'; render(); retryHost(code); }
    });
  }
  function retryHost(code){
    clearTimeout(retryT);
    retryT = setTimeout(() => { if (role === 'guest' && peer && !(hostConn && hostConn.open)){ if (peer.disconnected){ try{ peer.reconnect(); }catch(e){} } else connectHost(code); } }, 4000);
  }
  function connectHost(code){
    const p = peer, conn = p.connect(NETP + code, {reliable:true});
    const giveUp = setTimeout(() => { if (!conn.open){ try{ conn.close(); }catch(e){} if (peer === p){ netState = 'nohost'; render(); retryHost(code); } } }, 12000);
    conn.on('open', () => {
      clearTimeout(giveUp);
      if (peer !== p){ conn.close(); return; }
      hostConn = conn; hostSeen = Date.now(); netState = 'ready';
      conn.send({t:'hello', game:G.id, pid:PID, name:myName(), hints:prefs.hints, g:Date.now()});
    });
    conn.on('data', m => {
      if (hostConn !== conn || !m || typeof m !== 'object') return;
      hostSeen = Date.now();
      if (m.t === 'table' && m.T && typeof m.T === 'object'){
        const wasPhase = T && T.phase;
        T = m.T; T.mode = 'online'; lobbyUpdate();
        if (T.phase === 'play' && wasPhase && wasPhase !== 'play') overShown = false;
        render();
        if (T.phase === 'over' && !overShown){ overShown = true; if (wasPhase) setTimeout(showEnd, G.endDelay ?? 900); }
      }
      else if (m.t === 'time'){ const r = Date.now(); skew = (+m.h || r) - ((+m.g || r) + r) / 2; }
      else if (m.t === 'live' && G.onLive && T){ try{ G.onLive(m.d, +m.s, liveCtx()); }catch(e){} }
      else if (m.t === 'err'){ SND.bad(); toast(String(m.msg || 'That move isn’t allowed').slice(0, 120)); }
      else if (m.t === 'game' && typeof m.id === 'string' && /^[a-z]+$/.test(m.id) && m.id !== G.id){ location.href = '../' + m.id + '/#g-' + code; }
      else if (m.t === 'full'){ toast('That game is already full'); leaveOnline(); boot(true); }
    });
    conn.on('close', () => { clearTimeout(giveUp); if (hostConn === conn){ hostConn = null; netState = 'nohost'; render(); retryHost(code); } });
    conn.on('error', () => {});
  }
  setInterval(() => {
    if (role === 'guest'){ send({t:'ping'}); if (hostConn && Date.now() - hostSeen > 12000){ try{ hostConn.close(); }catch(e){} } }
    if (role === 'host' && T){ const before = JSON.stringify(T.online || []); T.online = onlineFlags(); if (JSON.stringify(T.online) !== before){ broadcast(); renderSide(); } }
  }, 4000);
  const inviteLink = () => location.origin + location.pathname + '#g-' + T.code;
  $('#bShare').onclick = () => {
    if (!T || !T.code) return;
    if (navigator.share){ navigator.share({title:G.name + ' · Game Hall', text:`Play ${G.name} with me! Game code ${T.code.toUpperCase()}`, url:inviteLink()}).catch(() => {}); return; }
    copyText(`Play ${G.name} with me in Game Hall: ${inviteLink()}  (game code ${T.code.toUpperCase()})`, 'Invite copied');
  };
  if (navigator.share) $('#bShare').lastChild.textContent = 'Share invite';
  $('#bCode').onclick = () => { if (T && T.code) copyText(T.code.toUpperCase(), 'Code copied'); };
  $('#quick').onclick = e => { const b = e.target.closest('button'); if (b) sendChat(b.textContent); };
  $('#chatForm').onsubmit = e => { e.preventDefault(); sendChat($('#chatIn').value); $('#chatIn').value = ''; };
  function sendChat(text){
    text = String(text).trim().slice(0, 200); if (!text || !T) return;
    if (role === 'guest'){ if (!send({t:'chat', text})) toast('Not connected right now'); return; }
    if (role === 'host'){ const s = mySeats()[0] ?? 0; T.chat = (T.chat || []).concat([{s, n:T.players[s].name, t:text}]).slice(-50); afterChange(); }
  }
  window.addEventListener('hashchange', () => { const m = /^#g-([a-z0-9]{4,12})$/.exec(location.hash); if (m && m[1] !== curCode) join(m[1]); });

  /* ---------- family room (who's online) ---------- */
  function lobbyInfo(){
    let table = null;
    if (T && T.code && role){
      table = {code:T.code, game:G.id, host:role === 'host', open:T.players.filter(p => p.kind === 'open').length, phase:T.phase,
        players:T.players.filter(p => p.kind === 'human').map(p => p.name || 'Player')};
    }
    return {where:G.id, game:G.name, table};
  }
  function lobbyUpdate(){ if (window.Lobby) Lobby.update(); }
  const invited = new Set();
  function famInvite(){
    const box = $('#famInv'); if (!box) return;
    if (!window.Lobby || !Lobby.room || !T || role !== 'host'){ box.innerHTML = ''; return; }
    const inGame = new Set(T.players.map(p => p.name));
    const ppl = Lobby.roster.filter(p => p.pid !== Lobby.myPid() && !(p.table && p.table.code === T.code));
    box.innerHTML = ppl.length ? '<div style="font-weight:800;font-size:14px;margin:12px 0 6px">Family online now</div>' : `<div style="font-size:13px;color:var(--mut);margin-top:10px">Nobody else from your family room is online right now.</div>`;
    for (const p of ppl){
      const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px';
      const nm = document.createElement('span'); nm.style.fontWeight = '700'; nm.textContent = p.name + (p.table ? ' · in a game' : '');
      const b = document.createElement('button'); b.className = 'mini'; const key = p.pid + T.code;
      b.textContent = invited.has(key) ? 'Invited' : 'Invite'; b.disabled = invited.has(key);
      b.onclick = () => { if (Lobby.invite(p.pid, G.id, T.code, G.name)){ invited.add(key); b.textContent = 'Invited'; b.disabled = true; toast('Invite sent to ' + p.name); } else toast('Not connected to your family room yet'); };
      row.append(nm, b); box.appendChild(row);
    }
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', {scope:'../'}).catch(() => {});
  (function loadLobby(){
    const go = () => { Lobby.start({getInfo:lobbyInfo}); Lobby.onChange(famInvite); };
    if (window.Lobby) go();
    else { const sc = document.createElement('script'); sc.src = '../shared/lobby.js'; sc.onload = go; document.head.appendChild(sc); }
  })();

  /* ---------- boot ---------- */
  function boot(skipHash){
    const m = !skipHash && /^#g-([a-z0-9]{4,12})$/.exec(location.hash);
    if (m){ join(m[1]); return; }
    let ah = null; try{ ah = JSON.parse(sessionStorage.getItem('gamehall.autohost') || 'null'); }catch(e){}
    if (ah && ah.game === G.id && typeof window.Peer === 'function'){
      try{ sessionStorage.removeItem('gamehall.autohost'); }catch(e){}
      hostCreate(N_MAX === 2 ? 2 : Math.max(2, NG.players));
      (Array.isArray(ah.to) ? ah.to : []).forEach(pid => setTimeout(() => window.Lobby && Lobby.invite(String(pid), G.id, T.code, G.name), 600));
      if (ah.to && ah.to.length) toast('Invite sent. The game starts when they join.');
      return;
    }
    if (G.onlineOnly){ T = null; render(); return; }
    const sv = store.get('save.' + G.id, null);
    if (sv && sv.T && sv.T.state && sv.T.game === G.id){
      T = sv.T; H = Array.isArray(sv.H) ? sv.H : []; overShown = T.phase === 'over';
      try{ render(); scheduleCpu(); return; }catch(e){ console.error('saved game unreadable', e); }
    }
    T = newTable(NG.mode === 'online' ? 'cpu' : NG.mode, NG.mode === 'cpu' ? NG.players : Math.max(2, NG.players), prefs.level, NG.opts);
    startPlay();
  }
  setTimeout(() => boot(), 0);   // after the game's own script has finished defining its helpers
  return {toast, SND, refresh:() => { if (T) render(); }};
}

return {run, esc, clone, SND, toast, store, prefs, LEVELS};
})();
