import {setWorkerTimeout,clearWorkerTimeout} from './ticker.mjs';
import {RELAY_URL} from './network-config.mjs';
import {PAIR_STORAGE,relayOrigin} from './board-network.mjs';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1));
const board=params.get('board');if(board&&/^SB-[A-Fa-f0-9]{12}$/.test(board))$('board').value=board.toUpperCase();
$('relay').value=RELAY_URL||localStorage.getItem('slowboard-relay-origin')||'';
$('relay-note').hidden=Boolean(RELAY_URL);
let heartbeat=null,credentials=null;
async function keepAlive(){
  if(!credentials)return;
  try{
    const response=await fetch(credentials.endpoint+'/api/state?board='+encodeURIComponent(credentials.board),{
      headers:{Authorization:'Bearer '+credentials.token},signal:AbortSignal.timeout(2500),cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Connection ended. Generate a fresh code and pair again.');
    heartbeat=setWorkerTimeout(keepAlive,1000);
  }catch(error){credentials=null;sessionStorage.removeItem(PAIR_STORAGE);$('play-link').hidden=true;$('pair-status').textContent=error.message;}
}
$('pair-form').addEventListener('submit',async event=>{
  event.preventDefault();$('pair-button').disabled=true;$('play-link').hidden=true;
  $('pair-status').textContent='Checking your board and pairing code…';
  try{
    const endpoint=relayOrigin($('relay').value.trim());
    const id=$('board').value.trim().toUpperCase(),code=$('code').value.trim();
    const response=await fetch(endpoint+'/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({board:id,code}),signal:AbortSignal.timeout(6000),credentials:'omit'});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Pairing failed.');
    if(!/^[a-f0-9]{64}$/.test(result.token))throw Error('Invalid pairing response.');
    credentials={endpoint,board:id,token:result.token};sessionStorage.setItem(PAIR_STORAGE,JSON.stringify(credentials));
    localStorage.setItem('slowboard-relay-origin',endpoint);$('code').value='';
    $('pair-status').textContent='Board paired. Continue to the game in this tab.';$('play-link').hidden=false;
    clearWorkerTimeout(heartbeat);keepAlive();
  }catch(error){$('pair-status').textContent=error.message==='Failed to fetch'?'Cannot reach the connection service. Check its address and your internet connection.':error.message;}
  finally{$('pair-button').disabled=false;}
});
addEventListener('pagehide',()=>clearWorkerTimeout(heartbeat));
