// Only real hardware reports travel between same-origin tabs. No saved readings
// are replayed: a silent source becomes unknown after two seconds.
export const SENSOR_CHANNEL='slowboard-sensors-v1';
export const SENSOR_TIMEOUT=2000;
export const unknownSensors=()=>Array(36).fill(null);
export function validSensors(values){return Array.isArray(values)&&values.length===36&&Array.from(values).every(v=>v===null||typeof v==='boolean');}
export class SensorSnapshot {
  constructor(){this.values=unknownSensors();this.at=null;this.source='';}
  accept(values,source,at=Date.now()){
    if(!validSensors(values))return false;
    this.values=values.slice();this.at=at;this.source=source;return true;
  }
  fresh(now=Date.now()){return this.at!==null&&now>=this.at&&now-this.at<SENSOR_TIMEOUT;}
  read(now=Date.now()){return this.fresh(now)?this.values.slice():unknownSensors();}
}
export function sensorChannel(onReport=()=>{},Channel=globalThis.BroadcastChannel){
  if(!Channel)return {publish(){},close(){}};
  const channel=new Channel(SENSOR_CHANNEL);
  let closed=false;
  channel.onmessage=({data})=>{
    const age=Date.now()-data?.at;
    if(data?.type==='sensors'&&['game','monitor'].includes(data.source)&&Number.isFinite(age)&&age>=0&&age<SENSOR_TIMEOUT&&validSensors(data.values)){
      onReport(data.values,data.source,data.at);
    }
  };
  return {
    publish(values,source){if(!closed&&validSensors(values))channel.postMessage({type:'sensors',source,values,at:Date.now()});},
    close(){closed=true;channel.close();}
  };
}
