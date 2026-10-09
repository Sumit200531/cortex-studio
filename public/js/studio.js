/* Cortex Studio · studio
   3D concept map, inspector, generate / explain / expand / quiz / ask. */
'use strict';

/* =====================================================================
   STUDIO: AI concept map
   ===================================================================== */
const EXAMPLE = {
  title:'How vaccines train immunity',
  summary:'A vaccine shows the immune system a harmless version or piece of a pathogen. The body learns to recognise it, so a later real infection meets a fast, prepared response.',
  nodes:[
    {id:'v',label:'Vaccines',level:0,blurb:'Vaccines prepare the immune system to recognise a specific pathogen without the person having to survive the disease first.'},
    {id:'ag',label:'Antigens',level:1,blurb:'Antigens are molecules, often proteins on a pathogen’s surface, that the immune system learns to recognise as foreign.'},
    {id:'inn',label:'Innate response',level:1,blurb:'The body’s fast, general first line of defence. It raises the alarm and helps start the more targeted adaptive response.'},
    {id:'b',label:'B cells',level:1,blurb:'White blood cells that, once activated by a matching antigen, turn into factories for antibodies.'},
    {id:'t',label:'T cells',level:1,blurb:'White blood cells that coordinate the immune response or directly destroy infected cells.'},
    {id:'mem',label:'Immune memory',level:1,blurb:'Long-lived memory cells remember an antigen, so a second encounter triggers a faster and stronger response.'},
    {id:'types',label:'Vaccine types',level:1,blurb:'Vaccines differ in what they show the body: a weakened pathogen, an inactivated one, a protein piece, or genetic instructions.'},
    {id:'herd',label:'Herd immunity',level:1,blurb:'When enough people are immune, a pathogen struggles to spread, which protects people who can’t be vaccinated.'},
    {id:'adj',label:'Adjuvants',level:2,blurb:'Ingredients added to some vaccines to boost the innate alarm, so the body responds more strongly to the antigen.'},
    {id:'dc',label:'Dendritic cells',level:2,blurb:'Cells that capture antigens and present them to T cells, bridging the innate and adaptive responses.'},
    {id:'ab',label:'Antibodies',level:2,blurb:'Y-shaped proteins that bind to a specific antigen, neutralising the pathogen or marking it for destruction.'},
    {id:'pc',label:'Plasma cells',level:2,blurb:'Activated B cells that release large amounts of antibodies into the blood.'},
    {id:'th',label:'Helper T cells',level:2,blurb:'T cells that signal B cells and other immune cells to activate and multiply.'},
    {id:'tk',label:'Killer T cells',level:2,blurb:'T cells that recognise and destroy the body’s own cells once they are infected.'},
    {id:'mb',label:'Memory B cells',level:2,blurb:'B cells that persist for years after vaccination and quickly produce antibodies if the antigen returns.'},
    {id:'boost',label:'Booster doses',level:2,blurb:'Extra doses that re-expose the immune system to the antigen and strengthen or extend immune memory.'},
    {id:'mrna',label:'mRNA vaccines',level:2,blurb:'Deliver instructions that let your own cells briefly make an antigen, such as a virus’s spike protein.'},
    {id:'live',label:'Live attenuated',level:2,blurb:'Use a weakened form of the pathogen that can still replicate a little, often giving long-lasting immunity.'},
    {id:'inact',label:'Inactivated vaccines',level:2,blurb:'Use a pathogen that has been killed, so it cannot cause infection but still displays its antigens.'},
    {id:'spike',label:'Spike protein',level:2,blurb:'The protein on the surface of SARS-CoV-2 that many COVID-19 vaccines use as their antigen.'}
  ],
  edges:[
    {from:'v',to:'ag',relation:'presents'},{from:'v',to:'inn',relation:'triggers'},{from:'v',to:'b',relation:'activates'},{from:'v',to:'t',relation:'activates'},
    {from:'v',to:'mem',relation:'builds'},{from:'v',to:'types',relation:'comes in'},{from:'v',to:'herd',relation:'enables'},
    {from:'inn',to:'adj',relation:'boosted by'},{from:'inn',to:'dc',relation:'uses'},{from:'dc',to:'t',relation:'presents to'},
    {from:'b',to:'ab',relation:'makes'},{from:'b',to:'pc',relation:'becomes'},{from:'pc',to:'ab',relation:'releases'},
    {from:'t',to:'th',relation:'includes'},{from:'t',to:'tk',relation:'includes'},{from:'th',to:'b',relation:'activates'},
    {from:'mem',to:'mb',relation:'stored in'},{from:'mem',to:'boost',relation:'strengthened by'},
    {from:'types',to:'mrna',relation:'includes'},{from:'types',to:'live',relation:'includes'},{from:'types',to:'inact',relation:'includes'},
    {from:'mrna',to:'spike',relation:'encodes'},{from:'ag',to:'spike',relation:'example'},{from:'ab',to:'ag',relation:'binds'}
  ]
};
const SUGGEST = ['How black holes form','Transformers in machine learning','Causes of the French Revolution','How CRISPR edits genes','Compound interest','The water cycle'];

let map = null, selected = null, gen = null;
const COL = { 0:new THREE.Color(0xf3a75b), 1:new THREE.Color(0x5fd3c3), 2:new THREE.Color(0xd9d3c8), m:new THREE.Color(0xffc27a) };

