import { handleIndexDataRequest } from "@/features/1-1-index-sync/index-data";

// 저장소에서 읽어 돌려주므로 오래 걸리지 않습니다.
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleIndexDataRequest(request);
}
