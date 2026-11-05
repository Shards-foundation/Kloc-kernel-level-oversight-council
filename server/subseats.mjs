// Optional explicitly configured sub-seat pool.
// All local endpoints are fixed loopback URLs to prevent SSRF through configuration.
import { SEATS, verifySingleSeat } from './council.mjs';
import { seatPrompt } from './prompt.mjs';

const PROVIDERS = new Set(['ollama', 'lmstudio', 'openrouter']);
const URLS = Object.freeze({
  ollama: 'http://127.0.0.1:11434/api/chat',
  lmstudio: 'http://127.0.0.1:1234/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions'
});
const fail = message => { throw Object.assign(new Error(message), { status: 503 }); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function loadSubseats(env = process.env) {
  const enabled = env.KLOC_SUBSEATS_ENABLED === 'true';
  if (!enabled) return [];
  let raw;
  try { raw = JSON.parse(env.KLOC_SUBSEATS_JSON || '[]'); }
  catch { fail('KLOC_SUBSEATS_JSON must contain a JSON array of sub-seats'); }
  if (!Array.isArray(raw) || !raw.length || raw.length > 20)
    fail('Enabled sub-seats require 1–20 configured backup candidates');
  const seen = new Set();
  return raw.map((item, index) => {
    if (!isObject(item) || !SEATS.includes(item.seat) || !PROVIDERS.has(item.provider))
      fail('Invalid backup sub-seat at index ' + index);
    if (Object.keys(item).some(key => !['seat', 'provider', 'model', 'priority'].includes(key)))
      fail('Unknown sub-seat configuration field at index ' + index);
    const model = item.model;
    if (typeof model !== 'string' || model.length > 128 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/+-]+$/.test(model))
      fail('Invalid sub-seat model identifier at index ' + index);
    if (item.provider === 'openrouter' && !model.endsWith(':free'))
      fail('OpenRouter fallback must use an explicitly named :free model');
    // The dynamic openrouter/free router is intentionally unsupported: it cannot
    // prove which model voted and cannot guarantee five distinct models.
    const priority = item.priority ?? 50;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100)
      fail('Sub-seat priority must be an integer between 0 and 100');
    const identity = item.seat + '|' + item.provider + '|' + model;
    if (seen.has(identity)) fail('Duplicate backup sub-seat configuration');
    seen.add(identity);
    if (item.provider === 'openrouter' &&
        (!env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY.startsWith('replace-with-')))
      fail('OPENROUTER_API_KEY required for an OpenRouter backup');
    return {
      seat: item.seat,
      provider: item.provider,
      model,
      priority,
      credential: item.provider === 'openrouter' ? env.OPENROUTER_API_KEY : ''
    };
  }).sort((a, b) => a.priority - b.priority);
}

export function subSeatStatus(env = process.env) {
  const enabled = env.KLOC_SUBSEATS_ENABLED === 'true';
  if (!enabled) return { enabled: false, configured_seats: 0, valid_config: true };
  try {
    const seats = new Set(loadSubseats(env).map(x => x.seat));
    return { enabled: true, configured_seats: seats.size, valid_config: true };
  } catch {
    return { enabled: true, configured_seats: 0, valid_config: false };
  }
}

const requireText = (value, provider) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(provider + ' returned no reviewer text');
  return value.trim();
};

function requestForSubseat(config, proposal) {
  const system = seatPrompt(config.seat) + '\nYou are an explicitly designated BACKUP reviewer. Report only your own evidence and do not claim to be the primary provider.';
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ proposal }) }
  ];
  if (config.provider === 'ollama') return {
    url: URLS.ollama,
    headers: { 'content-type': 'application/json' },
    body: {
      model: config.model, messages, stream: false, format: 'json',
      options: { temperature: 0 }
    },
    parse(data) {
      if (data?.done !== true || (data?.done_reason && data.done_reason !== 'stop'))
        throw new TypeError('Ollama incomplete response');
      return {
        text: requireText(data?.message?.content, 'Ollama'),
        model: data.model,
        usage: { input_tokens: data.prompt_eval_count, output_tokens: data.eval_count }
      };
    }
  };
  const base = {
    model: config.model,
    messages,
    temperature: 0,
    max_tokens: 3000,
    stream: false
  };
  const isRouter = config.provider === 'openrouter';
  return {
    url: isRouter ? URLS.openrouter : URLS.lmstudio,
    headers: {
      'content-type': 'application/json',
      ...(isRouter ? { authorization: 'Bearer ' + config.credential } : {})
    },
    body: base,
    parse(data) {
      const choice = data?.choices?.[0];
      if (choice?.finish_reason !== 'stop')
        throw new TypeError(config.provider + ' incomplete response');
      return {
        text: requireText(choice?.message?.content, config.provider),
        model: data.model,
        usage: {
          input_tokens: data?.usage?.prompt_tokens,
          output_tokens: data?.usage?.completion_tokens
        }
      };
    }
  };
}

export async function runSubseat(config, proposal, { fetchFn = fetch, timeoutMs = 45_000, now = Date.now } = {}) {
  const req = requestForSubseat(config, proposal);
  const start = now();
  let response;
  try {
    response = await fetchFn(req.url, {
      method: 'POST', headers: req.headers, body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new Error('Sub-seat unavailable or timed out');
  }
  if (!response.ok) throw new Error('Sub-seat returned HTTP ' + response.status);
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('Invalid sub-seat provider response'); }

  const decoded = req.parse(payload);
  // A model identity must be declared by the endpoint to count toward the quorum.
  // Brokers and local runtimes may supply aliases; never silently accept a different ID.
  if (typeof decoded.model !== 'string') throw new Error('Sub-seat provider did not attest model ID');
  const requestedId = config.model.replace(/:free$/, '');
  const actualId = decoded.model.replace(/:free$/, '');
  if (requestedId !== actualId) throw new Error('Sub-seat provider model mismatch');
  let candidate;
  try { candidate = JSON.parse(decoded.text); }
  catch { throw new Error('Sub-seat returned malformed reviewer JSON'); }
  if (!isObject(candidate) || candidate.seat !== config.seat)
    throw new Error('Sub-seat seat identity mismatch');
  const seat = verifySingleSeat(candidate, config.seat);
  const usage = {};
  for (const [k, v] of Object.entries(decoded.usage)) {
    if (Number.isFinite(v) && v >= 0) usage[k] = v;
  }
  return {
    seat,
    metadata: {
      seat: config.seat, provider: config.provider, model: config.model,
      tier: 'subseat', latency_ms: Math.max(0, now() - start), ...usage
    }
  };
}
