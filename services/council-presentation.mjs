// Pure UI projection for complete vs degraded council results.
export function councilPresentation(response) {
  const events = Array.isArray(response?.fallback_events) ? response.fallback_events : [];
  return {
    degraded: events.length > 0,
    label: events.length
      ? 'DEGRADED COUNCIL · ' + events.length + ' BACKUP SUB-SEAT(S) · HUMAN REVIEW REQUIRED'
      : 'FULL PRIMARY COUNCIL · 5 INDEPENDENT PROVIDERS · 5/5 REVIEWERS',
    replacements: events.map(event => ({
      seat: event.seat,
      label: event.seat + ': ' + event.replaced_provider + ' unavailable → ' +
        event.provider + ' / ' + event.model
    }))
  };
}
