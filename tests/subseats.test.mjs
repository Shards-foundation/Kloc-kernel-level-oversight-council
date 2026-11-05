import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSubseats, subSeatStatus, runSubseat } from '../server/subseats.mjs';
import { reviewerConfiguration, runIndependentCouncil } from '../server/providers.mjs';

const KEY_ENV = {
  ANTHROPIC_API_KEY: 'anthropic-test',
  OPENAI_API_KEY: 'openai-test',
  GEMINI_API_KEY: 'google-test',
  XAI_API_KEY: 'xai-test',
  MISTRAL_API_KEY: 'mistral-test'
};
const proposal = { proposal_id: 'P-031', title: 'Read-only autonomous code reviewer',
  context: 'Review proposed changes, no deployments or spending' };
const verdict = (seat, result = 'NO_OBJECTION') => ({
  seat, verdict: result, risk_score: 2, confidence: 0.8,
  hard_reject_triggers: result === 'HARD_REJECT' ? ['Critical breach'] : [],
  soft_reject_flags: [], unknowns: [],
  required_mitigations: [], minimal_test_plan: ['Review logs']
});
const backups = [
  { seat: 'SECURITY', provider: 'ollama', model: 'qwen3:8b', priority: 1 },
  { seat: 'FOUNDER_ADVERSARY', provider: 'openrouter', model: 'google/gemma-3-4b-it:free', priority: 2 },
  { seat: 'SYSTEMS_INTEGRITY', provider: 'lmstudio', model: 'local/qwen3-14b', priority: 3 }
];
const withSubseats = (items = backups, overrides = {}) => ({
  ...KEY_ENV,
  KLOC_SUBSEATS_ENABLED: 'true',
  KLOC_SUBSEATS_JSON: JSON.stringify(items),
  OPENROUTER_API_KEY: 'openrouter-test',
  ...overrides
});

function fakeResponses({ failPrimaries = [], badSubseat = '', hardPrimary = '', malformedPrimary = '' } = {}) {
  const calls = [];
  const config = reviewerConfiguration(KEY_ENV);
  const fetchFn = async (url, req) => {
    const request = JSON.parse(req.body);
    calls.push({ url, req, request });

    if (url.includes('api.anthropic.com')) {
      if (failPrimaries.includes('anthropic')) return new Response('{}', { status: 503 });
      const primaryVote = verdict('SECURITY', hardPrimary === 'anthropic' ? 'HARD_REJECT' : 'NO_OBJECTION');
      if (malformedPrimary === 'anthropic') delete primaryVote.unknowns;
      return Response.json({
        stop_reason: 'end_turn', usage: { input_tokens: 80, output_tokens: 90 },
        content: [{ type: 'text', text: JSON.stringify(primaryVote) }]
      });
    }
    if (url.includes('api.openai.com')) {
      if (failPrimaries.includes('openai')) return new Response('{}', { status: 429 });
      return Response.json({
        status: 'completed', usage: { input_tokens: 40, output_tokens: 40 },
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(verdict('SYSTEMS_INTEGRITY')) }] }]
      });
    }
    if (url.includes('googleapis.com')) return Response.json({
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 70 },
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(verdict('ECONOMIC_RISK')) }] } }]
    });
    if (url.includes('api.x.ai')) {
      if (failPrimaries.includes('xai')) return new Response('{}', { status: 429 });
      return Response.json({
        usage: { prompt_tokens: 80, completion_tokens: 60 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(verdict('FOUNDER_ADVERSARY')) } }]
      });
    }
    if (url.includes('api.mistral.ai')) return Response.json({
      usage: { prompt_tokens: 80, completion_tokens: 60 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(verdict('EXTERNAL_REALITY')) } }]
    });
    if (url.includes('127.0.0.1:11434')) {
      if (badSubseat === 'ollama-http') return new Response('{}', { status: 503 });
      return Response.json({
        model: badSubseat === 'ollama-model' ? 'other-model' : request.model,
        done: badSubseat !== 'ollama-truncated',
        done_reason: 'stop',
        prompt_eval_count: 14, eval_count: 18,
        message: { content: JSON.stringify(verdict(
          badSubseat === 'ollama-seat' ? 'EXTERNAL_REALITY' : 'SECURITY'
        )) }
      });
    }
    if (url.includes('127.0.0.1:1234')) return Response.json({
      model: request.model, usage: { prompt_tokens: 15, completion_tokens: 17 },
      choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify(verdict(request.messages[0].content.includes('Your assigned seat is SECURITY') ? 'SECURITY' : 'SYSTEMS_INTEGRITY'))
      } }]
    });
    if (url.includes('openrouter.ai')) return Response.json({
      model: request.model.replace(/:free$/, ''),
      usage: { prompt_tokens: 19, completion_tokens: 29 },
      choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify(verdict('FOUNDER_ADVERSARY'))
      } }]
    });
    throw new Error('Unexpected upstream URL ' + url);
  };
  return { calls, fetchFn, config };
}

