// Cortex Studio server
// Serves the frontend and forwards AI requests to any OpenAI-compatible endpoint.
// Default: Ollama running locally (free, open-source models, no API key).
// Zero dependencies. Requires Node.js 18+.

const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------- tiny .env loader ---------- */
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, '');
const API_KEY = process.env.AI_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'qwen2.5:7b';
const MODEL_FAST = process.env.AI_MODEL_FAST || MODEL;
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 2500;
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 30;
const PUBLIC_DIR = path.join(__dirname, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

/* ---------- helpers ---------- */
function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function authHeaders() {
  const h = { 'content-type': 'application/json' };
  if (API_KEY) h.authorization = 'Bearer ' + API_KEY;
  // Optional headers some free providers (e.g. OpenRouter) like to receive
  if (process.env.AI_APP_URL) h['HTTP-Referer'] = process.env.AI_APP_URL;
  h['X-Title'] = 'Cortex Studio';
  return h;
}
function readBody(req, limit = 300 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 'prompt_too_large' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------- simple per-IP rate limit ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 60_000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > RATE_PER_MIN;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some(t => now - t < 60_000)) hits.delete(ip); }, 60_000).unref();

/* ---------- /api/health ---------- */
async function health(res) {
  let reachable = false, models = [];
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(BASE_URL + '/models', { headers: authHeaders(), signal: ctl.signal });
    clearTimeout(timer);
    if (r.ok) { reachable = true; const j = await r.json().catch(() => ({})); models = (j.data || []).map(m => m.id); }
  } catch (_) { /* offline */ }
  const installed = !models.length || models.includes(MODEL) || models.some(id => id === MODEL + ':latest');
  sendJson(res, 200, { configured: reachable, model: MODEL, modelInstalled: installed, provider: BASE_URL.includes('11434') ? 'ollama' : 'openai-compatible' });
}

/* ---------- /api/chat → model proxy (streams plain text) ---------- */
async function chat(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'local';
  if (rateLimited(ip)) return sendJson(res, 429, { code: 'rate_limited', message: 'Too many requests' });

  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch (e) { return sendJson(res, e.code === 'prompt_too_large' ? 413 : 400, { code: e.code || 'invalid_request', message: 'Bad request body' }); }

  const messages = Array.isArray(body.messages) ? body.messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 60_000) })) : [];
  if (!messages.length || messages[messages.length - 1].role !== 'user') return sendJson(res, 400, { code: 'invalid_request', message: 'messages must end with a user turn' });

  const model = body.tier === 'quick' ? MODEL_FAST : MODEL;
  const upstreamCtl = new AbortController();
  res.on('close', () => upstreamCtl.abort());

  let up;
  try {
    up = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST', headers: authHeaders(), signal: upstreamCtl.signal,
      body: JSON.stringify({
        model, stream: true, max_tokens: MAX_TOKENS, temperature: 0.4,
        messages: [{ role: 'system', content: 'You are Cortex, a careful, friendly study tutor. Follow the requested output format exactly. When asked for JSON, reply with only valid JSON and nothing else.' }, ...messages]
      })
    });
  } catch (e) {
    if (upstreamCtl.signal.aborted) return;
    return sendJson(res, 502, { code: 'offline', message: 'Could not reach ' + BASE_URL });
  }

  if (!up.ok) {
    const txt = await up.text().catch(() => '');
    const code = up.status === 401 || up.status === 403 ? 'auth'
      : up.status === 404 ? 'no_model'
      : up.status === 429 ? 'rate_limited'
      : up.status === 503 || up.status === 529 ? 'overloaded'
      : up.status === 413 ? 'prompt_too_large' : 'upstream_error';
    console.error('[cortex] upstream', up.status, txt.slice(0, 300));
    return sendJson(res, up.status === 429 ? 429 : 502, { code, message: txt.slice(0, 300) });
  }

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const reader = up.body.getReader(); const dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          if (j.error) { res.write('\u0000ERR:upstream_error'); continue; }
          const t = j.choices?.[0]?.delta?.content;
          if (t) res.write(t);
        } catch (_) { /* partial or keep-alive line */ }
      }
    }
  } catch (e) {
    if (!upstreamCtl.signal.aborted) res.write('\u0000ERR:upstream_error');
  }
  res.end();
}

/* ---------- static files ---------- */
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- router ---------- */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/health' && req.method === 'GET') return health(res);
  if (url === '/api/chat') {
    if (req.method !== 'POST') return sendJson(res, 405, { code: 'invalid_request', message: 'POST only' });
    return chat(req, res).catch(e => { console.error(e); if (!res.headersSent) sendJson(res, 500, { code: 'upstream_error', message: 'Server error' }); else res.end(); });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`\n  Cortex Studio running → http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}${MODEL_FAST !== MODEL ? ' (fast: ' + MODEL_FAST + ')' : ''}`);
  console.log(`  Provider: ${BASE_URL}\n`);
});
