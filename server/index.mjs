// Local-only by default. Remote deployment needs a separately reviewed auth gateway.
import 'dotenv/config';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { validateProposal, normalizeCouncilResult } from './council.mjs';
import { KLOC_SYSTEM_PROMPT } from './prompt.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || '8787');
const DIST = resolve(process.cwd(), 'dist');
const MAX_BODY_BYTES = 48 * 1024;
const RATE_LIMIT = 6;
const recent = new Map();
let inFlight = 0;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
  throw new Error('PORT must be between 1 and 65535');
if (!['localhost', '127.0.0.1', '::1'].includes(HOST)) {
  // Never accidentally turn a development API with paid credentials into a public endpoint.
  throw new Error('Refusing non-loopback bind: KLOC requires an authenticated gateway before public deployment');
}

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES)
      throw Object.assign(new Error('Proposal exceeds 48 KiB'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON request'), { status: 400 });
  }
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const uri = new URL(origin);
    const allowedHost = ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname);
    const allowedPort = ['', '3000', String(PORT)].includes(uri.port);
    return uri.protocol === 'http:' && allowedHost && allowedPort;
  } catch { return false; }
}

async function assess(proposal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY is not configured on the server'), { status: 503 });
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.KLOC_MODEL || 'gemini-2.5-flash',
    contents: JSON.stringify({ proposal }),
    config: {
      systemInstruction: KLOC_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  });
  if (!response.text) throw new Error('Empty model response');
  // A model cannot approve itself: this function recalculates every resolution.
  return normalizeCouncilResult(JSON.parse(response.text), proposal);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return send(res, 400, { error: 'Malformed path' }); }
  const filename = resolve(DIST, '.' + decoded);
  if (filename !== DIST && !filename.startsWith(DIST + sep))
    return send(res, 403, { error: 'Forbidden' });

  let target = filename;
  try {
    const info = await stat(target);
    if (!info.isFile()) target = resolve(DIST, 'index.html');
  } catch {
    target = resolve(DIST, 'index.html');
  }
  try {
    const data = await readFile(target);
    const mime = ({
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    })[extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, { error: 'UI not built. Run npm run dev or npm run build.' });
  }
}

export function makeServer() {
  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
    catch { return send(res, 400, { error: 'Malformed URL' }); }

    if (pathname === '/api/health' && req.method === 'GET')
      return send(res, 200, { status: 'running', configured: Boolean(process.env.GEMINI_API_KEY) });
    if (pathname !== '/api/analyze') {
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      return serveStatic(req, res, pathname);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!checkOrigin(req)) return send(res, 403, { error: 'Disallowed Origin' });

    const now = Date.now();
    const ip = req.socket.remoteAddress || 'unknown';
    const previous = (recent.get(ip) || []).filter(t => now - t < 60_000);
    if (previous.length >= RATE_LIMIT) return send(res, 429, { error: 'Rate limit exceeded' });
    previous.push(now);
    recent.set(ip, previous);
    if (inFlight >= 2) return send(res, 429, { error: 'Council is busy' });

    inFlight++;
    try {
      const proposal = validateProposal(await readJson(req));
      const result = await assess(proposal);
      return send(res, 200, result);
    } catch (err) {
      if (err?.status) return send(res, err.status, { error: err.message });
      if (err instanceof TypeError || err instanceof SyntaxError)
        return send(res, 502, { error: 'Model response failed trusted validation; no decision issued' });
      console.error('KLOC analysis failed:', err?.name || 'UnknownError');
      return send(res, 502, { error: 'Model service unavailable; no decision issued' });
    } finally { inFlight--; }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  makeServer().listen(PORT, HOST, () => {
    console.log('KLOC listening on http://' + HOST + ':' + PORT + ' (loopback only)');
  });
}
