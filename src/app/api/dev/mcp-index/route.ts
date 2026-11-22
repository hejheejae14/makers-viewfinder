import { handleMcpPocIndex } from "@/features/2-1-search/mcp-poc/index-handler";

export async function POST(request: Request) {
  return handleMcpPocIndex(request);
}
