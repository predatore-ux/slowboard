// Read the existing original-based revision 1 output without reflashing.
// A report can span several lines when one or more expanders fail.
export class ReportParser {
  constructor(onReport){this.onReport=onReport;this.buffer='';this.report=null;}
  feed(text){
    this.buffer+=text;
    if(this.buffer.length>8192){this.buffer='';this.report=null;this.onReport(Array(36).fill(null));return;}
    let end;
    while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).replace(/\r/g,'');this.buffer=this.buffer.slice(end+1);this.line(line);}
  }
  line(line){
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
  constructor(onReport,onError){this.onReport=onReport;this.onError=onError;this.port=null;this.reader=null;this.task=null;this.pending=null;this.sending=false;this.writeTask=Promise.resolve();}
  async connect(){
    if(!('serial' in navigator))throw Error('Use desktop Chrome or Edge for USB board connection.');
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:115200}); this.port=port;
    const parser=new ReportParser(this.onReport),decoder=new TextDecoder();
    this.task=(async()=>{
      this.reader=port.readable.getReader();
      try{while(this.port===port){const {value,done}=await this.reader.read();if(done)break;parser.feed(decoder.decode(value,{stream:true}));}}
      catch(e){if(this.port===port)this.onError(e);}
      finally{this.reader.releaseLock();this.reader=null;this.onReport(Array(36).fill(null));}
    })();
  }
  send(commands){
    // Keep only the latest full LED frame while a previous one is being sent.
    this.pending=commands;
    if(this.sending||!this.port)return;
    this.sending=true;
    this.writeTask=(async()=>{
      try{while(this.pending&&this.port){
        const message=this.pending;this.pending=null;
        const writer=this.port.writable.getWriter();
        try{await writer.write(new TextEncoder().encode(message));}finally{writer.releaseLock();}
      }}catch(e){this.onError(e);}finally{this.sending=false;}
    })();
  }
  async disconnect(){
    const port=this.port;if(!port)return;
    this.port=null;this.pending=null;
    if(this.reader)await this.reader.cancel();
    await this.task;await this.writeTask;await port.close();
  }
}
