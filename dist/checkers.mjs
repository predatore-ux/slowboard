// Slowboard 6x6 variant: forward men, short kings, compulsory captures,
// complete jump chains, and promotion ends the turn. A1 is bottom left.
export const square = i => `${'ABCDEF'[i % 6]}${Math.floor(i / 6) + 1}`;
const at = (x,y) => x>=0&&x<6&&y>=0&&y<6 ? y*6+x : -1;
const owner = p => Math.sign(p);
const directions = p => Math.abs(p)===2 ? [-1,1] : [owner(p)];
export function initialGame() {
  const board=Array(36).fill(0);
  for(let y=0;y<6;y++) for(let x=0;x<6;x++)
    if((x+y)%2===0) board[y*6+x]=y<2?1:y>3?-1:0;
  return {board,turn:1,revision:0,quiet:0,winner:null,history:[]};
}
export function legalMoves(board,turn) {
  const captures=[],walks=[];
  function jump(b,pos,p,path,taken) {
    let continued=false;
    for(const dy of directions(p)) for(const dx of [-1,1]) {
      const mid=at(pos%6+dx,Math.floor(pos/6)+dy);
      const to=at(pos%6+2*dx,Math.floor(pos/6)+2*dy);
      if(mid<0||to<0||owner(b[mid])!==-turn||b[to]!==0) continue;
      continued=true;
      const next=b.slice(); next[pos]=0; next[mid]=0;
      const crowned=Math.abs(p)===1 && Math.floor(to/6)===(turn===1?5:0);
      next[to]=crowned?p*2:p;
      const route=[...path,to],removed=[...taken,mid];
      if(crowned) captures.push({path:route,captures:removed,board:next,promoted:true});
      else jump(next,to,p,route,removed);
    }
    if(!continued&&taken.length) captures.push({path,captures:taken,board:b,promoted:false});
  }
  board.forEach((p,from)=>{
    if(owner(p)!==turn) return;
    jump(board,from,p,[from],[]);
    for(const dy of directions(p)) for(const dx of [-1,1]) {
      const to=at(from%6+dx,Math.floor(from/6)+dy);
      if(to<0||board[to]) continue;
      const next=board.slice(); next[from]=0;
      const promoted=Math.abs(p)===1&&Math.floor(to/6)===(turn===1?5:0);
      next[to]=promoted?p*2:p;
      walks.push({path:[from,to],captures:[],board:next,promoted});
    }
  });
  return captures.length?captures:walks;
}
export function play(game,path,revision=game.revision) {
  if(game.winner!==null) throw Error('This game has ended.');
  if(revision!==game.revision) throw Error('Stale move. Select it again.');
  const move=legalMoves(game.board,game.turn).find(m=>JSON.stringify(m.path)===JSON.stringify(path));
  if(!move) throw Error('That move is not legal. Complete mandatory captures.');
  const next={...game,board:move.board,turn:-game.turn,revision:game.revision+1,
    quiet:move.captures.length||move.promoted?0:game.quiet+1,
    history:[...game.history,{player:game.turn,path:move.path,captures:move.captures}]};
  next.winner=legalMoves(next.board,next.turn).length===0?game.turn:next.quiet>=80?0:null;
  return next;
}
// Hardware order: BL, BR, TL, TR; within each 3x3 PCB, column-major bottom-up.
// All boards must have local A1 at their lower-left, A3 upper-left, C1 lower-right.
// Where the PHYSICAL board sits relative to the game, in quarter turns. The board is turned
// so player one sits east with their pieces; the game itself is unchanged. 1 means physical
// F1 is game A1 (physical C... F3 is game C1, E2 is B2). Set to 0 for the original seating.
export const BOARD_TURN=1;
export function turnSquare(index,turn=BOARD_TURN) {
  let x=index%6,y=Math.floor(index/6);
  for(let t=((turn%4)+4)%4;t>0;t--){[x,y]=[y,5-x];}
  return y*6+x;
}
export function hardwareToSquare(index) {
  const b=Math.floor(index/9),s=index%9;
  return turnSquare((Math.floor(b/2)*3+s%3)*6+(b%2)*3+Math.floor(s/3));
}
export function fromHardware(values) {
  const result=Array(36).fill(null);
  values.forEach((v,i)=>{if(i<36)result[hardwareToSquare(i)]=v;});
  return result;
}
export const occupancy = board => board.map(Boolean);
export const matches = (board,observed) => observed.length===36&&observed.every((v,i)=>v!==null&&v===Boolean(board[i]));
export function reconcile(game,observed,ready,aligned) {
  if(!ready||observed.length!==36||observed.some(v=>v===null)) return {kind:'unavailable',moves:[]};
  if(matches(game.board,observed)) return {kind:'aligned',moves:[]};
  if(!aligned||game.turn!==1||game.winner!==null) return {kind:'restore',moves:[]};
  const moves=legalMoves(game.board,1).filter(m=>matches(m.board,observed));
  return {kind:moves.length===1?'candidate':'restore',moves};
}
