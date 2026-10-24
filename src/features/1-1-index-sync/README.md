# 1-1. 인덱스 생성 및 동기화

`[PD] 문서 모음` Figma 파일을 팀 페이지 단위로 읽어 검색 인덱스를 만들고 저장하는 기능

- 노션 기능 명세 DB의 "1-1. 인덱스 생성 및 동기화" 페이지 참고
- 이 기능의 코드는 이 폴더 안에 위치

## 동기화 방법 (웹)

1. 배포 주소의 `/sync` 접속
2. 팀 비밀번호 입력 (팀 채널에서 확인)
3. 본인 Figma 개인 토큰 입력
   - Figma → Settings → Security → Personal access tokens에서 생성
   - 권한은 읽기 전용 2가지만 선택: 파일 내용 읽기, 디자인 시스템(컴포넌트·스타일) 읽기
   - `[PD] 문서 모음`과 MDS v1·v2 파일을 볼 수 있는 계정 필요
   - 토큰은 입력한 브라우저에만 저장, 서버에는 저장하지 않음 (AGENTS.md 원칙)
4. 팀 페이지 선택 후 "처음부터 동기화"
5. 끝날 때까지 화면 유지 (앱 약 1분, 구역이 많은 페이지는 15분 이상 소요 가능)

- 동기화가 끝나기 전에는 이전 인덱스가 그대로 사용됨
- 같은 팀 페이지는 동시에 한 번만 실행 가능 (중복 실행 시 안내 문구 표시)
- 동기화 주기는 아카이브 업데이트 시 (한 기수에 한 번 정도)

## 인덱스 읽는 방법 (2-1 등 다른 기능)

```ts
import { getTeamIndex } from "@/features/1-1-index-sync/sync";

const index = await getTeamIndex("앱"); // TeamIndex | undefined (동기화한 적 없으면 undefined)
index?.screens; // IndexedScreen[]
```

- 형식은 `src/lib/types.ts`의 `TeamIndex`, `IndexedScreen`, `MdsElement` 참고
- 서버 코드에서는 위 함수로 직접 조회 (Redis 접속 정보가 서버 환경 변수에 있음)
- 브라우저에서는 `POST /api/index-data`로 조회
  - 헤더: `x-team-password`
  - 본문: `{ "team": "앱" }`
  - 응답: `TeamIndex` (동기화한 적 없는 팀은 404)
  - Figma 토큰 불필요 (저장된 인덱스를 그대로 반환)
  - 응답 크기: 팀 페이지 하나의 인덱스 전체 (현재 1~2MB 안팎), 배포 환경의 응답 크기 한도(약 4.5MB)에 가까워지면 나눠서 반환하도록 변경 필요

## 화면 이미지 (2-4 등)

- 디자인 원본은 저장하지 않으므로 화면 이미지는 필요할 때마다 Figma에서 받아 옴
- `POST /api/screen-image`
  - 헤더: `x-team-password`, `x-figma-token`
  - 본문: `{ "nodeId": "202:18381", "scale": 1 }`
  - 응답: `{ "nodeId": "...", "url": "임시 이미지 주소" }`
- 임시 주소는 일정 시간 후 만료되므로 보여 줄 때마다 새로 요청

## 인덱스에 담는 내용

- 화면 판정 (`screen-rules.ts`): 이름이 아니라 크기와 내용 구조로 판정
  - 폭 300px 이상, 높이 400px 이상, 폭이 높이의 2배 이하
  - 컴포넌트·도형 없이 글만 있는 프레임(메모, 더미 글) 제외
  - 제외한 프레임은 이유와 함께 `excluded`에 저장
- 제외 대상: 숨겨진 레이어, 화면 영역 밖에 놓인 글·컴포넌트·토큰
- `components`: 화면에 쓰인 컴포넌트, MDS v1·v2 파일의 컴포넌트 목록과 대조해 `isMds`, `mdsVersion` 판정
- `tokens`: MDS 파일에 있는 스타일(토큰)만 저장
- `elements`: 화면 속 MDS 컴포넌트와 위치·크기
  - MDS가 아닌 컴포넌트(시스템 UI 포함)와 MDS 컴포넌트 안쪽 컴포넌트는 제외
  - 화면 영역 밖 요소는 제외

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `sync.ts` | 동기화 흐름 (계획 → 구역별 이어 읽기 → 인덱스 교체), `getTeamIndex` |
| `convert.ts` | Figma 노드를 `IndexedScreen`으로 변환 |
| `screen-rules.ts` | 화면 판정 기준 |
| `mds.ts` | MDS 라이브러리 파일 키, MDS 대조 형식 |
| `figma-library.ts` | Figma 읽기 요청 (읽기 전용), MDS 컴포넌트·스타일 목록 조회 |
| `store.ts` | 저장소 (Upstash Redis, 로컬은 임시 폴더 파일) |
| `config.ts` | Figma 파일 키, 팀 페이지별 노드 ID |
| `handler.ts` | `POST /api/index-sync` 처리 (상태, 시작, 이어 읽기) |
| `screen-image.ts` | `POST /api/screen-image` 처리 |
| `index-data.ts` | `POST /api/index-data` 처리 (저장된 인덱스 반환) |
| `auth.ts` | 팀 비밀번호 확인, Figma 토큰 헤더 읽기 |

공통 영역의 연결 파일 (`src/app`)
- `api/index-sync/route.ts`, `api/screen-image/route.ts`, `api/index-data/route.ts`: 위 처리 함수 연결
- `sync/page.tsx`: 동기화 화면 (디자인은 임시)

## 환경 변수

| 이름 | 용도 |
| --- | --- |
| `TEAM_PASSWORD` | 팀 공용 비밀번호 (서버에서 확인) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis 접속 정보 (Vercel에서 Redis 연결 시 자동 생성) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 위와 같은 용도의 다른 이름 (둘 중 하나만 있으면 동작) |

- Figma 토큰은 환경 변수로 두지 않음 (동기화하는 사람이 화면에 입력)
- 배포 환경에서 Redis 설정이 없으면 임시 저장 없이 오류로 중단

## 알아둘 점

- 동기화 결과는 동기화하는 사람의 Figma 접근 권한에 따라 달라질 수 있음 (일부 파일을 못 보는 계정이면 일부만 생성)
- 컴포넌트가 MDS 파일 목록에 없으면 MDS가 아닌 것으로 판정
- 스크롤해야 보이는 화면 아래쪽 내용이 프레임 밖에 있으면 검색 대상에서 제외
- Figma 파일 읽기만 수행 (생성, 수정, 이동, 삭제 코드 없음)

## 로컬 개발

- `.env.local`에 `TEAM_PASSWORD` 입력
- Redis 환경 변수가 없으면 임시 폴더의 파일에 저장 (개발 전용)
- `npm run dev` 실행 후 `/sync` 접속
