import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface FinancialSummaryParams {
  candidate_id: string;
  cycle?: number[];
}

export async function financialSummary(params: FinancialSummaryParams): Promise<string> {
  const { candidate_id, cycle } = params;
  if (!candidate_id || !candidate_id.trim()) {
    throw new Error("candidate_id is required, e.g. H8CA01234");
  }
  const data = await fetchFEC(
    `/candidate/${encodeURIComponent(candidate_id.toUpperCase())}/totals/`,
    { cycle }
  );
  return JSON.stringify(data, null, 2);
}

export function registerFinancialSummaryTool(server: McpServer): void {
  server.tool(
    "fec_financial_summary",
    "Get a candidate's aggregated financial totals: receipts, disbursements, cash on hand, across their principal committees.",
    {
      candidate_id: z.string().min(1).describe("FEC candidate ID, e.g. H8CA01234"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
    },
    async (params) => {
      try {
        const text = await financialSummary(params);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
