import test from 'node:test';
import assert from 'node:assert/strict';
import { councilPresentation } from '../services/council-presentation.mjs';

test('full council banner claims five primary independent providers only without substitutions', () => {
  const value = councilPresentation({ fallback_events: [], council_mode: 'five-independent-providers' });
  assert.equal(value.degraded, false);
  assert.match(value.label, /FULL PRIMARY COUNCIL/);
  assert.deepEqual(value.replacements, []);
});

test('degraded banner exposes each backup and manual-review requirement', () => {
  const value = councilPresentation({
    council_mode: 'five-models-with-backup-subseats',
    fallback_events: [
      { seat: 'SECURITY', replaced_provider: 'anthropic', provider: 'ollama', model: 'qwen3:8b' },
      { seat: 'FOUNDER_ADVERSARY', replaced_provider: 'xai', provider: 'openrouter', model: 'google/gemma-3-4b-it:free' }
    ]
  });
  assert.equal(value.degraded, true);
  assert.match(value.label, /2 BACKUP SUB-SEAT/);
  assert.match(value.label, /HUMAN REVIEW REQUIRED/);
  assert.match(value.replacements[0].label, /SECURITY: anthropic unavailable.*ollama/);
  assert.match(value.replacements[1].label, /FOUNDER_ADVERSARY: xai unavailable.*openrouter/);
});
