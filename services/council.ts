import type { KlocResponse, ProposalData } from '../types';
import { isKlocResponseShape } from './response-validation.mjs';

// Provider credentials remain server-only. Browser receives only checked council reports.
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
    const message = payload !== null && typeof payload === 'object' &&
      'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'Independent KLOC review failed';
    throw new Error(message);
  }
  if (!isKlocResponseShape(payload)) {
    throw new Error('Council response failed independent reviewer validation; no decision issued');
  }
  return payload as KlocResponse;
}
