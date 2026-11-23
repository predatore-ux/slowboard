import test from 'node:test';
import assert from 'node:assert/strict';
import {ConfirmedCommands} from '../dist/serial-commands.mjs';
import {BoardSerial} from '../dist/board-protocol.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('commands require the exact firmware acknowledgement, not sensor text',async()=>{
  const sent=[];const queue=new ConfirmedCommands(async line=>sent.push(line));
  let done=false;const pending=queue.send('led 0 255 0 0').then(()=>{done=true;});
  queue.line('Detected magnets: None');await tick();assert.equal(done,false);
  await assert.rejects(queue.send('off'),/already awaiting/);
  queue.line('LED 0 set to RGB(255, 0, 0)');await pending;
  assert.deepEqual(sent,['led 0 255 0 0\n']);
});
test('missing acknowledgement stops later writes',async()=>{
  const sent=[];const queue=new ConfirmedCommands(async line=>sent.push(line),20);
  await assert.rejects(queue.send('off'),/did not confirm/);
  await assert.rejects(queue.send('turn 1'),/did not confirm/);
  assert.deepEqual(sent,['off\n']);
});
test('firmware rejection and restart cancel a command',async()=>{
  for(const response of ['Unknown command. Type help for usage.','SlowBoard original-based revision 1 starting']){
    const queue=new ConfirmedCommands(async()=>{});const pending=queue.send('manual');
    queue.line(response);await assert.rejects(pending,/did not accept/);
  }
});
test('USB bridge waits for startup, paces frames, coalesces updates and turns off on disconnect',async()=>{
  let input,opened=false,closed=false;const written=[],errors=[],reports=[];
  const encoder=new TextEncoder();
  const port={
    readable:new ReadableStream({start(controller){input=controller;}}),
    writable:new WritableStream({write(bytes){written.push(new TextDecoder().decode(bytes));}}),
    async open(options){assert.equal(options.baudRate,115200);opened=true;},
    async close(){closed=true;}
  };
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serial:{requestPort:async()=>port}}});
  const emit=async line=>{input.enqueue(encoder.encode(line+'\r\n'));await tick();};
  const bridge=new BoardSerial(values=>reports.push(values),e=>errors.push(e));
  try{
    const connect=bridge.connect();await tick();assert.equal(opened,true);
    await emit('SlowBoard original-based revision 1 starting');assert.deepEqual(written,[]);
    await emit('Detected magnets: None');assert.deepEqual(written,['manual\n']);
    await emit('Detected magnets: None');assert.equal(written.length,1);
    await emit('Manual lighting enabled; sensors still monitored.');assert.equal(written.at(-1),'off\n');
    await emit('All LEDs turned off.');await connect;assert.equal(bridge.ready,true);
    written.length=0;
    bridge.send('off\nled 0 255 0 0\nturn 1\n');await tick();
    bridge.send('off\nturn 2\n');bridge.send('off\nturn 0\n');
    assert.deepEqual(written,['off\n']);
    await emit('All LEDs turned off.');assert.equal(written.at(-1),'led 0 255 0 0\n');
    // Acknowledgements can be split across USB reads.
    input.enqueue(encoder.encode('LED 0 set to RGB(255,'));await tick();assert.equal(written.length,2);
    await emit(' 0, 0)');assert.equal(written.at(-1),'turn 1\n');
    await emit('Turn indicator: 1');assert.equal(written.at(-1),'off\n');
    await emit('All LEDs turned off.');assert.equal(written.at(-1),'turn 0\n');
    await emit('Turn indicator: 0');await bridge.writeTask;
    assert.deepEqual(written,['off\n','led 0 255 0 0\n','turn 1\n','off\n','turn 0\n']);
    const disconnect=bridge.disconnect();await tick();assert.equal(written.at(-1),'off\n');
    await emit('All LEDs turned off.');await disconnect;
    assert.equal(closed,true);assert.equal(bridge.port,null);assert.equal(bridge.ready,false);
    assert.deepEqual(errors,[]);assert.deepEqual(reports.at(-1),Array(36).fill(null));
  }finally{
    if(bridge.port){bridge.fail(Error('Test cleanup'));await bridge.disconnect();}
    if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;
  }
});
