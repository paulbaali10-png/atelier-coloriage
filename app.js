(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CFG = window.ATELIER_CONFIG || {};
const FN_URL = (CFG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/atelier";

let st = { hasPin:false, limit:2, used:0, bonus:0, remaining:0, editMax:3 };
let current = null, busy = false, parentPin = null;

/* ---------- API ---------- */
async function api(action, payload={}, timeoutMs=20000){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  let r;
  try{
    r = await fetch(FN_URL, { method:"POST", signal:ctrl.signal,
      headers:{ "Content-Type":"application/json", "apikey": CFG.publishableKey || "" },
      body: JSON.stringify({ action, ...payload }) });
  }catch(e){ throw new Error(e.name==="AbortError" ? "Ça met trop de temps. Vérifie internet et réessaie." : "Pas de connexion internet ?"); }
  finally{ clearTimeout(t); }
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || "Erreur. Réessaie.");
  return data;
}

/* Le serveur dessine en arrière-plan : on vérifie toutes les 3 s. */
async function waitJob(jobId){
  const t0=Date.now(); let netErrors=0;
  while(Date.now()-t0 < 300000){
    await new Promise(r=>setTimeout(r,3000));
    let j;
    try{ j=await api("job",{ id:jobId }); netErrors=0; }
    catch(e){ if(++netErrors>=5) throw e; continue; }
    if(j.status==="done") return j;
    if(j.status==="error"){ if(j.counter){ st=j.counter; renderCounter(); } throw new Error(j.error||"Le dessin n'a pas pu être fait."); }
  }
  throw new Error("Le dessin prend trop de temps. Regarde dans ta galerie dans quelques minutes.");
}

/* ---------- helpers ---------- */
function show(id){ $$("section").forEach(s=>s.classList.toggle("hidden", s.id!==id)); }
function msg(el, text, err){ el.innerHTML=""; if(!text) return; const d=document.createElement("div"); d.className="msg"+(err?" err":""); d.textContent=text; el.appendChild(d); }
function slug(s){ return (s||"dessin").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"dessin"; }

/* ---------- counter ---------- */
function renderCounter(){
  const total=st.limit+st.bonus, left=st.remaining;
  $("#counter").classList.remove("hidden");
  $("#counterTxt").textContent = left>0 ? `Il te reste ${left} dessin${left>1?"s":""}` : "Plus de dessin aujourd'hui";
  const dots=$("#dots"); dots.innerHTML="";
  for(let i=0;i<Math.min(total,10);i++){ const d=document.createElement("span"); d.className="dot"+(i<left?"":" off"); dots.appendChild(d); }
  $("#createCard").classList.toggle("hidden", left<=0);
  $("#limitCard").classList.toggle("hidden", left>0);
  $("#todayInfo").textContent = `${st.used} dessin(s) fait(s), ${left} restant(s).`;
  $("#limVal").textContent = st.limit;
}

/* ---------- navigation ---------- */
function go(view){
  $$(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.view===view?"true":"false"));
  if(view==="parent" && !parentPin){ askPin("check"); return; }
  if(view==="gallery") loadGallery();
  show("v-"+view);
  if(view==="parent") renderCounter();
}
$$(".tab").forEach(t=>t.addEventListener("click",()=>{ if(!busy) go(t.dataset.view); }));
$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));

/* ---------- idea chips ---------- */
const SUBJ=["un dragon","un chat ninja","un robot","une licorne","un T-rex","un astronaute","un pirate","un chevalier","un renard","un requin","un hibou","un panda","un footballeur","une sorcière","un monstre rigolo"];
const ACT=["qui fait du skate","qui joue au foot","qui mange une pizza géante","qui conduit une voiture de course","qui fait du surf","qui joue de la guitare","qui pêche","qui vole en montgolfière","qui construit une cabane"];
const PLACE=["sur la Lune","dans la jungle","au fond de la mer","dans un château","en ville","à la montagne","dans l'espace","dans un stade","sur une île déserte"];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function renderChips(){
  const c=$("#chips"); c.innerHTML="";
  const dice=document.createElement("button"); dice.className="chip dice"; dice.textContent="🎲 Idée au hasard";
  dice.onclick=()=>{ $("#idea").value=`${pick(SUBJ)} ${pick(ACT)} ${pick(PLACE)}`; };
  c.appendChild(dice);
  [...SUBJ].sort(()=>Math.random()-.5).slice(0,6).forEach(s=>{
    const b=document.createElement("button"); b.className="chip"; b.textContent=s;
    b.onclick=()=>{ const t=$("#idea"); t.value=(t.value.trim()? t.value.trim()+" et ":"")+s; t.focus(); };
    c.appendChild(b);
  });
}

