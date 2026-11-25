/* Game Hall family room: who's online, open games and invites, with no server.
   Everyone who types the same family room name meets at one well-known connection id.
   The first device to claim that id becomes the "room keeper" and relays the list;
   if it closes, another device claims the id a few seconds later. */
window.Lobby = window.Lobby || (() => {
  const script = document.currentScript;
  const ROOT = new URL('../', script && script.src ? script.src : location.href).href;
  const get = (k, d) => { try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } };
  const set = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  const OPTS = {debug:0, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}, {urls:'stun:global.stun.twilio.com:3478'}]}};
  { const bk = /^([a-z0-9.-]+):(\d{2,5})$/i.exec(new URLSearchParams(location.search).get('broker') || ''); if (bk) Object.assign(OPTS, {host:bk[1], port:+bk[2], path:'/', secure:location.protocol === 'https:' && bk[1] !== 'localhost'}); }
  let peer = null, conn = null, keeper = false, members = new Map(), roster = [], state = 'off', retryT = 0, started = false, updT = 0;
  let getInfo = () => ({where:'hub'});
  let outbox = [], held = [];
  const listeners = [];
  const room = () => String(get('gamehall.room', '') || '').trim().toLowerCase();
  function myPid(){ let p = get('gamehall.pid', null); if (!p){ p = Math.random().toString(36).slice(2, 12); set('gamehall.pid', p); } return p; }
  function myName(){ const g = get('gamehall.prefs', {}), c = get('chesshall.prefs', {}); return String(g.name || c.name || '').trim().slice(0, 24) || 'Someone'; }
  function hash(s, seed){ let h = seed >>> 0; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const roomId = () => 'gamehall-room-v1-' + hash(room(), 2166136261) + hash(room() + '#gh', 2654435761);
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, n);
  function clean(i){
    if (!i || typeof i !== 'object') return null;
    const t = i.table && typeof i.table === 'object' ? i.table : null;
    return {pid:str(i.pid, 20), name:str(i.name, 24) || 'Someone', where:/^[a-z]{2,20}$/.test(i.where) ? i.where : 'hub', game:str(i.game, 30), at:+i.at || Date.now(),
      table:t && /^[a-z0-9]{4,12}$/.test(t.code) && /^[a-z]{2,20}$/.test(t.game) ? {code:t.code, game:t.game, open:Math.max(0, Math.min(8, +t.open || 0)), phase:['lobby', 'play', 'over'].includes(t.phase) ? t.phase : 'play', host:!!t.host, players:Array.isArray(t.players) ? t.players.slice(0, 8).map(p => str(p, 24)) : []} : null};
  }
  function me(){ const i = getInfo() || {}; return clean({pid:myPid(), name:myName(), where:i.where || 'hub', game:i.game || '', table:i.table || null, at:Date.now()}); }
  function emit(){ for (const f of listeners){ try{ f(); }catch(e){} } }
  function cleanup(){
    clearTimeout(retryT);
    if (conn){ try{ conn.close(); }catch(e){} conn = null; }
    if (peer){ try{ peer.destroy(); }catch(e){} peer = null; }
    keeper = false; members.clear();
  }
  function connect(){
    cleanup();
    if (!room() || typeof window.Peer !== 'function'){ state = room() ? 'unavailable' : 'off'; roster = []; emit(); return; }
    state = 'connecting'; emit();
    const p = peer = new Peer(roomId(), OPTS);
    p.on('open', () => { if (peer !== p) return; keeper = true; state = 'on'; rebuild(); flush(); });
    p.on('connection', c => {
      c.on('data', m => { if (peer === p) keeperMsg(c, m); });
      c.on('close', () => { if (members.delete(c)) rebuild(); });
      c.on('error', () => {});
    });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) setTimeout(() => { try{ p.reconnect(); }catch(e){} }, 2000); });
    p.on('error', err => {
      if (peer !== p) return;
      if (err.type === 'unavailable-id'){ try{ p.destroy(); }catch(e){} peer = null; joinMember(); }
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) retryLater(5000);
    });
  }
  function joinMember(){
    const p = peer = new Peer(OPTS);
    p.on('open', () => {
      if (peer !== p) return;
      const c = p.connect(roomId(), {reliable:true});
      const giveUp = setTimeout(() => { if (!c.open && peer === p) retryLater(); }, 10000);
      c.on('open', () => { clearTimeout(giveUp); if (peer !== p){ c.close(); return; } conn = c; keeper = false; state = 'on'; c.send({t:'me', info:me()}); emit(); flush(); });
      c.on('data', m => { if (conn === c) memberMsg(m); });
      c.on('close', () => { if (conn === c){ conn = null; retryLater(); } });
      c.on('error', () => {});
    });
    p.on('error', err => { if (peer === p && (err.type === 'peer-unavailable' || ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type))) retryLater(); });
  }
  function retryLater(ms){ cleanup(); state = 'connecting'; emit(); retryT = setTimeout(connect, ms || 500 + Math.random() * 2500); }
  function keeperMsg(c, m){
    if (!m || typeof m !== 'object') return;
    if (m.t === 'me'){ const i = clean(m.info); if (i){ i.at = Date.now(); members.set(c, i); rebuild();
      const due = held.filter(h => h.m.to === i.pid && Date.now() - h.at < 90000); held = held.filter(h => !due.includes(h) && Date.now() - h.at < 90000);
      for (const h of due){ try{ c.send(h.m); }catch(e){} } } }
    else if (m.t === 'invite') deliver(m);
  }
  function memberMsg(m){
    if (!m || typeof m !== 'object') return;
    if (m.t === 'roster' && Array.isArray(m.list)){ roster = m.list.map(clean).filter(Boolean); emit(); }
    else if (m.t === 'invite') showInvite(m);
  }
  function rebuild(){
    if (!keeper) return;
    const now = Date.now(), byPid = new Map();
    for (const [c, i] of members){ if (now - i.at > 40000){ members.delete(c); try{ c.close(); }catch(e){} continue; } }
    for (const i of [me(), ...members.values()]){ const old = byPid.get(i.pid); if (!old || old.at <= i.at || i.table) byPid.set(i.pid, i); }
    roster = [...byPid.values()];
    for (const [c] of members){ try{ c.send({t:'roster', list:roster}); }catch(e){} }
    emit();
  }
  function deliver(m){
    const to = str(m.to, 20); let sent = false;
    if (to === myPid()){ showInvite(m); sent = true; }
    for (const [c, i] of members) if (i.pid === to){ try{ c.send(m); sent = true; }catch(e){} }
    if (!sent) held.push({m:Object.assign({}, m, {to}), at:Date.now()});
  }
  function flush(){ const o = outbox; outbox = []; for (const m of o){ if (Date.now() - m.at > 90000) continue; delete m.at; if (keeper) deliver(m); else if (conn && conn.open){ try{ conn.send(m); }catch(e){} } } }
  function update(){
    clearTimeout(updT);
    updT = setTimeout(() => { if (keeper) rebuild(); else if (conn && conn.open){ try{ conn.send({t:'me', info:me()}); }catch(e){} } }, 250);
  }
  function invite(to, game, code, gname){
    const m = {t:'invite', to, from:myName(), fromPid:myPid(), game, code, gname};
    if (keeper) deliver(m); else if (conn && conn.open) conn.send(m); else { if (!room()) return false; outbox.push(Object.assign(m, {at:Date.now()})); }
    return true;
  }
  /* ---------- invite pop-up ---------- */
  function tone(){ try{ const a = new (window.AudioContext || window.webkitAudioContext)(); [880, 1175, 1568].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * .1; o.frequency.value = f; o.type = 'triangle'; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.08, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .35); }); }catch(e){} }
  function showInvite(m){
    const game = str(m.game, 20), code = str(m.code, 12);
    if (!/^[a-z]{2,20}$/.test(game) || !/^[a-z0-9]{4,12}$/.test(code)) return;
    const el = document.createElement('div');
    el.setAttribute('role', 'alertdialog');
    el.style.cssText = 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:90;max-width:min(360px,calc(100vw - 32px));background:#2a1620;color:#f6ecef;border:2px solid #e3b75c;border-radius:18px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.55);font:15px/1.4 Manrope,system-ui,sans-serif;animation:ghpop .35s cubic-bezier(.2,.8,.3,1.2)';
    el.innerHTML = '<style>@keyframes ghpop{from{transform:translateY(30px) scale(.9);opacity:0}}</style><div style="font:700 20px/1.2 Fraunces,Georgia,serif;margin-bottom:4px"></div><div class="w" style="color:#d9c3cf;margin-bottom:12px"></div><div style="display:flex;gap:8px"><button data-j style="flex:1;min-height:44px;border-radius:12px;border:0;background:#e3b75c;color:#21120a;font:800 15px Manrope,system-ui,sans-serif;cursor:pointer">Join</button><button data-n style="flex:1;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#f6ecef;font:700 15px Manrope,system-ui,sans-serif;cursor:pointer">Not now</button></div>';
    el.firstElementChild.nextElementSibling.textContent = str(m.from, 24) + ' invited you!';
    el.querySelector('.w').textContent = 'Come play ' + (str(m.gname, 30) || game) + '.';
    el.querySelector('[data-j]').onclick = () => { location.href = ROOT + game + '/' + location.search + '#g-' + code; };
    el.querySelector('[data-n]').onclick = () => el.remove();
    document.body.appendChild(el); tone();
    setTimeout(() => el.remove(), 90000);
  }
  /* ---------- public ---------- */
  function start(o){
    if (o && o.getInfo) getInfo = o.getInfo;
    if (started){ update(); return; }
    started = true; connect();
    setInterval(() => { if (keeper) rebuild(); else if (conn && conn.open){ try{ conn.send({t:'me', info:me()}); }catch(e){} } }, 10000);
    addEventListener('pagehide', () => cleanup());
  }
  function setRoom(name){ set('gamehall.room', String(name || '').trim().toLowerCase().slice(0, 40)); if (started) connect(); else start(); }
  return {start, update, invite, setRoom, root:ROOT, myPid,
    onChange(f){ listeners.push(f); },
    get roster(){ return roster; }, get state(){ return state; }, get room(){ return room(); }};
})();
