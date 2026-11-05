// Five distinct provider integrations. No shared inference proxy, no fallback model.
import { SEATS, normalizeCouncilResult, validateProposal } from './council.mjs';
import { seatPrompt } from './prompt.mjs';
import { loadSubseats, runSubseat } from './subseats.mjs';

const DEFAULTS = Object.freeze([
  { seat: 'SECURITY', provider: 'anthropic', key: 'ANTHROPIC_API_KEY', modelKey: 'KLOC_ANTHROPIC_MODEL', model: 'claude-sonnet-5-5' },
  { seat: 'SYSTEMS_INTEGRITY', provider: 'openai', key: 'OPENAI_API_KEY', modelKey: 'KLOC_OPENAI_MODEL', model: 'gpt-6.1-terra' },
  { seat: 'ECONOMIC_RISK', provider: 'google', key: 'GEMINI_API_KEY', modelKey: 'KLOC_GEMINI_MODEL', model: 'gemini-3.8-flash' },
  { seat: 'FOUNDER_ADVERSARY', provider: 'xai', key: 'XAI_API_KEY', modelKey: 'KLOC_XAI_MODEL', model: 'grok-4.7' },
  { seat: 'EXTERNAL_REALITY', provider: 'mistral', key: 'MISTRAL_API_KEY', modelKey: 'KLOC_MISTRAL_MODEL', model: 'mistral-small-latest' }
]);

export function reviewerConfiguration(env = process.env) {
  return DEFAULTS.map(entry => ({
    seat: entry.seat,
    provider: entry.provider,
    keyName: entry.key,
    credential: (env[entry.key] || '').trim(),
    model: (env[entry.modelKey] || entry.model).trim()
  }));
}

function assertConfiguration(config, { requireCredentials = true } = {}) {
  if (!Array.isArray(config) || config.length !== SEATS.length) {
    throw Object.assign(new Error('Exactly five reviewers are required'), { status: 503 });
  }
  const seats = config.map(x => x.seat);
  const providers = config.map(x => x.provider);
  const models = config.map(x => x.model);
  const validSeats = SEATS.every(s => seats.includes(s));
  const expectedMapping = config.every(entry =>
    DEFAULTS.some(defaultReviewer =>
      entry.seat === defaultReviewer.seat && entry.provider === defaultReviewer.provider));
  if (!validSeats || !expectedMapping || new Set(seats).size !== 5 ||
      new Set(providers).size !== 5 || new Set(models).size !== 5) {
    throw Object.assign(new Error('Five unique seats, providers and models with correct provider ownership are required'), { status: 503 });
  }
  const missing = config.filter(x => !x.credential || x.credential.startsWith('replace-with-'));
  if (requireCredentials && missing.length) {
    throw Object.assign(new Error('Required providers not configured: ' + missing.map(x => x.provider).join(', ')), { status: 503 });
  }
  if (config.some(x => !x.model || !/^[a-zA-Z0-9._-]{2,128}$/.test(x.model))) {
    throw Object.assign(new Error('Invalid model identifier in reviewer configuration'), { status: 503 });
  }
  return config;
}

export function isCouncilConfigured(env = process.env) {
  try { assertConfiguration(reviewerConfiguration(env)); return true; }
  catch { return false; }
}

const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Invalid ' + label + ' response');
  return value.trim();
};

const usageCounts = (usage, provider) => {
  const u = usage && typeof usage === 'object' ? usage : {};
  const input = provider === 'google' ? u.promptTokenCount :
    provider === 'anthropic' ? u.input_tokens :
    provider === 'openai' ? u.input_tokens : u.prompt_tokens;
  const output = provider === 'google' ? u.candidatesTokenCount :
    provider === 'anthropic' ? u.output_tokens :
    provider === 'openai' ? u.output_tokens : u.completion_tokens;
  const result = {};
  if (Number.isFinite(input) && input >= 0) result.input_tokens = input;
  if (Number.isFinite(output) && output >= 0) result.output_tokens = output;
  return result;
};

