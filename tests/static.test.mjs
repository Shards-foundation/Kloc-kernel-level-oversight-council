import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server/index.mjs';

test('static handler serves only canonical paths within build directory', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kloc-static-'));
  const dist = join(temp, 'dist');
  const outside = join(temp, 'private.txt');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<h1>KLOC Test</h1>');
  await writeFile(outside, 'do-not-expose');
  await symlink(outside, join(dist, 'escape.txt'));

  const server = makeServer({ staticRoot: dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  try {
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /KLOC Test/);

    const escape = await fetch(base + '/escape.txt');
    assert.equal(escape.status, 403);
    assert.doesNotMatch(await escape.text(), /do-not-expose/);

    const traversal = await fetch(base + '/..%2Fprivate.txt');
    assert.equal(traversal.status, 403);
    assert.doesNotMatch(await traversal.text(), /do-not-expose/);

    const fallback = await fetch(base + '/dashboard');
    assert.equal(fallback.status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await rm(temp, { recursive: true, force: true });
  }
});
