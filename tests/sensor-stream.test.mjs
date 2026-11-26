import test from 'node:test';
import assert from 'node:assert/strict';
import {SensorSnapshot,sensorChannel,unknownSensors} from '../dist/sensor-stream.mjs';
import {ReportParser} from '../dist/board-protocol.mjs';
import {fromHardware,turnSquare} from '../dist/checkers.mjs';

test('live snapshots retain initial occupancy, reflect lifts and expire to unknown',()=>{
  const state=new SensorSnapshot(),values=Array(36).fill(false);values[0]=true;values[35]=true;
  state.accept(values,'usb',1000);values[0]=false;
  assert.equal(state.read(1001)[0],true);assert.equal(state.read(1001)[35],true);
  state.accept(values,'usb',1100);assert.equal(state.read(1101)[0],false);
  assert.equal(state.accept(Array(35).fill(false),'usb',1200),false);
  assert.equal(state.accept(Array(36),'usb',1200),false);
  assert.deepEqual(state.read(3100),unknownSensors());
});
test('all 36 sensor positions map to homepage coordinates and board faults stay unknown',()=>{
  const reports=[],parser=new ReportParser(values=>reports.push(fromHardware(values)));
  parser.feed('Detected magnets: B1_BL_HALL_A1, B2_BR_HALL_C3, B3_TL_HALL_A3, B4_TR_HALL_C3\nDetected magnets: None\n');
  const values=reports.at(-1);
  assert.equal(values[turnSquare(0)],true); // physical square 0, turned into game coordinates
  assert.equal(values[turnSquare(17)],true); // physical square 17, turned into game coordinates
  assert.equal(values[turnSquare(30)],true); // physical square 30, turned into game coordinates
  assert.equal(values[turnSquare(35)],true); // physical square 35, turned into game coordinates
  parser.feed('Error: Failed to read B4_TR (0x26).None\nDetected magnets: None\n');
  assert.equal(reports.at(-1).filter(v=>v===null).length,9);
});
test('tab feed rejects stale, malformed and simulated data; preserves read errors',()=>{
  let endpoint;const received=[],sent=[];
  class Channel{
    constructor(){endpoint=this;}
    postMessage(message){sent.push(message);}
    close(){this.closed=true;}
  }
  const feed=sensorChannel((...args)=>received.push(args),Channel);
  const values=Array(36).fill(false);values.fill(null,27);
  const message={type:'sensors',source:'game',at:Date.now(),values};
  endpoint.onmessage({data:message});assert.equal(received.length,1);
  assert.equal(received[0][0].filter(v=>v===null).length,9);
  for(const data of [{...message,at:Date.now()-3000},{...message,source:'sim'},{...message,values:[true]},{...message,at:'bad'},null])endpoint.onmessage({data});
  assert.equal(received.length,1);
  feed.publish(values,'game');assert.equal(sent[0].type,'sensors');
  feed.close();assert.equal(endpoint.closed,true);
});
test('an early PCB fault does not temporarily erase other boards occupancy',()=>{
  const reports=[],parser=new ReportParser(values=>reports.push(values));
  parser.feed('Detected magnets: B4_TR_HALL_C3\nDetected magnets: \n');
  parser.feed('Error: Failed to read B1_BL (0x20).\n');
  assert.equal(reports.at(-1)[35],true);
  assert.ok(reports.at(-1).slice(0,9).every(v=>v===null));
  parser.feed('B4_TR_HALL_C3\nDetected magnets: None\n');
  assert.equal(reports.at(-1)[35],true);
});
