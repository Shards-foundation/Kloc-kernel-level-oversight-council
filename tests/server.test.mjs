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
