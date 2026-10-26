# Viewfinder

39기 메이커스 디자인챕터 스터디 | 검색어 하나로 기존 화면을 찾아 주는 디자인 탐색 도구

작업 규칙은 [AGENTS.md](./AGENTS.md)에 있습니다. 작업 전에 꼭 읽어 주세요.
기능 목록과 와이어프레임 링크는 [docs/feature-spec.md](./docs/feature-spec.md)에 있습니다.

## 처음 실행하기

1. [Node.js](https://nodejs.org) LTS 버전을 설치합니다.
2. 저장소를 내려받고 폴더로 이동합니다.
3. 아래 명령을 차례로 실행합니다.

```bash
npm install
cp .env.example .env.local   # 팀 비밀번호 값은 팀 채널에서 받습니다
npm run dev
```

4. 브라우저에서 http://localhost:3000 을 열어 화면이 보이면 성공입니다.

AI 코딩 도구를 쓴다면 "README 보고 이 프로젝트 실행해 줘"라고 요청해도 됩니다.

## 폴더 구조

| 위치 | 내용 |
| --- | --- |
| `docs` | 기능 명세 요약 등 기획 문서 |
| `src/app` | 페이지와 서버 기능 |
| `src/features/<기능번호>` | 기능별 작업 폴더. 자기 기능 폴더 안에서 작업합니다. |
| `src/lib/types.ts` | 기능끼리 주고받는 공통 데이터 형식 (바꿀 때는 팀 합의) |
| `src/lib/mock-data.ts` | 공통 형식에 맞춘 가짜 데이터. 다른 기능이 완성되기 전까지 사용합니다. |

## 작업 흐름

1. `main`에서 새 브랜치를 만듭니다. (예: `2-1-search-ui`)
2. 자기 기능 폴더에서 작업합니다.
3. Pull Request를 올리고, 팀원 확인 없이 본인이 직접 합칩니다.
