# 2-1. 팀 선택 및 화면 검색

AI가 검색 인덱스에서 화면을 찾아 SearchResponse를 만듭니다. Find My Design 판정 규칙을 따릅니다.

- 노션 기능 명세 DB의 "2-1. 팀 선택 및 화면 검색" 페이지를 참고합니다.
- 이 기능의 코드는 이 폴더 안에 둡니다.

## 현재 구현

1. `index-client.ts`가 팀 비밀번호로 보호된 `POST /api/index-data`에서 선택한 팀의 인덱스를 읽습니다.
2. AI가 자연어 검색어를 인덱스에서 확인할 필수 조건과 동의어로 해석합니다.
3. `candidate-search.ts`가 화면 이름, 구역, 화면 속 텍스트, 컴포넌트, variant, 토큰을 모두 확인해 AI에 보낼 후보를 줄입니다.
4. `search.ts`가 AI 판정 결과를 공통 `SearchResponse` 형식으로 조립합니다.
   - 검색과 AI 판정 흐름은 `client-only`로 제한해 개인 AI 키가 우리 서버를 거치지 않게 합니다.
   - AI에는 판정에 필요한 텍스트·컴포넌트 정보만 전달하고 Figma 파일 키, 원본 링크, 요소 위치는 보내지 않습니다.
   - AI가 돌려준 화면 ID가 실제 후보에 있을 때만 결과에 포함합니다.
   - `정답 후보`는 불충족 조건이 없어야 합니다.
   - `부분 일치`는 어떤 조건이 맞지 않았는지 반드시 포함해야 합니다.
   - 유효한 결과가 없으면 `results: []`이며 화면에서는 `찾지 못함`으로 표시합니다.
5. `judge-prompt.ts`가 AI 제공자와 무관한 검색어 해석·Find My Design 판정 지침과 JSON 응답 형식을 만듭니다.
6. `gemini.ts`가 개인 API 키로 Gemini를 두 번 호출합니다.
   - 기본 모델: `gemini-3.5-flash-lite`
   - 1차 호출: 자연어 검색어를 필수 조건과 동의어로 해석
   - 2차 호출: 줄인 후보를 `정답 후보` 또는 `부분 일치`로 판정
   - 키는 저장하거나 로그에 남기지 않고 Gemini 요청의 `x-goog-api-key` 헤더에만 넣습니다.
   - 잘못된 키, 무료 한도 소진, 일시적인 Gemini 오류를 구분해 안내합니다.

실제 검색은 `createGeminiSearchAi(apiKey)`로 만든 판정기를 반드시 전달해야 하며, 키 없이 쓰는 최종 검색 모드는 만들지 않습니다.

## 테스트

새 라이브러리 없이 Node.js 기본 테스트 도구로 가짜 인덱스를 확인합니다.

```bash
node --experimental-strip-types --test src/features/2-1-search/candidate-search.test.mjs
```
