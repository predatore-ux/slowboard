import {ConfirmedCommands} from './serial-commands.mjs';
// Read the existing original-based revision 1 output without reflashing.
// A report can span several lines when one or more expanders fail.
export class ReportParser {
  constructor(onReport,onLine=()=>{}){this.onReport=onReport;this.onLine=onLine;this.buffer='';this.report=null;}
  feed(text){
    this.buffer+=text;
    if(this.buffer.length>8192){this.buffer='';this.report=null;this.onReport(Array(36).fill(null));return;}
    let end;
    while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).replace(/\r/g,'');this.buffer=this.buffer.slice(end+1);this.line(line);}
  }
  line(line){
    this.onLine(line);
    if(line.includes('starting')) {this.report=null;this.onReport(Array(36).fill(null));}
    if(line.startsWith('Detected magnets:')) {
      if(this.report)this.onReport(this.report);
      this.report=Array(36).fill(false);
    }
    if(!this.report)return;
    for(const m of line.matchAll(/Failed to read B([1-4])_[A-Z]+/g)) {
      const b=Number(m[1])-1;this.report.fill(null,b*9,b*9+9);
      // Faults block immediately; no waiting for the next report boundary.
      this.onReport(this.report.map((v,i)=>i>=b*9&&i<b*9+9?null:v));
    }
    for(const m of line.matchAll(/B([1-4])_[A-Z]+_HALL_([ABC])([123])/g)) {
      const index=(Number(m[1])-1)*9+'ABC'.indexOf(m[2])*3+Number(m[3])-1;
      if(this.report[index]!==null)this.report[index]=true;
    }
  }
}

export class BoardSerial {
  constructor(onReport,onError){this.onReport=onReport;this.onError=onError;this.port=null;this.reader=null;this.task=null;this.pending=null;this.sending=false;this.ready=false;this.failed=false;this.closing=false;this.writeTask=Promise.resolve();this.commands=null;}
  async connect(){
    if(!('serial' in navigator))throw Error('Use desktop Chrome or Edge for USB board connection.');
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:115200}); this.port=port;this.failed=false;this.ready=false;this.closing=false;
    this.commands=new ConfirmedCommands(async message=>{
      const writer=port.writable.getWriter();
      try{await writer.write(new TextEncoder().encode(message));}finally{writer.releaseLock();}
    });
    let firstReport;
    const started=new Promise(resolve=>{firstReport=resolve;});
    const parser=new ReportParser(values=>this.onReport(values),line=>{
      if(line.startsWith('Detected magnets:'))firstReport();
      if(this.ready&&line.includes('starting'))this.fail(Error('ESP32 restarted. Disconnect and reconnect the board.'));
      this.commands.line(line);
    }),decoder=new TextDecoder();
    this.task=(async()=>{
      this.reader=port.readable.getReader();
      try{while(this.port===port){const {value,done}=await this.reader.read();if(done){if(!this.closing)this.fail(Error('Board serial connection ended. Reconnect the board.'));break;}parser.feed(decoder.decode(value,{stream:true}));}}
      catch(e){if(this.port===port&&!this.closing)this.fail(e);}
      finally{this.reader.releaseLock();this.reader=null;this.ready=false;this.commands.cancel();this.onReport(Array(36).fill(null));}
    })();
    let startupTimer;
    try{
      await Promise.race([started,new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(Error('No sensor reports from the ESP32. Check firmware, port and 115200 baud.')),8000);})]);
      await this.commands.send('manual');
      await this.commands.send('off');
      this.ready=true;
    }catch(e){this.fail(e);throw e;}finally{clearTimeout(startupTimer);}
  }
  fail(e){this.ready=false;this.failed=true;this.pending=null;this.commands?.cancel(e);this.onError(e);}
  send(commands){
    if(!this.ready||this.failed||this.closing)return;
    // Keep only the latest full LED frame while a previous one is being sent.
    this.pending=commands;
    if(this.sending||!this.port)return;
    this.sending=true;
    this.writeTask=(async()=>{
      try{while(this.pending&&this.port){
        const message=this.pending;this.pending=null;
        for(const line of message.trim().split('\n'))await this.commands.send(line);
      }}catch(e){if(!this.closing)this.fail(e);}finally{this.sending=false;}
    })();
  }
  async disconnect(){
    const port=this.port;if(!port)return;
    this.closing=true;this.pending=null;
    await this.writeTask;
    let cleanupError;
    // Leave no old guidance frame behind after a normal disconnect.
    try{if(!this.failed&&this.ready)await this.commands.send('off');}catch(e){cleanupError=e;}
    this.ready=false;this.port=null;this.commands?.cancel();
    if(this.reader)await this.reader.cancel();
    await this.task;await this.writeTask;await port.close();
    if(cleanupError)throw cleanupError;
  }
}
