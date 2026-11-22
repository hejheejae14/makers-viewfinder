import { notFound } from "next/navigation";
import { McpPocSearch } from "@/features/2-1-search/mcp-poc/McpPocSearch";

export default function McpPocSearchPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <McpPocSearch />;
}
