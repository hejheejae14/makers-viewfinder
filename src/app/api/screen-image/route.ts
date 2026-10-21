import { handleScreenImageRequest } from "@/features/1-1-index-sync/screen-image";

// 화면 이미지를 Figma에서 받아 오는 데 몇 초 걸립니다. 이미지는 저장하지 않고 임시 주소만 돌려줍니다.
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleScreenImageRequest(request);
}