test('sub-seats are disabled by default and health reflects only configuration, not reachability', () => {
  assert.deepEqual(loadSubseats(KEY_ENV), []);
  assert.deepEqual(subSeatStatus(KEY_ENV), { enabled: false, configured_seats: 0, valid_config: true });
  const env = withSubseats();
  assert.equal(loadSubseats(env).length, 3);
  assert.deepEqual(subSeatStatus(env), { enabled: true, configured_seats: 3, valid_config: true });
});

test('rejects malformed sub-seat JSON, disallowed fields, dynamic model routing and paid broker models', () => {
  assert.throws(() => loadSubseats({ KLOC_SUBSEATS_ENABLED: 'true', KLOC_SUBSEATS_JSON: '{' }), /JSON array/);
  assert.throws(() => loadSubseats(withSubseats([{ ...backups[0], endpoint: 'http://evil.test' }])), /Unknown sub-seat/);
  assert.throws(() => loadSubseats(withSubseats([{ ...backups[1], model: 'openrouter/free' }])), /:free/);
  assert.throws(() => loadSubseats(withSubseats([{ ...backups[1], model: 'openai/gpt-4' }])), /:free/);
  assert.throws(() => loadSubseats(withSubseats([backups[1]], { OPENROUTER_API_KEY: '' })), /OPENROUTER_API_KEY/);
  assert.throws(() => loadSubseats(withSubseats([backups[0], backups[0]])), /Duplicate/);
});

test('a missing primary credential can be replaced by a separately modelled local sub-seat', async () => {
  const env = withSubseats(backups, { ANTHROPIC_API_KEY: '' });
  const mocked = fakeResponses();
  const result = await runIndependentCouncil(proposal, { env, fetchFn: mocked.fetchFn });
  assert.equal(result.council_mode, 'five-models-with-backup-subseats');
  assert.equal(result.fallback_events.length, 1);
  assert.equal(result.fallback_events[0].seat, 'SECURITY');
  assert.equal(result.fallback_events[0].replaced_provider, 'anthropic');
  assert.equal(result.fallback_events[0].provider, 'ollama');
  assert.equal(result.reviewers[0].tier, 'subseat');
  assert.equal(result.reviewers[0].model, 'qwen3:8b');
  assert.equal(result.kernel_resolution.final_state, 'MANUAL_REVIEW');
  assert.ok(result.kernel_resolution.rule_trace.some(x => x.includes('DEGRADED COUNCIL')));
  assert.equal(result.seats.length, 5);
  assert.equal(mocked.calls.filter(c => c.url.includes('api.anthropic.com')).length, 0);
  assert.equal(mocked.calls.filter(c => c.url.includes('127.0.0.1:11434')).length, 1);
  assert.equal(new Set(result.reviewers.map(r => r.model)).size, 5);
  assert.equal(mocked.calls.filter(c => c.url.includes('openrouter.ai')).length, 0);
});

test('runtime primary failure uses explicit :free broker sub-seat, not a paid model', async () => {
  const env = withSubseats();
  const mocked = fakeResponses({ failPrimaries: ['xai'] });
  const result = await runIndependentCouncil(proposal, { env, fetchFn: mocked.fetchFn });
  assert.equal(result.fallback_events.length, 1);
  assert.equal(result.fallback_events[0].provider, 'openrouter');
  assert.equal(result.reviewers[3].tier, 'subseat');
  assert.equal(result.kernel_resolution.final_state, 'MANUAL_REVIEW');
  const broker = mocked.calls.find(c => c.url.includes('openrouter.ai'));
  assert.ok(broker);
  assert.equal(broker.request.model, 'google/gemma-3-4b-it:free');
  assert.equal(broker.req.headers.authorization, 'Bearer openrouter-test');
});

test('normal primary quorum remains unchanged and never calls configured sub-seats', async () => {
  const mocked = fakeResponses();
  const result = await runIndependentCouncil(proposal, { env: withSubseats(), fetchFn: mocked.fetchFn });
  assert.equal(result.council_mode, 'five-independent-providers');
  assert.deepEqual(result.fallback_events, []);
  assert.equal(result.kernel_resolution.final_state, 'PROCEED');
  assert.equal(mocked.calls.length, 5);
});

test('no fallback candidate means no council verdict and no unnecessary paid primary requests', async () => {
  const mocked = fakeResponses();
  const env = withSubseats([backups[1]], { ANTHROPIC_API_KEY: '' });
  await assert.rejects(runIndependentCouncil(proposal, { env, fetchFn: mocked.fetchFn }), /No complete five-model council/);
  assert.equal(mocked.calls.length, 0);
});