const gCanvas = $('#graph'), stage = $('#stage'), labelsEl = $('#labels');
let gR = null, gScene, gCam, gRoot, edgeMesh = null, glowTex;
const nodeObjs = new Map(); // id -> {sprite, core, label}
let camTheta = 0.6, camPhi = 1.25, camDist = 9, camTarget = new THREE.Vector3(), tTarget = new THREE.Vector3(), lastInteract = 0;
let simAlpha = 1;

if (window.THREE){ try {
  gR = new THREE.WebGLRenderer({ canvas:gCanvas, antialias:true, alpha:true });
  gR.setPixelRatio(Math.min(devicePixelRatio||1, 2));
  gR.setClearColor(0x000000, 0);
  gScene = new THREE.Scene();
  gCam = new THREE.PerspectiveCamera(45, 1, .1, 200);
  gRoot = new THREE.Group(); gScene.add(gRoot);
  glowTex = glowTexture();
  // dust
  const R = rng(9), dn = 900, dp = new Float32Array(dn*3);
  for (let i = 0; i < dn; i++){ const v = new THREE.Vector3(R()*2-1,R()*2-1,R()*2-1).normalize().multiplyScalar(4 + R()*14); dp.set([v.x,v.y,v.z], i*3); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp,3));
  gScene.add(new THREE.Points(dg, new THREE.PointsMaterial({ size:.06, map:glowTex, color:0x5fd3c3, transparent:true, opacity:.35, depthWrite:false, blending:THREE.AdditiveBlending })));
} catch(e){ gR = null; } }

function sizeGraph(){
  if (!gR) return;
  const r = stage.getBoundingClientRect(); gR.setSize(r.width, r.height, false); gCam.aspect = r.width/Math.max(1,r.height); gCam.fov = gCam.aspect < 0.9 ? 62 : 45; gCam.updateProjectionMatrix();
}
if (window.ResizeObserver) new ResizeObserver(sizeGraph).observe(stage); else addEventListener('resize', sizeGraph);

function byId(id){ return map && map.nodes.find(n => n.id === id); }
function neighbors(id){ return map.edges.filter(e => e.from === id || e.to === id).map(e => ({ node: byId(e.from === id ? e.to : e.from), relation: e.relation, out: e.from === id })).filter(x => x.node); }

