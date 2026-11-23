import {initialGame,legalMoves,play,square,occupancy,fromHardware,hardwareToSquare,reconcile} from './checkers.mjs';
import {BoardSerial} from './board-protocol.mjs';
import {sensorChannel,unknownSensors} from './sensor-stream.mjs';
let sensorFeed=sensorChannel();
const $=s=>document.querySelector(s);
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
const serial=new BoardSerial(receive,e=>{notice(`Board connection: ${e.message}`);lastSeen=0;aligned=false;render();});
function physical(){return mode!=='web';}
function readings(){
  if(mode==='sim')return simulated.map((v,i)=>$('#fault').checked&&i%6>=3&&i>=18?null:v);
  return observed;
}
function state(){
  if(!physical())return {kind:'web',moves:[]};
  const ready=mode==='sim'||Boolean(serial.ready&&!serial.failed&&Date.now()-lastSeen<2000&&$('#calibrated').checked);
  return reconcile(game,readings(),ready,aligned);
}
function moveAllowed(){return !physical()||state().kind==='aligned'&&game.turn===-1;}
function commit(path){
  try{game=play(game,path);selected=null;aligned=false;notice();render();}catch(e){notice(e.message);}
}
for(let y=5;y>=0;y--)for(let x=0;x<6;x++){
  const i=y*6+x,button=document.createElement('button');button.type='button';
  button.className=`cell ${(x+y)%2===0?'dark':''}`;
  button.addEventListener('click',()=>{
    if(game.winner!==null||!moveAllowed())return;
    const candidates=legalMoves(game.board,game.turn).filter(m=>m.path[0]===selected&&m.path.at(-1)===i);
    if(candidates.length===1){commit(candidates[0].path);return;}
    selected=Math.sign(game.board[i])===game.turn?i:null;render();
  });$('#board').append(button);cells[i]=button;
  const sensor=document.createElement('button');sensor.type='button';sensor.className='sensor';
  sensor.addEventListener('click',()=>{if(mode!=='sim')return;simulated[i]=!simulated[i];changedAt=Date.now();render();});
  $('#sensors').append(sensor);sensorCells[i]=sensor;
}
function updateLights(s){
  if(mode!=='usb'||!serial.ready||serial.failed||serial.closing)return;
  const ready=s.kind==='aligned'&&game.winner===null;
  const player=ready?(game.turn===1?1:2):0;
  const obs=readings();const commands=['manual','off'];
  for(let h=0;h<36;h++){
    const i=hardwareToSquare(h);let rgb=null;
    if(s.kind==='unavailable')rgb=[30,12,0];
    else if(Boolean(game.board[i])!==obs[i])rgb=game.board[i]?[0,100,25]:[140,35,0];
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
  $('#turn').textContent=game.winner===0?'A shared draw.':game.winner!==null?`${game.winner===1?'Blue':'Orange'} wins.`:`${game.turn===1?'Blue':'Orange'} to move.`;
  const statuses={web:'Choose a piece, then a highlighted destination.',aligned:game.turn===1?'Move a blue physical piece. Complete any captures, then confirm here.':'Orange can move on this screen.',unavailable:'Physical play paused. All four boards must be readable, connected and calibrated.',restore:'Match the physical pieces to the game board. Remove captured pieces and follow the highlighted differences.',candidate:'A legal physical move is detected. Check the pieces, then confirm.'};
  $('#status').textContent=game.winner!==null?'Start a new game when you’re ready.':statuses[s.kind];
  $('#p1').classList.toggle('active',game.turn===1&&game.winner===null);
  $('#p2').classList.toggle('active',game.turn===-1&&game.winner===null);
  $('#p1').textContent=`Player one · blue · ${mode==='web'?'this screen':mode==='sim'?'simulated board':'physical board'}`;
  $('#usb-controls').hidden=mode!=='usb';$('#sim-controls').hidden=mode!=='sim';
  $('#connect').disabled=connecting||Boolean(serial.port)||!$('#calibrated').checked;
  $('#disconnect').disabled=!serial.port||connecting||serial.closing;$('#mode').disabled=Boolean(serial.port)||connecting;
  $('#connection').textContent=!serial.port?'Not connected.':serial.failed?'Command confirmation failed. Disconnect and reconnect.':!serial.ready?'Waiting for ESP32 readiness and command confirmation…':Date.now()-lastSeen>=2000?'Waiting for board reports…':serial.sending?'Receiving sensors · confirming LED commands…':'Receiving sensors · LED commands confirmed.';
  $('#confirm').hidden=s.kind!=='candidate';$('#confirm').disabled=Date.now()-changedAt<500;
  const moves=game.winner===null?legalMoves(game.board,game.turn):[];
  const selectedMoves=moves.filter(m=>m.path[0]===selected);
  const obs=readings();
  cells.forEach((cell,i)=>{
    const p=game.board[i],label=`${square(i)}: ${p?`${p>0?'blue':'orange'} ${Math.abs(p)===2?'king':'piece'}`:'empty'}`;
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
    game.history.forEach(m=>{const li=document.createElement('li');li.textContent=`${m.player===1?'Blue':'Orange'}: ${m.path.map(square).join(' → ')}${m.captures.length?' · capture':''}`;history.append(li);});
  }
  updateLights(s);
}
$('#mode').onchange=()=>{mode=$('#mode').value;selected=null;aligned=false;changedAt=Date.now();simulated=occupancy(game.board);notice();render();};
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
