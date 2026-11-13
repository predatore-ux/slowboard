const arrangement = {hero:{cream:[24,26,28,31,33,35,19],red:[0,2,4,7,9,11,16]},left:{cream:[24,26,28,31,33,35,19],red:[0,2,4,7,9,11,16]},right:{cream:[0,2,4,7,9,11,16],red:[24,26,28,31,33,35,19]}};
document.querySelectorAll('[data-board]').forEach(board=>{
  const pieces=arrangement[board.dataset.board];
  for(let i=0;i<36;i++){
    const cell=document.createElement('div');
    cell.className='cell'+((Math.floor(i/6)+i%6)%2?' alt':'')+(i===19?' glow':'');
    if(pieces.cream.includes(i)||pieces.red.includes(i)){
      const piece=document.createElement('span');piece.className='piece'+(pieces.red.includes(i)?' red':'');cell.append(piece);
    }
    board.append(cell);
  }
});
const demo=document.getElementById('demo-grid');
const status=document.getElementById('move-status');
let signalTimer;
for(let i=0;i<36;i++){
  const square=document.createElement('button');
  const coordinate=String.fromCharCode(65+i%6)+(6-Math.floor(i/6));
  square.type='button';square.className='cell'+((Math.floor(i/6)+i%6)%2?' alt':'');square.textContent=coordinate;
  square.setAttribute('aria-label','Send a demo move at '+coordinate);square.setAttribute('aria-pressed','false');
  square.addEventListener('click',()=>{
    clearTimeout(signalTimer);
    demo.querySelectorAll('button').forEach(cell=>{cell.classList.remove('selected','received');cell.setAttribute('aria-pressed','false');});
    square.classList.add('selected');square.setAttribute('aria-pressed','true');status.textContent='Your move: '+coordinate+'. Sending a little signal…';
    signalTimer=setTimeout(()=>{square.classList.add('received');status.textContent='Signal received at '+coordinate+'. A small move, a shared moment.';},850);
  });
  square.addEventListener('keydown',event=>{
    const offsets={ArrowRight:1,ArrowLeft:-1,ArrowDown:6,ArrowUp:-6};
    if(event.key in offsets){event.preventDefault();const next=i+offsets[event.key];if(next>=0&&next<36)demo.children[next].focus();}
  });
  demo.append(square);
}
document.getElementById('reset-demo').addEventListener('click',()=>{
  clearTimeout(signalTimer);demo.querySelectorAll('button').forEach(cell=>{cell.classList.remove('selected','received');cell.setAttribute('aria-pressed','false');});status.textContent='The board is waiting for your move.';
});

