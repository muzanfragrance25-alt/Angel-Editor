const $ = s => document.querySelector(s);
const state = {
  assets: [], clips: [], selectedId: null, currentTime: 0, playing: false, zoom: 100,
  text: null, transition: null
};
const video = $("#sourceVideo"), canvas = $("#previewCanvas"), ctx = canvas.getContext("2d");
let raf = null, activeAsset = null;

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }
function fmt(t){ t=Math.max(0,t||0); return `${String(Math.floor(t/60)).padStart(2,"0")}:${(t%60).toFixed(2).padStart(5,"0")}`; }
function toast(msg){ const e=$("#toast"); e.textContent=msg; e.classList.add("show"); setTimeout(()=>e.classList.remove("show"),1800); }
function selected(){ return state.clips.find(c=>c.id===state.selectedId); }
function timelineDuration(){ return state.clips.reduce((m,c)=>Math.max(m,c.start+c.duration),0); }

function renderMedia(){
  const list=$("#mediaList"); list.innerHTML="";
  state.assets.forEach(a=>{
    const el=document.createElement("div"); el.className="media-item";
    el.innerHTML=`<img src="${a.thumb||""}" alt=""><div class="media-name">${escapeHtml(a.name)}</div>
      <div class="media-meta">${a.type.toUpperCase()} · ${fmt(a.duration)} · ${formatBytes(a.size)}</div>
      <div class="media-actions"><button data-preview="${a.id}">Preview</button><button data-add="${a.id}">Add to timeline</button></div>`;
    list.appendChild(el);
  });
  list.querySelectorAll("[data-preview]").forEach(b=>b.onclick=()=>previewAsset(b.dataset.preview));
  list.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addClip(b.dataset.add));
}
function formatBytes(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";return (n/1048576).toFixed(1)+" MB"}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

async function importFiles(files){
  for(const file of files){
    const url=URL.createObjectURL(file);
    let duration=0,w=1920,h=1080,thumb="";
    if(file.type.startsWith("video/")){
      duration=await getVideoDuration(url);
      const meta=await makeThumb(url);
      w=meta.w;h=meta.h;thumb=meta.thumb;
    } else if(file.type.startsWith("image/")){
      const im=new Image(); im.src=url; await im.decode(); w=im.naturalWidth;h=im.naturalHeight; duration=5;
      const c=document.createElement("canvas"); c.width=320;c.height=180; c.getContext("2d").drawImage(im,0,0,320,180); thumb=c.toDataURL();
    }
    state.assets.push({id:uid(),name:file.name,type:file.type,url,file,duration,w,h,thumb,size:file.size});
  }
  renderMedia(); toast("Media imported locally");
}
function getVideoDuration(url){return new Promise((res,rej)=>{const v=document.createElement("video");v.preload="metadata";v.src=url;v.onloadedmetadata=()=>res(v.duration);v.onerror=()=>rej(new Error("Could not read video"));});}
function makeThumb(url){return new Promise((res,rej)=>{const v=document.createElement("video");v.muted=true;v.preload="metadata";v.src=url;v.onloadeddata=()=>{v.currentTime=Math.min(.2,v.duration||0);};v.onseeked=()=>{const c=document.createElement("canvas");c.width=320;c.height=180;c.getContext("2d").drawImage(v,0,0,320,180);res({w:v.videoWidth||1920,h:v.videoHeight||1080,thumb:c.toDataURL()});};v.onerror=()=>rej();});}

function previewAsset(id){
  const a=state.assets.find(x=>x.id===id); if(!a)return;
  activeAsset=a; video.src=a.url; video.currentTime=0; video.play().catch(()=>{});
  state.currentTime=0; $("#emptyPreview").style.display="none"; $("#previewStatus").textContent="SOURCE";
}
function addClip(assetId){
  const a=state.assets.find(x=>x.id===assetId); if(!a)return;
  const start=timelineDuration();
  const c={id:uid(),assetId:a.id,start,sourceStart:0,sourceEnd:a.duration,duration:a.duration,speed:1,scale:1,rotation:0,opacity:1,volume:1,effect:"none"};
  state.clips.push(c); state.selectedId=c.id; activeAsset=a; video.src=a.url; video.currentTime=0;
  $("#emptyPreview").style.display="none"; $("#previewStatus").textContent="READY"; renderTimeline(); renderInspector(); drawFrame(); toast("Clip added to timeline");
}
function renderTimeline(){
  const lane=$("#videoTrack"); lane.innerHTML="";
  const px=state.zoom;
  state.clips.forEach(c=>{
    const a=state.assets.find(x=>x.id===c.assetId); if(!a)return;
    const el=document.createElement("div"); el.className="clip"+(c.id===state.selectedId?" selected":"");
    el.style.left=(c.start*px)+"px"; el.style.width=Math.max(25,c.duration*px)+"px";
    el.innerHTML=`<div class="thumb" style="background-image:url('${a.thumb||""}')"></div><div class="clip-label">${escapeHtml(a.name)}</div>`;
    el.onclick=()=>selectClip(c.id);
    lane.appendChild(el);
  });
  $("#zoomLabel").textContent=state.zoom+"%"; updatePlayhead();
}
function selectClip(id){
  state.selectedId=id; const c=selected(); const a=state.assets.find(x=>x.id===c.assetId);
  activeAsset=a; video.src=a.url; video.currentTime=Math.max(0,c.sourceStart); video.pause();
  $("#emptyPreview").style.display="none"; $("#previewStatus").textContent="READY"; renderTimeline(); renderInspector(); drawFrame();
}
function renderInspector(){
  const c=selected(); $("#inspectorEmpty").hidden=!!c; $("#inspectorContent").hidden=!c; if(!c)return;
  const a=state.assets.find(x=>x.id===c.assetId);
  $("#clipName").value=a?.name||"Clip"; $("#trimStart").value=c.sourceStart.toFixed(2); $("#trimEnd").value=c.sourceEnd.toFixed(2);
  $("#speed").value=c.speed; $("#scale").value=c.scale; $("#rotation").value=c.rotation; $("#opacity").value=c.opacity; $("#volume").value=c.volume;
}
function updateClipFromInspector(){
  const c=selected(); if(!c)return;
  c.sourceStart=Math.max(0,Math.min(+$("#trimStart").value,c.sourceEnd-.05));
  c.sourceEnd=Math.max(c.sourceStart+.05,Math.min(+$("#trimEnd").value,assetDuration(c)));
  c.duration=(c.sourceEnd-c.sourceStart)/c.speed;
  c.speed=+$("#speed").value;c.scale=+$("#scale").value;c.rotation=+$("#rotation").value;c.opacity=+$("#opacity").value;c.volume=+$("#volume").value;
  renderTimeline(); drawFrame();
}
function assetDuration(c){return state.assets.find(a=>a.id===c.assetId)?.duration||0;}

function currentClipAt(t=state.currentTime){return state.clips.find(c=>t>=c.start && t<c.start+c.duration);}
function seekTo(t){
  const dur=timelineDuration(); state.currentTime=Math.max(0,Math.min(t,dur));
  const c=currentClipAt(state.currentTime);
  if(c){
    const local=state.currentTime-c.start;
    const source=c.sourceStart+local*c.speed;
    const a=state.assets.find(x=>x.id===c.assetId);
    if(activeAsset?.id!==a.id){activeAsset=a;video.src=a.url;}
    if(Math.abs(video.currentTime-source)>.08)video.currentTime=source;
    video.playbackRate=c.speed; video.volume=c.volume;
  } else video.pause();
  updatePlayhead(); drawFrame(); updateLabels();
}
function updatePlayhead(){
  const x=58+state.currentTime*state.zoom;
  $("#playhead").style.left=x+"px";
  $("#seek").max=timelineDuration(); $("#seek").value=state.currentTime;
}
function updateLabels(){$("#currentTime").textContent=fmt(state.currentTime);$("#durationTime").textContent=fmt(timelineDuration());$("#timeBadge").textContent=fmt(state.currentTime);}

function drawFrame(){
  const c=currentClipAt(); const a=c&&state.assets.find(x=>x.id===c.assetId);
  if(!c||!a||!video.videoWidth){ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  canvas.width=a.w||video.videoWidth; canvas.height=a.h||video.videoHeight;
  ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
  const scale=c.scale||1; const op=c.opacity??1;
  ctx.globalAlpha=op;
  ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate((c.rotation||0)*Math.PI/180);
  const sw=canvas.width*scale, sh=canvas.height*scale;
  ctx.filter=effectFilter(c.effect);
  ctx.drawImage(video,-sw/2,-sh/2,sw,sh);
  ctx.restore();
  if(state.text){ctx.save();ctx.fillStyle=state.text.color||"white";ctx.font=`${state.text.size||64}px sans-serif`;ctx.textAlign="center";ctx.fillText(state.text.value,canvas.width/2,canvas.height*.85);ctx.restore();}
}
function effectFilter(e){
  if(e==="bw")return "grayscale(1)";
  if(e==="cinematic")return "contrast(1.2) saturate(.85) brightness(.95)";
  if(e==="dreamy")return "brightness(1.08) saturate(1.15) blur(1px)";
  if(e==="vintage")return "sepia(.35) contrast(1.08) saturate(.8)";
  if(e==="glow")return "brightness(1.08) saturate(1.15) blur(.6px)";
  return "none";
}

function loop(){
  if(state.playing){
    const dt=.016; state.currentTime+=dt;
    if(state.currentTime>=timelineDuration()){state.currentTime=0;}
    seekTo(state.currentTime);
  }
  raf=requestAnimationFrame(loop);
}
loop();

$("#fileInput").onchange=e=>importFiles([...e.target.files]);
$("#importBtn").onclick=()=>$("#fileInput").click();$("#importCard").onclick=()=>$("#fileInput").click();
$("#playBtn").onclick=()=>{
  if(!state.clips.length){toast("Add a clip to the timeline first");return;}
  state.playing=!state.playing; $("#playBtn").textContent=state.playing?"⏸":"▶";
  if(state.playing){const c=currentClipAt(); if(c)video.play().catch(()=>{});}else video.pause();
};
$("#seek").oninput=e=>{state.playing=false;$("#playBtn").textContent="▶";seekTo(+e.target.value);}
$("#prevBtn").onclick=()=>seekTo(Math.max(0,state.currentTime-.5));$("#nextBtn").onclick=()=>seekTo(Math.min(timelineDuration(),state.currentTime+.5));
$("#splitBtn").onclick=()=>{
  const c=selected();if(!c){toast("Select a clip");return}
  const local=state.currentTime-c.start;if(local<=.05||local>=c.duration-.05){toast("Put the playhead inside the clip");return}
  const cutSource=c.sourceStart+local*c.speed;
  const second={...c,id:uid(),sourceStart:cutSource,start:c.start+local,duration:c.duration-local,sourceEnd:c.sourceEnd};
  c.sourceEnd=cutSource;c.duration=local;
  state.clips.push(second);state.clips.sort((a,b)=>a.start-b.start);state.selectedId=second.id;renderTimeline();renderInspector();toast("Clip split");
};
$("#deleteBtn").onclick=()=>{if(!selected())return;state.clips=state.clips.filter(c=>c.id!==state.selectedId);state.selectedId=null;renderTimeline();renderInspector();toast("Clip deleted");};
["trimStart","trimEnd","speed","scale","rotation","opacity","volume"].forEach(id=>$( "#"+id).addEventListener("input",updateClipFromInspector));
$("#addTextBtn").onclick=()=>{state.text={value:"Your text",size:64,color:"#ffffff"};toast("Text layer added");drawFrame();};
document.querySelectorAll("[data-effect]").forEach(b=>b.onclick=()=>{const c=selected();if(!c){toast("Select a video clip first");return}c.effect=b.dataset.effect;renderInspector();drawFrame();toast("Effect applied");});
document.querySelectorAll("[data-transition]").forEach(b=>b.onclick=()=>{state.transition=b.dataset.transition;toast("Transition preset selected");});
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));t.classList.add("active");$("#panel-"+t.dataset.panel).classList.add("active");});
$("#zoomIn").onclick=()=>{state.zoom=Math.min(250,state.zoom+25);renderTimeline()};$("#zoomOut").onclick=()=>{state.zoom=Math.max(50,state.zoom-25);renderTimeline()};
$("#newProjectBtn").onclick=()=>{if(confirm("Start a new project?")){state.assets=[];state.clips=[];state.selectedId=null;state.currentTime=0;renderMedia();renderTimeline();renderInspector();ctx.clearRect(0,0,canvas.width,canvas.height);$("#emptyPreview").style.display="flex";}};
$("#saveProjectBtn").onclick=()=>{
  const data={version:1,clips:state.clips,projectName:$("#projectName").textContent};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});downloadBlob(blob,"angel-project.json");toast("Project JSON saved");
};

