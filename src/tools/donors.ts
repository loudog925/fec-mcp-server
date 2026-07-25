import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

const DONOR_SEARCH_TIMEOUT_MS = 60000;

export interface DonorSearchParams {
  contributor_name: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contributor_state?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
  page?: number;
  last_index?: string;
  last_contribution_receipt_amount?: number;
}

export async function donorSearch(params: DonorSearchParams): Promise<string> {
  if (!params.contributor_name || !params.contributor_name.trim()) {
    throw new Error("contributor_name is required to search for a donor.");
  }
  const data = await fetchFEC(
    "/schedules/schedule_a/",
    {
      contributor_name: params.contributor_name,
      contributor_employer: params.contributor_employer,
      contributor_occupation: params.contributor_occupation,
      contributor_state: params.contributor_state,
      min_date: params.min_date,
      max_date: params.max_date,
      min_amount: params.min_amount,
      max_amount: params.max_amount,
      per_page: params.per_page ?? 20,
      page: params.page,
      last_index: params.last_index,
      last_contribution_receipt_amount: params.last_contribution_receipt_amount,
    },
    DONOR_SEARCH_TIMEOUT_MS
  );
  return JSON.stringify(data, null, 2);
}

export function registerDonorSearchTool(server: McpServer): void {
  server.tool(
    "fec_donor_search",
    "Find an individual donor's contributions by name (optionally narrowed by employer/occupation/state/date/amount) across all committees, not just one.",
    {
      contributor_name: z.string().min(1).describe("Donor name search text (required)"),
      contributor_employer: z.string().optional(),
      contributor_occupation: z.string().optional(),
      contributor_state: z.string().length(2).optional().describe("Two-letter state code"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
      last_index: z
        .string()
        .optional()
        .describe(
          "Cursor from the previous response's pagination.last_indexes.last_index, for paging deeper into large result sets than `page` can reliably reach"
        ),
      last_contribution_receipt_amount: z
        .number()
        .optional()
        .describe(
          "Cursor from the previous response's pagination.last_indexes.last_contribution_receipt_amount; pass alongside last_index"
        ),
    },
    async (params) => {
      try {
        const text = await donorSearch(params);
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
