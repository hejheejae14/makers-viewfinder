import { handleSyncRequest } from "@/features/1-1-index-sync/handler";

// 구역 하나를 읽는 데 3~7초 걸리고, handler.ts는 30초 안에 새 구역을 시작합니다. 배포 환경은 이 값을 읽어 실행 시간 제한을 적용합니다.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleSyncRequest(request);
}
