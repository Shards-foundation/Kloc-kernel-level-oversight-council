// Shared pure client-side response validation; no provider keys or HTTP access here.
// Do not trust a model response merely because its JSON parses successfully.
const OWNERS = Object.freeze({
  SECURITY: 'anthropic',
  SYSTEMS_INTEGRITY: 'openai',
  ECONOMIC_RISK: 'google',
  FOUNDER_ADVERSARY: 'xai',
  EXTERNAL_REALITY: 'mistral'
});
const STATUSES = ['PROCEED', 'DEFER', 'BLOCK', 'MANUAL_REVIEW'];
const VERDICTS = ['NO_OBJECTION', 'SOFT_REJECT', 'HARD_REJECT', 'ESCALATE'];
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const strings = x => Array.isArray(x) && x.every(v => typeof v === 'string');
const finite = (x, max) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max;

export function isKlocResponseShape(value) {
  if (!record(value) || value.council_mode !== 'five-independent-providers' ||
      typeof value.proposal_id !== 'string' || typeof value.proposal_summary_1line !== 'string' ||
      !Array.isArray(value.seats) || value.seats.length !== 5 ||
      !Array.isArray(value.reviewers) || value.reviewers.length !== 5) return false;

  const resolution = value.kernel_resolution;
  const notes = value.operator_notes;
  if (!record(resolution) || !record(notes) ||
      !STATUSES.includes(resolution.final_state) ||
      !strings(resolution.rule_trace) || !strings(resolution.blocking_items) ||
      !strings(resolution.defer_items) || !strings(resolution.manual_review_questions) ||
      typeof notes.override_policy !== 'string' ||
      typeof notes.recommended_next_action !== 'string') return false;

  const expectedSeats = Object.keys(OWNERS);
  const seats = new Set();
  for (const seat of value.seats) {
    if (!record(seat) || !Object.hasOwn(OWNERS, seat.seat) || seats.has(seat.seat) ||
        !VERDICTS.includes(seat.verdict) || !finite(seat.risk_score, 10) ||
        !finite(seat.confidence, 1) ||
        !strings(seat.hard_reject_triggers) || !strings(seat.soft_reject_flags) ||
        !strings(seat.unknowns) || !strings(seat.required_mitigations) ||
        !strings(seat.minimal_test_plan)) return false;
    seats.add(seat.seat);
  }

  const reviewerSeats = new Set();
  const providers = new Set();
  const models = new Set();
  for (const review of value.reviewers) {
    if (!record(review) || !Object.hasOwn(OWNERS, review.seat) ||
        review.provider !== OWNERS[review.seat] ||
        reviewerSeats.has(review.seat) ||
        typeof review.model !== 'string' || !review.model.trim() ||
        !finite(review.latency_ms, Number.MAX_SAFE_INTEGER) ||
        (review.input_tokens !== undefined && !finite(review.input_tokens, Number.MAX_SAFE_INTEGER)) ||
        (review.output_tokens !== undefined && !finite(review.output_tokens, Number.MAX_SAFE_INTEGER))) return false;
    reviewerSeats.add(review.seat);
    providers.add(review.provider);
    models.add(review.model);
  }
  return reviewerSeats.size === 5 && providers.size === 5 && models.size === 5 &&
    expectedSeats.every(name => seats.has(name) && reviewerSeats.has(name));
}