$("#exportBtn").onclick=()=>{$("#exportModal").hidden=false;$("#exportProgress").hidden=true;};
$("#cancelExport").onclick=()=>$("#exportModal").hidden=true;
$("#startExport").onclick=exportVideo;

async function exportVideo(){
  if(!state.clips.length){toast("Add a video clip first");return}
  $("#exportProgress").hidden=false;$("#startExport").disabled=true;
  const quality=+$("#exportQuality").value; const out=document.createElement("canvas"); out.width=quality==="1080"?1920:1280; out.height=quality==="1080"?1080:720;
  const octx=out.getContext("2d"); const stream=out.captureStream(30);
  let audioStream=null;
  try{audioStream=video.captureStream?.(); if(audioStream) audioStream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch{}
  const mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm";
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});
  const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  const done=new Promise(resolve=>rec.onstop=resolve);rec.start();
  const wasPlaying=state.playing;state.playing=false;$("#playBtn").textContent="▶";
  const start=performance.now(), total=timelineDuration();
  while(state.currentTime<total){
    seekTo(state.currentTime);
    await new Promise(r=>setTimeout(r,33));
    drawExportFrame(octx,out.width,out.height);
    state.currentTime+=1/30;
    const p=Math.min(100,state.currentTime/total*100);$("#progressBar").style.width=p+"%";$("#progressText").textContent=`Rendering ${p.toFixed(0)}%`;
  }
  rec.stop(); await done; if(wasPlaying)state.playing=true;
  const blob=new Blob(chunks,{type:mime});downloadBlob(blob,"angel-edit.webm");
  $("#progressText").textContent="Export complete — downloaded as WebM";$("#startExport").disabled=false;
}
function drawExportFrame(octx,w,h){
  octx.fillStyle="#000";octx.fillRect(0,0,w,h);
  const c=currentClipAt(),a=c&&state.assets.find(x=>x.id===c.assetId);if(!c||!a)return;
  const scale=Math.min(w/(video.videoWidth||w),h/(video.videoHeight||h))*(c.scale||1);
  const dw=(video.videoWidth||w)*scale,dh=(video.videoHeight||h)*scale;
  octx.save();octx.globalAlpha=c.opacity??1;octx.translate(w/2,h/2);octx.rotate((c.rotation||0)*Math.PI/180);octx.filter=effectFilter(c.effect);octx.drawImage(video,-dw/2,-dh/2,dw,dh);octx.restore();
  if(state.text){octx.fillStyle=state.text.color;octx.font=`${state.text.size||64}px sans-serif`;octx.textAlign="center";octx.fillText(state.text.value,w/2,h*.85);}
}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}

video.addEventListener("loadedmetadata",()=>{drawFrame();});
video.addEventListener("timeupdate",()=>{if(state.playing)drawFrame();});
renderMedia();renderTimeline();renderInspector();updateLabels();
