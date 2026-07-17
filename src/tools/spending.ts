import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

const SPENDING_SEARCH_TIMEOUT_MS = 60000;

export interface SpendingSearchParams {
  recipient_name?: string;
  disbursement_description?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
  page?: number;
}

export async function spendingSearch(params: SpendingSearchParams): Promise<string> {
  if (!params.recipient_name && !params.disbursement_description) {
    throw new Error(
      "Provide at least recipient_name or disbursement_description to search spending."
    );
  }
  const data = await fetchFEC(
    "/schedules/schedule_b/",
    {
      recipient_name: params.recipient_name,
      disbursement_description: params.disbursement_description,
      min_date: params.min_date,
      max_date: params.max_date,
      min_amount: params.min_amount,
      max_amount: params.max_amount,
      per_page: params.per_page ?? 20,
      page: params.page,
    },
    SPENDING_SEARCH_TIMEOUT_MS
  );
  return JSON.stringify(data, null, 2);
}

export function registerSpendingSearchTool(server: McpServer): void {
  server.tool(
    "fec_spending_search",
    "Find spending by vendor name or expenditure description/purpose across all committees, not just one.",
    {
      recipient_name: z.string().optional().describe("Vendor/recipient name search text"),
      disbursement_description: z.string().optional().describe("Free-text purpose/description search"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await spendingSearch(params);
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
