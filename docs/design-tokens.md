# 디자인 토큰 (MDS v2)

Viewfinder는 토큰을 새로 만들지 않고 **MDS v2(makers design system v2) 토큰을 그대로** 씁니다. (팀 결정, 10/26)
코드에서는 `src/styles/mds-tokens.css`의 CSS 변수로 쓰고, 이 파일은 `globals.css`에서 불러오기 때문에 모든 화면에서 바로 쓸 수 있습니다.

- 원본: Figma `makers design system v2` 파일의 ✅ Token 페이지와 로컬 변수 (Color, Typography, Spacing, Radius 컬렉션)
- 테마: MDS v2는 다크 테마 하나뿐입니다. 라이트 모드는 만들지 않습니다.
- 글꼴: SUIT (Variable). 웹 폰트는 jsDelivr CDN에서 불러옵니다.

## 쓰는 규칙

- 색은 **의미 토큰(`bg` / `fg` / `stroke`)만** 씁니다. `--mds-base-gray-600` 같은 base 팔레트는 의미 토큰 정의에만 쓰고, 화면에서 직접 쓰지 않습니다.
- `#3f3f47`처럼 값을 직접 쓰지 않습니다. 맞는 토큰이 없으면 임의로 만들지 말고 팀 채널에 먼저 공유합니다.
- 토큰 값은 이 저장소에서 바꾸지 않습니다. MDS v2가 바뀌면 Figma 값을 다시 옮겨 옵니다.

## 이름 규칙

Figma 변수 이름의 `/`를 `-`로 바꾸고 앞에 `--mds-`를 붙입니다.

| Figma 변수 | CSS 변수 |
| --- | --- |
| `bg/neutral/default` | `--mds-bg-neutral-default` |
| `fg/neutral/subtle` | `--mds-fg-neutral-subtle` |
| `stroke/neutral/default` | `--mds-stroke-neutral-default` |
| `base/gray/600` | `--mds-base-gray-600` |
| `base/size/s16` (Spacing) | `--mds-space-16` |
| `base/r8` | `--mds-radius-8` |
| `typography/body2` (글자 스타일) | `--mds-body2` + `--mds-body2-letter-spacing`, 또는 `.mds-body2` 클래스 |

## 색 (의미 토큰)

| 용도 | 토큰 |
| --- | --- |
| 화면 바탕 | `bg-layer-layer-basement` (가장 아래), `bg-layer-layer-default` (카드·패널) |
| 중립 면 | `bg-neutral-{inverse, bold, default, subtle, ghost}` + `-hover` / `-pressed` / `-disabled` |
| 브랜드 (주황) | `bg-brand-{default, subtle, ghost}`, `fg-brand-default`, `stroke-brand-{default, subtle}` |
| 보조 (파랑) | `bg-secondary-*`, `fg-secondary-default`, `stroke-secondary-*` |
| 상태 | `information`, `success`, `danger`, `attention` (fg는 bold / default / subtle) |
| 글자 | `fg-neutral-{bold, default, subtle, ghost, inverse}` + `-disabled` |
| 선 | `stroke-neutral-{default, default-focused, subtle, ghost, inverse}` |
| 딤 | `bg-dim` (모달 뒤 어두운 막) |

전체 목록과 값은 `src/styles/mds-tokens.css`에 있습니다.

## 글자 스타일

| 이름 | 굵기 | 크기/행간 |
| --- | --- | --- |
| heading1 ~ 4 | Bold | 32/48, 24/36, 20/30, 16/24 |
| title1 ~ 5 | SemiBold | 28/42, 24/36, 20/30, 18/26, 16/24 |
| body1 ~ 3 | Regular | 16/26, 14/22, 12/18 |
| label1 ~ 4 | SemiBold | 18/24, 16/22, 14/18, 12/16 |

자간은 대부분 -2%, heading4·title5·body는 -1.5%입니다. 기본 글자(body)는 `body2`로 맞춰 두었습니다.

## 간격 · 모서리

- 간격: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 64, 72, 80, 120, 160 (px)
- 모서리: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, full(9999) (px)

## 와이어프레임에서 자주 쓸 조합 (제안)

| 와이어프레임 요소 | 토큰 |
| --- | --- |
| 페이지 바탕 | `bg-layer-layer-basement` |
| 결과 카드, 상세 패널, 설정 카드 | `bg-layer-layer-default` + `stroke-neutral-subtle` |
| 선택된 결과 카드 | `bg-layer-layer-default-hover` + `stroke-brand-default` |
| 정답 후보 표시 | `fg-success-default` / `bg-success-ghost` |
| 부분 일치 표시 | `fg-attention-default` |
| 오류 안내 (키 오류, 한도 소진) | `fg-danger-default` / `bg-danger-ghost` |

조합은 컴포넌트 단계에서 MDS v2 컴포넌트(Button, Chip, Input, Tag, Callout 등)를 확인하면서 확정합니다.
