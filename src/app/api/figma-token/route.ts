import { handleFigmaTokenRequest } from "@/features/1-1-index-sync/figma-token";

export async function POST(request: Request) {
  return handleFigmaTokenRequest(request);
}