test('failed local fallback cannot fabricate an approving vote', async () => {
  for (const badSubseat of ['ollama-http', 'ollama-model', 'ollama-seat', 'ollama-truncated']) {
    const mocked = fakeResponses({ badSubseat });
    await assert.rejects(runIndependentCouncil(proposal, {
      env: withSubseats(backups, { ANTHROPIC_API_KEY: '' }),
      fetchFn: mocked.fetchFn
    }), /Council incomplete.*SECURITY/i);
  }
});

test('local and free backups use fixed endpoints and receive no other reviewer results or credentials', async () => {
  const mocked = fakeResponses({ failPrimaries: ['xai'] });
  await runIndependentCouncil(proposal, {
    env: withSubseats(backups, { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' }),
    fetchFn: mocked.fetchFn
  });
  for (const call of mocked.calls.filter(c => c.url.includes('127.0.0.1') || c.url.includes('openrouter.ai'))) {
    assert.ok(call.url === 'http://127.0.0.1:11434/api/chat' ||
      call.url === 'http://127.0.0.1:1234/v1/chat/completions' ||
      call.url === 'https://openrouter.ai/api/v1/chat/completions');
    assert.ok(JSON.stringify(call.request).includes('Read-only autonomous code reviewer'));
    assert.ok(!JSON.stringify(call.request).includes('Critical breach'));
    assert.ok(!JSON.stringify(call.request).includes('anthropic-test'));
  }
});

test('a full primary HARD_REJECT always prevails over degraded-subseat manual review', async () => {
  const mocked = fakeResponses({ hardPrimary: 'anthropic', failPrimaries: ['xai'] });
  const result = await runIndependentCouncil(proposal, { env: withSubseats(), fetchFn: mocked.fetchFn });
  assert.equal(result.kernel_resolution.final_state, 'BLOCK');
  assert.equal(result.fallback_events.length, 1);
});

test('multiple local backups still require distinct underlying model IDs', async () => {
  const env = withSubseats([
    backups[0],
    { seat: 'SYSTEMS_INTEGRITY', provider: 'ollama', model: 'qwen3:8b' }
  ], { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' });
  const mocked = fakeResponses();
  await assert.rejects(runIndependentCouncil(proposal, { env, fetchFn: mocked.fetchFn }), /No complete five-model council/);
  assert.equal(mocked.calls.length, 0);
});

test('direct sub-seat adapter validates provider-declared model and one reviewer schema', async () => {
  const mocked = fakeResponses();
  const sub = loadSubseats(withSubseats()).find(x => x.provider === 'lmstudio');
  const result = await runSubseat(sub, proposal, { fetchFn: mocked.fetchFn });
  assert.equal(result.metadata.tier, 'subseat');
  assert.equal(result.metadata.provider, 'lmstudio');
  assert.equal(result.seat.seat, 'SYSTEMS_INTEGRITY');
  assert.equal(result.metadata.input_tokens, 15);
});


test('schema-invalid primary vote is treated as failure and replaced by valid local sub-seat', async () => {
  const mocked = fakeResponses({ malformedPrimary: 'anthropic' });
  const result = await runIndependentCouncil(proposal, {
    env: withSubseats(), fetchFn: mocked.fetchFn
  });
  assert.equal(result.fallback_events.length, 1);
  assert.equal(result.fallback_events[0].seat, 'SECURITY');
  assert.equal(result.kernel_resolution.final_state, 'MANUAL_REVIEW');
  assert.equal(mocked.calls.filter(c => c.url.includes('127.0.0.1:11434')).length, 1);
});


test('tries next explicitly configured backup after first local sub-seat fails', async () => {
  const candidatePool = [
    { seat: 'SECURITY', provider: 'ollama', model: 'qwen3:8b', priority: 1 },
    { seat: 'SECURITY', provider: 'lmstudio', model: 'local/qwen3-14b', priority: 2 }
  ];
  const env = withSubseats(candidatePool, { ANTHROPIC_API_KEY: '' });
  const mocked = fakeResponses({ badSubseat: 'ollama-http' });
  const result = await runIndependentCouncil(proposal, { env, fetchFn: mocked.fetchFn });
  assert.equal(result.kernel_resolution.final_state, 'MANUAL_REVIEW');
  assert.equal(result.fallback_events[0].provider, 'lmstudio');
  assert.equal(mocked.calls.filter(c => c.url.includes('127.0.0.1:11434')).length, 1);
  assert.equal(mocked.calls.filter(c => c.url.includes('127.0.0.1:1234')).length, 1);
});
