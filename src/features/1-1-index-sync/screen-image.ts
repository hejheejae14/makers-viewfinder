import { authorize, json } from "./auth";
import { PD_FILE_KEY } from "./config";
import { figmaGet } from "./figma-library";

/**
 * 화면 이미지를 Figma에서 그때그때 받아 옵니다. (읽기 전용: 이미지 렌더 요청만 보냅니다.)
 * 디자인 원본은 저장하지 않는다는 원칙에 따라 이미지를 저장하지 않고, Figma가 주는 임시 주소만 돌려줍니다.
 * 임시 주소는 일정 시간이 지나면 만료되므로, 보여 줄 때마다 새로 받습니다.
 */

const NODE_ID = /^\d+:\d+$/;
const MAX_SCALE = 2;

export async function getScreenImageUrl(nodeId: string, scale = 1): Promise<string | undefined> {
  const response = await figmaGet<{ images: Record<string, string | null> }>(
    `/v1/images/${PD_FILE_KEY}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
  );
  return response.images[nodeId] ?? undefined;
}

/** POST { nodeId, scale? } → { url }. 팀 비밀번호를 서버에서 확인한다. */
export async function handleScreenImageRequest(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { nodeId?: unknown; scale?: unknown } | null;
  const nodeId = typeof body?.nodeId === "string" && NODE_ID.test(body.nodeId) ? body.nodeId : undefined;
  const scale = typeof body?.scale === "number" ? Math.min(Math.max(body.scale, 0.5), MAX_SCALE) : 1;
  if (!nodeId) return json({ error: "nodeId(예: 103:40906)가 필요합니다." }, 400);

  try {
    const url = await getScreenImageUrl(nodeId, scale);
    if (!url) return json({ error: "Figma에서 이 화면의 이미지를 만들지 못했습니다." }, 404);
    return json({ nodeId, url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "알 수 없는 오류가 났습니다." }, 500);
  }
}