/* ---------- SVG sanitize (affichage) ---------- */
const ALLOWED=new Set(["svg","g","path","circle","ellipse","rect","polygon","polyline","line","defs","title"]);
const BLACK=new Set(["#000","#000000","black"]);
function inherited(el,attr){ for(let n=el;n&&n.nodeType===1;n=n.parentNode){ const v=n.getAttribute(attr); if(v!=null) return v.trim().toLowerCase(); } return null; }
function cleanSvg(text){
  const a=(text||"").indexOf("<svg"), b=(text||"").lastIndexOf("</svg>");
  if(a<0||b<0) return null;
  const doc=new DOMParser().parseFromString(text.slice(a,b+6),"image/svg+xml");
  const root=doc.documentElement;
  if(!root||root.nodeName.toLowerCase()!=="svg"||doc.querySelector("parsererror")) return null;
  const strip=el=>[...el.attributes].forEach(at=>{ const nm=at.name.toLowerCase();
    if(nm.startsWith("on")||nm.includes("href")||nm==="style"||nm==="filter"||nm==="mask"||nm==="clip-path"||/url\(/i.test(at.value)) el.removeAttribute(at.name); });
  const walk=n=>[...n.children].forEach(c=>{ if(!ALLOWED.has(c.nodeName.toLowerCase())){ c.remove(); return; } strip(c); walk(c); });
  strip(root); walk(root);
  root.querySelectorAll("path,circle,ellipse,rect,polygon,polyline,line").forEach(el=>{
    const isBg = el.nodeName==="rect" && parseFloat(el.getAttribute("width"))>=200 && parseFloat(el.getAttribute("height"))>=280;
    if(isBg){ el.setAttribute("fill","#fff"); el.setAttribute("stroke","none"); return; }
    const fill=inherited(el,"fill");
    if(fill!=="none" && !BLACK.has(fill||"")) el.setAttribute("fill", (el.nodeName==="line"||el.nodeName==="polyline") ? "none" : "#fff");
    if(inherited(el,"stroke")!=="none") el.setAttribute("stroke","#000");
    if(inherited(el,"stroke-width")==null) el.setAttribute("stroke-width","1.6");
    el.setAttribute("stroke-linejoin","round"); el.setAttribute("stroke-linecap","round");
  });
  root.setAttribute("xmlns","http://www.w3.org/2000/svg");
  if(!root.getAttribute("viewBox")) root.setAttribute("viewBox","0 0 210 297");
  root.removeAttribute("width"); root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio","xMidYMid meet");
  return new XMLSerializer().serializeToString(root);
}
function svgNode(t){ return document.importNode(new DOMParser().parseFromString(t,"image/svg+xml").documentElement,true); }

/* ---------- loading ---------- */
let barTimer=null;
function setLoading(on,label){
  $("#loading").classList.toggle("hidden",!on);
  if(label) $("#loadTxt").textContent=label;
  clearInterval(barTimer);
  const bar=$("#barFill");
  if(on){ let p=3; bar.style.width=p+"%"; barTimer=setInterval(()=>{ p+= (95-p)*0.04; bar.style.width=p+"%"; },500); }
  $$("#v-result button, #v-result input").forEach(b=>b.disabled=on);
  $$(".tab").forEach(t=>t.disabled=on);
}

/* ---------- result ---------- */
function renderResult(){
  const sheet=$("#sheet");
  [...sheet.children].forEach(c=>{ if(c.id!=="loading") c.remove(); });
  const clean=current?.svg ? cleanSvg(current.svg) : null;
  if(clean) sheet.insertBefore(svgNode(clean), $("#loading"));
  $("#resTitle").textContent = current ? current.idea : "";
  const left=st.editMax-(current?.edits||0);
  $("#editsLeft").textContent = left>0 ? `${left} retouche${left>1?"s":""} possible${left>1?"s":""}` : "Plus de retouche pour ce dessin";
  $("#edit").disabled = left<=0; $("#editBtn").disabled = left<=0;
  $("#delBtn").classList.toggle("hidden", !parentPin);
  // feuille d'impression
  const ps=$("#printSheet"); ps.innerHTML=""; if(clean) ps.appendChild(svgNode(clean));
  msg($("#resMsg"),"");
}

$("#drawBtn").addEventListener("click", async ()=>{
  if(busy) return;
  const idea=$("#idea").value.trim();
  if(idea.length<3){ msg($("#createMsg"),"Écris ou dicte ton idée d'abord !",true); return; }
  busy=true; msg($("#createMsg"),"");
  current={ id:null, idea, svg:null, edits:0 };
  show("v-result"); renderResult(); setLoading(true,"Je dessine…");
  try{
    const g=await api("generate",{ idea });
    st=g.status; renderCounter();
    const r=await waitJob(g.jobId);
    current=r.drawing; st=r.counter;
    setLoading(false); renderCounter(); renderResult(); $("#idea").value="";
  }catch(e){
    setLoading(false); current=null; go("create");
    msg($("#createMsg"), e.message, true);
    refreshStatus();
  }finally{ busy=false; }
});

$("#editBtn").addEventListener("click", async ()=>{
  if(busy||!current?.id) return;
  const instruction=$("#edit").value.trim();
  if(instruction.length<2){ msg($("#resMsg"),"Écris ce que tu veux changer.",true); return; }
  busy=true; setLoading(true,"Je retouche…");
  try{
    const g=await api("edit",{ id:current.id, instruction });
    const r=await waitJob(g.jobId);
    current=r.drawing; $("#edit").value="";
    setLoading(false); renderResult();
  }catch(e){ setLoading(false); renderResult(); msg($("#resMsg"), e.message, true); }
  finally{ busy=false; }
});

$("#newBtn").addEventListener("click",()=>{ current=null; go("create"); });
$("#delBtn").addEventListener("click", async ()=>{
  if(!parentPin||!current?.id) return;
  try{ await api("delete",{ pin:parentPin, id:current.id }); current=null; go("gallery"); }
  catch(e){ msg($("#resMsg"),e.message,true); }
});

/* ---------- print / save ---------- */
$("#pdfBtn").addEventListener("click",()=>{ if(current?.svg) window.print(); });
$("#pngBtn").addEventListener("click", async ()=>{
  const clean=current?.svg && cleanSvg(current.svg); if(!clean) return;
  try{
    const w=1654,h=2339;
    const img=new Image();
    await new Promise((ok,ko)=>{ img.onload=ok; img.onerror=ko;
      img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(clean.replace("<svg",`<svg width="${w}" height="${h}"`)); });
    const c=document.createElement("canvas"); c.width=w; c.height=h;
    const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h);
    const blob=await new Promise(r=>c.toBlob(r,"image/png"));
    const name=`coloriage-${slug(current.idea)}.png`;
    const file=new File([blob],name,{type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({ files:[file] }); return; }
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000);
  }catch(e){ if(e&&e.name==="AbortError") return; msg($("#resMsg"),"Impossible d'enregistrer l'image.",true); }
});

