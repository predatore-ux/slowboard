import http from 'node:http';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const validHex = (value,length) => typeof value==='string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const same = (a,b) => typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const idValid = id => typeof id==='string'&&/^SB-[A-F0-9]{12}$/.test(id);
const integer = (v,min,max) => Number.isInteger(v)&&v>=min&&v<=max;
const fail = (status,message) => Object.assign(Error(message),{status});
export function validFrame(frame) {
  return frame && Array.isArray(frame.colors)&&frame.colors.length===36&&
    frame.colors.every(c=>integer(c,0,0xFFFFFF))&&integer(frame.player,0,2)&&integer(frame.brightness,0,255);
}

export function createRelay({devices,now=Date.now,allowedOrigins=['https://predatore-ux.github.io'],allowLocalHttp=false}={}) {
  if(!devices||!Object.keys(devices).length)throw Error('A private device registry is required.');
  const states=new Map(),rates=new Map();
  const get=id=>{if(!idValid(id)||!devices[id])throw fail(401,'Unknown board or credentials.');
    if(!states.has(id))states.set(id,{boot:'',at:0,values:Array(36).fill(null),pairCode:'',pairUntil:0,
      consumedCode:'',attempts:0,controller:null,frame:null,ack:0,seq:0});return states.get(id);};
  function controller(req,id) {
    const state=get(id),token=req.headers.authorization?.replace(/^Bearer /,'');
    if(!state.controller||!same(sha256(token||''),state.controller.tokenHash)||now()-state.controller.seen>10000)
      throw fail(401,'Pair the board again.');
    if(now()-state.at>5000)throw fail(409,'Board offline. Wait for it to reconnect.');
    return state;
  }
  function cors(req,res) {
    const origin=req.headers.origin;
    if(origin && !allowedOrigins.includes(origin))throw fail(403,'Website origin is not allowed.');
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-SB-Board');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  }
  async function body(req) {
    if(!String(req.headers['content-type']).startsWith('application/json'))throw fail(415,'JSON required.');
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw fail(413,'Message too large.');}
    try{return JSON.parse(text);}catch{throw fail(400,'Invalid JSON.');}
  }
  function limit(key,max,window=60000) {
    const time=now();let entry=rates.get(key);
    if(!entry||time-entry.since>=window){entry={since:time,count:0};rates.set(key,entry);}
    if(++entry.count>max)throw fail(429,'Too many attempts. Wait one minute.');
    if(rates.size>10000)for(const [k,v] of rates)if(time-v.since>=window)rates.delete(k);
  }
  const handler=async(req,res)=>{
    const reply=(status,data)=>{const text=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)});res.end(text);};
    try {
      cors(req,res);
      const url=new URL(req.url,'http://relay');
      // Hosting probes can use internal HTTP. This reveals no board or session data.
      if(req.method==='GET'&&url.pathname==='/health'){reply(200,{service:'slowboard-relay',version:3});return;}
      // Production requires a TLS reverse proxy; set TRUST_PROXY=1 only behind your own proxy.
      const secure=req.socket.encrypted||(process.env.TRUST_PROXY==='1'&&req.headers['x-forwarded-proto']==='https');
      if(!allowLocalHttp&&!secure)throw fail(426,'HTTPS is required.');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(req.method==='POST'&&url.pathname==='/api/device/exchange') {
        const id=req.headers['x-sb-board'],state=get(id);
        const secret=req.headers.authorization?.replace(/^Bearer /,'')||'';
        if(!validHex(secret,64)||!same(sha256(secret),devices[id].keyHash))throw fail(401,'Unknown board or credentials.');
        limit('device:'+id,600);
        const data=await body(req);
        if(!validHex(data.boot,32)||typeof data.sensors!=='string'||!/^[01?]{36}$/.test(data.sensors)||
          !integer(data.ack,0,0xFFFFFFFF)||typeof data.localOverride!=='boolean'||
          !(data.pairCode===''||/^\d{6}$/.test(data.pairCode))||!integer(data.pairRemainingMs,0,120000))
          throw fail(400,'Invalid device snapshot.');
        if(state.boot!==data.boot) {
          Object.assign(state,{boot:data.boot,controller:null,frame:null,ack:0,seq:0,consumedCode:'',pairCode:'',attempts:0});
        }
        state.at=now();state.values=[...data.sensors].map(v=>v==='?'?null:v==='1');state.ack=data.ack;
        if(data.localOverride){state.controller=null;state.frame=null;}
        if(data.pairCode!==state.pairCode){state.pairCode=data.pairCode;state.attempts=0;}
        state.pairUntil=now()+data.pairRemainingMs;
        if(state.controller&&now()-state.controller.seen>5000){state.controller=null;state.frame=null;}
        const active=Boolean(state.controller&&state.frame);
        reply(200,{boot:state.boot,paired:Boolean(state.controller),active,
          ttlMs:active?Math.max(1,5000-(now()-state.controller.seen)):0,
          session:active?state.controller.session:'',seq:active?state.seq:0,
          ...(active?state.frame:{colors:Array(36).fill(0),player:0,brightness:60})});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/pair') {
        limit('ip:'+req.socket.remoteAddress,30);
        const data=await body(req),state=get(data.board);
        limit('pair:'+data.board,10);
        if(now()-state.at>5000)throw fail(409,'Board is offline. Finish Wi-Fi setup first.');
        if(state.controller&&now()-state.controller.seen<=5000)throw fail(409,'Board is already controlled by another session. Disconnect it first.');
        if(state.pairUntil<=now()||state.pairCode===''||state.pairCode===state.consumedCode)
          throw fail(409,'Open board setup and generate a new pairing code.');
        if(++state.attempts>5)throw fail(429,'Generate a new pairing code on the board.');
        if(typeof data.code!=='string'||!/^\d{6}$/.test(data.code)||!same(data.code,state.pairCode))
          throw fail(401,'Incorrect pairing code.');
        const token=randomBytes(32).toString('hex');
        state.controller={tokenHash:sha256(token),session:randomBytes(16).toString('hex'),seen:now()};
        state.consumedCode=state.pairCode;state.frame=null;
        reply(200,{token,board:data.board});return;
      }
      const id=url.searchParams.get('board');
      if(req.method==='GET'&&url.pathname==='/api/state') {
        const state=controller(req,id);state.controller.seen=now();
        reply(200,{sensors:state.values,ack:state.ack,pending:state.seq,boot:state.boot,online:true});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/frame') {
        const state=controller(req,id),data=await body(req);
        if(!validFrame(data))throw fail(400,'A complete 36-pixel RGB frame is required.');
        if(!integer(data.clientSeq,1,0xFFFFFFFF)||data.clientSeq<=(state.controller.clientSeq||0))
          throw fail(409,'Stale frame.');
        state.controller.clientSeq=data.clientSeq;state.controller.seen=now();
        state.frame={colors:[...data.colors],player:data.player,brightness:data.brightness};
        if(state.seq===0xFFFFFFFF)throw fail(409,'Pair again to reset the sequence.');
        ++state.seq;reply(200,{seq:state.seq});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/disconnect') {
        const state=controller(req,id);state.controller=null;state.frame=null;
        reply(200,{disconnected:true});return;
      }
      throw fail(404,'Not found.');
    } catch(error) {if(!res.headersSent)reply(error.status||500,{error:error.status?error.message:'Server error.'});else res.end();}
  };
  return {handler,states};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const devices=JSON.parse(readFileSync(process.env.DEVICE_REGISTRY||new URL('./private/devices.json',import.meta.url),'utf8'));
  const allowedOrigins=(process.env.ALLOWED_ORIGINS||'https://predatore-ux.github.io').split(',').map(s=>s.trim());
  const {handler}=createRelay({devices,allowedOrigins,allowLocalHttp:process.env.ALLOW_LOCAL_HTTP==='1'});
  const server=http.createServer(handler);server.requestTimeout=10000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Slowboard relay listening. TLS reverse proxy required for production.'));
}