function providerRequest(config, proposal) {
  const { provider, model, credential, seat } = config;
  const system = seatPrompt(seat);
  const packet = JSON.stringify({ proposal });
  const baseHeaders = { 'content-type': 'application/json' };

  if (provider === 'openai') return {
    url: 'https://api.openai.com/v1/responses',
    headers: { ...baseHeaders, authorization: 'Bearer ' + credential },
    body: {
      model, store: false, instructions: system, input: packet,
      max_output_tokens: 3500,
      text: { format: { type: 'json_object' } }
    },
    extract(json) {
      if (json?.status && json.status !== 'completed') throw new TypeError('OpenAI response incomplete');
      return requireText((json?.output || []).flatMap(o => o?.content || [])
        .filter(p => p?.type === 'output_text').map(p => p.text).join(''), 'OpenAI');
    }
  };
  if (provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { ...baseHeaders, 'x-api-key': credential, 'anthropic-version': '2026-10-21' },
    body: { model, max_tokens: 3500, system, messages: [{ role: 'user', content: packet }] },
    extract(json) {
      if (json?.stop_reason === 'max_tokens') throw new TypeError('Anthropic response truncated');
      return requireText((json?.content || []).filter(c => c?.type === 'text')
        .map(c => c.text).join(''), 'Anthropic');
    }
  };
  if (provider === 'google') return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    headers: { ...baseHeaders, 'x-goog-api-key': credential },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: packet }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 3500 }
    },
    extract(json) {
      const candidate = json?.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new TypeError('Gemini response incomplete');
      }
      return requireText((candidate?.content?.parts || []).map(p => p?.text || '').join(''), 'Gemini');
    }
  };
  if (provider === 'xai' || provider === 'mistral') return {
    url: provider === 'xai' ? 'https://api.x.ai/v1/chat/completions' :
      'https://api.mistral.ai/v1/chat/completions',
    headers: { ...baseHeaders, authorization: 'Bearer ' + credential },
    body: {
      model, messages: [{ role: 'system', content: system }, { role: 'user', content: packet }],
      max_tokens: 3500
    },
    extract(json) {
      const first = json?.choices?.[0];
      if (first?.finish_reason && first.finish_reason !== 'stop') {
        throw new TypeError('Chat response incomplete');
      }
      return requireText(first?.message?.content, provider);
    }
  };
  throw Object.assign(new Error('Unsupported reviewer provider'), { status: 503 });
}

