import { authorize, json } from "./auth";
import { PD_FILE_KEY } from "./config";
import { FigmaAccessError, figmaGet } from "./figma-library";
import { FigmaTokenMissingError, getSharedFigmaToken } from "./figma-token";
import { SEARCH_TEAMS, canonicalTeam } from "../../lib/screen-identity";
import { canPreview } from "./preview-access";
import { getTeamIndex } from "./sync";

/**
 * 화면 이미지를 Figma에서 그때그때 받아 옵니다. (읽기 전용: 이미지 렌더 요청만 보냅니다.)
 * 디자인 원본은 저장하지 않는다는 원칙에 따라 이미지를 저장하지 않고, Figma가 주는 임시 주소만 돌려줍니다.
 * 임시 주소는 일정 시간이 지나면 만료되므로, 보여 줄 때마다 새로 받습니다.
 */

const NODE_ID = /^\d+:\d+$/;
const MAX_SCALE = 2;

export async function getScreenImageUrl(nodeId: string, figmaToken: string, scale = 1, fileKey = PD_FILE_KEY): Promise<string | undefined> {
  const response = await figmaGet<{ images: Record<string, string | null> }>(
    `/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
    figmaToken,
  );
  return response.images[nodeId] ?? undefined;
}

/** POST { nodeId, scale? } → { url }. 팀 비밀번호를 서버에서 확인하고, 등록된 팀 공용 Figma 토큰으로 읽는다. */
export async function handleScreenImageRequest(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { nodeId?: unknown; scale?: unknown; fileKey?: unknown; team?: unknown } | null;
  const nodeId = typeof body?.nodeId === "string" && NODE_ID.test(body.nodeId) ? body.nodeId : undefined;
  const scale = typeof body?.scale === "number" && Number.isFinite(body.scale) ? Math.min(Math.max(body.scale, 0.5), MAX_SCALE) : 1;
  if (!nodeId) return json({ error: "nodeId(예: 103:40906)가 필요합니다." }, 400);

  try {
    const fileKey = typeof body?.fileKey === "string" ? body.fileKey : PD_FILE_KEY;
    // 예전 nodeId 전용 호출은 PD 인덱스에서만 확인한다. 새 호출은 팀·파일을 함께 지정한다.
    const team = body?.team === "어드민" ? "공홈" : SEARCH_TEAMS.find((t) => t === body?.team);
    if (body?.team !== undefined && !team) return json({ error: "검색 팀을 확인해 주세요." }, 400);
    if (!team && fileKey !== PD_FILE_KEY) return json({ error: "실제 파일 미리보기에는 team이 필요합니다." }, 400);
    const allowed = team ? canPreview(await getTeamIndex(team), canonicalTeam(team), fileKey, nodeId)
      : (await Promise.all(SEARCH_TEAMS.map(async (t) => canPreview(await getTeamIndex(t), t, fileKey, nodeId)))).some(Boolean);
    if (!allowed) return json({ error: "선택한 팀 인덱스에 등록된 화면이 아닙니다." }, 403);
    const figmaToken = await getSharedFigmaToken();
    const url = await getScreenImageUrl(nodeId, figmaToken, scale, fileKey);
    if (!url) return json({ error: "Figma에서 이 화면의 이미지를 만들지 못했어요." }, 404);
    return json({ nodeId, fileKey, url });
  } catch (error) {
    if (error instanceof FigmaTokenMissingError) return json({ error: error.message }, 503);
    if (error instanceof FigmaAccessError) return json({ error: error.message }, 403);
    return json({ error: error instanceof Error ? error.message : "알 수 없는 오류가 났어요." }, 500);
  }
}
