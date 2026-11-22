import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpPocIndex } from './index-handler.ts';

const fixture = { team: '앱', syncedAt: 'fixture', screens: Array.from({ length: 4 }, (_, i) => ({
  teamPage: '앱', fileKey: 'Hbwppk3hFZm1jq7GuclyXG', id: `0:${i}`, name: 'fixture', texts: [], components: [], tokens: [],
  figmaUrl: `https://www.figma.com/design/Hbwppk3hFZm1jq7GuclyXG/?node-id=0-${i}`,
})), excluded: [] };
test('PoC API: production denial, authentication before read, APP-only file validation, no-store', async () => {
  const originalMode = process.env.NODE_ENV, originalPassword = process.env.TEAM_PASSWORD;
  const request = (password = 'test-only-password', team = '앱') => new Request('http://localhost/api/dev/mcp-index', {
    method: 'POST', headers: { 'x-team-password': password, 'content-type': 'application/json' }, body: JSON.stringify({ team }),
  });
  let reads = 0;
  const read = async () => { reads++; return JSON.stringify(fixture); };
  try {
    process.env.TEAM_PASSWORD = 'test-only-password'; process.env.NODE_ENV = 'production';
    assert.equal((await handleMcpPocIndex(request(), read)).status, 404);
    process.env.NODE_ENV = 'development';
    assert.equal((await handleMcpPocIndex(request('incorrect'), read)).status, 401);
    assert.equal((await handleMcpPocIndex(request('test-only-password', '플그'), read)).status, 400);
    assert.equal(reads, 0);
    const response = await handleMcpPocIndex(request(), read);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), fixture);
    const bad = structuredClone(fixture); bad.screens[0].fileKey = 'OUTSIDE';
    assert.equal((await handleMcpPocIndex(request(), async () => JSON.stringify(bad))).status, 422);
    assert.equal((await handleMcpPocIndex(request(), async () => { throw new Error('private details'); })).status, 404);
    const missing = await handleMcpPocIndex(request(), async () => 'null');
    assert.ok(!JSON.stringify(await missing.json()).includes('private details'));
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
    if (originalPassword === undefined) delete process.env.TEAM_PASSWORD; else process.env.TEAM_PASSWORD = originalPassword;
  }
});
