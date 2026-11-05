export type Verdict = 'NO_OBJECTION' | 'SOFT_REJECT' | 'HARD_REJECT' | 'ESCALATE';

export type SeatName = 'SECURITY' | 'SYSTEMS_INTEGRITY' | 'ECONOMIC_RISK' | 'FOUNDER_ADVERSARY' | 'EXTERNAL_REALITY';

export interface SeatResult {
  seat: SeatName;
  verdict: Verdict;
  risk_score: number;
  confidence: number;
  hard_reject_triggers: string[];
  soft_reject_flags: string[];
  unknowns: string[];
  required_mitigations: string[];
  minimal_test_plan: string[];
}

export type FinalState = 'PROCEED' | 'DEFER' | 'BLOCK' | 'MANUAL_REVIEW';

export interface KernelResolution {
  final_state: FinalState;
  rule_trace: string[];
  blocking_items: string[];
  defer_items: string[];
  manual_review_questions: string[];
}

export interface OperatorNotes {
  override_policy: string;
  recommended_next_action: string;
}

export interface ReviewerTrace {
  seat: SeatName;
  provider: 'anthropic' | 'openai' | 'google' | 'xai' | 'mistral';
  model: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface KlocResponse {
  council_mode: 'five-independent-providers';
  reviewers: ReviewerTrace[];
  kloc_version: string;
  proposal_id: string;
  proposal_summary_1line: string;
  seats: SeatResult[];
  kernel_resolution: KernelResolution;
  operator_notes: OperatorNotes;
}

export interface ProposalData {
  proposal_id: string;
  title: string;
  context: string;
  scope: string;
  assets_at_risk: string;
  execution_boundary: string;
  tools_and_integrations: string;
  data_sources: string;
  success_criteria: string;
  constraints: string;
  unknowns_you_already_know: string;
}

export const DEFAULT_PROPOSAL: ProposalData = {
  proposal_id: "KL-TEST-001",
  title: "",
  context: "",
  scope: "",
  assets_at_risk: "",
  execution_boundary: "",
  tools_and_integrations: "",
  data_sources: "",
  success_criteria: "",
  constraints: "",
  unknowns_you_already_know: ""
};