/* ---------- gallery ---------- */
async function loadGallery(){
  const g=$("#grid"); g.innerHTML='<div class="empty">Chargement…</div>';
  try{
    const { drawings }=await api("gallery");
    g.innerHTML="";
    if(!drawings.length){ g.innerHTML='<div class="empty">Pas encore de dessin. Va dans « Créer » !</div>'; return; }
    drawings.forEach(d=>{
      const b=document.createElement("button"); b.className="thumb";
      const im=document.createElement("div"); im.className="im";
      const clean=cleanSvg(d.svg); if(clean) im.appendChild(svgNode(clean));
      const cap=document.createElement("div"); cap.className="cap"; cap.textContent=d.idea;
      b.append(im,cap);
      b.onclick=()=>{ current={...d}; show("v-result"); renderResult(); };
      g.appendChild(b);
    });
  }catch(e){ g.innerHTML=""; const d=document.createElement("div"); d.className="empty"; d.textContent=e.message; g.appendChild(d); }
}

/* ---------- PIN ---------- */
let pinMode="check", pinBuf="", pinFirst="";
function askPin(mode){
  pinMode=mode; pinBuf=""; pinFirst="";
  $("#pinTitle").textContent = mode==="check" ? "Code parent" : "Choisis un code à 4 chiffres";
  $("#pinErr").textContent=""; drawPin(); $("#pinModal").classList.remove("hidden");
}
function drawPin(){ $$("#pinDots i").forEach((d,i)=>d.classList.toggle("f",i<pinBuf.length)); }
function buildPad(){
  const p=$("#pad"); ["1","2","3","4","5","6","7","8","9","⌫","0","✓"].forEach(k=>{
    const b=document.createElement("button"); b.textContent=k;
    b.onclick=()=>{
      if(k==="⌫") pinBuf=pinBuf.slice(0,-1);
      else if(k==="✓"){ submitPin(); return; }
      else if(pinBuf.length<4) pinBuf+=k;
      drawPin(); if(pinBuf.length===4) setTimeout(submitPin,120);
    }; p.appendChild(b); });
}
let pinBusy=false;
async function submitPin(){
  if(pinBuf.length<4||pinBusy) return;
  pinBusy=true;
  try{
    if(pinMode==="check"){
      try{ st=await api("parent_check",{ pin:pinBuf }); parentPin=pinBuf; $("#pinModal").classList.add("hidden"); $(".tab.lock").textContent="🔓 Parent"; go("parent"); }
      catch(e){ $("#pinErr").textContent=e.message; pinBuf=""; drawPin(); }
      return;
    }
    if(!pinFirst){ pinFirst=pinBuf; pinBuf=""; $("#pinTitle").textContent="Tape-le une 2e fois"; drawPin(); return; }
    if(pinBuf!==pinFirst){ $("#pinErr").textContent="Les deux codes sont différents, recommence"; pinFirst=""; pinBuf=""; $("#pinTitle").textContent="Choisis un code à 4 chiffres"; drawPin(); return; }
    try{
      if(pinMode==="setup"){ st=await api("setup",{ newPin:pinBuf }); $("#pinModal").classList.add("hidden"); startApp(); }
      else { st=await api("set_pin",{ pin:parentPin, newPin:pinBuf }); parentPin=pinBuf; $("#pinModal").classList.add("hidden"); msg($("#parentMsg"),"Code changé."); }
    }catch(e){ $("#pinErr").textContent=e.message; pinBuf=""; pinFirst=""; drawPin(); }
  } finally { pinBusy=false; }
}
$("#pinCancel").addEventListener("click",()=>{ $("#pinModal").classList.add("hidden"); if(pinMode==="check") go("create"); });
$("#setupBtn").addEventListener("click",()=>askPin("setup"));
$("#pinChange").addEventListener("click",()=>askPin("change"));

