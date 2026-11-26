import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRelay,sha256} from '../server.mjs';
const board='SB-123456789ABC',key='a'.repeat(64),boot='b'.repeat(32),code='123456';
async function fixture(t){
  let now=100000;const relay=createRelay({devices:{[board]:{keyHash:sha256(key)}},now:()=>now,allowLocalHttp:true});
  const server=http.createServer(relay.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  async function request(path,{method='GET',data,token,headers={}}={}){
    const response=await fetch(origin+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:data?JSON.stringify(data):undefined});
    return {status:response.status,body:await response.json()};
  }
  const snapshot={boot,sensors:'0'.repeat(36),ack:0,localOverride:false,pairCode:code,pairRemainingMs:120000};
  const device=overrides=>request('/api/device/exchange',{method:'POST',token:key,headers:{'X-SB-Board':board},data:{...snapshot,...overrides}});
  const pair=(overrides={})=>request('/api/pair',{method:'POST',data:{board,code,...overrides}});
  const frame={colors:Array(36).fill(0),player:1,brightness:60,clientSeq:1};frame.colors[0]=0xFA4E0A;
  return {request,device,pair,frame,advance:ms=>{now+=ms;},origin};
}
test('pairing needs an online authenticated board and a one-use physical code',async t=>{
  const f=await fixture(t);
  assert.equal((await f.pair()).status,409);
  assert.equal((await f.request('/api/device/exchange',{method:'POST',token:'c'.repeat(64),headers:{'X-SB-Board':board},data:{}})).status,401);
  assert.equal((await f.device()).status,200);
  assert.equal((await f.pair({code:'654321'})).status,401);
  const paired=await f.pair();assert.equal(paired.status,200);assert.match(paired.body.token,/^[a-f0-9]{64}$/);
  assert.equal((await f.pair()).status,409);
  assert.equal((await f.request('/api/state?board='+board,{token:paired.body.token})).body.sensors.length,36);
  await f.request('/api/disconnect?board='+board,{method:'POST',token:paired.body.token});
  assert.equal((await f.pair()).status,409);
});
test('complete frames arrive atomically and acknowledge from the device',async t=>{
  const f=await fixture(t);await f.device();const token=(await f.pair()).body.token;
  const sent=await f.request('/api/frame?board='+board,{method:'POST',token,data:f.frame});assert.equal(sent.status,200);
  const received=await f.device({pairCode:''});assert.equal(received.body.active,true);
  assert.deepEqual(received.body.colors,f.frame.colors);assert.equal(received.body.seq,sent.body.seq);
  await f.device({pairCode:'',ack:sent.body.seq});
  const state=await f.request('/api/state?board='+board,{token});assert.equal(state.body.ack,sent.body.seq);
  assert.equal((await f.request('/api/frame?board='+board,{method:'POST',token,data:f.frame})).status,409);
});
test('malformed frames cannot mutate the accepted frame',async t=>{
  const f=await fixture(t);await f.device();const token=(await f.pair()).body.token;
  await f.request('/api/frame?board='+board,{method:'POST',token,data:f.frame});
  for(const bad of [{colors:[1]}, {player:4}, {brightness:256},{colors:Array(36).fill(-1)},{colors:Array(36).fill(0.5)}]){
    const r=await f.request('/api/frame?board='+board,{method:'POST',token,data:{...f.frame,clientSeq:2,...bad}});assert.equal(r.status,400);
  }
  assert.deepEqual((await f.device()).body.colors,f.frame.colors);
});
test('idle heartbeat keeps ownership; missing heartbeat releases it',async t=>{
  const f=await fixture(t);await f.device();const token=(await f.pair()).body.token;
  await f.request('/api/frame?board='+board,{method:'POST',token,data:f.frame});
  for(let i=0;i<30;i++){f.advance(2000);await f.device();assert.equal((await f.request('/api/state?board='+board,{token})).status,200);}
  assert.equal((await f.device()).body.active,true);
  f.advance(5001);assert.equal((await f.device()).body.active,false);
  assert.equal((await f.request('/api/state?board='+board,{token})).status,401);
});
test('board reboot or USB override revokes old browser control',async t=>{
  const f=await fixture(t);await f.device();let token=(await f.pair()).body.token;
  await f.request('/api/frame?board='+board,{method:'POST',token,data:f.frame});
  assert.equal((await f.device({localOverride:true})).body.active,false);
  assert.equal((await f.request('/api/state?board='+board,{token})).status,401);
  await f.device({boot:'d'.repeat(32),pairCode:'999999'});token=(await f.pair({code:'999999'})).body.token;
  await f.device({boot:'e'.repeat(32)});
  assert.equal((await f.request('/api/state?board='+board,{token})).status,401);
});
test('unknown input remains unknown and offline state is not invented as empty',async t=>{
  const f=await fixture(t);await f.device({sensors:'?'.repeat(9)+'1'+'0'.repeat(26)});const token=(await f.pair()).body.token;
  const state=(await f.request('/api/state?board='+board,{token})).body;
  assert.deepEqual(state.sensors.slice(0,9),Array(9).fill(null));assert.equal(state.sensors[9],true);
  f.advance(5001);assert.equal((await f.request('/api/state?board='+board,{token})).status,409);
});
test('pair-code expiration, failed-attempt limit and origin restriction',async t=>{
  const f=await fixture(t);await f.device();
  for(let i=0;i<5;i++)assert.equal((await f.pair({code:'000000'})).status,401);
  assert.equal((await f.pair()).status,429);
  await f.device({pairCode:'999999'});assert.equal((await f.pair({code:'999999'})).status,200);
  assert.equal((await f.request('/health',{headers:{Origin:'https://evil.example'}})).status,403);
});
test('production allows internal health probes but rejects plain HTTP for board APIs',async t=>{
  const relay=createRelay({devices:{[board]:{keyHash:sha256(key)}}});
  const server=http.createServer(relay.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const health=await fetch(origin+'/health');assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{service:'slowboard-relay',version:3});
  const response=await fetch(origin+'/api/state?board='+board);assert.equal(response.status,426);
});
