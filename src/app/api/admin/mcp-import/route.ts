import { handleMcpImport } from "@/features/1-1-index-sync/mcp-import-handler";

export const maxDuration = 30;
export async function POST(request: Request) {
  return handleMcpImport(request);
}
