import {initialGame,legalMoves,play,square,occupancy,fromHardware,hardwareToSquare,reconcile} from './checkers.mjs';
import {BoardSerial} from './board-protocol.mjs';
import {BoardNetwork,PAIR_STORAGE} from './board-network.mjs';
import {sensorChannel,unknownSensors} from './sensor-stream.mjs';
let sensorFeed=sensorChannel();
const $=s=>document.querySelector(s);
const KING_RGB=[90,0,110]; // violet: distinct from green/orange/blue used for moves and turns
let game=initialGame(),mode='web',selected=null,observed=Array(36).fill(null),simulated=occupancy(game.board);
let lastSeen=0,changedAt=0,aligned=false,lastFrame='',connecting=false;
const cells=[],sensorCells=[];
function notice(message=''){$('#notice').textContent=message;}
function receive(values){
  sensorFeed.publish(values,'game');
  const next=fromHardware(values);
  if(JSON.stringify(next)!==JSON.stringify(observed))changedAt=Date.now();
  observed=next;lastSeen=Date.now();
  if(next.some(v=>v===null))aligned=false;
  render();
}
const connectionError=e=>{notice(`Board connection: ${e.message}`);lastSeen=0;aligned=false;render();};
const usb=new BoardSerial(receive,connectionError),wireless=new BoardNetwork(receive,connectionError);
let serial=usb;
function physical(){return ['sim','usb','wifi'].includes(mode);}
function readings(){
  if(mode==='sim')return simulated.map((v,i)=>$('#fault').checked&&i%6>=3&&i>=18?null:v);
  return observed;
}
function state(){
  if(!physical())return {kind:'web',moves:[]};
  const ready=mode==='sim'||Boolean(serial.ready&&!serial.failed&&Date.now()-lastSeen<2000&&$('#calibrated').checked);
  return reconcile(game,readings(),ready,aligned);
}
const AUTO_CONFIRM_MS=2000;
let cpuPending=false;
const cpuActive=()=>mode==='cpu'||(physical()&&$('#cpu-orange').checked);
const cpuTurn=()=>cpuActive()&&game.turn===-1&&game.winner===null;
function maybeCpu(){
  if(!cpuTurn()||cpuPending)return;
  const ready=()=>mode==='cpu'||state().kind==='aligned';
  if(!ready())return;
  cpuPending=true;
  setTimeout(()=>{
    cpuPending=false;
    if(!cpuTurn()||!ready())return;
    const moves=legalMoves(game.board,-1);if(!moves.length)return;
    // Greedy and a little random: prefer captures and promotion.
    const score=m=>m.captures.length*10+(m.promoted?5:0)+Math.random()*3;
    commit(moves.reduce((a,b)=>score(b)>score(a)?b:a).path);
  },700);
}
function moveAllowed(){return !physical()||state().kind==='aligned'&&game.turn===-1;}
function commit(path){
  try{game=play(game,path);selected=null;aligned=false;notice();render();}catch(e){notice(e.message);}
}
for(let y=5;y>=0;y--)for(let x=0;x<6;x++){
  const i=y*6+x,button=document.createElement('button');button.type='button';
  button.className=`cell ${(x+y)%2===0?'dark':''}`;
  button.addEventListener('click',()=>{
    if(game.winner!==null||!moveAllowed()||cpuTurn())return;
    const candidates=legalMoves(game.board,game.turn).filter(m=>m.path[0]===selected&&m.path.at(-1)===i);
    if(candidates.length===1){commit(candidates[0].path);return;}
    selected=Math.sign(game.board[i])===game.turn?i:null;render();
  });$('#board').append(button);cells[i]=button;
  const sensor=document.createElement('button');sensor.type='button';sensor.className='sensor';
  sensor.addEventListener('click',()=>{if(mode!=='sim')return;simulated[i]=!simulated[i];changedAt=Date.now();render();});
  $('#sensors').append(sensor);sensorCells[i]=sensor;
}
function updateLights(s){
  if(!['usb','wifi'].includes(mode)||!serial.ready||serial.failed||serial.closing)return;
  if(mode==='wifi'&&!$('#calibrated').checked)return;
  const ready=s.kind==='aligned'&&game.winner===null;
  // Illegal physical move: blue's turn, board settled for 3 s, matches nothing legal.
  // Red on both strips (player 3). Wi-Fi firmware only; the USB firmware rejects turn 3.
  const illegal=mode==='wifi'&&s.kind==='restore'&&aligned&&game.turn===1&&game.winner===null&&
    !readings().some(v=>v===null)&&Date.now()-changedAt>=3000;
  const player=illegal?3:ready?(game.turn===1?1:2):0;
  const obs=readings();const commands=['manual','off'];
  for(let h=0;h<36;h++){
    const i=hardwareToSquare(h);let rgb=null;
    if(s.kind==='unavailable')rgb=[30,12,0];
    else if(Boolean(game.board[i])!==obs[i])rgb=game.board[i]?[0,100,25]:[140,35,0];
    else if(Math.abs(game.board[i])===2)rgb=KING_RGB; // kings can't be sensed, so the board marks them
    else if(ready&&Math.sign(game.board[i])===game.turn)rgb=game.turn===1?[50,70,130]:[140,35,0];
    if(rgb)commands.push(`led ${h} ${rgb.join(' ')}`);
  }
  commands.push(`turn ${player}`);
  const frame=commands.join('\n')+'\n';
  if(frame!==lastFrame){lastFrame=frame;serial.send(frame);}
}
function render(){
  const s=state();if(s.kind==='aligned')aligned=true;
  if(s.kind==='unavailable')aligned=false;
  $('#turn').textContent=game.winner===0?'A shared draw.':game.winner!==null?`${game.winner===1?'Green':'Maroon'} wins.`:`${game.turn===1?'Green':'Maroon'} to move.`;
  const statuses={web:'Choose a piece, then a highlighted destination.',aligned:game.turn===1?'Move a green physical piece. Complete any captures, then confirm here.':'Maroon can move on this screen.',unavailable:'Physical play paused. All four boards must be readable, connected and calibrated.',restore:'Match the physical pieces to the game board. Remove captured pieces and follow the highlighted differences.',candidate:'A legal physical move is detected. Check the pieces, then confirm.'};
  $('#status').textContent=game.winner!==null?'Start a new game when you’re ready.':statuses[s.kind];
  $('#p1').classList.toggle('active',game.turn===1&&game.winner===null);
  $('#p2').classList.toggle('active',game.turn===-1&&game.winner===null);
  $('#p1').textContent=`Player one · green · ${mode==='web'||mode==='cpu'?'this screen':mode==='sim'?'simulated board':'physical board'}`;
  $('#usb-controls').hidden=!['usb','wifi'].includes(mode);$('#sim-controls').hidden=mode!=='sim';
  $('#usb-help').hidden=mode!=='usb';$('#wifi-help').hidden=mode!=='wifi';
  $('#connect').disabled=connecting||Boolean(serial.port)||!$('#calibrated').checked;
  $('#disconnect').disabled=!serial.port||connecting||serial.closing;$('#mode').disabled=Boolean(serial.port)||connecting;
  $('#connection').textContent=!serial.port?'Not connected.':serial.failed?'Command confirmation failed. Disconnect and reconnect.':!serial.ready?'Waiting for ESP32 readiness and command confirmation…':Date.now()-lastSeen>=2000?'Waiting for board reports…':serial.sending?'Receiving sensors · confirming LED commands…':'Receiving sensors · LED commands confirmed.';
  $('#auto-label').hidden=!['usb','wifi'].includes(mode);
  // Auto-accept: exactly one legal move matches, and nothing has changed for AUTO_CONFIRM_MS.
  // Chains are only matched when complete, and ambiguous results never auto-accept.
  if(s.kind==='candidate'&&s.moves.length===1&&['usb','wifi'].includes(mode)&&$('#auto-confirm').checked&&
     Date.now()-changedAt>=AUTO_CONFIRM_MS&&Date.now()-lastSeen<2000){commit(s.moves[0].path);return;}
  $('#confirm').hidden=s.kind!=='candidate';$('#confirm').disabled=Date.now()-changedAt<500;
  const moves=game.winner===null?legalMoves(game.board,game.turn):[];
  const selectedMoves=moves.filter(m=>m.path[0]===selected);
  const obs=readings();
  cells.forEach((cell,i)=>{
    const p=game.board[i],label=`${square(i)}: ${p?`${p>0?'green':'maroon'} ${Math.abs(p)===2?'king':'piece'}`:'empty'}`;
    cell.setAttribute('aria-label',label);cell.setAttribute('aria-pressed',String(selected===i));
    cell.classList.toggle('selected',selected===i);cell.classList.toggle('target',moveAllowed()&&selectedMoves.some(m=>m.path.at(-1)===i));
    cell.classList.toggle('mismatch',physical()&&obs[i]!==null&&Boolean(p)!==obs[i]);
    // Keep DOM stable during sensor polls so keyboard focus and animations remain stable.
    const content=`${p?`<span class="piece ${p>0?'blue':'orange'}">${Math.abs(p)===2?'K':''}</span>`:''}<small>${square(i)}</small>`;
    if(cell.innerHTML!==content)cell.innerHTML=content;
    const sensor=sensorCells[i];sensor.className=`sensor ${obs[i]===null?'unknown':obs[i]?'occupied':''}`;
    sensor.textContent=obs[i]===null?'?':square(i);sensor.disabled=obs[i]===null;
    sensor.setAttribute('aria-label',`${square(i)} sensor: ${obs[i]===null?'unavailable':obs[i]?'occupied':'empty'}`);
  });
  const paths=$('#moves');const key=JSON.stringify([selected,game.revision,moveAllowed()]);
  if(paths.dataset.key!==key){paths.dataset.key=key;paths.replaceChildren();if(moveAllowed())selectedMoves.forEach(m=>{
    const button=document.createElement('button');button.textContent=m.path.map(square).join(' → ');button.onclick=()=>commit(m.path);paths.append(button);
  });}
  const history=$('#history');if(history.dataset.revision!==String(game.revision)){
    history.dataset.revision=String(game.revision);history.replaceChildren();
    game.history.forEach(m=>{const li=document.createElement('li');li.textContent=`${m.player===1?'Green':'Maroon'}: ${m.path.map(square).join(' → ')}${m.captures.length?' · capture':''}`;history.append(li);});
  }
  updateLights(s);
  $('#cpu-orange-label').hidden=!['usb','wifi'].includes(mode);
  maybeCpu();
}
$('#mode').onchange=()=>{mode=$('#mode').value;serial=mode==='wifi'?wireless:usb;selected=null;aligned=false;changedAt=Date.now();simulated=occupancy(game.board);lastFrame='';notice();render();};
$('#fault').onchange=()=>{aligned=false;changedAt=Date.now();render();};
$('#align').onclick=()=>{simulated=occupancy(game.board);changedAt=Date.now();render();};
$('#calibrated').onchange=()=>{aligned=false;render();};
$('#confirm').onclick=()=>{const s=state();if(s.kind==='candidate'&&Date.now()-changedAt>=500)commit(s.moves[0].path);};
$('#connect').onclick=async()=>{connecting=true;render();try{await serial.connect();lastFrame='';notice();}catch(e){notice(e.message);}finally{connecting=false;render();}};
$('#disconnect').onclick=async()=>{try{await serial.disconnect();}catch(e){notice(e.message);}finally{lastSeen=0;aligned=false;lastFrame='';render();}};
$('#reset').onclick=()=>{if(game.revision>0&&!confirm('Start a new game and clear the move history?'))return;game=initialGame();selected=null;aligned=false;changedAt=Date.now();if(mode==='sim')simulated=occupancy(game.board);notice();render();};
setInterval(render,250);render();
addEventListener('pagehide',()=>{if(serial.port)sensorFeed.publish(unknownSensors(),'game');sensorFeed.close();});
addEventListener('pageshow',event=>{if(event.persisted)sensorFeed=sensorChannel();});
if(location.hash==='#wifi'&&sessionStorage.getItem(PAIR_STORAGE)){
  mode='wifi';serial=wireless;$('#mode').value='wifi';
  // Establish the heartbeat immediately; lighting waits for calibration confirmation.
  $('#connect').onclick();
}
