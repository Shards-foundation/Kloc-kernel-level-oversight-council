import type { KlocResponse, ProposalData } from '../types';

// Never send provider credentials to the browser. The same-origin server owns inference.
export async function runKlocAnalysis(proposal: ProposalData): Promise<KlocResponse> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposal)
  });

  let payload: any;
  try { payload = await response.json(); }
  catch { throw new Error('KLOC server returned an invalid response'); }

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : 'KLOC analysis failed'
    );
  }
  if (!payload || !Array.isArray(payload.seats) || !payload.kernel_resolution) {
    throw new Error('KLOC server response was incomplete');
  }
  return payload as KlocResponse;
}
