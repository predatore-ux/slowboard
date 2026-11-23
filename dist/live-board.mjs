import {BoardSerial} from './board-protocol.mjs';
import {fromHardware,square} from './checkers.mjs';
import {SensorSnapshot,sensorChannel,unknownSensors} from './sensor-stream.mjs';

const $=selector=>document.querySelector(selector);
function text(selector,value){const element=$(selector);if(element.textContent!==value)element.textContent=value;}
const snapshot=new SensorSnapshot(),grid=$('#demo-grid'),cells=[];
let connecting=false,disconnecting=false,error='',lastChange='Waiting for the first sensor report.';
let previous=unknownSensors();
function receive(values,source,at=Date.now()){
  const wasFresh=snapshot.fresh();
  if(!snapshot.accept(values,source,at))return;
  const next=fromHardware(values),changes=[];
  next.forEach((value,i)=>{
    if(wasFresh&&previous[i]!==null&&value!==null&&value!==previous[i])changes.push(`${square(i)} ${value?'placed':'lifted'}`);
  });
  if(changes.length)lastChange=changes.slice(0,4).join(' · ')+(changes.length>4?` · ${changes.length-4} more changes`:'');
  else if(!wasFresh)lastChange='Current board received. Lift or place a piece to see it here.';
  previous=next;render();
}
function mirroredReport(values,source,at){if(!serial.port&&!connecting&&!disconnecting){error='';receive(values,source,at);}}
let stream=sensorChannel(mirroredReport);
const serial=new BoardSerial(values=>{
  receive(values,'usb');stream.publish(values,'monitor');
},e=>{error=e.message;render();},{observeOnly:true});
for(let y=5;y>=0;y--)for(let x=0;x<6;x++){
  const i=y*6+x,cell=document.createElement('div');
  cell.className=`cell sensor-cell${(x+y)%2===0?' alt':''}`;
  cell.innerHTML=`<span class="sensor-marker" aria-hidden="true"></span><span class="sensor-coordinate">${square(i)}</span><span class="sensor-unknown" aria-hidden="true">?</span>`;
  cell.setAttribute('role','img');grid.append(cell);cells[i]=cell;
}
function render(){
  const fresh=snapshot.fresh(),values=fromHardware(snapshot.read());
  let occupied=0,unavailable=0;
  values.forEach((value,i)=>{
    if(value===true)occupied++;if(value===null)unavailable++;
    const cell=cells[i];cell.classList.toggle('sensed',value===true);cell.classList.toggle('sensor-unavailable',value===null);
    cell.setAttribute('aria-label',`${square(i)}: ${value===null?'sensor unavailable':value?'magnet detected':'empty'}`);
  });
  const active=fresh&&unavailable<36;
  text('#sensor-state',active?(snapshot.source==='game'?'LIVE · CHECKERS TAB':snapshot.source==='monitor'?'LIVE · MONITOR TAB':'LIVE · USB BOARD'):connecting?'CONNECTING':'AWAITING BOARD');
  text('#sensor-count',fresh?`${occupied} detected · ${36-unavailable}/36 readable`:'36 positions');
  $('#sensor-health').dataset.active=String(active);
  text('#move-status',error?error:disconnecting?'Disconnecting…':connecting?'Waiting for sensor reports…':!fresh?'No live readings. Connect the board here, or connect it in the checkers tab.':unavailable?`${unavailable} sensors unavailable. Only confirmed readings are shown.`:`Live sensing · ${occupied} ${occupied===1?'magnet':'magnets'} detected.`);
  text('#sensor-last-change',fresh?lastChange:'Readings are unknown until the board reports again.');
  $('#sensor-connect').disabled=connecting||disconnecting||Boolean(serial.port)||(active&&snapshot.source!=='usb');
  $('#sensor-disconnect').hidden=!serial.port;
  $('#sensor-disconnect').disabled=connecting||disconnecting;
  $('#sensor-error-help').hidden=!error;
}
$('#sensor-connect').onclick=async()=>{
  connecting=true;error='';snapshot.at=null;render();
  try{await serial.connect();}catch(e){error=e.message;if(serial.port)try{await serial.disconnect();}catch{}}
  finally{connecting=false;render();}
};
$('#sensor-disconnect').onclick=async()=>{
  disconnecting=true;render();
  try{await serial.disconnect();error='';}catch(e){error=e.message;}
  finally{disconnecting=false;snapshot.at=null;render();}
};
addEventListener('pagehide',()=>{if(serial.port)stream.publish(unknownSensors(),'monitor');stream.close();});
addEventListener('pageshow',event=>{if(event.persisted){stream=sensorChannel(mirroredReport);snapshot.at=null;render();}});
setInterval(render,250);render();