// Native scroll drives three pinned scenes; no wheel interception or scroll hijacking.
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const narrow=matchMedia('(max-width: 850px)');
const $=selector=>document.querySelector(selector);
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const hero=$('.hero'),heroCopy=$('.hero-copy'),heroBoard=$('.hero-board');
const heroFloat=$('.hero-art .board-float'),heroAfter=$('.hero-after');
const red=$('.hero-art .piece-coral'),cream=$('.hero-art .piece-cream');
const statement=$('.manifesto h2');
// Wrap only text nodes, preserving the authored line break and emphasis.
function wrapWords(node){
  [...node.childNodes].forEach(child=>{
    if(child.nodeType===3){const fragment=document.createDocumentFragment();child.textContent.split(/(\s+)/).forEach(word=>{if(!word.trim()){fragment.append(document.createTextNode(word));return;}const span=document.createElement('span');span.className='word';span.textContent=word;fragment.append(span);});child.replaceWith(fragment);}
    else if(child.nodeType===1)wrapWords(child);
  });
}
wrapWords(statement);
const words=[...statement.querySelectorAll('.word')];
const sceneTracks=['.hero-runway','.manifesto-runway','.experience-runway'].map(selector=>({element:$(selector),top:0,range:1}));
const progress=document.createElement('div');progress.className='page-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
const revealTargets=[...document.querySelectorAll('.play-copy,.demo-wrap,.inside-title,.inside-content,.prototype-note,.closing h2')];
revealTargets.forEach(element=>element.classList.add('reveal'));
const revealObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('is-visible');});},{threshold:.12});
revealTargets.forEach(element=>revealObserver.observe(element));
let frame=0,lastTime=0,currentY=scrollY,targetY=scrollY;
let pointerX=0,pointerY=0,easedX=0,easedY=0;
const animated=[hero,heroCopy,heroBoard,heroFloat,heroAfter,red,cream,$('.scene-halo'),$('.manifesto-bottom'),$('.background-word'),$('.board-left'),$('.board-right'),$('.connection-line'),...document.querySelectorAll('.steps article'),...words];
function measure(){sceneTracks.forEach(track=>{track.top=track.element.getBoundingClientRect().top+scrollY;track.range=Math.max(1,track.element.offsetHeight-innerHeight);});}
function render(time){
  frame=0;
  if(motion.matches)return;
  const dt=Math.min(64,lastTime?time-lastTime:16);lastTime=time;
  const easing=1-Math.exp(-dt/65);
  currentY+=(targetY-currentY)*easing;easedX+=(pointerX-easedX)*easing;easedY+=(pointerY-easedY)*easing;
  const [h,m,c]=sceneTracks.map(track=>clamp((currentY-track.top)/track.range));
  const turn=smooth(h/.8),introOut=smooth(h/.34),secondIn=smooth((h-.38)/.24);
  const mobile=narrow.matches;
  hero.style.setProperty('--hero-progress',h.toFixed(4));
  heroCopy.style.opacity=(1-introOut).toFixed(4);
  heroCopy.style.transform=`translate3d(0,${-introOut*110}px,0)`;
  // Prevent an invisible hero CTA from catching clicks or keyboard focus.
  heroCopy.inert=introOut>.98;
  heroFloat.style.transform=`translate3d(${turn*(mobile?-21:-20)}vw,${turn*(mobile?3:-4)}vh,0) scale(${1+turn*(mobile?.14:.22)})`;
  heroBoard.style.transform=`perspective(1400px) rotateX(${42-turn*27+easedY*2}deg) rotateY(${-12+turn*17+easedX*3}deg) rotateZ(${-24+turn*39}deg)`;
  heroAfter.style.opacity=secondIn.toFixed(4);
  heroAfter.style.transform=`translate3d(0,${(1-secondIn)*55}px,0)`;
  // On desktop the second caption sits left; board remains on the right.
  if(!mobile)heroFloat.style.transform=`translate3d(${turn*1}vw,${turn*-3}vh,0) scale(${1+turn*.1})`;
  red.style.transform=`translate3d(${turn*-15}vw,${-turn*160}px,0) rotate(${-20+turn*100}deg)`;
  cream.style.transform=`translate3d(${turn*12}vw,${turn*100}px,0) rotate(${turn*-70}deg)`;
  $('.scene-halo').style.transform=`translate3d(${-turn*20}vw,${turn*15}vh,0) scale(${1+turn*.3})`;
  words.forEach((word,index)=>{const active=clamp((m*.95+.08)*words.length-index);word.style.color=`color-mix(in srgb, #263c31 ${Math.round(active*100)}%, #c8cdbf)`;});
  $('.manifesto-bottom').style.opacity=(.4+.6*smooth(m/.65)).toFixed(3);
  $('.background-word').style.transform=`translate3d(${-8+m*12}%,${50-m*80}px,0)`;
  const connect=smooth(c/.8);
  $('.board-left').style.transform=`translate3d(${(1-connect)*-70}px,${(1-connect)*50}px,0) rotate(${(1-connect)*-12}deg)`;
  $('.board-right').style.transform=`translate3d(${(1-connect)*70}px,${(1-connect)*-45}px,0) rotate(${(1-connect)*12}deg)`;
  $('.connection-line').style.setProperty('--signal-progress',clamp((c-.25)/.6).toFixed(3));
  document.querySelectorAll('.steps article').forEach((step,index)=>{const active=Math.min(2,Math.floor(c*3.3));step.style.opacity=index===active?'1':'.38';});
  const destination=$('[data-board="right"] .glow');destination.style.filter=c>.78?'brightness(1.5)':'none';
  progress.style.transform=`scaleX(${clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight))})`;
  if(Math.abs(targetY-currentY)>.15||Math.abs(pointerX-easedX)>.003||Math.abs(pointerY-easedY)>.003)requestFrame();
}
function requestFrame(){if(!frame&&!motion.matches)frame=requestAnimationFrame(render);}
function setupMotion(){
  document.documentElement.classList.toggle('motion-ready',!motion.matches);
  if(motion.matches){cancelAnimationFrame(frame);frame=0;animated.forEach(element=>element.removeAttribute('style'));heroCopy.inert=false;revealTargets.forEach(element=>element.classList.add('is-visible'));}
  currentY=targetY=scrollY;measure();requestFrame();
}
addEventListener('scroll',()=>{targetY=scrollY;requestFrame();},{passive:true});
addEventListener('resize',()=>{measure();currentY=targetY=scrollY;requestFrame();},{passive:true});
hero.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'){pointerX=event.clientX/innerWidth-.5;pointerY=event.clientY/innerHeight-.5;requestFrame();}},{passive:true});
hero.addEventListener('pointerleave',()=>{pointerX=pointerY=0;requestFrame();});
motion.addEventListener('change',setupMotion);
document.fonts.ready.then(()=>{measure();requestFrame();});
setupMotion();

