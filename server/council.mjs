// KLOC's trust boundary: model output is untrusted input, never policy authority.
export const SEATS = Object.freeze([
  'SECURITY', 'SYSTEMS_INTEGRITY', 'ECONOMIC_RISK',
  'FOUNDER_ADVERSARY', 'EXTERNAL_REALITY'
]);
export const VERDICTS = Object.freeze([
  'NO_OBJECTION', 'SOFT_REJECT', 'HARD_REJECT', 'ESCALATE'
]);

const PROPOSAL_FIELDS = Object.freeze([
  'proposal_id', 'title', 'context', 'scope', 'assets_at_risk',
  'execution_boundary', 'tools_and_integrations', 'data_sources',
  'success_criteria', 'constraints', 'unknowns_you_already_know'
]);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(message); };

function nonemptyString(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(label + ' must be a non-empty string (max ' + max + ' characters)');
  return value.trim();
}
function stringArray(value, label) {
  if (!Array.isArray(value) || value.length > 30) fail(label + ' must be an array of at most 30 strings');
  return value.map((item, i) => nonemptyString(item, label + '[' + i + ']', 1000));
}
function score(value, label, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    fail(label + ' must be a finite number from 0 to ' + max);
  return value;
}

export function validateProposal(input) {
  if (!record(input)) fail('Proposal must be an object');
  const proposal = {};
  for (const field of PROPOSAL_FIELDS) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > 8000)
      fail(field + ' must be a string no longer than 8000 characters');
    proposal[field] = value.trim();
  }
  nonemptyString(proposal.title, 'title', 8000);
  nonemptyString(proposal.context, 'context', 8000);
  // Never trust or execute arbitrary model-selected proposal identifiers.
  proposal.proposal_id = proposal.proposal_id || 'KLOC-UNSPECIFIED';
  return proposal;
}

export function verifySeats(raw) {
  if (!record(raw) || !Array.isArray(raw.seats) || raw.seats.length !== SEATS.length)
    fail('Council must return exactly five seats');
  const seen = new Set();
  const seats = raw.seats.map((value, index) => {
    if (!record(value) || !SEATS.includes(value.seat) || seen.has(value.seat))
      fail('Unknown or duplicate seat at index ' + index);
    seen.add(value.seat);
    if (!VERDICTS.includes(value.verdict)) fail('Invalid verdict for ' + value.seat);
    const seat = {
      seat: value.seat,
      verdict: value.verdict,
      risk_score: score(value.risk_score, 'risk_score', 10),
      confidence: score(value.confidence, 'confidence', 1),
      hard_reject_triggers: stringArray(value.hard_reject_triggers, 'hard_reject_triggers'),
      soft_reject_flags: stringArray(value.soft_reject_flags, 'soft_reject_flags'),
      unknowns: stringArray(value.unknowns, 'unknowns'),
      required_mitigations: stringArray(value.required_mitigations, 'required_mitigations'),
      minimal_test_plan: stringArray(value.minimal_test_plan, 'minimal_test_plan')
    };
    if (seat.hard_reject_triggers.length && seat.verdict !== 'HARD_REJECT')
      fail('Hard rejection triggers require HARD_REJECT verdict');
    return seat;
  });
  return SEATS.map(name => seats.find(seat => seat.seat === name));
}

export function resolveCouncil(seats, knownUnknowns = '') {
  const hard = seats.filter(s => s.verdict === 'HARD_REJECT');
  const escalated = seats.filter(s => s.verdict === 'ESCALATE');
  const soft = seats.filter(s => s.verdict === 'SOFT_REJECT');
  const operatorUnknowns = typeof knownUnknowns === 'string' && knownUnknowns.trim().length > 0;

  let final_state, rule;
  if (hard.length) {
    final_state = 'BLOCK';
    rule = 'Any HARD_REJECT -> BLOCK (' + hard.map(s => s.seat).join(', ') + ')';
  } else if (escalated.length || operatorUnknowns) {
    final_state = 'MANUAL_REVIEW';
    rule = 'ESCALATE or admitted unknowns -> MANUAL_REVIEW';
  } else if (soft.length >= 2) {
    final_state = 'DEFER';
    rule = 'At least two SOFT_REJECT verdicts -> DEFER (' + soft.length + ')';
  } else {
    final_state = 'PROCEED';
    rule = 'No blocking, escalation or deferral threshold -> PROCEED (advisory only)';
  }

  return {
    final_state,
    rule_trace: [rule],
    blocking_items: hard.flatMap(s => s.hard_reject_triggers.length ?
      s.hard_reject_triggers.map(item => s.seat + ': ' + item) : [s.seat + ': HARD_REJECT']),
    defer_items: soft.flatMap(s => s.soft_reject_flags.length ?
      s.soft_reject_flags.map(item => s.seat + ': ' + item) : [s.seat + ': SOFT_REJECT']),
    manual_review_questions: [
      ...(operatorUnknowns ? ['Operator-admitted unknowns: ' + knownUnknowns.trim()] : []),
      ...escalated.flatMap(s => s.unknowns.length ?
        s.unknowns.map(item => s.seat + ': ' + item) : [s.seat + ': escalation requires review'])
    ]
  };
}

export function normalizeCouncilResult(raw, originalProposal) {
  const proposal = validateProposal(originalProposal);
  const seats = verifySeats(raw);
  const resolution = resolveCouncil(seats, proposal.unknowns_you_already_know);
  // IMPORTANT: ignore raw.kernel_resolution and other model-computed policy fields.
  return {
    kloc_version: '1.1',
    proposal_id: proposal.proposal_id,
    proposal_summary_1line: typeof raw.proposal_summary_1line === 'string'
      ? raw.proposal_summary_1line.slice(0, 500) : proposal.title,
    seats,
    kernel_resolution: resolution,
    operator_notes: {
      override_policy: 'Council verdicts are advisory. No execution authority. Log reason, risk, and rollback before overriding a block or escalation.',
      recommended_next_action: typeof raw.operator_notes?.recommended_next_action === 'string'
        ? raw.operator_notes.recommended_next_action.slice(0, 1000)
        : 'Review council findings and verify mitigations before taking action.'
    }
  };
}
