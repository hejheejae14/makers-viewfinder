import assert from 'node:assert/strict';
import test from 'node:test';
import { SEARCH_TEAMS } from '../../lib/screen-identity.ts';
import { conditionMatches, includesTerm, normalizeSpacing } from './evidence.ts';
import { findCandidatesByConditions, matchScreen } from './candidate-search.ts';
import { parseInterpretation } from './gemini-validation.ts';
import { prepareJudgeInput } from './judge-payload.ts';
import { toAiCandidates, verifyJudgements } from './verification.ts';

const screen = (team = '앱', extra = {}) => ({ id: '1:1', fileKey: 'FIXTURE', teamPage: team, name: 'Frame',
  texts: ['게시물 없음'], components: [], tokens: [], figmaUrl: 'https://example.test', syncedAt: 'fixture', ...extra });
const condition = (alias, extra = {}) => ({ id: 'c1', label: alias, aliases: [alias], kind: 'text', requirement: 'must', ...extra });

test('등록된 동의어가 없는 한글 표현도 붙임·띄움·여러 공백·줄바꿈을 양방향으로 동일 비교', () => {
  for (const phrase of ['게시물 없음', '회원 가입', '참여 인원 0명', '결제 내역 조회', '위치 정보 없음', '프로필 수정', '알림 수신 설정']) {
    const compact = phrase.replace(/\s/g, '');
    for (const variant of [compact, phrase, [...compact].join(' '), phrase.replace(/ /g, '\n\t  ')]) {
      assert.equal(includesTerm(phrase, variant), true, `${phrase} / ${variant}`);
      assert.equal(includesTerm(variant, phrase), true, `${variant} / ${phrase}`);
    }
  }
  assert.equal(includesTerm('결제 내역', '환불 내역'), false);
  assert.equal(includesTerm('게시물', '게시물 없음'), false);
  assert.equal(includesTerm('내용', ' \n\t '), false);
});

test('영문·숫자·혼합 표현도 내부 공백을 무시하고 바깥의 영문 단어 경계를 유지', () => {
  for (const [a, b] of [['EmptyView', 'EMPTY VIEW'], ['MemberList', 'Member List'], ['MD S 버 튼', 'MDS버튼'], ['v 2', 'v2']]) {
    assert.equal(includesTerm(a, b), true);
    assert.equal(includesTerm(b, a), true);
  }
  assert.equal(includesTerm('a Card button', 'Card'), true);
  assert.equal(includesTerm('Discard Card', 'Card'), true);
  for (const [a, b] of [['Discard', 'Card'], ['Cardinality', 'Card'], ['NotEmptyView', 'Empty View'], ['v20', 'v2'], ['XMDS버튼', 'MDS 버튼']]) {
    assert.equal(includesTerm(a, b), false, `${a} / ${b}`);
  }
});

test('유니코드·구분자 차이를 보정하며 원래 문구는 유지', () => {
  assert.equal(includesTerm('게시물_없음', '게시물없음'), true);
  assert.equal(includesTerm('프로필 수정'.normalize('NFD'), '프로필수정'), true);
  assert.equal(includesTerm('Ｅｍｐｔｙ　Ｖｉｅｗ', 'emptyview'), true);
  assert.equal(normalizeSpacing('회 원\n가 입'), '회원가입');
});

test('모든 팀에서 동일하게 후보 선정·전송할 근거·확인 판정을 처리하고 원문 인용을 보존', () => {
  for (const team of SEARCH_TEAMS) {
    const source = screen(team);
    for (const term of ['게시물없음', '게시물 없음', '게 시 물 없 음']) {
      const cs = [condition(term)];
      const candidates = findCandidatesByConditions([source], cs);
      assert.equal(candidates.length, 1);
      const payload = prepareJudgeInput(term, toAiCandidates(candidates), cs, team);
      const sent = JSON.parse(payload.input).candidates[0].evidence.find(a => a.ref === 'texts/0');
      assert.equal(sent.value, '게시물 없음');
      const verified = verifyJudgements(candidates, [{ screenId: 'candidate-1', verdict: '정답 후보', relevance: 'high', reasons: ['fixture'],
        checks: [{ conditionId: 'c1', status: '확인됨', scope: 'screen', evidenceRefs: ['texts/0'], explanation: 'fixture' }] }], cs, team);
      assert.equal(verified[0].result.verdict, '정답 후보');
      assert.ok(verified[0].result.reasons.some(r => r.includes("'게시물 없음'")));
    }
  }
});

test('임의 문구의 원문 인용도 공백만 달라지면 미확인으로 바꾸지 않음', () => {
  const parsed = parseInterpretation({ conditions: [{ ...condition('결제내역조회'), sourceText: '결제 내역 조회', scope: 'screen' }] }, '결제내역조회 찾아줘');
  assert.notEqual(parsed.conditions[0].sourceVerified, false);
});

test('서로 다른 텍스트나 컴포넌트의 근거를 이어붙이지 않음', () => {
  assert.equal(findCandidatesByConditions([screen('앱', { texts: ['게시물', '없음'] })], [condition('게시물없음')]).length, 0);
  const source = screen('앱', { texts: [], components: [{ name: 'Action Button', variant: 'primary', isMds: true }, { name: 'Card', variant: 'sub tle', isMds: true }] });
  const cs = [condition('ActionButton', { kind: 'component' }), condition('subtle', { id: 'c2', kind: 'property', relatedTo: 'c1' })];
  const matched = matchScreen(source, cs);
  assert.deepEqual(matched.matchedConditions, ['ActionButton']);
});

test('제외조건도 같은 공백 규칙으로 검사하고 다른 화면의 홈 단서를 만들지 않음', () => {
  const source = screen('앱', { texts: ['가입 완료', '관리자전용'] });
  const cs = [condition('가입완료'), condition('관리자 전용', { id: 'ex', requirement: 'exclude' })];
  assert.deepEqual(verifyJudgements([{ screen: source }], [], cs, '앱'), []);
  assert.equal(conditionMatches({ source: '화면 속 텍스트', value: '홈 페 이 지', strength: 'direct', ref: 'texts/0' }, condition('홈', { kind: 'screen' })), false);
});
