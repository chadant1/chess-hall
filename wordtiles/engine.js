/* Word Tiles computer player: a compact trie of the word list and an anchor-based move finder.
   Runs in a Web Worker so the board never freezes while the computer thinks. */
importScripts('rules.js');
var first, next, letter, term, lastChild, count = 1, readyResolve, ready = new Promise(function(r){ readyResolve = r; });
function grow(){
  var cap = first.length * 2;
  function g(a, T){ var b = new T(cap); b.set(a); return b; }
  first = g(first, Int32Array); next = g(next, Int32Array); lastChild = g(lastChild, Int32Array); letter = g(letter, Uint8Array); term = g(term, Uint8Array);
  for (var i = cap / 2; i < cap; i++){ first[i] = -1; next[i] = -1; lastChild[i] = -1; }
}
function build(text){
  var cap = 800000;
  first = new Int32Array(cap).fill(-1); next = new Int32Array(cap).fill(-1); lastChild = new Int32Array(cap).fill(-1);
  letter = new Uint8Array(cap); term = new Uint8Array(cap);
  var words = text.split('\n');
  for (var w = 0; w < words.length; w++){
    var s = words[w]; if (!s) continue;
    var node = 0;
    for (var i = 0; i < s.length; i++){
      var L = s.charCodeAt(i) - 97, lc = lastChild[node];
      if (lc !== -1 && letter[lc] === L){ node = lc; continue; }
      var c = child(node, L);
      if (c !== -1){ node = c; continue; }
      if (count >= first.length) grow();
      var nn = count++; letter[nn] = L;
      if (lc === -1) first[node] = nn; else next[lc] = nn;
      lastChild[node] = nn; node = nn;
    }
    term[node] = 1;
  }
}
function child(node, L){ for (var k = first[node]; k !== -1; k = next[k]) if (letter[k] === L) return k; return -1; }
function walk(str, node){ node = node || 0; for (var i = 0; i < str.length && node !== -1; i++) node = child(node, str.charCodeAt(i) - 97); return node; }
function isWord(str){ var n = walk(str, 0); return n !== -1 && term[n] === 1; }