/* ---------- parent ---------- */
async function changeLimit(d){
  const v=Math.max(1,Math.min(10,st.limit+d)); if(v===st.limit) return;
  try{ st=await api("set_limit",{ pin:parentPin, limit:v }); renderCounter(); }catch(e){ msg($("#parentMsg"),e.message,true); }
}
$("#limMinus").addEventListener("click",()=>changeLimit(-1));
$("#limPlus").addEventListener("click",()=>changeLimit(1));
$("#bonusBtn").addEventListener("click", async ()=>{
  try{ st=await api("bonus",{ pin:parentPin }); renderCounter(); msg($("#parentMsg"),"Un dessin de plus pour aujourd'hui."); }
  catch(e){ msg($("#parentMsg"),e.message,true); }
});
$("#lockBtn").addEventListener("click",()=>{ parentPin=null; $(".tab.lock").textContent="🔒 Parent"; go("create"); });

/* ---------- dictée (Web Speech API) ---------- */
function setupDictation(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return;
  $$(".mic").forEach(b=>b.classList.remove("hidden"));
  $("#micHint").textContent="Appuie sur le micro et dis ton idée. Appuie encore pour arrêter.";
  let rec=null, target=null, base="";
  $$(".mic").forEach(b=>b.addEventListener("click",()=>{
    if(rec){ rec.stop(); return; }
    target=$("#"+b.dataset.target); base=target.value.trim();
    rec=new SR(); rec.lang="fr-FR"; rec.interimResults=true; rec.continuous=false;
    rec.onresult=e=>{ let t=""; for(const r of e.results) t+=r[0].transcript; target.value=(base+" "+t).trim(); };
    rec.onerror=e=>{ if(e.error==="not-allowed"){ $("#micHint").textContent="Micro refusé : utilise le micro du clavier."; } };
    rec.onend=()=>{ b.classList.remove("on"); rec=null; };
    b.classList.add("on");
    try{ rec.start(); }catch(_){ b.classList.remove("on"); rec=null; }
  }));
}

/* ---------- boot ---------- */
async function refreshStatus(){ try{ st=await api("status"); renderCounter(); }catch(_){} }
function startApp(){ $("#nav").classList.remove("hidden"); renderChips(); renderCounter(); go("create"); }
async function boot(){
  buildPad(); setupDictation();
  if(!CFG.supabaseUrl){ $("#bootTitle").textContent="Configuration manquante"; return; }
  try{ st=await api("status"); }
  catch(e){ $("#bootTitle").textContent="L'atelier ne répond pas"; $("#bootTxt").textContent=e.message+" Recharge la page dans un moment."; return; }
  if(!st.hasPin){ show("v-setup"); return; }
  startApp();
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && !busy && $("#nav") && !$("#nav").classList.contains("hidden")) refreshStatus(); });
boot();
})();
