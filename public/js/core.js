/* Cortex Studio · core
   Shared helpers, heading scramble effect, AI client (talks to server.js), glow texture. */
'use strict';

const $ = s => document.querySelector(s);
const clamp = (x,a,b) => Math.min(b, Math.max(a,x));
const ss = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const lerp = (a,b,t) => a + (b-a)*t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 760px)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const store = { get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };

/* ============ scramble headings on entry ============ */
const GLYPHS = '01<>/[]{}#*+=~ABCDEFXYZ';
function scramble(el){
  if (reduce || el._busy) return;
  el._busy = true;
  const nodes = []; const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 3){ if (c.textContent.trim()) nodes.push({ n:c, t:c._orig || (c._orig = c.textContent) }); } else walk(c); }); }; walk(el);
  const total = nodes.reduce((a,b) => a + b.t.length, 0); const start = performance.now(), dur = 1100;
  const tick = now => {
    const p = clamp((now - start)/dur, 0, 1); let idx = 0;
    nodes.forEach(o => { let s = ''; for (let i = 0; i < o.t.length; i++, idx++){ const ch = o.t[i]; s += (ch === ' ' || idx/total < p*1.15 - 0.15) ? ch : GLYPHS[(Math.random()*GLYPHS.length)|0]; } o.n.textContent = s; });
    if (p < 1) requestAnimationFrame(tick); else { nodes.forEach(o => o.n.textContent = o.t); el._busy = false; }
  };
  requestAnimationFrame(tick);
}
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) scramble(e.target); }), { threshold:.6 });
document.querySelectorAll('.scramble').forEach(h => io.observe(h));

/* ============ AI (open-source model via server.js) ============ */
let sample = null, aiChecked = false, aiBlocked = false;
const aiState = $('#aiState');
function setAiText(){
  if (aiBlocked) aiState.textContent = 'AI paused · exploring the example map';
  else if (sample) aiState.textContent = 'AI ready · ' + (modelName || 'open-source model');
  else if (aiChecked) aiState.textContent = 'AI offline · exploring the example map';
  else aiState.textContent = 'Connecting to the AI server…';
}

/* Talks to server.js, which forwards to a free open-source model (Ollama by default) and streams the reply back as plain text.
   Exposes the same shape the page uses everywhere: sample(input, opts) and sample.json(input, opts). */
function makeApiSample(){
  async function call(input, opts){
    opts = opts || {};
    const messages = typeof input === 'string' ? [{ role:'user', content:input }] : input;
    let res, text = '';
    try {
      res = await fetch('api/chat', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ messages, tier: opts.modelTier || 'default' }), signal: opts.signal });
    } catch(e){ throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error', message: String(e && e.message || e) }; }
    if (!res.ok){ let j = {}; try { j = await res.json(); } catch(_){} throw { code: j.code || 'upstream_error', message: j.message || res.statusText }; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    try {
      for (;;){
        const { value, done } = await reader.read(); if (done) break;
        const delta = dec.decode(value, { stream:true }); if (!delta) continue;
        if (delta.includes('\u0000ERR:')){ const [ok, err] = delta.split('\u0000ERR:'); text += ok; throw { code: err.trim() || 'upstream_error', text }; }
        text += delta; if (opts.onText) opts.onText({ text, delta });
      }
    } catch(e){ if (e && e.code) throw e; throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error', text }; }
    if (!text.trim()) throw { code:'empty_completion' };
    return { text, truncated:false, modelTierApplied: opts.modelTier || 'default' };
  }
  call.json = async (input, opts) => {
    const { text } = await call(input, opts);
    const tryParse = s => { try { return JSON.parse(s); } catch(_){ return undefined; } };
    let v = tryParse(text.trim());
    if (v === undefined){ const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) v = tryParse(m[1].trim()); }
    if (v === undefined){ const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')); if (a >= 0 && b > a) v = tryParse(text.slice(a, b+1)); }
    if (v === undefined) throw { code:'invalid_json', text };
    return v;
  };
  return call;
}

// Ask our own server which open-source model is connected.
let modelName = '';
fetch('api/health').then(r => r.ok ? r.json() : null).then(j => {
  if (j && j.configured) { sample = makeApiSample(); modelName = j.model || ''; }
  aiChecked = true; setAiText(); refreshInspector(); renderQuiz();
}).catch(() => { aiChecked = true; setAiText(); });
setAiText();
function errCopy(e){
  const c = e && e.code;
  if (c === 'auth') return 'The AI provider rejected the API key. Check AI_API_KEY in your .env file.';
  if (c === 'offline') return 'Can\u2019t reach the model. Is Ollama running? Start it with \u201collama serve\u201d.';
  if (c === 'no_model') return 'That model isn\u2019t installed. Run \u201collama pull\u201d for the model named in your .env file.';
  if (c === 'overloaded') return 'The model is busy right now. Give it a few seconds and try again.';
  if (c === 'rate_limited') return 'Too many requests for the moment. Wait a little, then try again.';
  if (c === 'refused') return 'The model declined that request. Try rewording the topic.';
  if (c === 'invalid_json') return 'The answer came back in a shape Cortex couldn’t read. Try again.';
  if (c === 'prompt_too_large') return 'That’s too much text at once. Paste a shorter section.';
  return 'Something interrupted the connection. Try again.';
}
function aiReady(){ return !!sample && !aiBlocked; }
function noAiNote(){ return '<div class="note">AI features need a model connected. Install <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--teal)">Ollama</a>, run <code>ollama pull qwen2.5:7b</code>, then <code>npm start</code>. See the README. The example map works without it.</div>'; }

/* ============ shared textures ============ */
function glowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.12,'rgba(255,255,255,.9)'); gr.addColorStop(.3,'rgba(255,255,255,.32)'); gr.addColorStop(.6,'rgba(255,255,255,.06)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
}

if (!window.THREE){ document.body.classList.add('no-gl'); }