function gen(B, rack){
  var moves = [], seen = {}, rk = {};
  rack.forEach(function(t){ rk[t] = (rk[t] || 0) + 1; });
  var empty = B.every(function(x){ return !x; });
  [true, false].forEach(function(horiz){
    function I(r, c){ return horiz ? r * 15 + c : c * 15 + r; }
    function at(r, c){ return B[I(r, c)]; }
    var cc = new Int32Array(225), cs = new Int32Array(225), has = new Uint8Array(225), anchor = new Uint8Array(225);
    for (var r = 0; r < 15; r++) for (var c = 0; c < 15; c++){
      var k = r * 15 + c; cc[k] = 0x3ffffff;
      if (at(r, c)) continue;
      if ((r > 0 && at(r - 1, c)) || (r < 14 && at(r + 1, c)) || (c > 0 && at(r, c - 1)) || (c < 14 && at(r, c + 1))) anchor[k] = 1;
      if ((r > 0 && at(r - 1, c)) || (r < 14 && at(r + 1, c))){
        var up = '', dn = '', sc = 0, y = r - 1;
        while (y >= 0 && at(y, c)){ up = at(y, c).l + up; sc += at(y, c).v; y--; }
        y = r + 1; while (y <= 14 && at(y, c)){ dn += at(y, c).l; sc += at(y, c).v; y++; }
        var m = 0, base = walk(up, 0);
        if (base !== -1) for (var e = first[base]; e !== -1; e = next[e]){ var n2 = walk(dn, e); if (n2 !== -1 && term[n2]) m |= 1 << letter[e]; }
        cc[k] = m; cs[k] = sc; has[k] = 1;
      }
    }
    if (empty){ anchor[7 * 15 + 7] = 1; }
    for (var row = 0; row < 15; row++){
      for (var col = 0; col < 15; col++){
        if (!anchor[row * 15 + col]) continue;
        if (col > 0 && at(row, col - 1)){
          var p = col - 1, pre = '';
          while (p >= 0 && at(row, p)){ pre = at(row, p).l + pre; p--; }
          var nd = walk(pre, 0);
          if (nd !== -1) extend(row, col, col, nd, [], p + 1);
        } else {
          var lim = 0, q = col - 1;
          while (q >= 0 && !at(row, q) && !anchor[row * 15 + q]) { lim++; q--; }
          leftPart(row, col, 0, [], lim);
        }
      }
    }
    function leftPart(row, anc, node, left, lim){
      extend(row, anc, anc, node, left, anc - left.length);
      if (lim <= 0) return;
      for (var e = first[node]; e !== -1; e = next[e]){
        var ch = String.fromCharCode(97 + letter[e]);
        if (rk[ch] > 0){ rk[ch]--; left.push({l:ch, b:false}); leftPart(row, anc, e, left, lim - 1); left.pop(); rk[ch]++; }
        else if (rk['?'] > 0){ rk['?']--; left.push({l:ch, b:true}); leftPart(row, anc, e, left, lim - 1); left.pop(); rk['?']++; }
      }
    }
    function extend(row, anc, col, node, placed, start){
      if (col > 14 || !at(row, col)){
        if (col > anc && term[node] && placed.length) record(row, start, col - 1, placed);
        if (col > 14) return;
      }
      if (col <= 14 && at(row, col)){
        var ex = child(node, at(row, col).l.charCodeAt(0) - 97);
        if (ex !== -1) extend(row, anc, col + 1, ex, placed, start);
        return;
      }
      if (col < anc) return;
      var k = row * 15 + col;
      for (var e = first[node]; e !== -1; e = next[e]){
        if (!(cc[k] & (1 << letter[e]))) continue;
        var ch = String.fromCharCode(97 + letter[e]);
        var use = rk[ch] > 0 ? 'r' : rk['?'] > 0 ? 'b' : null;
        if (!use) continue;
        if (use === 'r') rk[ch]--; else rk['?']--;
        placed.push({l:ch, b:use === 'b', c:col});
        extend(row, anc, col + 1, e, placed, start);
        placed.pop();
        if (use === 'r') rk[ch]++; else rk['?']++;
      }
    }
    function record(row, start, end, placed){
      // left-part tiles carry no column; they fill the empty squares before the anchor in order
      var tiles = [], li = 0, word = '', base = 0, mult = 1, cross = 0, newc = 0;
      var leftTiles = placed.filter(function(t){ return t.c == null; }), rightTiles = placed.filter(function(t){ return t.c != null; });
      for (var c = start; c <= end; c++){
        var ex = at(row, c);
        if (ex){ word += ex.l; base += ex.v; continue; }
        var t = rightTiles.find(function(x){ return x.c === c; }) || leftTiles[li++];
        if (!t) return;
        var k = I(row, c), pm = WT.PREM[k], lv = t.b ? 0 : WT.VAL[t.l];
        word += t.l; base += lv * WT.lm(pm); mult *= WT.wm(pm); newc++;
        if (has[row * 15 + c]) cross += (cs[row * 15 + c] + lv * WT.lm(pm)) * WT.wm(pm);
        tiles.push({r:Math.floor(k / 15), c:k % 15, l:t.l, b:t.b});
      }
      if (word.length < 2) return;
      if (empty && !tiles.some(function(t){ return t.r === 7 && t.c === 7; })) return;
      var score = base * mult + cross + (newc === 7 ? WT.BINGO : 0);
      var key = tiles.map(function(t){ return t.r + ',' + t.c + t.l + (t.b ? '*' : ''); }).sort().join('|');
      if (seen[key]) return; seen[key] = 1;
      moves.push({tiles:tiles, score:score, word:word});
    }
  });
  moves.sort(function(a, b){ return b.score - a.score; });
  return moves.slice(0, 400);
}
self.onmessage = function(e){
  var m = e.data;
  if (m.t === 'init'){
    fetch(m.url).then(function(r){ return r.text(); }).then(function(t){ build(t); readyResolve(); self.postMessage({t:'ready'}); }).catch(function(err){ self.postMessage({t:'error', msg:String(err)}); });
  } else if (m.t === 'moves'){
    ready.then(function(){ var mv = []; try{ mv = gen(m.board, m.rack); }catch(err){ mv = []; } self.postMessage({t:'moves', id:m.id, moves:mv}); });
  }
};
