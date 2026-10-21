/**
 * 프레임이 "화면"인지 가르는 기준입니다. 화면으로 판정된 프레임만 검색 인덱스에 넣습니다.
 *
 * 이름으로는 제외하지 않습니다. (페이지·구역·프레임 이름만 보고 후보에서 빼면 엉뚱한 곳에 있는 화면을 놓칩니다.)
 * 크기와 내용 구조만 보고, 제외한 프레임은 이유와 함께 목록으로 남겨 사람이 검토할 수 있게 합니다.
 */

/** 이 크기(px) 미만이면 화면이 아니다. 360, 375, 430, 웹 브레이크포인트를 따로 나열하지 않는다. */
export const MIN_SCREEN_WIDTH = 300;
export const MIN_SCREEN_HEIGHT = 400;

/** 폭이 높이의 이 배수를 넘으면 화면이 아니다. (가로로 길게 늘어놓은 띠, 흐름도 등) */
export const MAX_WIDTH_TO_HEIGHT = 2;

/** 컴포넌트도 도형도 없이 글만 있는 프레임에서, 글 덩어리가 이 개수 이하이면 메모·더미 글로 본다. */
export const MAX_TEXTS_FOR_MEMO = 10;

export interface FrameShape {
  type: string;
  width: number;
  height: number;
}

/** 프레임 안을 훑어 센 내용 */
export interface FrameStats {
  texts: number; // 글자 레이어 수
  instances: number; // 컴포넌트 인스턴스 수
  shapes: number; // 글자·프레임·그룹·인스턴스가 아닌 그림 레이어 수 (벡터, 사각형 등)
}

export type ScreenVerdict = { isScreen: true } | { isScreen: false; reason: string };

export function judgeFrame(frame: FrameShape, stats: FrameStats): ScreenVerdict {
  if (frame.type !== "FRAME") return { isScreen: false, reason: "프레임이 아님" };
  if (frame.width < MIN_SCREEN_WIDTH || frame.height < MIN_SCREEN_HEIGHT) {
    return { isScreen: false, reason: "화면 크기보다 작음" };
  }
  if (frame.width > frame.height * MAX_WIDTH_TO_HEIGHT) {
    return { isScreen: false, reason: "가로로 지나치게 넓음" };
  }
  if (stats.instances === 0 && stats.shapes === 0 && stats.texts <= MAX_TEXTS_FOR_MEMO) {
    return { isScreen: false, reason: "글만 있는 메모 또는 더미 글" };
  }
  return { isScreen: true };
}
