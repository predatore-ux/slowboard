// The legacy sketch has no frame command. Send one command at a time and wait
// for its exact response, rather than filling the ESP32 UART buffer in a burst.
export function responseFor(command) {
  if(command==='manual')return 'Manual lighting enabled; sensors still monitored.';
  if(command==='off')return 'All LEDs turned off.';
  let m=/^turn ([012])$/.exec(command);
  if(m)return `Turn indicator: ${m[1]}`;
  m=/^led (\d+) (\d+) (\d+) (\d+)$/.exec(command);
  if(m)return `LED ${m[1]} set to RGB(${m[2]}, ${m[3]}, ${m[4]})`;
  throw Error(`Unsupported bridge command: ${command}`);
}
export class ConfirmedCommands {
  constructor(write,timeout=2500){this.write=write;this.timeout=timeout;this.waiter=null;this.failure=null;}
  line(line){
    const w=this.waiter;if(!w)return;
    if(line===w.expected){clearTimeout(w.timer);this.waiter=null;w.resolve();}
    else if(line.startsWith('Unknown command.')||line.startsWith('Error: command')||line.includes('starting')){
      this.cancel(Error('Firmware did not accept the command, or restarted. Reconnect using original-based revision 1.'));
    }
  }
  cancel(error=Error('Board disconnected.')){
    this.failure=error;
    if(this.waiter){clearTimeout(this.waiter.timer);this.waiter.reject(error);this.waiter=null;}
  }
  async send(command){
    if(this.failure)throw this.failure;
    if(this.waiter)throw Error('A board command is already awaiting acknowledgement.');
    const expected=responseFor(command);
    let resolve,reject;
    const reply=new Promise((yes,no)=>{resolve=yes;reject=no;});
    // Attach error handling before the write: unplugging can reject the reply first.
    reply.catch(()=>{});
    this.waiter={expected,resolve,reject,timer:setTimeout(()=>this.cancel(Error(`ESP32 did not confirm "${command}". Disconnect and reconnect the board.`)),this.timeout)};
    try{await this.write(command+'\n');await reply;}
    catch(e){this.cancel(e);throw e;}
  }
}
