import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEATS, validateProposal, verifySeats, resolveCouncil, normalizeCouncilResult
} from '../server/council.mjs';

const proposal = {
  proposal_id: 'K-001', title: 'Deploy a read-only AI agent',
  context: 'Agent reviews pull requests with explicit human approval',
  unknowns_you_already_know: ''
};
const seat = (name, verdict = 'NO_OBJECTION') => ({
  seat: name, verdict, risk_score: 3, confidence: 0.8,
  hard_reject_triggers: verdict === 'HARD_REJECT' ? ['unauthorised modification risk'] : [],
  soft_reject_flags: verdict === 'SOFT_REJECT' ? ['unmeasured cost'] : [],
  unknowns: verdict === 'ESCALATE' ? ['provider retention policy'] : [],
  required_mitigations: [], minimal_test_plan: []
});
const raw = verdicts => ({
  proposal_summary_1line: 'Adversarial review',
  seats: SEATS.map((name, i) => seat(name, verdicts[i] || 'NO_OBJECTION')),
  kernel_resolution: { final_state: 'PROCEED', rule_trace: ['untrusted model claim'] },
  operator_notes: { recommended_next_action: 'Check policy controls' }
});

test('proposal validation rejects empty or ill-typed input', () => {
  assert.throws(() => validateProposal(null));
  assert.throws(() => validateProposal({ title: '', context: 'x' }));
  assert.throws(() => validateProposal({ title: 'x', context: 2 }));
  assert.equal(validateProposal(proposal).proposal_id, 'K-001');
});

test('five seats are mandatory, unique, and ordered', () => {
  const data = raw([]);
  assert.deepEqual(verifySeats(data).map(s => s.seat), SEATS);
  assert.throws(() => verifySeats({ seats: data.seats.slice(0, 4) }));
  const duplicate = structuredClone(data);
  duplicate.seats[1].seat = 'SECURITY';
  assert.throws(() => verifySeats(duplicate));
});

test('schema rejects malformed scores, verdicts and hard trigger contradictions', () => {
  const a = raw([]);
  a.seats[0].confidence = 1.2;
  assert.throws(() => verifySeats(a));
  a.seats[0].confidence = 0.8;
  a.seats[0].verdict = 'APPROVED';
  assert.throws(() => verifySeats(a));
  a.seats[0].verdict = 'NO_OBJECTION';
  a.seats[0].hard_reject_triggers = ['actual hard trigger'];
  assert.throws(() => verifySeats(a));
});

test('single hard rejection blocks even when model claims proceed', () => {
  const normalized = normalizeCouncilResult(raw(['NO_OBJECTION','HARD_REJECT']), proposal);
  assert.equal(normalized.kernel_resolution.final_state, 'BLOCK');
  assert.match(normalized.kernel_resolution.rule_trace[0], /HARD_REJECT/);
  assert.equal(normalized.kernel_resolution.blocking_items.length, 1);
  assert.equal(normalized.proposal_id, 'K-001');
});

test('escalation outweighs soft rejects', () => {
  const normalized = normalizeCouncilResult(raw(['ESCALATE','SOFT_REJECT','SOFT_REJECT']), proposal);
  assert.equal(normalized.kernel_resolution.final_state, 'MANUAL_REVIEW');
});

test('two soft rejects defer; one does not', () => {
  assert.equal(resolveCouncil(verifySeats(raw(['SOFT_REJECT','SOFT_REJECT']))).final_state,'DEFER');
  assert.equal(resolveCouncil(verifySeats(raw(['SOFT_REJECT']))).final_state,'PROCEED');
});

test('operator-admitted unknowns prevent automatic clearance', () => {
  const normalized = normalizeCouncilResult(raw([]), {
    ...proposal, unknowns_you_already_know: 'Unverified dependencies'
  });
  assert.equal(normalized.kernel_resolution.final_state, 'MANUAL_REVIEW');
  assert.match(normalized.kernel_resolution.manual_review_questions[0], /Unverified/);
});

test('invalid model response fails closed rather than pretending success', () => {
  assert.throws(() => normalizeCouncilResult({ seats: [] }, proposal));
  assert.throws(() => normalizeCouncilResult(null, proposal));
});

test('model cannot pass an unresolved unknown as NO_OBJECTION', () => {
  const data = raw([]);
  data.seats[0].unknowns = ['Unverified privileged API access'];
  const result = normalizeCouncilResult(data, proposal);
  assert.equal(result.kernel_resolution.final_state, 'MANUAL_REVIEW');
});
