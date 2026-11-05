import test from 'node:test';
import assert from 'node:assert/strict';
import { isKlocResponseShape } from '../services/response-validation.mjs';

const pairs = [
  ['SECURITY','anthropic','claude-sonnet-5-5'],
  ['SYSTEMS_INTEGRITY','openai','gpt-6.1-terra'],
  ['ECONOMIC_RISK','google','gemini-3.8-flash'],
  ['FOUNDER_ADVERSARY','xai','grok-4.7'],
  ['EXTERNAL_REALITY','mistral','mistral-small-latest']
];

function report() {
  return {
    kloc_version: '1.2', council_mode: 'five-independent-providers',
    proposal_id: 'TEST', proposal_summary_1line: 'review',
    seats: pairs.map(([seat]) => ({
      seat, verdict: 'NO_OBJECTION', risk_score: 1, confidence: 0.8,
      hard_reject_triggers: [], soft_reject_flags: [], unknowns: [],
      required_mitigations: [], minimal_test_plan: []
    })),
    reviewers: pairs.map(([seat, provider, model]) => ({
      seat, provider, model, latency_ms: 100, input_tokens: 25, output_tokens: 40
    })),
    kernel_resolution: {
      final_state: 'PROCEED', rule_trace: ['no risk'],
      blocking_items: [], defer_items: [], manual_review_questions: []
    },
    operator_notes: { override_policy: 'No automatic execution', recommended_next_action: 'Inspect' }
  };
}

test('valid five-provider response is accepted', () => {
  assert.equal(isKlocResponseShape(report()), true);
});

test('wrong provider-to-seat mapping cannot be displayed as independent review', () => {
  const a = report(); a.reviewers[0].provider = 'openai';
  assert.equal(isKlocResponseShape(a), false);
  const b = report(); b.reviewers[1].seat = 'SECURITY';
  assert.equal(isKlocResponseShape(b), false);
});

test('invalid review metadata or duplicated model identity is rejected', () => {
  const a = report(); a.reviewers[3].latency_ms = -2;
  assert.equal(isKlocResponseShape(a), false);
  const b = report(); b.reviewers[1].model = b.reviewers[0].model;
  assert.equal(isKlocResponseShape(b), false);
  const c = report(); c.reviewers[1].output_tokens = Infinity;
  assert.equal(isKlocResponseShape(c), false);
});

test('untrusted seat verdicts and resolution metadata fail closed in UI', () => {
  const a = report(); a.seats[0].verdict = 'APPROVE';
  assert.equal(isKlocResponseShape(a), false);
  const b = report(); b.seats[1].risk_score = 15;
  assert.equal(isKlocResponseShape(b), false);
  const c = report(); c.kernel_resolution.final_state = 'EXECUTE';
  assert.equal(isKlocResponseShape(c), false);
  const d = report(); d.seats.pop();
  assert.equal(isKlocResponseShape(d), false);
});
