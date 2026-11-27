// Timers that keep running at full speed when the tab is hidden or in the background.
// Browsers slow ordinary page timers in background tabs (Chrome to about once a minute), which would
// silence the board's keep-alive for far longer than the relay allows. A dedicated worker's timers
// are not slowed that way. Without Worker support (or in tests) these fall back to normal timers.
let worker,nextId=1;const handlers=new Map();
function start() {
  if(worker!==undefined)return worker;
  try {
    if(typeof Worker==='undefined'||typeof Blob==='undefined'||typeof URL?.createObjectURL!=='function')throw Error('no worker');
    const source='const t=new Map();onmessage=e=>{const m=e.data;if(m.cmd==="start")t.set(m.id,setInterval(()=>postMessage(m.id),m.ms));else{clearInterval(t.get(m.id));t.delete(m.id);}};';
    worker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
    worker.onmessage=e=>{const run=handlers.get(e.data);if(run)run();};
  } catch {worker=null;}
  return worker;
}
export function setTicker(run,ms) {
  const w=start();
  if(!w){const id=setInterval(run,ms);return ()=>clearInterval(id);}
  const id=nextId++;handlers.set(id,run);w.postMessage({cmd:'start',id,ms});
  return ()=>{handlers.delete(id);w.postMessage({cmd:'stop',id});};
}
export function setWorkerTimeout(run,ms) {
  if(!start())return setTimeout(run,ms);
  const stop=setTicker(()=>{stop();run();},ms);
  return stop;
}
export function clearWorkerTimeout(handle) {
  if(typeof handle==='function')handle();else clearTimeout(handle);
}
