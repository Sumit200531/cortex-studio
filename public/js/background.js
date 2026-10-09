/* Cortex Studio · background film
   Scroll-driven particle film: neuron cloud -> page of text -> network -> recall. */
'use strict';

/* =====================================================================
   BACKGROUND FILM: neuron cloud → page of text → network → recall
   ===================================================================== */
const bgCanvas = $('#bg');
let bgRenderer = null, bgVisible = true;
const scenes = [...document.querySelectorAll('[data-scene]')];
let anchors = [], maxS = 1;
function measure(){
  const vh = innerHeight;
  anchors = scenes.map((s,i) => i === 0 ? 0 : clamp(s.offsetTop + s.offsetHeight/2 - vh/2, 0, 1e9));
  maxS = anchors[anchors.length-1] || 1;
}
function sceneAt(y){
  for (let i = 0; i < anchors.length-1; i++) if (y <= anchors[i+1]) return i + clamp((y - anchors[i])/Math.max(1, anchors[i+1]-anchors[i]), 0, 1);
  return anchors.length - 1 + clamp((y - anchors[anchors.length-1])/innerHeight, 0, 1);
}

if (window.THREE){ try {
  const V3 = THREE.Vector3;
  bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, antialias:false, powerPreference:'high-performance' });
  bgRenderer.setPixelRatio(Math.min(devicePixelRatio||1, 1.6));
  bgRenderer.setClearColor(0x04070a, 1);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, .1, 100);
  const root = new THREE.Group(); scene.add(root);
  const R = rng(5);
  const N = isMobile() ? 9000 : 18000;

  // network nodes
  const NN = 30, nodes = [];
  for (let i = 0; i < NN; i++){ const v = new V3(R()*2-1, R()*2-1, R()*2-1).normalize().multiplyScalar(0.6 + Math.pow(R(),.6)*1.9); v.y *= .8; nodes.push(v); }
  nodes.sort((a,b) => a.length() - b.length());
  const edges = [];
  for (let i = 0; i < NN; i++){ const d = nodes.map((n,j) => [j, n.distanceTo(nodes[i])]).filter(x => x[0] !== i).sort((a,b) => a[1]-b[1]); for (let k = 0; k < 3; k++){ const j = d[k][0]; if (!edges.some(e => (e[0]===i&&e[1]===j)||(e[0]===j&&e[1]===i))) edges.push([i,j]); } }

  const pos = new Float32Array(N*3), tx = new Float32Array(N*3), net = new Float32Array(N*3), seed = new Float32Array(N*4), nodeIdx = new Float32Array(N);
  const tiltA = new THREE.Matrix4().makeRotationY(-0.42).multiply(new THREE.Matrix4().makeRotationX(-0.32));
  // text rows
  const rows = []; let y = 1.9;
  for (let r = 0; r < 17; r++){
    if (r === 6 || r === 12){ y -= 0.2; }
    const words = []; let x = -2.6; const end = r === 5 || r === 11 || r === 16 ? -0.4 + R()*1.2 : 2.3 + R()*0.35;
    while (x < end){ const w = 0.12 + R()*0.5; words.push([x, Math.min(x+w, end)]); x += w + 0.09; }
    rows.push({ y, words, h: r === 0 ? 0.075 : 0.04 }); y -= 0.25;
  }
  for (let i = 0; i < N; i++){
    // brain-ish cloud: two lobes, surface-biased with folds
    const lobe = R() < .5 ? -1 : 1;
    const dir = new V3(R()*2-1, R()*2-1, R()*2-1).normalize();
    const rr = 0.72 + 0.28*Math.pow(R(), .35);
    const fold = 1 + 0.07*Math.sin(dir.x*11 + dir.y*7) * Math.cos(dir.z*9);
    const c = new V3(dir.x*1.25*rr*fold + lobe*0.78, dir.y*1.15*rr*fold + 0.05, dir.z*1.55*rr*fold);
    if (c.y < -0.85) c.y = -0.85 + (c.y + 0.85)*0.3;
    pos.set([c.x, c.y, c.z], i*3);
    // text
    const row = rows[(R()*rows.length)|0], wd = row.words[(R()*row.words.length)|0];
    const t = new V3(lerp(wd[0], wd[1], R()), row.y + (R()-.5)*row.h*2, (R()-.5)*0.04).applyMatrix4(tiltA);
    tx.set([t.x, t.y, t.z], i*3);
    // network
    let p, ni = -1;
    if (R() < .58){ ni = (R()*NN)|0; const g = () => (R()+R()+R()-1.5)*0.075; p = nodes[ni].clone().add(new V3(g(), g(), g())); }
    else { const e = edges[(R()*edges.length)|0]; const tt = R(); p = nodes[e[0]].clone().lerp(nodes[e[1]], tt).add(new V3((R()-.5)*.03,(R()-.5)*.03,(R()-.5)*.03)); }
    net.set([p.x, p.y, p.z], i*3); nodeIdx[i] = ni;
    seed.set([R(), R(), R(), R()], i*4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aText', new THREE.BufferAttribute(tx, 3));
  geo.setAttribute('aNet', new THREE.BufferAttribute(net, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aNode', new THREE.BufferAttribute(nodeIdx, 1));
  const U = { uW0:{value:1}, uW1:{value:0}, uW2:{value:0}, uTime:{value:0}, uPx:{value:1}, uFocus:{value:8}, uLit:{value:0},
    uTeal:{value:new THREE.Color(0x5fd3c3)}, uAmber:{value:new THREE.Color(0xf3a75b)}, uInk:{value:new THREE.Color(0xebe5da)}, uFade:{value:1} };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 aText, aNet; attribute vec4 aSeed; attribute float aNode;
      uniform float uW0,uW1,uW2,uTime,uPx,uFocus,uLit,uFade; uniform vec3 uTeal,uAmber,uInk; varying vec3 vCol; varying float vA;
      void main(){
        vec3 cl = position + 0.035*vec3(sin(uTime*.7+aSeed.x*40.), cos(uTime*.6+aSeed.y*40.), sin(uTime*.5+aSeed.z*40.));
        vec3 tx = aText; tx.z += sin(uTime*.9 + aText.x*1.6 + aText.y*3.0)*0.025;
        vec3 nt = aNet + 0.018*vec3(sin(uTime*1.3+aSeed.x*30.), cos(uTime*1.1+aSeed.y*30.), sin(uTime*.9+aSeed.z*30.));
        float trans = 4.0*max(uW0*uW1, max(uW1*uW2, uW0*uW2));
        vec3 p = cl*uW0 + tx*uW1 + nt*uW2;
        p += (aSeed.xyz - 0.5) * trans * 1.8 + vec3(0.0, trans*0.3*sin(uTime + aSeed.w*6.28), 0.0);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        float depth = -mv.z; float coc = abs(depth - uFocus);
        gl_PointSize = (0.9 + aSeed.w*1.9) * uPx * (1.0 + coc*0.75) * (7.5/depth);
        float isNode = step(0.0, aNode);
        float lit = isNode * (1.0 - step(uLit, aNode));
        vec3 cCloud = mix(uTeal, uInk, aSeed.z*0.75);
        vec3 cNet = mix(mix(uTeal, uInk, 0.2 + 0.5*(1.0-isNode)), uAmber*1.25, lit);
        vCol = cCloud*uW0 + uInk*0.95*uW1 + cNet*uW2;
        vA = (0.32 + 0.68*aSeed.y) / (1.0 + coc*coc*0.9) * (uW0*0.85 + uW1*0.75 + uW2*(0.45 + 0.55*isNode + 0.4*lit)) * uFade;
      }`,
    fragmentShader:`varying vec3 vCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol, a*a*vA); }`
  }));
  root.add(pts);

  // synapse lines with travelling signals
  const lp = [], lt = [], lph = [];
  edges.forEach(e => { const a = nodes[e[0]], b = nodes[e[1]], ph = R(); lp.push(a.x,a.y,a.z,b.x,b.y,b.z); lt.push(0,1); lph.push(ph,ph); });
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp,3)); lgeo.setAttribute('aT', new THREE.Float32BufferAttribute(lt,1)); lgeo.setAttribute('aPh', new THREE.Float32BufferAttribute(lph,1));
  const LU = { uTime:{value:0}, uA:{value:0}, uTeal:U.uTeal, uAmber:U.uAmber, uRate:{value:.35} };
  const lines = new THREE.LineSegments(lgeo, new THREE.ShaderMaterial({ uniforms:LU, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aT, aPh; varying float vT; varying float vP; void main(){ vT = aT; vP = aPh; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform float uTime, uA, uRate; uniform vec3 uTeal, uAmber; varying float vT; varying float vP;
      void main(){ float f = fract(uTime*uRate + vP); float pulse = exp(-pow((vT - f)*9.0, 2.0)); vec3 c = uTeal*0.35 + uAmber*pulse*2.2; gl_FragColor = vec4(c, (0.18 + pulse)*uA); }`
  }));
  root.add(lines);

  // anamorphic flare (cinematic lens streak)
  const flareMat = new THREE.ShaderMaterial({ uniforms:{ uA:{value:.0}, uC:{value:new THREE.Color(0x7fe0d4)} }, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform float uA; uniform vec3 uC; varying vec2 vUv; void main(){ float x = abs(vUv.x-0.5)*2.0; float y = abs(vUv.y-0.5)*2.0; float a = exp(-y*y*60.0) * pow(1.0-x, 3.0); a += exp(-(x*x+y*y)*30.0)*0.6; gl_FragColor = vec4(uC*a*uA, a*uA); }` });
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), flareMat);
  scene.add(flare);

  let composer = null, bloom = null;
  if (THREE.EffectComposer && THREE.UnrealBloomPass){
    try { composer = new THREE.EffectComposer(bgRenderer); composer.addPass(new THREE.RenderPass(scene, cam));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.22); composer.addPass(bloom);
      composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader)); } catch(e){ composer = null; }
  }
  function bgResize(){
    const w = innerWidth, h = innerHeight; bgRenderer.setSize(w, h, false); cam.aspect = w/h; cam.fov = w/h < .8 ? 50 : 38; cam.updateProjectionMatrix();
    if (composer) composer.setSize(w, h); U.uPx.value = bgRenderer.getPixelRatio()*Math.min(1, h/900); measure();
  }
  addEventListener('resize', bgResize); bgResize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  const studioEl = $('#studio');
  const vis = new IntersectionObserver(es => { es.forEach(e => { bgVisible = !(e.isIntersecting && e.intersectionRatio > .85); }); }, { threshold:[0,.85,1] });
  vis.observe(studioEl);

  // layout keyframes per scene (desktop / mobile)
  const KX = [1.9, 1.7, 1.6, 1.6, 1.6], KZ = [8.4, 6.6, 7.6, 7.0, 8], KY = [0.25, 0.1, 0.35, 0.1, 0];
  let sS = 0, lastT = performance.now()/1000, mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', e => { tmx = e.clientX/innerWidth*2-1; tmy = e.clientY/innerHeight*2-1; }, { passive:true });
  const kf = (arr, s) => { const i = Math.floor(clamp(s,0,arr.length-1)), j = Math.min(i+1, arr.length-1); return lerp(arr[i], arr[j], ss(0,1,clamp(s,0,arr.length-1)-i)); };
  function bgFrame(now){
    requestAnimationFrame(bgFrame);
    const t = now/1000, dt = Math.min(.05, t - lastT); lastT = t;
    if (!bgVisible || document.hidden) return;
    const target = sceneAt(scrollY);
    sS += (target - sS) * (1 - Math.exp(-dt*(reduce ? 30 : 4)));
    mx += (tmx - mx)*(1-Math.exp(-dt*2.5)); my += (tmy - my)*(1-Math.exp(-dt*2.5));
    const s = sS, f1 = ss(0.25, 0.85, s), f2 = ss(1.25, 1.85, s);
    U.uW0.value = 1 - f1; U.uW1.value = f1*(1-f2); U.uW2.value = f2;
    U.uTime.value = t; LU.uTime.value = t;
    LU.uA.value = ss(1.6, 2.0, s);
    LU.uRate.value = 0.3 + 0.25*ss(2.4, 3, s);
    U.uLit.value = ss(2.35, 2.95, s) * (NN + 1);
    U.uFade.value = 1 - ss(3.4, 4.0, s)*0.75;
    const mob = isMobile();
    root.position.set(mob ? 0 : kf(KX, s), mob ? 1.0 : 0, 0);
    root.rotation.set(my*0.12 + (1-f1)*0.15, (reduce ? 0 : t*0.07) + s*0.6 + mx*0.25 - f1*(1-f2)*0.6, 0);
    const z = kf(KZ, s) + (mob ? 3.2 : 0);
    cam.position.set(mx*0.35, kf(KY, s) - my*0.2, z);
    cam.lookAt(root.position.x*0.15, root.position.y*0.6, 0);
    U.uFocus.value = cam.position.distanceTo(root.position);
    flare.position.copy(root.position).add(new V3(0, 0, 1.2)); flare.quaternion.copy(cam.quaternion);
    flareMat.uniforms.uA.value = (0.22 + 0.12*Math.sin(t*0.8)) * (1 - f1*(1-f2)) * (1 - ss(3.4,4,s));
    flareMat.uniforms.uC.value.set(0x7fe0d4).lerp(new THREE.Color(0xf3a75b), ss(2.3, 2.9, s));
    if (bloom) bloom.strength = 0.7 + 0.35*ss(2.3, 2.9, s);
    if (composer) composer.render(); else bgRenderer.render(scene, cam);
  }
  requestAnimationFrame(bgFrame);
} catch(e){ bgCanvas.style.background = 'radial-gradient(60% 50% at 70% 45%,#0f2a2a,#04070a 70%)'; } }
