import assert from 'node:assert/strict';
import test from 'node:test';
import { isDescriptionFrame } from './screen-rules.ts';
import { nodeToScreens } from './convert.ts';
import { mergeLegacyIndexes } from './index-merge.ts';
import { validateMcpImport } from './mcp-import-validation.ts';
import { runSearch } from '../2-1-search/search-pipeline.ts';

const fileKey = 'MyVs5YHGCOZBoaH0bIRtFJ';
const at = '2026-11-24T00:00:00.000Z';
const screen = (id, name = '공개 홈페이지 메인', extra = {}) => ({ id, name, fileKey, teamPage: '공홈', texts: ['홈', '프로젝트'], components: [], tokens: [], figmaUrl: `https://www.figma.com/design/${fileKey}/?node-id=${id.replace(':', '-')}`, syncedAt: at, ...extra });
const index = screens => ({ team: '공홈', syncedAt: at, screens, excluded: [] });

test('Description 설명판 이름과 상위 설명 구역만 제외하고 일반 화면의 description 문구는 보존', () => {
  for (const name of ['Description', '[PC/MO] 모임 피드 홈 Description', 'description_01']) assert.equal(isDescriptionFrame(name), true);
  assert.equal(isDescriptionFrame('Frame', '어드민 > Description'), true);
  assert.equal(isDescriptionFrame('ProductDescription'), false);
  assert.equal(isDescriptionFrame('프로필 수정'), false);
});

test('새 인덱스 수집은 설명판 하위 트리까지 건너뛰고 실제 공개 홈페이지를 수집', () => {
  const frame = (id, name) => ({ id, name, type: 'FRAME', absoluteBoundingBox: { width: 1440, height: 1000 }, children: [
    { id: `${id}-text`, name: 'description', type: 'TEXT', characters: '프로젝트 description 입력' }, { id: `${id}-bg`, name: '배경', type: 'RECTANGLE' },
  ] });
  const response = { document: { id: '0:1', name: '페이지', type: 'CANVAS', children: [frame('1:1', 'Description'), frame('1:2', '공홈 메인'),
    { id: '2:1', name: 'Description', type: 'GROUP', children: [frame('2:2', '설명판 안의 Frame')] }] } };
  const converted = nodeToScreens(response, { fileKey, teamPage: '공홈', syncedAt: at, mdsKeys: { components: new Map(), styles: new Set() } });
  assert.deepEqual(converted.screens.map(s => s.id), ['1:2']);
  assert.ok(converted.screens[0].texts.includes('프로젝트 description 입력'));
  assert.equal(converted.excluded.filter(e => e.reason.includes('Description')).length, 2);
});

test('긴 공홈 메인의 세로 섹션을 여러 화면으로 잘라내지 않음', () => {
  const section = (id, name, y) => ({ id, name, type: 'FRAME', absoluteBoundingBox: { x: 0, y, width: 1440, height: 800 }, children: [
    { id: `${id}-t`, name: name, type: 'TEXT', characters: name, absoluteBoundingBox: { x: 0, y, width: 200, height: 30 } },
    { id: `${id}-bg`, name: '배경', type: 'RECTANGLE' },
  ] });
  const response = { document: { id: '1:1', name: 'main_page_desktop', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 3000 }, children: [
    section('2:1', 'hero', 0), section('2:2', 'projects', 900), section('2:3', 'footer', 1800),
  ] } };
  const result = nodeToScreens(response, { fileKey, teamPage: '공홈', syncedAt: at, mdsKeys: { components: new Map(), styles: new Set() } });
  assert.deepEqual(result.screens.map(s => s.id), ['1:1']);
  assert.deepEqual(result.screens[0].texts, ['hero', 'projects', 'footer']);
});

test('기존 공홈·어드민 인덱스를 합쳐 읽을 때 설명판만 제외하고 양쪽 실제 화면을 보존', () => {
  const home = index([screen('1:1'), screen('1:2', 'Description')]);
  const admin = { ...index([screen('2:1', '공홈 관리', { teamPage: '어드민', originalTeam: '어드민', fileKey: 'vQrKzAR6nrVMmcJ5brCZ0H' })]), team: '어드민' };
  const before = structuredClone([home, admin]);
  const merged = mergeLegacyIndexes('공홈', home, admin);
  assert.deepEqual(new Set(merged.screens.map(s => s.id)), new Set(['1:1', '2:1']));
  assert.ok(merged.excluded.some(e => e.id === '1:2'));
  assert.deepEqual([home, admin], before);
});

test('MCP 가져오기도 Description 행을 거부하고 38기·39기 공홈 파일의 실제 화면은 허용', () => {
  const current = screen('3:1', '공홈 메인', { fileKey: 'aFJhoF5NN7HnSgRPLg5VeN', figmaUrl: 'https://www.figma.com/design/aFJhoF5NN7HnSgRPLg5VeN/?node-id=3-1' });
  const checked = validateMcpImport(index([screen('1:1'), screen('1:2', 'Description'), current]), '공홈');
  assert.deepEqual(checked.screens.map(s => s.id), ['1:1', '3:1']);
  assert.equal(checked.rejected.length, 1);
});

test('직접 전달되거나 캐시에 남은 설명판도 AI 후보로 전송하지 않음', async () => {
  let sent;
  const response = await runSearch({ query: '홈 화면', team: '공홈', index: index([screen('1:1'), screen('1:2', 'Description')]), ai: {
    interpret: async () => ({ conditions: [{ id: 'home', label: '홈', kind: 'screen', aliases: ['홈'], sourceText: '홈 화면', requirement: 'must', scope: 'screen' }] }),
    judge: async args => { sent = args.candidates; return []; },
  } });
  assert.equal(sent.length, 1);
  assert.ok(!sent.some(c => c.name === 'Description'));
  assert.deepEqual(response.results.map(r => r.screen.id), ['1:1']);
});
