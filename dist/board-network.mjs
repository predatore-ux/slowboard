import {validSensors} from './sensor-stream.mjs';
export const PAIR_STORAGE='slowboard-wifi-session-v1';
export function relayOrigin(value) {
  const url=new URL(value);
  const local=['127.0.0.1','localhost'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash||url.pathname!=='/')
    throw Error('Enter the HTTPS connection-service address, without a path.');
  return url.origin;
}
export function commandsToFrame(text) {
  const result={colors:Array(36).fill(0),player:0,brightness:60};
  for(const line of text.trim().split('\n')) {
    if(line==='manual')continue;
    if(line==='off'){result.colors.fill(0);result.player=0;continue;}
    let m=/^led (\d+) (\d+) (\d+) (\d+)$/.exec(line);
    if(m){const [i,r,g,b]=m.slice(1).map(Number);if(i>35||[r,g,b].some(v=>v>255))throw Error('Invalid LED frame.');result.colors[i]=(r<<16)|(g<<8)|b;continue;}
    m=/^turn ([012])$/.exec(line);if(m){result.player=Number(m[1]);continue;}
    throw Error('Unsupported wireless lighting command.');
  }
  return result;
}
export class BoardNetwork {
  constructor(onReport,onError,{fetcher=globalThis.fetch,storage=globalThis.sessionStorage}={}) {
    Object.assign(this,{onReport,onError,fetcher,storage,port:null,ready:false,failed:false,closing:false,sending:false,
      pending:null,writeTask:Promise.resolve(),timer:null,waiter:null,clientSeq:0,credentials:null,generation:0});
  }
  async request(path,{method='GET',data}={}) {
    const c=this.credentials;
    const response=await this.fetcher(c.endpoint+path+(path.includes('?')?'&':'?')+'board='+encodeURIComponent(c.board),{
      method,headers:{Authorization:'Bearer '+c.token,...(data?{'Content-Type':'application/json'}:{})},
      body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(2500),cache:'no-store',credentials:'omit'
    });
    const result=await response.json();if(!response.ok)throw Error(result.error||'Board connection failed.');return result;
  }
  async connect(credentials) {
    if(this.port)throw Error('Already connected.');
    const c=credentials||JSON.parse(this.storage?.getItem(PAIR_STORAGE)||'null');
    if(!c||!/^SB-[A-F0-9]{12}$/.test(c.board)||!/^[a-f0-9]{64}$/.test(c.token))throw Error('Scan the board QR and pair it first.');
    this.credentials={...c,endpoint:relayOrigin(c.endpoint)};this.port={network:true};this.failed=false;this.closing=false;
    this.clientSeq=0;this.generation++;const generation=this.generation;
    try {
      const first=await this.request('/api/state');this.accept(first);
      this.startPoll(generation);this.ready=true;
      this.send('off\n');await this.writeTask;
      if(this.failed)throw Error('Board did not confirm the initial clear command.');
    } catch(error) {this.fail(error);throw error;}
  }
  accept(state) {
    if(!validSensors(state.sensors)||!Number.isInteger(state.ack))throw Error('Invalid board snapshot.');
    this.onReport(state.sensors);
    if(this.waiter&&state.ack>=this.waiter.seq){clearTimeout(this.waiter.timer);this.waiter.resolve();this.waiter=null;}
  }
  startPoll(generation) {
    const poll=async()=>{
      if(generation!==this.generation||!this.port||this.failed)return;
      try {const state=await this.request('/api/state');if(generation!==this.generation)return;this.accept(state);}
      catch(error){if(generation===this.generation)this.fail(error);return;}
      this.timer=setTimeout(poll,250);
    };
    this.timer=setTimeout(poll,100);
  }
  async waitForAck(seq) {
    await new Promise((resolve,reject)=>{this.waiter={seq,resolve,reject,timer:setTimeout(()=>{
      this.waiter=null;reject(Error('Board did not confirm the LED frame. Pair again.'));
    },4000)};});
  }
  send(text) {
    if(!this.ready||this.failed||this.closing)return;
    try {this.pending=commandsToFrame(text);}catch(error){this.fail(error);return;}
    if(this.sending)return;
    this.sending=true;
    this.writeTask=(async()=>{
      try {
        while(this.pending&&this.port&&!this.failed){
          const frame=this.pending;this.pending=null;
          const ack=await this.request('/api/frame',{method:'POST',data:{...frame,clientSeq:++this.clientSeq}});
          await this.waitForAck(ack.seq);
        }
      }catch(error){this.fail(error);}finally{this.sending=false;}
    })();
  }
  fail(error) {
    if(this.failed)return;this.failed=true;this.ready=false;this.pending=null;clearTimeout(this.timer);
    if(this.waiter){clearTimeout(this.waiter.timer);this.waiter.reject(error);this.waiter=null;}
    this.onReport(Array(36).fill(null));this.onError(error);
  }
  async disconnect() {
    if(!this.port)return;
    this.closing=true;this.pending=null;await this.writeTask;
    let error;
    try {await this.request('/api/disconnect',{method:'POST'});}catch(e){error=e;}
    this.generation++;clearTimeout(this.timer);this.port=null;this.ready=false;this.closing=false;
    this.storage?.removeItem(PAIR_STORAGE);this.onReport(Array(36).fill(null));
    if(error)throw error;
  }
}
