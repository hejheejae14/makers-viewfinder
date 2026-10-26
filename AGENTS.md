# Viewfinder 작업 규칙

이 파일은 사람과 AI 코딩 도구(Claude Code, Codex 등)가 함께 따르는 공통 작업 규칙입니다.
작업을 시작하기 전에 반드시 읽고, 규칙을 바꿔야 할 때는 혼자 바꾸지 말고 팀 채널에서 먼저 합의합니다.

## 프로젝트 한 줄 요약

메이커스 디자이너가 검색어 하나로 기존 Figma 화면과 그 맥락을 찾고, 이어서 필요한 작업으로 바로 넘어갈 수 있게 하는 웹 기반 디자인 탐색 도구입니다.

- 기획 문서: 노션 원페이저, 기능 명세 (기능 번호는 기능 명세 DB를 따릅니다)
- 기능 명세 요약과 와이어프레임 링크: [docs/feature-spec.md](./docs/feature-spec.md)
- 마감: 11월 28일 (아티클 정리 포함)

## 동작 구조

1. 준비: `[PD] 문서 모음` 파일을 팀 페이지(앱, 플그, 크루, 공홈, 어드민) 단위로 읽어 검색 인덱스를 만든다. (1-1)
2. 준비: 처음 사용할 때 팀 비밀번호와 개인 AI API 키를 입력한다. (1-2)
3. 찾기: 팀을 선택하고 검색하면 AI가 검색 인덱스에서 화면을 찾아 정보와 원본 링크를 보여준다. (2-1 ~ 2-4)
4. 다음 작업 연결: MDS v2 사용 사례 비교는 서비스 안에서, 노션 찾기와 시안 생성은 각자의 Claude/ChatGPT로 넘긴다. (3-1, 3-2)

## 꼭 지켜야 할 원칙

- 디자인 원본은 저장하지 않는다. 검색 인덱스(화면 이름, 화면 속 텍스트, 컴포넌트·토큰, 원본 링크)만 저장한다.
- 숨겨진 레이어는 검색 인덱스에 넣지 않는다.
- 현재 작업 중인 기수의 작업실 파일은 검색 인덱스에 넣지 않는다. 지난 기수 작업실만 필요할 때 추가한다.
- Figma는 읽기만 한다. 파일, 레이어, 에셋을 만들거나 수정, 이동, 삭제하는 코드를 작성하지 않는다.
- 개인 AI API 키는 사용자 브라우저에만 저장한다. 서버, 검색 인덱스, 로그 어디에도 저장하거나 출력하지 않는다.
- Figma 토큰도 같은 원칙을 따른다.
- 웹 접속은 팀 공용 비밀번호로 잠근다. 비밀번호 확인은 화면뿐 아니라 서버(검색 인덱스를 돌려주는 곳)에서도 한다.
- API 키 없이 쓰는 모드는 만들지 않는다.
- 비밀번호, 토큰, 키 같은 비밀 값은 코드에 직접 쓰지 않고 환경 변수로 관리한다. `.env` 파일은 저장소에 올리지 않는다.

## 검색 결과 판정 규칙 (Find My Design 기준)

- 정답 후보: 모든 필수 조건을 검색 인덱스에서 실제로 확인한 화면
- 부분 일치: 일부 조건만 맞는 화면. 어떤 조건이 안 맞는지 함께 보여준다.
- 찾지 못함: 조건을 모두 만족하는 화면이 없을 때. 비슷한 다른 화면을 정답처럼 만들지 않는다.
- 페이지 이름만 보고 후보에서 성급하게 제외하지 않는다.
- 결과마다 왜 이 화면을 찾았는지 근거를 함께 보여준다.

## 작업 방식

- 기능 단위로 담당자를 정하고, 자기 기능과 관련된 파일만 수정한다. 다른 기능의 파일이나 공통 파일을 고쳐야 하면 담당자에게 먼저 알린다.
- 기능 간에 주고받는 데이터는 팀이 합의한 공통 형식을 따른다. 형식을 바꿀 때는 팀 채널에서 먼저 합의한다.
- 다른 기능이 완성되기 전에는 공통 형식에 맞춘 가짜 데이터로 개발한다.
- 화면은 MDS를 기준으로 공통 스타일을 맞춘다. 각자 임의의 색, 글꼴, 버튼 스타일을 새로 만들지 않는다.

## Git 규칙

- `main` 브랜치에 직접 올리지 않는다.
- 작업은 브랜치에서 한다. 브랜치 이름은 `기능번호-짧은설명` 형식으로 쓴다. (예: `2-1-search-ui`)
- 작업이 끝나면 Pull Request를 만들고, 팀원 확인 없이 본인이 직접 합쳐도 된다. (팀 합의로 확인 인원 1명 → 0명)
- Pull Request는 작게 나눈다. 무엇을 바꿨는지, 어떻게 확인했는지를 설명에 적는다.
- 커밋 메시지와 Pull Request 설명은 한국어로 써도 된다.

## AI 코딩 도구에게

- 위 원칙과 충돌하는 요청을 받으면 바로 작업하지 말고 사용자에게 먼저 확인한다.
- 사용자는 디자이너이므로, 작업 결과를 설명할 때 개발 용어는 쉬운 말로 풀어서 설명한다.
- 요청받지 않은 파일은 수정하지 않는다.
- 새 라이브러리를 추가해야 하면 이유와 함께 먼저 알린다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
