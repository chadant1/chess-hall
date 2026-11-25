/* Game Hall offline support. Pages and files come from the network when it is there
   (so updates show up straight away) and from this cache when it is not. */
const CACHE = 'gamehall-v3';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'shared/hall.css', 'shared/hall.js', 'shared/lobby.js', 'shared/peerjs.min.js',
  'chess/', 'chess/index.html', 'chess/lib/chess.js', 'chess/lib/pieces.js', 'chess/lib/peerjs.min.js', 'chess/engine/stockfish.js',
  'checkers/', 'mancala/', 'reversi/', 'wildcards/', 'fivedice/', 'seabattle/', 'sketch/',
  'wordtiles/', 'wordtiles/rules.js', 'wordtiles/engine.js', 'wordtiles/words.txt'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  if (fonts){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => new Response('', {status:504}))));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try{
      // pages give up on a stalled network after 5 s and use the saved copy; other files wait as long as they need
      const nav = req.mode === 'navigate', ctl = new AbortController(), t = nav ? setTimeout(() => ctl.abort(), 5000) : 0;
      const r = await fetch(req, nav ? {signal:ctl.signal} : undefined); clearTimeout(t);
      if (r.ok) cache.put(req, r.clone());
      return r;
    }catch(err){
      const hit = await cache.match(req, {ignoreSearch:true});
      if (hit) return hit;
      if (req.mode === 'navigate'){ const home = await cache.match('index.html'); if (home) return home; }
      throw err;
    }
  })());
});