export async function runReviewer(config, proposal, { fetchFn = fetch, timeoutMs = 60_000, now = Date.now } = {}) {
  const request = providerRequest(config, proposal);
  const started = now();
  let response;
  try {
    response = await fetchFn(request.url, {
      method: 'POST', headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new Error(config.seat + ': ' + config.provider + ' unavailable or timed out');
  }
  if (!response.ok) {
    // Provider body may contain sensitive details: do not log or return it.
    throw new Error(config.seat + ': ' + config.provider + ' HTTP ' + response.status);
  }
  let parsed;
  try { parsed = await response.json(); }
  catch { throw new TypeError(config.seat + ': malformed provider JSON'); }
  let seat;
  try { seat = JSON.parse(request.extract(parsed)); }
  catch { throw new TypeError(config.seat + ': malformed or incomplete reviewer report'); }
  if (!seat || Array.isArray(seat) || typeof seat !== 'object' || seat.seat !== config.seat) {
    throw new TypeError(config.seat + ': reviewer identity mismatch');
  }
  return {
    seat,
    metadata: {
      seat: config.seat, provider: config.provider, model: config.model,
      latency_ms: Math.max(0, now() - started),
      ...usageCounts(config.provider === 'google' ? parsed.usageMetadata : parsed.usage, config.provider)
    }
  };
}

function hasCredential(config) {
  return Boolean(config.credential && !config.credential.startsWith('replace-with-'));
}

function coveragePossible(missingSeats, candidates, occupiedModels) {
  if (!missingSeats.length) return true;
  const [seat, ...remaining] = missingSeats;
  return candidates.some(candidate =>
    candidate.seat === seat && !occupiedModels.has(candidate.model) &&
    coveragePossible(remaining, candidates, new Set([...occupiedModels, candidate.model])));
}

export async function runIndependentCouncil(input, options = {}) {
  const proposal = validateProposal(input);
  const env = options.env || process.env;
  // All sub-seats are opt-in. With disabled backups, the strict v1.2 behaviour is unchanged.
  const backups = options.backups || loadSubseats(env);
  const configs = assertConfiguration(
    options.config || reviewerConfiguration(env),
    { requireCredentials: backups.length === 0 }
  );
  const missingCredentials = configs.filter(config => !hasCredential(config));
  const initialModels = new Set(configs.filter(hasCredential).map(config => config.model));
  if (missingCredentials.length &&
      !coveragePossible(missingCredentials.map(config => config.seat), backups, initialModels)) {
    throw Object.assign(new Error('No complete five-model council configuration: some primary seats have no distinct configured backup'), { status: 503 });
  }

  const outcomes = await Promise.all(configs.map(async config => {
    if (!hasCredential(config)) return {
      ok: false, failedSeat: config.seat, reason: 'primary_not_configured'
    };
    try {
      const report = await runReviewer(config, proposal, options);
      return { ok: true, report };
    } catch {
      return { ok: false, failedSeat: config.seat, reason: 'primary_unavailable' };
    }
  }));

  const accepted = outcomes.map(item => item.ok ? item.report : null);
  const occupiedModels = new Set(accepted.filter(Boolean).map(item => item.metadata.model));
  const occupiedProviders = new Set(accepted.filter(Boolean).map(item => item.metadata.provider));
  const fallbackEvents = [];
  const failedSeats = [];

  for (const [index, original] of outcomes.entries()) {
    if (original.ok) continue;
    const config = configs[index];
    // Prefer distinct providers, then configured priority. Every backup is still
    // one separate inference request and must use a unique model identity.
    const candidates = backups.filter(backup =>
      backup.seat === config.seat && !occupiedModels.has(backup.model)
    ).sort((a, b) =>
      Number(occupiedProviders.has(a.provider)) - Number(occupiedProviders.has(b.provider)) ||
      a.priority - b.priority
    );
    let resolved = false;
    for (const candidate of candidates) {
      try {
        const report = await runSubseat(candidate, proposal, options);
        report.metadata.replaced_provider = config.provider;
        report.metadata.backup_reason = original.reason;
        accepted[index] = report;
        occupiedModels.add(candidate.model);
        occupiedProviders.add(candidate.provider);
        fallbackEvents.push({
          seat: config.seat,
          replaced_provider: config.provider,
          provider: candidate.provider,
          model: candidate.model,
          reason: original.reason
        });
        resolved = true;
        break;
      } catch {
        // A failed backup never becomes a fabricated vote. Try the next explicit
        // backup candidate for this seat, if one exists.
      }
    }
    if (!resolved) failedSeats.push(config.seat);
  }

  if (failedSeats.length || accepted.some(item => !item)) {
    throw Object.assign(
      new Error('Independent council incomplete; no decision issued. Failed seats: ' + failedSeats.join(', ')),
      { status: 502 }
    );
  }
  const finalModels = accepted.map(item => item.metadata.model);
  if (new Set(finalModels).size !== SEATS.length) {
    throw Object.assign(new Error('Independent council model duplication; no decision issued'), { status: 502 });
  }

  const normalized = normalizeCouncilResult({
    proposal_summary_1line: proposal.title,
    seats: accepted.map(item => item.seat),
    operator_notes: {
      recommended_next_action: 'Review every seat report, model provenance and required mitigation before acting.'
    }
  }, proposal);

  if (fallbackEvents.length) {
    // Backup votes are useful continuity evidence, not equivalent to a complete
    // primary five-provider review. Never silently clear a consequential proposal.
    if (normalized.kernel_resolution.final_state !== 'BLOCK') {
      normalized.kernel_resolution.final_state = 'MANUAL_REVIEW';
    }
    normalized.kernel_resolution.rule_trace.push(
      'DEGRADED COUNCIL: ' + fallbackEvents.length + ' backup sub-seat(s); human review mandatory'
    );
    normalized.kernel_resolution.manual_review_questions.push(
      ...fallbackEvents.map(event =>
        event.seat + ': ' + event.replaced_provider + ' replaced by ' +
        event.provider + ' (' + event.model + ') — verify review quality')
    );
  }
  return {
    ...normalized,
    kloc_version: '1.3',
    reviewers: accepted.map(item => ({
      tier: 'primary', ...item.metadata
    })),
    fallback_events: fallbackEvents,
    council_mode: fallbackEvents.length
      ? 'five-models-with-backup-subseats'
      : 'five-independent-providers'
  };
}
