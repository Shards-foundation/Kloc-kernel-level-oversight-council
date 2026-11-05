import type { KlocResponse, ProposalData } from '../types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

function isKlocResponse(value: unknown): value is KlocResponse {
  if (!isObject(value) || !Array.isArray(value.seats) || value.seats.length !== 5)
    return false;

  const resolution = value.kernel_resolution;
  const notes = value.operator_notes;
  if (!isObject(resolution) || !isObject(notes)) return false;
  if (!['PROCEED', 'DEFER', 'BLOCK', 'MANUAL_REVIEW'].includes(String(resolution.final_state)))
    return false;
  if (!stringArray(resolution.rule_trace) ||
      !stringArray(resolution.blocking_items) ||
      !stringArray(resolution.defer_items) ||
      !stringArray(resolution.manual_review_questions)) return false;
  if (typeof notes.override_policy !== 'string' ||
      typeof notes.recommended_next_action !== 'string') return false;
  if (typeof value.proposal_id !== 'string' ||
      typeof value.proposal_summary_1line !== 'string') return false;

  const seatNames = new Set<string>();
  for (const seat of value.seats) {
    if (!isObject(seat) || typeof seat.seat !== 'string' ||
        typeof seat.verdict !== 'string' || typeof seat.risk_score !== 'number' ||
        typeof seat.confidence !== 'number' ||
        !['NO_OBJECTION', 'SOFT_REJECT', 'HARD_REJECT', 'ESCALATE'].includes(seat.verdict) ||
        !stringArray(seat.hard_reject_triggers) ||
        !stringArray(seat.soft_reject_flags) ||
        !stringArray(seat.unknowns) ||
        !stringArray(seat.required_mitigations) ||
        !stringArray(seat.minimal_test_plan)) return false;
    seatNames.add(seat.seat);
  }
  const allSeats = ['SECURITY', 'SYSTEMS_INTEGRITY', 'ECONOMIC_RISK', 'FOUNDER_ADVERSARY', 'EXTERNAL_REALITY'];
  if (value.council_mode !== 'five-independent-providers' ||
      !Array.isArray(value.reviewers) || value.reviewers.length !== 5) return false;
  const providers = new Set<string>();
  const models = new Set<string>();
  const reviewerSeats = new Set<string>();
  for (const reviewer of value.reviewers) {
    if (!isObject(reviewer) || typeof reviewer.seat !== 'string' ||
        typeof reviewer.provider !== 'string' || typeof reviewer.model !== 'string' ||
        typeof reviewer.latency_ms !== 'number' ||
        !Number.isFinite(reviewer.latency_ms) || reviewer.latency_ms < 0 ||
        !['anthropic', 'openai', 'google', 'xai', 'mistral'].includes(reviewer.provider)) return false;
    providers.add(reviewer.provider);
    models.add(reviewer.model);
    reviewerSeats.add(reviewer.seat);
  }
  return seatNames.size === 5 && providers.size === 5 && models.size === 5 &&
    reviewerSeats.size === 5 && allSeats.every(name => seatNames.has(name) && reviewerSeats.has(name));
}

// Provider credentials are never transmitted to the browser.
export async function runKlocAnalysis(proposal: ProposalData): Promise<KlocResponse> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposal)
  });

  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('KLOC server returned invalid JSON'); }

  if (!response.ok) {
    const message = isObject(payload) && typeof payload.error === 'string'
      ? payload.error : 'KLOC analysis failed';
    throw new Error(message);
  }
  if (!isKlocResponse(payload)) {
    throw new Error('KLOC server response failed validation; no decision issued');
  }
  return payload;
}
