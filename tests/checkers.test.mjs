import test from 'node:test';
import assert from 'node:assert/strict';
import {partialCapture,initialGame,legalMoves,play,hardwareToSquare,turnSquare,BOARD_TURN,fromHardware,occupancy,reconcile} from '../dist/checkers.mjs';
import {ReportParser} from '../dist/board-protocol.mjs';
const empty=()=>Array(36).fill(0);
test('six pieces per side and only dark squares',()=>{
 const g=initialGame();assert.equal(g.board.filter(p=>p===1).length,6);assert.equal(g.board.filter(p=>p===-1).length,6);
 g.board.forEach((p,i)=>{if(p)assert.equal((i%6+Math.floor(i/6))%2,0);});assert.ok(legalMoves(g.board,1).length);
});
test('valid moves alternate turn; stale and duplicate moves fail',()=>{
 const g=initialGame(),m=legalMoves(g.board,1)[0],next=play(g,m.path);
 assert.equal(next.turn,-1);assert.equal(next.revision,1);assert.throws(()=>play(next,m.path,0),/Stale/);assert.throws(()=>play(next,m.path),/not legal/);
});
test('capture is compulsory and removes victim',()=>{
 const b=empty();b[0]=1;b[7]=-1;b[4]=1;
 const moves=legalMoves(b,1);assert.equal(moves.length,1);assert.deepEqual(moves[0].path,[0,14]);assert.equal(moves[0].board[7],0);
});
test('complete multiple jumps, reject intermediate landing',()=>{
 const b=empty();b[0]=1;b[7]=-1;b[21]=-1;
 const g={...initialGame(),board:b};const moves=legalMoves(b,1);
 assert.deepEqual(moves[0].path,[0,14,28]);assert.equal(moves[0].captures.length,2);assert.throws(()=>play(g,[0,14]));
});
test('men cannot move backward; kings can',()=>{
 const b=empty();b[14]=1;assert.ok(legalMoves(b,1).every(m=>m.path.at(-1)>14));
 b[14]=2;assert.ok(legalMoves(b,1).some(m=>m.path.at(-1)<14));
});
test('promotion and final capture produce a winner',()=>{
 const b=empty();b[24]=1;b[31]=-1;
 // Walking into last rank promotes; separate final-capture position tests victory.
 const c=empty();c[28]=1;c[1]=-1;
 assert.ok(legalMoves(c,1).every(m=>m.promoted&&m.board[m.path.at(-1)]===2));
 const d=empty();d[0]=1;d[7]=-1;
 assert.equal(play({...initialGame(),board:d},[0,14]).winner,1);
});
test('capture chain promotion ends the move',()=>{
 const b=empty();b[6]=1;b[13]=-1;b[27]=-1;
 const m=legalMoves(b,1)[0];assert.deepEqual(m.path,[6,20,34]);assert.equal(m.board[34],2);assert.equal(m.promoted,true);
});
test('80 quiet turns result in a draw',()=>{
 const g=initialGame();g.quiet=79;assert.equal(play(g,legalMoves(g.board,1)[0].path).winner,0);
});
test('hardware mapping covers each square exactly once',()=>{
 assert.equal(new Set(Array.from({length:36},(_,i)=>hardwareToSquare(i))).size,36);
 assert.equal(BOARD_TURN,1);
 // physical squares (before the turn) for these hardware indexes are 0,12,2,3,18,21
 assert.deepEqual([0,2,6,9,18,27].map(i=>hardwareToSquare(i)),[0,12,2,3,18,21].map(i=>turnSquare(i)));
});
test('turned board: physical F1,F3,F5,E2,E4,E6 are game A1,C1,E1,B2,D2,F2',()=>{
 const name=i=>'ABCDEF'[i%6]+(Math.floor(i/6)+1),idx=n=>('ABCDEF'.indexOf(n[0]))+(n[1]-1)*6;
 const pairs={F1:'A1',F3:'C1',F5:'E1',E2:'B2',E4:'D2',E6:'F2',A2:'B6',A4:'D6',A6:'F6',B1:'A5',B3:'C5',B5:'E5'};
 for(const [phys,game] of Object.entries(pairs))assert.equal(name(turnSquare(idx(phys),1)),game,phys);
});
test('four quarter turns are the identity and every turn is a permutation',()=>{
 for(let t=0;t<4;t++)assert.equal(new Set(Array.from({length:36},(_,i)=>turnSquare(i,t))).size,36);
 for(let i=0;i<36;i++){assert.equal(turnSquare(i,4),i);assert.equal(turnSquare(i,0),i);}
});
test('turned start position: player one pieces sit on the physical east columns',()=>{
 const g=initialGame(),hw=Array(36).fill(false);
 for(let h=0;h<36;h++)hw[h]=Boolean(g.board[hardwareToSquare(h)]);
 assert.equal(hw.filter(Boolean).length,12);
 assert.deepEqual(fromHardware(hw).map(Boolean),occupancy(g.board));
});
test('Board 4 unavailable never becomes empty squares or a move',()=>{
 const hw=Array(36).fill(false);hw.fill(null,27);const obs=fromHardware(hw);
 assert.equal(obs.filter(v=>v===null).length,9);
 assert.equal(reconcile(initialGame(),obs,true,true).kind,'unavailable');
});
test('physical move needs established baseline, unique legal state and complete capture',()=>{
 const g=initialGame(),m=legalMoves(g.board,1)[0],obs=occupancy(m.board);
 assert.equal(reconcile(g,obs,true,false).kind,'restore');assert.equal(reconcile(g,obs,true,true).kind,'candidate');
 assert.equal(reconcile(g,obs,false,true).kind,'unavailable');
 const partial=occupancy(g.board);partial[m.path[0]]=false;
 assert.equal(reconcile(g,partial,true,true).kind,'restore');
});
test('web move requires physical reconciliation, not a second move',()=>{
 const g=initialGame(),m=legalMoves(g.board,1)[0],next=play(g,m.path);
 assert.equal(reconcile(next,occupancy(g.board),true,false).kind,'restore');
 assert.equal(reconcile(next,occupancy(next.board),true,false).kind,'aligned');
});
test('parser handles split chunks and multiline Board 4 failure',()=>{
 const reports=[],parser=new ReportParser(v=>reports.push(v.slice()));
 parser.feed('Detected mag');parser.feed('nets: B1_BL_HALL_A1, B2_BR_HALL_C3\r\nError: Failed to read B4_TR (0x26).\nDetected magnets: None\n');
 const r=reports.at(-1);assert.equal(r[0],true);assert.equal(r[17],true);assert.ok(r.slice(27).every(v=>v===null));
});
test('parser reconnect baseline and normal none reports',()=>{
 const reports=[],p=new ReportParser(v=>reports.push(v));
 p.feed('Detected magnets: None\nDetected magnets: None\n');assert.ok(reports.at(-1).every(v=>v===false));
 p.feed('SlowBoard original-based revision 1 starting\n');assert.ok(reports.at(-1).every(v=>v===null));
});
test('random legal playouts conserve players and board limits',()=>{
 for(let run=0;run<20;run++){
  let g=initialGame();for(let ply=0;ply<120&&g.winner===null;ply++){
   const moves=legalMoves(g.board,g.turn);assert.ok(moves.length);const m=moves[(run*7+ply*13)%moves.length];
   const count=g.board.filter(Boolean).length;g=play(g,m.path);
   assert.equal(g.board.filter(Boolean).length,count-m.captures.length);
   assert.ok(g.board.every(p=>[-2,-1,0,1,2].includes(p)));
  }
 }
});
test('men capture backward but still only step forward',()=>{
 const b=empty();b[14]=1;b[7]=-1; // victim behind player one's man (down-left)
 const m=legalMoves(b,1);assert.equal(m.length,1);assert.deepEqual(m[0].path,[14,0]);assert.deepEqual(m[0].captures,[7]);
 const w=empty();w[14]=1;assert.ok(legalMoves(w,1).every(x=>x.path.at(-1)>14));
});
test('kings fly: slide any distance and capture from afar, landing anywhere beyond',()=>{
 const w=empty();w[0]=2;assert.deepEqual(legalMoves(w,1).map(m=>m.path.at(-1)).sort((a,b)=>a-b),[7,14,21,28,35]);
 const c=empty();c[0]=2;c[21]=-1; // victim three squares away on the long diagonal
 const m=legalMoves(c,1);assert.deepEqual(m.map(x=>x.path.at(-1)).sort((a,b)=>a-b),[28,35]);
 assert.ok(m.every(x=>x.captures[0]===21&&x.board[21]===0));
});
test('a flying king must land where its chain can continue',()=>{
 const c=empty();c[0]=2;c[7]=-1;c[16]=-1; // after taking 7, only landing 14 can then take 16
 const m=legalMoves(c,1);assert.ok(m.length>0&&m.every(x=>x.captures.length===2));
});
test('a man crowned mid-capture carries on as a king',()=>{
 const b=empty();b[19]=1;b[26]=-1;b[28]=-1; // 19 x 26 -> 33 (last row, crowned) then king x 28 -> 23
 const m=legalMoves(b,1);assert.equal(m.length,1);
 assert.deepEqual(m[0].path,[19,33,23]);assert.deepEqual(m[0].captures,[26,28]);
 assert.equal(m[0].board[23],2);assert.equal(m[0].promoted,true);assert.equal(m[0].board[19]+m[0].board[26]+m[0].board[28],0);
});
test('a capture stopped half-way is reported, not treated as a mystery',()=>{
 const sq=n=>'ABCDEF'.indexOf(n[0])+(n[1]-1)*6,b=empty();
 ['B2','D2','F2','E3','E1'].forEach(n=>{b[sq(n)]=1;});['B6','A5','E5','F4','C3'].forEach(n=>{b[sq(n)]=-1;});
 const g={...initialGame(),board:b},obs=b.map(Boolean);
 obs[sq('B2')]=false;obs[sq('C3')]=false;obs[sq('D4')]=true; // jumped to D4, E5 still to take
 const r=reconcile(g,obs,true,true);
 assert.equal(r.kind,'restore');assert.equal(r.partial.at,sq('D4'));assert.equal(r.partial.next,sq('F6'));assert.deepEqual(r.partial.remaining,[sq('E5')]);
 obs[sq('C3')]=true; // victim not lifted yet is also recognised
 assert.ok(reconcile(g,obs,true,true).partial);
 const done=b.map(Boolean);done[sq('B2')]=false;done[sq('C3')]=false;done[sq('E5')]=false;done[sq('F6')]=true;
 assert.equal(reconcile(g,done,true,true).kind,'candidate');
 assert.equal(partialCapture(g,b.map(Boolean)),null);
});
