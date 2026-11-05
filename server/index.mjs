// Local-only by default. Remote deployment needs a separately reviewed auth gateway.
import 'dotenv/config';
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { validateProposal } from './council.mjs';
import { runIndependentCouncil, isCouncilConfigured } from './providers.mjs';
import { subSeatStatus } from './subseats.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || '8787');
const DIST = resolve(process.cwd(), 'dist');
const MAX_BODY_BYTES = 48 * 1024;
const RATE_LIMIT = 6;

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

// Five separately invoked providers; never a single simulated council call.
const assess = runIndependentCouncil;

async function serveStatic(req, res, pathname, staticRoot = DIST) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return send(res, 400, { error: 'Malformed path' }); }

  let root;
  try { root = await realpath(staticRoot); }
  catch { return send(res, 404, { error: 'UI not built. Run npm run dev or npm run build.' }); }

  const requested = resolve(root, '.' + decoded);
  if (requested !== root && !requested.startsWith(root + sep))
    return send(res, 403, { error: 'Forbidden' });

  // Resolve symlinks before reading. Lexical path containment alone is insufficient.
  async function safeFile(candidate) {
    let canonical;
    try { canonical = await realpath(candidate); }
    catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
      throw err;
    }
    if (canonical !== root && !canonical.startsWith(root + sep))
      return { escaped: true };
    const info = await stat(canonical);
    return info.isFile() ? { file: canonical } : null;
  }

  try {
    let candidate = await safeFile(requested);
    if (candidate?.escaped) return send(res, 403, { error: 'Forbidden' });
    if (!candidate) candidate = await safeFile(resolve(root, 'index.html'));
    if (candidate?.escaped) return send(res, 403, { error: 'Forbidden' });
    if (!candidate?.file) return send(res, 404, { error: 'UI not built. Run npm run build.' });

    const data = await readFile(candidate.file);
    const mime = ({
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    })[extname(candidate.file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, { error: 'Static content unavailable' });
  }
}

export function makeServer({ staticRoot = DIST, assessProposal = assess } = {}) {
  const recent = new Map();
  let inFlight = 0;
  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
    catch { return send(res, 400, { error: 'Malformed URL' }); }

    if (pathname === '/api/health' && req.method === 'GET')
      return send(res, 200, {
        status: 'running', configured: isCouncilConfigured(),
        backup_subseats: subSeatStatus()
      });
    if (pathname !== '/api/analyze') {
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      return serveStatic(req, res, pathname, staticRoot);
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
      const rawProposal = await readJson(req);
      let proposal;
      try { proposal = validateProposal(rawProposal); }
      catch (err) { return send(res, 400, { error: err.message }); }
      const result = await assessProposal(proposal);
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
