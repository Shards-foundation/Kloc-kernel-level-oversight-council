// Pure client-side verification of the server-issued review envelope.
// Never trust a model's claimed provider, seat, or quorum status.
const OWNERS = Object.freeze({
  SECURITY: 'anthropic',
  SYSTEMS_INTEGRITY: 'openai',
  ECONOMIC_RISK: 'google',
  FOUNDER_ADVERSARY: 'xai',
  EXTERNAL_REALITY: 'mistral'
});
const BACKUP_PROVIDERS = ['ollama', 'lmstudio', 'openrouter'];
const STATES = ['PROCEED', 'DEFER', 'BLOCK', 'MANUAL_REVIEW'];
const VERDICTS = ['NO_OBJECTION', 'SOFT_REJECT', 'HARD_REJECT', 'ESCALATE'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = v => Array.isArray(v) && v.every(x => typeof x === 'string');
const finite = (v, limit) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= limit;

export function isKlocResponseShape(value) {
  if (!record(value) ||
      !['five-independent-providers', 'five-models-with-backup-subseats'].includes(value.council_mode) ||
      typeof value.proposal_id !== 'string' ||
      typeof value.proposal_summary_1line !== 'string' ||
      !Array.isArray(value.seats) || value.seats.length !== 5 ||
      !Array.isArray(value.reviewers) || value.reviewers.length !== 5) return false;

  const resolution = value.kernel_resolution;
  const notes = value.operator_notes;
  if (!record(resolution) || !record(notes) || !STATES.includes(resolution.final_state) ||
      !strings(resolution.rule_trace) || !strings(resolution.blocking_items) ||
      !strings(resolution.defer_items) || !strings(resolution.manual_review_questions) ||
      typeof notes.override_policy !== 'string' ||
      typeof notes.recommended_next_action !== 'string') return false;

  const names = Object.keys(OWNERS);
  const seats = new Set();
  for (const seat of value.seats) {
    if (!record(seat) || !Object.hasOwn(OWNERS, seat.seat) || seats.has(seat.seat) ||
        !VERDICTS.includes(seat.verdict) || !finite(seat.risk_score, 10) ||
        !finite(seat.confidence, 1) || !strings(seat.hard_reject_triggers) ||
        !strings(seat.soft_reject_flags) || !strings(seat.unknowns) ||
        !strings(seat.required_mitigations) || !strings(seat.minimal_test_plan)) return false;
    seats.add(seat.seat);
  }

  const reviewerSeats = new Set();
  const providers = new Set();
  const models = new Set();
  const substitutions = new Map();
  for (const item of value.reviewers) {
    if (!record(item) || !Object.hasOwn(OWNERS, item.seat) ||
        reviewerSeats.has(item.seat) ||
        typeof item.model !== 'string' || !item.model.trim() ||
        !finite(item.latency_ms, Number.MAX_SAFE_INTEGER) ||
        (item.input_tokens !== undefined && !finite(item.input_tokens, Number.MAX_SAFE_INTEGER)) ||
        (item.output_tokens !== undefined && !finite(item.output_tokens, Number.MAX_SAFE_INTEGER))) return false;
    const tier = item.tier ?? 'primary'; // legacy responses only
    if (tier === 'primary') {
      if (item.provider !== OWNERS[item.seat] || item.replaced_provider !== undefined)
        return false;
    } else if (tier === 'subseat') {
      if (!BACKUP_PROVIDERS.includes(item.provider) ||
          item.replaced_provider !== OWNERS[item.seat] ||
          !['primary_not_configured', 'primary_unavailable'].includes(item.backup_reason))
        return false;
      substitutions.set(item.seat, item);
    } else return false;
    reviewerSeats.add(item.seat);
    providers.add(item.provider);
    models.add(item.model);
  }

  if (reviewerSeats.size !== 5 || models.size !== 5 ||
      !names.every(name => seats.has(name) && reviewerSeats.has(name)))
    return false;

  const degraded = value.council_mode === 'five-models-with-backup-subseats';
  const fallbackEvents = value.fallback_events ?? [];
  if (!Array.isArray(fallbackEvents) || fallbackEvents.length !== substitutions.size)
    return false;
  if (degraded !== (substitutions.size > 0)) return false;
  if (!degraded && providers.size !== 5) return false;

  const seenEvents = new Set();
  for (const event of fallbackEvents) {
    if (!record(event) || !substitutions.has(event.seat) || seenEvents.has(event.seat))
      return false;
    const matching = substitutions.get(event.seat);
    if (event.provider !== matching.provider || event.model !== matching.model ||
        event.replaced_provider !== matching.replaced_provider ||
        event.reason !== matching.backup_reason) return false;
    seenEvents.add(event.seat);
  }

  if (degraded) {
    if (!['MANUAL_REVIEW', 'BLOCK'].includes(resolution.final_state)) return false;
    if (!resolution.rule_trace.some(trace => trace.startsWith('DEGRADED COUNCIL:')))
      return false;
  }
  return true;
}