function makeNodeObj(n){
  const color = COL[clamp(n.level|0,0,2)].clone();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xffffff, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  gRoot.add(sprite); gRoot.add(core);
  const label = document.createElement('button'); label.type = 'button';
  label.className = 'nlabel l' + clamp(n.level|0,0,2); label.textContent = n.label;
  label.addEventListener('click', e => { e.stopPropagation(); select(n.id); });
  labelsEl.appendChild(label);
  return { sprite, core, label };
}
function clearGraph(){
  nodeObjs.forEach(o => { gRoot.remove(o.sprite); gRoot.remove(o.core); o.sprite.material.dispose(); o.core.material.dispose(); o.label.remove(); });
  nodeObjs.clear();
  if (edgeMesh){ gRoot.remove(edgeMesh); edgeMesh.geometry.dispose(); edgeMesh = null; }
}
function placeNew(n, near){
  const R = Math.random;
  const base = near ? near.clone() : new THREE.Vector3();
  const r = near ? 1.2 : (n.level === 0 ? 0 : n.level === 1 ? 2.2 : 3.6);
  const v = new THREE.Vector3(R()*2-1, R()*2-1, R()*2-1).normalize().multiplyScalar(r + R()*0.4);
  n.pos = base.add(v); n.vel = new THREE.Vector3(); n.born = performance.now()/1000;
}
function syncGraph(){
  if (!map) return;
  map.nodes.forEach(n => {
    if (!n.pos){ const parent = map.edges.map(e => e.to === n.id ? byId(e.from) : e.from === n.id ? byId(e.to) : null).find(p => p && p.pos); placeNew(n, parent && parent.pos); }
    if (!nodeObjs.has(n.id)) nodeObjs.set(n.id, makeNodeObj(n));
  });
  [...nodeObjs.keys()].forEach(id => { if (!byId(id)){ const o = nodeObjs.get(id); gRoot.remove(o.sprite); gRoot.remove(o.core); o.label.remove(); nodeObjs.delete(id); } });
  buildEdges();
  simAlpha = 1;
  $('#nCount').textContent = map.nodes.length; $('#eCount').textContent = map.edges.length;
  updateMastery();
}
function buildEdges(){
  if (!gR) return;
  if (edgeMesh){ gRoot.remove(edgeMesh); edgeMesh.geometry.dispose(); }
  const E = map.edges.filter(e => byId(e.from) && byId(e.to));
  const pos = new Float32Array(E.length*6), t = [], ph = [], hi = [];
  E.forEach(e => { const p = Math.random(); t.push(0,1); ph.push(p,p); const h = selected && (e.from === selected || e.to === selected) ? 1 : selected ? -1 : 0; hi.push(h,h); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t,1)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph,1)); g.setAttribute('aHi', new THREE.Float32BufferAttribute(hi,1));
  edgeMesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms:{ uTime:{value:0} }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aT, aPh, aHi; varying float vT; varying float vP; varying float vH; void main(){ vT = aT; vP = aPh; vH = aHi; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform float uTime; varying float vT; varying float vP; varying float vH;
      void main(){ float f = fract(uTime*0.45 + vP); float pulse = exp(-pow((vT - f)*10.0, 2.0));
        float base = vH > 0.5 ? 0.55 : (vH < -0.5 ? 0.06 : 0.2);
        vec3 c = mix(vec3(0.37,0.83,0.76), vec3(1.0,0.75,0.45), vH > 0.5 ? 0.6 : 0.0);
        gl_FragColor = vec4(c*(base + pulse*(vH < -0.5 ? 0.3 : 1.6)), 1.0); }` }));
  edgeMesh.userData.E = E;
  gRoot.add(edgeMesh);
}
function simulate(dt){
  if (!map || simAlpha < 0.003) return;
  const ns = map.nodes.filter(n => n.pos);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < ns.length; i++){
    const a = ns[i];
    for (let j = i+1; j < ns.length; j++){
      const b = ns[j]; tmp.subVectors(a.pos, b.pos); let d2 = tmp.lengthSq(); if (d2 < 0.01) { tmp.set(Math.random()-.5, Math.random()-.5, Math.random()-.5); d2 = 0.01; }
      const f = 0.9 / d2; tmp.normalize().multiplyScalar(f*simAlpha*dt);
      a.vel.add(tmp); b.vel.sub(tmp);
    }
    a.vel.addScaledVector(a.pos, -0.12*simAlpha*dt*(a.level === 0 ? 6 : 1));
  }
  map.edges.forEach(e => { const a = byId(e.from), b = byId(e.to); if (!a || !b || !a.pos || !b.pos) return;
    const rest = (a.level === 0 || b.level === 0) ? 2.0 : 1.5;
    tmp.subVectors(b.pos, a.pos); const d = tmp.length() || .001; const f = (d - rest)*0.9*simAlpha*dt; tmp.multiplyScalar(f/d);
    a.vel.add(tmp); b.vel.sub(tmp); });
  ns.forEach(n => { n.vel.multiplyScalar(0.86); n.pos.addScaledVector(n.vel, 1); });
  simAlpha *= Math.pow(0.35, dt);
}

/* ---- orbit controls ---- */
let drag = null;
gCanvas.addEventListener('pointerdown', e => { drag = { x:e.clientX, y:e.clientY, th:camTheta, ph:camPhi, moved:false }; gCanvas.setPointerCapture(e.pointerId); gCanvas.classList.add('dragging'); lastInteract = performance.now(); });
gCanvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx)+Math.abs(dy) > 4) drag.moved = true; camTheta = drag.th - dx*0.006; camPhi = clamp(drag.ph - dy*0.006, 0.25, 2.9); lastInteract = performance.now(); });
gCanvas.addEventListener('pointerup', e => { gCanvas.classList.remove('dragging'); if (drag && !drag.moved) pickAt(e.clientX, e.clientY); drag = null; });
gCanvas.addEventListener('pointercancel', () => { drag = null; gCanvas.classList.remove('dragging'); });
gCanvas.addEventListener('wheel', e => { e.preventDefault(); camDist = clamp(camDist * (1 + Math.sign(e.deltaY)*0.08), 3.5, 22); lastInteract = performance.now(); }, { passive:false });
function pickAt(x, y){
  if (!map) return;
  const r = stage.getBoundingClientRect(); let best = null, bd = 30*30;
  map.nodes.forEach(n => { if (!n._sx) return; const dx = n._sx + r.left - x, dy = n._sy + r.top - y, d = dx*dx + dy*dy; if (d < bd){ bd = d; best = n; } });
  if (best) select(best.id); else { selected = null; buildEdges(); refreshInspector(); }
}

/* ---- render loop ---- */
let gLast = performance.now()/1000;
const vtmp = new THREE.Vector3();
function gFrame(now){
  requestAnimationFrame(gFrame);
  if (!gR || document.hidden) return;
  const r = stage.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
  const t = now/1000, dt = Math.min(.05, t - gLast); gLast = t;
  simulate(dt*3);
  if (!reduce && performance.now() - lastInteract > 2500 && !drag) camTheta += dt*0.06;
  const sel = selected && byId(selected);
  tTarget.copy(sel && sel.pos ? sel.pos : new THREE.Vector3()).multiplyScalar(sel ? 0.7 : 1);
  camTarget.lerp(tTarget, 1 - Math.exp(-dt*2.5));
  gCam.position.set(camTarget.x + camDist*Math.sin(camPhi)*Math.sin(camTheta), camTarget.y + camDist*Math.cos(camPhi), camTarget.z + camDist*Math.sin(camPhi)*Math.cos(camTheta));
  gCam.lookAt(camTarget);
  gCam.updateMatrixWorld();
  if (map){
    map.nodes.forEach(n => {
      const o = nodeObjs.get(n.id); if (!o || !n.pos) return;
      const age = clamp((t - (n.born || 0))/0.9, 0, 1), pop = age < 1 ? 1 + 2.70158*Math.pow(age-1,3) + 1.70158*Math.pow(age-1,2) : 1;
      const base = n.level === 0 ? 1.5 : n.level === 1 ? 0.95 : 0.6;
      const isSel = selected === n.id, beat = isSel ? 1 + Math.sin(t*4)*0.12 : 1 + Math.sin(t*1.3 + n.pos.x*3)*0.04;
      const dim = selected && !isSel && !neighbors(selected).some(x => x.node.id === n.id) ? 0.35 : 1;
      o.sprite.position.copy(n.pos); o.core.position.copy(n.pos);
      o.sprite.scale.setScalar(base*pop*beat*(isSel ? 1.35 : 1));
      o.core.scale.setScalar(base*0.28*pop);
      const c = n.mastered ? COL.m : COL[clamp(n.level|0,0,2)];
      o.sprite.material.color.copy(c); o.sprite.material.opacity = (n.seen || n.level === 0 ? 1 : 0.75) * dim;
      o.core.material.opacity = 0.9*dim;
      vtmp.copy(n.pos).project(gCam);
      const sx = (vtmp.x*0.5 + 0.5)*r.width, sy = (-vtmp.y*0.5 + 0.5)*r.height; n._sx = sx; n._sy = sy;
      const behind = vtmp.z > 1;
      const depth = gCam.position.distanceTo(n.pos), fade = clamp(1.4 - depth/(camDist*1.6), 0.15, 1);
      o.label.style.transform = 'translate(' + (sx + 10*base + 6).toFixed(1) + 'px,' + (sy - 12).toFixed(1) + 'px)';
      o.label.style.opacity = behind ? 0 : (selected ? (dim < 1 ? 0.25 : 1) : fade) * Math.min(1, age*1.5);
      o.label.style.zIndex = String(1000 - Math.round(depth*10));
      o.label.classList.toggle('sel', isSel); o.label.classList.toggle('mastered', !!n.mastered);
    });
    if (edgeMesh){
      const E = edgeMesh.userData.E, p = edgeMesh.geometry.attributes.position;
      E.forEach((e,i) => { const a = byId(e.from), b = byId(e.to); if (!a || !b || !a.pos || !b.pos) return; p.setXYZ(i*2, a.pos.x, a.pos.y, a.pos.z); p.setXYZ(i*2+1, b.pos.x, b.pos.y, b.pos.z); });
      p.needsUpdate = true; edgeMesh.material.uniforms.uTime.value = t;
    }
  }
  // ghost labels while streaming
  ghosts.forEach(g => {
    g.ang += dt*0.4; const p = new THREE.Vector3(Math.cos(g.ang)*g.r, g.y, Math.sin(g.ang)*g.r); g.pos = p;
    vtmp.copy(p).project(gCam); g.el.style.transform = 'translate(' + ((vtmp.x*0.5+0.5)*r.width).toFixed(1) + 'px,' + ((-vtmp.y*0.5+0.5)*r.height).toFixed(1) + 'px)';
    g.sprite.position.copy(p);
  });
  gR.render(gScene, gCam);
}
requestAnimationFrame(gFrame);

/* ---- ghosts (labels appearing while the AI writes) ---- */
let ghosts = [];
function addGhost(label){
  const el = document.createElement('span'); el.className = 'nlabel ghost'; el.textContent = label; labelsEl.appendChild(el);
  let sprite = null; if (gR){ sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x5fd3c3, transparent:true, opacity:.8, depthWrite:false, blending:THREE.AdditiveBlending })); sprite.scale.setScalar(.6); gScene.add(sprite); }
  ghosts.push({ label, el, sprite: sprite || { position:new THREE.Vector3() }, ang: Math.random()*6.28, r: 1.5 + Math.random()*2.5, y: (Math.random()-.5)*3 });
}
function clearGhosts(){ ghosts.forEach(g => { g.el.remove(); if (g.sprite.material){ gScene.remove(g.sprite); g.sprite.material.dispose(); } }); ghosts = []; }

/* ---- loading & saving maps ---- */
function loadMap(m, fromGhosts){
  clearGraph(); selected = null;
  const gmap = new Map(); if (fromGhosts) ghosts.forEach(g => gmap.set(g.label.toLowerCase(), g.pos));
  map = { example: m === EXAMPLE, title:m.title, summary:m.summary, nodes:m.nodes.map(n => ({ id:String(n.id), label:String(n.label).slice(0,48), level:clamp(n.level|0,0,3) > 2 ? 2 : clamp(n.level|0,0,2), blurb:String(n.blurb||''), seen:!!n.seen, mastered:!!n.mastered })), edges:m.edges.filter(e => e && e.from && e.to).map(e => ({ from:String(e.from), to:String(e.to), relation:String(e.relation||'relates to').slice(0,28) })) };
  map.nodes.forEach(n => { const gp = gmap.get(n.label.toLowerCase()); if (gp){ n.pos = gp.clone(); n.vel = new THREE.Vector3(); n.born = performance.now()/1000 - 0.5; } });
  clearGhosts();
  syncGraph();
  quiz = null; chatTurns = []; $('#msgs').innerHTML = '';
  camDist = 10.5 + Math.max(0, map.nodes.length - 20)*0.18;
  refreshInspector(); renderQuiz(); renderSugg();
  setStatus(false, map.title);
}
function saveMap(){
  if (!map || map.example) return;
  const lib = store.get('cortex.lib', []);
  const plain = { title:map.title, summary:map.summary, nodes:map.nodes.map(n => ({ id:n.id, label:n.label, level:n.level, blurb:n.blurb, seen:n.seen, mastered:n.mastered })), edges:map.edges, at:Date.now() };
  const i = lib.findIndex(x => x.title === plain.title); if (i >= 0) lib.splice(i,1);
  lib.unshift(plain); store.set('cortex.lib', lib.slice(0,6)); renderChips();
}
function renderChips(){
  const box = $('#chips'); box.innerHTML = '';
  const lib = store.get('cortex.lib', []);
  if (lib.length){
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Your maps'; box.appendChild(l);
    lib.slice(0,3).forEach(m => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = '↺ ' + m.title; b.onclick = () => loadMap(m); box.appendChild(b); });
  }
  const l2 = document.createElement('span'); l2.className = 'lbl'; l2.textContent = 'Try'; box.appendChild(l2);
  SUGGEST.slice(0, lib.length ? 3 : 5).forEach(s => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = s; b.onclick = () => { $('#topic').value = s; autosize(); generate(); }; box.appendChild(b); });
  const ex = document.createElement('button'); ex.className = 'chip'; ex.type = 'button'; ex.textContent = 'Example: vaccines'; ex.onclick = () => loadMap(EXAMPLE); box.appendChild(ex);
}
function setStatus(busy, text){ $('#status').dataset.busy = busy ? 'true' : 'false'; $('#statusText').textContent = text; }
function updateMastery(){
  if (!map) return; const n = map.nodes.length, m = map.nodes.filter(x => x.mastered).length;
  $('#mFill').style.width = (n ? m/n*100 : 0) + '%'; $('#mText').textContent = m + '/' + n;
}

/* ---- generate map ---- */
let tier = 'quick';
$('#mFast').onclick = () => { tier = 'quick'; $('#mFast').setAttribute('aria-pressed','true'); $('#mDeep').setAttribute('aria-pressed','false'); };
$('#mDeep').onclick = () => { tier = 'default'; $('#mDeep').setAttribute('aria-pressed','true'); $('#mFast').setAttribute('aria-pressed','false'); };
const topicEl = $('#topic');
function autosize(){ topicEl.style.height = '44px'; topicEl.style.height = Math.min(180, Math.max(44, topicEl.scrollHeight)) + 'px'; }
topicEl.addEventListener('input', autosize);
topicEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && topicEl.value.length < 200){ e.preventDefault(); generate(); } });
$('#genBtn').onclick = () => gen ? gen.abort() : generate();

function mapPrompt(input){
  const isNotes = input.length > 220;
  return `You are Cortex, an expert tutor who turns ${isNotes ? 'a learner\'s notes' : 'a topic'} into a concept map for studying.

${isNotes ? 'NOTES (build the map only from ideas in these notes, correcting obvious errors):' : 'TOPIC:'}
"""
${input.slice(0, 24000)}
"""

Reply with ONLY one JSON object, no markdown:
{"title": string (max 6 words), "summary": string (2 plain sentences),
 "nodes": [{"id": "n1", "label": string (1-4 words), "level": 0|1|2, "blurb": string (1-2 sentences, plain language, accurate)}],
 "edges": [{"from": id, "to": id, "relation": string (1-3 lowercase words, e.g. "causes", "part of")}]}

Rules: exactly one level-0 node (the central idea). 5-7 level-1 key concepts, each linked from the level-0 node. 8-13 level-2 details, each linked from a level-1 node. Add 3-6 extra cross-links between related nodes. Ids unique like n1, n2. Write nodes in a sensible teaching order. Facts must be correct; prefer clear, concrete wording a curious 16-year-old understands.`;
}
async function generate(){
  const input = topicEl.value.trim();
  if (!input){ topicEl.focus(); return; }
  if (!aiReady()){ setStatus(false, aiChecked ? 'AI is unavailable in this view. The example map still works.' : 'Still connecting to the AI, try again in a moment.'); showConceptNote(aiChecked ? noAiNote() : ''); return; }
  const ctl = new AbortController(); gen = ctl;
  $('#genBtn').dataset.busy = 'true'; $('#genLabel').textContent = 'Stop';
  clearGraph(); clearGhosts(); map = null; selected = null; refreshInspector();
  $('#nCount').textContent = '0'; $('#eCount').textContent = '0';
  setStatus(true, 'Reading and thinking…');
  const seen = new Set();
  try {
    const out = await sample.json(mapPrompt(input), { modelTier: tier, signal: ctl.signal, onText: ({ text }) => {
      const re = /"label"\s*:\s*"([^"]{1,60})"/g; let m;
      while ((m = re.exec(text))){ const l = m[1]; if (!seen.has(l)){ seen.add(l); addGhost(l); } }
      setStatus(true, seen.size ? 'Finding concepts… ' + seen.size : 'Writing the map…');
    }});
    if (!out || !Array.isArray(out.nodes) || !out.nodes.length) throw { code:'invalid_json' };
    if (!Array.isArray(out.edges)) out.edges = [];
    loadMap(out, true);
    const core = map.nodes.find(n => n.level === 0) || map.nodes[0]; if (core) select(core.id);
    saveMap();
  } catch(e){
    clearGhosts();
    if (e && e.code === 'cancelled'){ setStatus(false, 'Stopped.'); }
    else { setStatus(false, 'Couldn’t build the map.'); showConceptNote('<div class="note err">' + esc(errCopy(e)) + '</div>'); }
    if (!map) loadMap(EXAMPLE);
  } finally {
    gen = null; $('#genBtn').dataset.busy = 'false'; $('#genLabel').textContent = 'Build map';
  }
}

/* ---- inspector ---- */
const tabs = { concept:[$('#tConcept'),$('#pConcept')], quiz:[$('#tQuiz'),$('#pQuiz')], ask:[$('#tAsk'),$('#pAsk')] };
function openTab(k){ Object.entries(tabs).forEach(([n,[t,p]]) => { t.setAttribute('aria-selected', n === k ? 'true':'false'); p.hidden = n !== k; }); }
tabs.concept[0].onclick = () => openTab('concept'); tabs.quiz[0].onclick = () => openTab('quiz'); tabs.ask[0].onclick = () => openTab('ask');

const ICON = {
  deep:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3h12M2 7h8M2 11h10M2 14h5"/></svg>',
  grow:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="5" cy="8" r="2"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M7 7l3.6-2.6M7 9l3.6 2.6"/></svg>',
  quiz:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M6.2 6.3a1.9 1.9 0 113 1.5c-.8.5-1.2.9-1.2 1.7M8 11.6v.2"/></svg>'
};
let deepCache = {};
function showConceptNote(html){ openTab('concept'); const p = $('#pConcept'); const old = p.querySelector('.flash'); if (old) old.remove(); if (!html) return; const d = document.createElement('div'); d.className = 'flash'; d.innerHTML = html; p.prepend(d); }
function select(id){
  selected = id; const n = byId(id); if (!n) return;
  if (!n.seen){ n.seen = true; saveMap(); }
  buildEdges(); refreshInspector(); openTab('concept');
}
function levelTag(l){ return ['<i style="background:#f3a75b;box-shadow:0 0 8px #f3a75b"></i>Core idea','<i style="background:#5fd3c3"></i>Key concept','<i style="background:#d9d3c8"></i>Detail'][l] || ''; }
function mdLite(s){ return esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g,'<br>') + '</p>').join(''); }
function refreshInspector(){
  const p = $('#pConcept');
  if (!map){ p.innerHTML = '<p class="tag"><i style="background:#5fd3c3"></i>Building</p><p class="node-name">Mapping your topic</p><p class="node-blurb">Concepts appear in the map as the model writes them. Local models can take 10–60 seconds depending on your computer.</p>'; return; }
  const n = selected && byId(selected);
  if (!n){
    const core = map.nodes.find(x => x.level === 0);
    p.innerHTML = `<p class="tag">Concept map</p><h4 class="map-title">${esc(map.title)}</h4><p class="map-sum">${esc(map.summary||'')}</p>
      <div class="actions"><button class="act" id="startQuiz">${ICON.quiz}Quiz me on the whole map</button>${core ? `<button class="act" id="goCore">Start at “${esc(core.label)}”</button>` : ''}</div>
      <div class="sec-h"><span>Key concepts</span><span>${map.nodes.filter(x => x.level === 1).length}</span></div>
      <div class="links">${map.nodes.filter(x => x.level === 1).map(x => `<button class="link" data-id="${esc(x.id)}"><span class="rel">${x.mastered ? 'mastered' : x.seen ? 'explored' : 'new'}</span><span>${esc(x.label)}</span></button>`).join('')}</div>
      ${aiReady() || !aiChecked ? '' : noAiNote()}`;
    p.querySelectorAll('.link').forEach(b => b.onclick = () => select(b.dataset.id));
    const gc = p.querySelector('#goCore'); if (gc) gc.onclick = () => select(core.id);
    p.querySelector('#startQuiz').onclick = () => startQuiz(null);
    return;
  }
  const nb = neighbors(n.id);
  const dis = aiReady() ? '' : ' disabled title="Needs a connected model"';
  p.innerHTML = `<p class="tag">${levelTag(n.level)}${n.mastered ? ' · <span style="color:var(--amber)">mastered</span>' : ''}</p>
    <h4 class="node-name">${esc(n.label)}</h4>
    <p class="node-blurb">${esc(n.blurb)}</p>
    <div class="actions">
      <button class="act" id="aDeep"${dis}>${ICON.deep}Explain deeper</button>
      <button class="act" id="aGrow"${dis}>${ICON.grow}Expand branch</button>
      <button class="act" id="aQuiz"${dis}>${ICON.quiz}Quiz me</button>
    </div>
    <div id="deepOut">${deepCache[n.id] ? '<div class="deep">' + mdLite(deepCache[n.id]) + '</div>' : ''}</div>
    <div class="sec-h"><span>Connections</span><span>${nb.length}</span></div>
    <div class="links">${nb.map(x => `<button class="link" data-id="${esc(x.node.id)}"><span class="rel">${x.out ? '' : '← '}${esc(x.relation)}</span><span>${esc(x.node.label)}</span></button>`).join('')}</div>
    <div class="sec-h"><span>Map</span><span></span></div>
    <button class="link" id="backMap"><span class="rel">overview</span><span>${esc(map.title)}</span></button>
    ${aiReady() || !aiChecked ? '' : noAiNote()}`;
  p.querySelectorAll('.link[data-id]').forEach(b => b.onclick = () => select(b.dataset.id));
  p.querySelector('#backMap').onclick = () => { selected = null; buildEdges(); refreshInspector(); };
  p.querySelector('#aDeep').onclick = () => explain(n);
  p.querySelector('#aGrow').onclick = () => expand(n);
  p.querySelector('#aQuiz').onclick = () => startQuiz(n);
}
function mapContext(){ return map.nodes.map(n => `- ${n.label} (${['core','key','detail'][n.level]}): ${n.blurb}`).join('\n'); }
async function explain(n){
  const out = $('#deepOut'); if (!out) return;
  const btn = $('#aDeep'); btn.disabled = true;
  out.innerHTML = '<span class="thinking"><span class="dots"><i></i><i></i><i></i></span>Thinking</span>';
  try {
    const { text } = await sample(`You are a warm, precise tutor. Map topic: "${map.title}".\nOther concepts on the map:\n${mapContext().slice(0,6000)}\n\nExplain "${n.label}" more deeply for a curious 16-year-old in about 150 words: what it is, how it works, one concrete real-world example or analogy, and how it connects to one other concept on the map. Use 2-3 short paragraphs of plain text. You may bold up to 3 key terms with **double asterisks**. No headings or lists.`,
      { modelTier:'quick', onText: ({ text }) => { if (selected === n.id && $('#deepOut')) $('#deepOut').innerHTML = '<div class="deep">' + mdLite(text) + '</div>'; } });
    deepCache[n.id] = text;
  } catch(e){
    if (selected === n.id && $('#deepOut')) $('#deepOut').innerHTML = (e.text ? '<div class="deep">' + mdLite(e.text) + '</div>' : '') + '<div class="note err">' + esc(errCopy(e)) + '</div>';
  } finally { const b = $('#aDeep'); if (b) b.disabled = !aiReady(); }
}
async function expand(n){
  const btn = $('#aGrow'); btn.disabled = true; btn.innerHTML = ICON.grow + 'Growing…';
  setStatus(true, 'Growing “' + n.label + '”…');
  const existing = map.nodes.map(x => x.label).join(', ');
  try {
    const out = await sample.json(`You are extending a study concept map about "${map.title}". Existing concepts: ${existing}.\nExpand the concept "${n.label}" (${n.blurb}).\nReply with ONLY JSON: {"nodes":[{"label": string 1-4 words, "blurb": string 1-2 accurate plain sentences, "relation": string 1-3 lowercase words describing how "${n.label}" relates to it}]} with 3-5 NEW sub-concepts not already on the map.`, { modelTier:'quick', cache:false });
    const list = (out && Array.isArray(out.nodes) ? out.nodes : []).filter(x => x && x.label && !map.nodes.some(m => m.label.toLowerCase() === String(x.label).toLowerCase())).slice(0,5);
    if (!list.length) throw { code:'empty' };
    list.forEach((x, i) => { const id = 'x' + Date.now().toString(36) + i; map.nodes.push({ id, label:String(x.label).slice(0,48), level:2, blurb:String(x.blurb||'') }); map.edges.push({ from:n.id, to:id, relation:String(x.relation||'includes').slice(0,28) }); });
    syncGraph(); saveMap(); refreshInspector();
    setStatus(false, 'Added ' + list.length + (list.length === 1 ? ' concept' : ' concepts') + ' to “' + n.label + '”');
  } catch(e){
    setStatus(false, 'Couldn’t expand that branch.');
    if (e && e.code !== 'empty') showConceptNote('<div class="note err">' + esc(errCopy(e)) + '</div>');
    refreshInspector();
  }
}

/* ---- quiz ---- */
let quiz = null;
async function startQuiz(n){
  openTab('quiz');
  if (!aiReady()){ $('#pQuiz').innerHTML = '<p class="node-name" style="font-size:26px">Quiz</p>' + noAiNote(); return; }
  const scope = n ? `the concept "${n.label}" (${n.blurb}) and its links` : 'the whole map, spreading questions across different key concepts';
  const count = n ? 3 : 5;
  quiz = { loading:true, scope:n ? n.label : map.title };
  renderQuiz();
  try {
    const qs = await sample.json(`Write ${count} multiple-choice questions to test real understanding (not just recall of wording) of ${scope}, in a study map about "${map.title}".\nMap concepts:\n${mapContext().slice(0,7000)}\n\nReply with ONLY a JSON array: [{"q": string, "options": [4 strings], "answer": index 0-3, "why": string (one sentence explaining the right answer), "concept": exact label of the map concept it tests}]. Make wrong options plausible. Vary which index is correct.`, { modelTier:'quick', cache:false });
    const items = (Array.isArray(qs) ? qs : []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2).slice(0, count);
    if (!items.length) throw { code:'invalid_json' };
    quiz = { scope: quiz.scope, items, i:0, picks:[], node:n ? n.id : null };
  } catch(e){ quiz = { error: errCopy(e), scope: quiz.scope }; }
  renderQuiz();
}
function renderQuiz(){
  const p = $('#pQuiz');
  if (!quiz){
    p.innerHTML = `<p class="tag">Practice</p><h4 class="node-name" style="font-size:28px">Test what you know</h4><p class="node-blurb">Answer questions written from this map. Concepts you get right turn amber and count toward mastery.</p>
      <div class="actions"><button class="act" id="qAll">${ICON.quiz}Quiz me on the whole map</button>${selected && byId(selected) ? `<button class="act" id="qOne">Only “${esc(byId(selected).label)}”</button>` : ''}</div>${aiReady() || !aiChecked ? '' : noAiNote()}`;
    p.querySelector('#qAll').onclick = () => startQuiz(null);
    const q1 = p.querySelector('#qOne'); if (q1) q1.onclick = () => startQuiz(byId(selected));
    return;
  }
  if (quiz.loading){ p.innerHTML = `<p class="tag">Quiz · ${esc(quiz.scope)}</p><span class="thinking"><span class="dots"><i></i><i></i><i></i></span>Writing questions</span>`; return; }
  if (quiz.error){ p.innerHTML = `<div class="note err">${esc(quiz.error)}</div><button class="act" id="qRetry">Try again</button>`; p.querySelector('#qRetry').onclick = () => { quiz = null; renderQuiz(); }; return; }
  const { items, i, picks } = quiz;
  const prog = items.map((_, k) => `<i class="${k < picks.length ? (picks[k] === items[k].answer ? 'ok' : 'no') : k === i ? 'cur' : ''}"></i>`).join('');
  if (i >= items.length){
    const score = picks.filter((pk, k) => pk === items[k].answer).length;
    p.innerHTML = `<p class="tag">Quiz · ${esc(quiz.scope)}</p><div class="qcard"><div class="qmeta"><span>Result</span><span class="qprog">${prog}</span></div>
      <div class="score">${score}/${items.length}</div><p class="node-blurb" style="margin-top:10px">${score === items.length ? 'Perfect. Those concepts now glow amber on the map.' : score ? 'Concepts you answered correctly are now marked as mastered. Review the others and try again.' : 'Nothing stuck yet, which is normal on a first pass. Read the explanations and go again.'}</p>
      <div class="actions"><button class="act" id="qAgain">${ICON.quiz}New questions</button><button class="act" id="qDone">Back to the map</button></div></div>`;
    p.querySelector('#qAgain').onclick = () => startQuiz(quiz.node ? byId(quiz.node) : null);
    p.querySelector('#qDone').onclick = () => { quiz = null; renderQuiz(); openTab('concept'); };
    return;
  }
  const q = items[i], answered = picks.length > i, pick = picks[i];
  p.innerHTML = `<p class="tag">Quiz · ${esc(quiz.scope)}</p><div class="qcard"><div class="qmeta"><span>Question ${i+1} of ${items.length}</span><span class="qprog">${prog}</span></div>
    <p class="qtext">${esc(q.q)}</p>
    <div class="opts">${q.options.map((o, k) => `<button class="opt${answered ? (k === q.answer ? ' right' : k === pick ? ' wrong' : '') : ''}" data-k="${k}"${answered ? ' disabled' : ''}><span class="k">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`).join('')}</div>
    ${answered ? `<div class="why${pick === q.answer ? '' : ' no'}"><b>${pick === q.answer ? 'Correct.' : 'Not quite.'}</b> ${esc(q.why||'')}</div><div class="qnav"><span class="tag" style="margin:0">${esc(q.concept||'')}</span><button class="act" id="qNext">${i+1 < items.length ? 'Next question' : 'See result'} →</button></div>` : ''}</div>`;
  p.querySelectorAll('.opt:not([disabled])').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; quiz.picks[i] = k;
    if (k === q.answer){ const c = map.nodes.find(n => n.label.toLowerCase() === String(q.concept||'').toLowerCase()) || (quiz.node && byId(quiz.node)); if (c){ c.mastered = true; c.seen = true; c.born = performance.now()/1000 - 0.3; updateMastery(); saveMap(); } }
    renderQuiz();
  });
  const nx = p.querySelector('#qNext'); if (nx){ nx.onclick = () => { quiz.i++; renderQuiz(); }; nx.focus(); }
}

/* ---- ask ---- */
let chatTurns = [], chatCtl = null;
function renderSugg(){
  const s = $('#sugg'); s.innerHTML = '';
  if (!map) return;
  const l1 = map.nodes.filter(n => n.level === 1);
  const qs = [`What's the single most important idea in ${map.title.toLowerCase()}?`];
  if (l1[0] && l1[1]) qs.push(`How does ${l1[0].label} relate to ${l1[1].label}?`);
  qs.push('Give me a memory trick for this map');
  qs.forEach(q => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = q; b.onclick = () => ask(q); s.appendChild(b); });
}
function addMsg(role, html){ const d = document.createElement('div'); d.className = 'msg ' + role; d.innerHTML = html; $('#msgs').appendChild(d); $('#msgs').scrollTop = 1e6; return d; }
$('#askForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#askIn').value.trim(); if (v){ $('#askIn').value = ''; ask(v); } });
async function ask(q){
  openTab('ask');
  addMsg('me', esc(q));
  if (!aiReady()){ addMsg('ai', noAiNote()); return; }
  const bubble = addMsg('ai', '<span class="thinking"><span class="dots"><i></i><i></i><i></i></span>Thinking</span>');
  chatTurns.push({ role:'user', content:q });
  const rules = `You are Cortex, a friendly study tutor. The learner is studying a concept map titled "${map.title}". ${map.summary}\nConcepts:\n${mapContext().slice(0,8000)}\n\nAnswer their questions in under 140 words, plain text, short paragraphs, accurate. Refer to concepts on the map by name when useful. If a question goes beyond the map, answer briefly and say so.`;
  if (chatCtl) chatCtl.abort(); const ctl = chatCtl = new AbortController();
  try {
    const { text } = await sample([{ role:'user', content:rules }, ...chatTurns.slice(-10)], { cache:false, modelTier:'quick', signal:ctl.signal, onText: ({ text }) => { bubble.innerHTML = mdLite(text); $('#msgs').scrollTop = 1e6; } });
    chatTurns.push({ role:'assistant', content:text });
  } catch(e){
    if (e.code === 'cancelled') return;
    bubble.innerHTML = (e.text ? mdLite(e.text) : '') + '<div class="note err">' + esc(errCopy(e)) + '</div>';
    chatTurns.pop();
  }
}

/* ---- boot ---- */
const navEl = document.querySelector('.nav');
const navCheck = () => navEl.classList.toggle('solid', $('#studio').getBoundingClientRect().top < 70);
addEventListener('scroll', navCheck, { passive:true }); navCheck();
renderChips();
sizeGraph();
loadMap(EXAMPLE);
setStatus(false, 'Example map · pick any concept');
autosize();
measure();
addEventListener('resize', measure);
