import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewerConfiguration, isCouncilConfigured, runIndependentCouncil } from '../server/providers.mjs';

const env = {
  ANTHROPIC_API_KEY: 'anthropic-test-only',
  OPENAI_API_KEY: 'openai-test-only',
  GEMINI_API_KEY: 'gemini-test-only',
  XAI_API_KEY: 'xai-test-only',
  MISTRAL_API_KEY: 'mistral-test-only'
};
const config = reviewerConfiguration(env);
const proposal = { proposal_id: 'KL-123', title: 'Evaluate permissioned agent', context: 'Only read access is permitted', unknowns_you_already_know: '' };
const seat = (name, verdict = 'NO_OBJECTION') => ({
  seat: name, verdict, risk_score: 3, confidence: 0.8,
  hard_reject_triggers: verdict === 'HARD_REJECT' ? ['Excessive privileges'] : [],
  soft_reject_flags: [], unknowns: [], required_mitigations: [],
  minimal_test_plan: ['Verify no write access']
});

function mocked({ verdicts = {}, failProvider, spoofProvider, malformedProvider } = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const reviewer = config.find(c => {
      if (c.provider === 'anthropic') return url.includes('anthropic.com');
      if (c.provider === 'openai') return url.includes('openai.com');
      if (c.provider === 'google') return url.includes('googleapis.com');
      if (c.provider === 'xai') return url.includes('api.x.ai');
      if (c.provider === 'mistral') return url.includes('mistral.ai');
      return false;
    });
    assert.ok(reviewer, 'unrecognised upstream endpoint ' + url);
    calls.push({ reviewer, url, init });
    if (reviewer.provider === failProvider) return new Response('{}', { status: 429 });

    const raw = seat(reviewer.provider === spoofProvider ? 'SECURITY' : reviewer.seat,
      verdicts[reviewer.seat]);
    const encoded = reviewer.provider === malformedProvider ? '{not-json' : JSON.stringify(raw);
    const usage = { prompt_tokens: 128, completion_tokens: 80 };
    let data;
    switch (reviewer.provider) {
      case 'openai':
        data = { status: 'completed', usage: { input_tokens: 128, output_tokens: 80 },
          output: [{ content: [{ type: 'output_text', text: encoded }] }] };
        break;
      case 'anthropic':
        data = { stop_reason: 'end_turn', usage: { input_tokens: 128, output_tokens: 80 },
          content: [{ type: 'text', text: encoded }] };
        break;
      case 'google':
        data = { usageMetadata: { promptTokenCount: 128, candidatesTokenCount: 80 },
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: encoded }] } }] };
        break;
      default:
        data = { usage, choices: [{ finish_reason: 'stop', message: { content: encoded } }] };
    }
    return Response.json(data);
  };
  return { fetchFn, calls };
}

test('requires five distinct provider configurations and refuses missing keys before spending', async () => {
  assert.equal(isCouncilConfigured(env), true);
  assert.equal(new Set(config.map(x => x.provider)).size, 5);
  assert.equal(new Set(config.map(x => x.model)).size, 5);
  assert.equal(isCouncilConfigured({ ...env, XAI_API_KEY: '' }), false);
  const mockedFetch = mocked();
  await assert.rejects(runIndependentCouncil(proposal, {
    env: { ...env, XAI_API_KEY: '' }, fetchFn: mockedFetch.fetchFn
  }), /not configured/);
  assert.equal(mockedFetch.calls.length, 0);
});

test('calls five separate APIs and no provider sees other provider reviews', async () => {
  const provider = mocked({ verdicts: { SECURITY: 'HARD_REJECT' } });
  const result = await runIndependentCouncil(proposal, { env, fetchFn: provider.fetchFn });
  assert.equal(provider.calls.length, 5);
  assert.equal(new Set(provider.calls.map(c => new URL(c.url).hostname)).size, 5);
  assert.equal(result.council_mode, 'five-independent-providers');
  assert.equal(result.reviewers.length, 5);
  assert.equal(result.seats.length, 5);
  assert.equal(result.kernel_resolution.final_state, 'BLOCK');
  assert.equal(result.kloc_version, '1.2');
  assert.deepEqual(result.reviewers.map(r => r.seat), config.map(r => r.seat));
  assert.deepEqual(result.reviewers.map(r => r.provider), config.map(r => r.provider));
  assert.ok(result.reviewers.every(r => r.input_tokens === 128 && r.output_tokens === 80));
  for (const call of provider.calls) {
    const body = JSON.stringify(JSON.parse(call.init.body));
    assert.match(body, /Evaluate permissioned agent/);
    assert.match(body, new RegExp(call.reviewer.seat));
    assert.doesNotMatch(body, /Excessive privileges/);
    assert.equal(body.includes(call.reviewer.credential), false);
  }
});

test('missing one upstream vote fails the full council; no Gemini substitution', async () => {
  const provider = mocked({ failProvider: 'xai' });
  await assert.rejects(runIndependentCouncil(proposal, { env, fetchFn: provider.fetchFn }),
    /[Ii]ndependent council incomplete.*FOUNDER_ADVERSARY/);
  assert.equal(provider.calls.length, 5);
});

test('a model cannot impersonate a different seat', async () => {
  const provider = mocked({ spoofProvider: 'mistral' });
  await assert.rejects(runIndependentCouncil(proposal, { env, fetchFn: provider.fetchFn }),
    /[Ii]ndependent council incomplete.*EXTERNAL_REALITY/);
});

test('a malformed model JSON report fails closed', async () => {
  const provider = mocked({ malformedProvider: 'google' });
  await assert.rejects(runIndependentCouncil(proposal, { env, fetchFn: provider.fetchFn }),
    /[Ii]ndependent council incomplete.*ECONOMIC_RISK/);
});

test('rejects duplicate provider or model identity even with five votes', async () => {
  const overridden = config.map(x => ({ ...x }));
  overridden[1].provider = 'anthropic';
  let mock = mocked();
  await assert.rejects(runIndependentCouncil(proposal, { config: overridden, fetchFn: mock.fetchFn }), /unique/);
  assert.equal(mock.calls.length, 0);
  overridden[1].provider = 'openai';
  overridden[1].model = overridden[0].model;
  await assert.rejects(runIndependentCouncil(proposal, { config: overridden, fetchFn: mock.fetchFn }), /unique/);
});
