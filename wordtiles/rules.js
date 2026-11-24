/* Word Tiles shared rules: letter values, tile counts and the bonus-square layout.
   The layout is our own: one octant is defined and mirrored eight ways. */
var WT = (function(){
  var VAL = {a:1,b:4,c:4,d:2,e:1,f:4,g:3,h:3,i:1,j:9,k:5,l:2,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:2,v:5,w:4,x:8,y:4,z:10};
  var COUNT = {a:8,b:2,c:2,d:4,e:12,f:2,g:3,h:3,i:8,j:1,k:1,l:4,m:2,n:6,o:8,p:2,q:1,r:6,s:5,t:6,u:4,v:2,w:2,x:1,y:2,z:1,'?':2};
  var OCT = {TW:[[0,3]], DW:[[1,1],[3,3],[4,6]], TL:[[2,5],[5,5]], DL:[[0,6],[2,2],[3,6],[6,6],[5,7]]};
  var PREM = []; for (var i = 0; i < 225; i++) PREM.push(null);
  Object.keys(OCT).forEach(function(k){
    OCT[k].forEach(function(p){
      var r = p[0], c = p[1];
      [[r,c],[c,r],[14-r,c],[r,14-c],[14-r,14-c],[c,14-r],[14-c,r],[14-c,14-r]].forEach(function(q){ PREM[q[0] * 15 + q[1]] = k; });
    });
  });
  PREM[112] = 'ST';
  function lm(p){ return p === 'DL' ? 2 : p === 'TL' ? 3 : 1; }
  function wm(p){ return p === 'DW' || p === 'ST' ? 2 : p === 'TW' ? 3 : 1; }
  return {VAL:VAL, COUNT:COUNT, PREM:PREM, N:15, CENTER:112, lm:lm, wm:wm, BINGO:50};
})();
