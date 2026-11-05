import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server/index.mjs';

test('local API serves health and rejects unsafe or invalid requests', async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const server = makeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;

  const request = (body, headers = {}) => fetch(base + '/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    const state = await health.json();
    assert.equal(state.status, 'running');
    assert.equal(state.configured, false);

    const malicious = await request({ title: 'a', context: 'b' }, { Origin: 'https://evil.example' });
    assert.equal(malicious.status, 403);

    const invalid = await request({ title: '', context: 'b' });
    assert.equal(invalid.status, 400);

    const malformed = await request('invalid JSON');
    assert.equal(malformed.status, 400);

    const noKey = await request({ title: 'safe review', context: 'test the app' });
    assert.equal(noKey.status, 503);
    const noKeyBody = await noKey.json();
    assert.match(noKeyBody.error, /not configured/);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});


test('health exposes backup configuration without implying local runtime reachability', async () => {
  const previous = {
    KLOC_SUBSEATS_ENABLED: process.env.KLOC_SUBSEATS_ENABLED,
    KLOC_SUBSEATS_JSON: process.env.KLOC_SUBSEATS_JSON
  };
  process.env.KLOC_SUBSEATS_ENABLED = 'true';
  process.env.KLOC_SUBSEATS_JSON = JSON.stringify([
    { seat: 'SECURITY', provider: 'ollama', model: 'qwen3:8b' }
  ]);
  const server = makeServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const health = await fetch('http://127.0.0.1:' + server.address().port + '/api/health');
    assert.equal(health.status, 200);
    const data = await health.json();
    assert.deepEqual(data.backup_subseats, {
      enabled: true, configured_seats: 1, valid_config: true
    });
    assert.equal(typeof data.configured, 'boolean');
    assert.equal(data.backup_subseats.connected, undefined);
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
