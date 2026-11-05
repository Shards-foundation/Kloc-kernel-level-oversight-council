import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server/index.mjs';

const proposal = { title: 'Read-only review', context: 'No execution authority' };
const headers = { 'content-type': 'application/json' };

async function open(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}
async function close(server) {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
const submit = (base, data = proposal) => fetch(base + '/api/analyze', {
  method: 'POST', headers, body: JSON.stringify(data)
});

test('HTTP method, content-type, body size and invalid payload are rejected', async () => {
  const server = makeServer({ assessProposal: async () => ({ ok: true }) });
  const base = await open(server);
  try {
    assert.equal((await fetch(base + '/api/analyze')).status, 405);
    assert.equal((await fetch(base + '/api/analyze', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}'
    })).status, 415);
    assert.equal((await submit(base, { title: '', context: 'x' })).status, 400);
    assert.equal((await submit(base, { ...proposal, context: 'x'.repeat(50_000) })).status, 413);
  } finally { await close(server); }
});

test('provider errors do not issue council decisions or expose internal details', async () => {
  const server = makeServer({ assessProposal: async () => {
    throw new SyntaxError('internal model response that must not leak');
  } });
  const base = await open(server);
  try {
    const response = await submit(base);
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.match(data.error, /no decision issued/);
    assert.doesNotMatch(data.error, /internal model response/);
  } finally { await close(server); }
});

test('local gateway limits request rate', async () => {
  const server = makeServer({ assessProposal: async () => ({ ok: true }) });
  const base = await open(server);
  try {
    for (let i = 0; i < 6; i++)
      assert.equal((await submit(base)).status, 200);
    assert.equal((await submit(base)).status, 429);
  } finally { await close(server); }
});

test('local gateway limits concurrent provider requests', async () => {
  let started = 0;
  let enteredResolve;
  let release;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const blocker = new Promise(resolve => { release = resolve; });
  const server = makeServer({ assessProposal: async () => {
    if (++started === 2) enteredResolve();
    await blocker;
    return { ok: true };
  } });
  const base = await open(server);
  try {
    const first = submit(base);
    const second = submit(base);
    await entered;
    const third = await submit(base);
    assert.equal(third.status, 429);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
  } finally {
    release();
    await close(server);
  }
});
