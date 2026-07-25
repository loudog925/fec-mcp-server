import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// Unnarrowed schedule_a queries (e.g. a common contributor_name with no
// date range) have been observed taking ~26s upstream, leaving too little
// margin under the default 30000ms timeout.
const ITEMIZED_CONTRIBUTIONS_TIMEOUT_MS = 60000;

export interface ItemizedContributionsParams {
  committee_id?: string[];
  contributor_name?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
  page?: number;
  last_index?: string;
  last_contribution_receipt_amount?: number;
}

export async function itemizedContributions(
  params: ItemizedContributionsParams
): Promise<string> {
  const { committee_id, contributor_name } = params;
  if ((!committee_id || committee_id.length === 0) && !contributor_name) {
    throw new Error(
      "Provide at least committee_id or contributor_name to search itemized contributions."
    );
  }
  const data = await fetchFEC(
    "/schedules/schedule_a/",
    {
      committee_id: committee_id?.map((id) => id.toUpperCase()),
      contributor_name,
      contributor_state: params.contributor_state,
      contributor_employer: params.contributor_employer,
      contributor_occupation: params.contributor_occupation,
      min_date: params.min_date,
      max_date: params.max_date,
      min_amount: params.min_amount,
      max_amount: params.max_amount,
      per_page: params.per_page ?? 20,
      page: params.page,
      last_index: params.last_index,
      last_contribution_receipt_amount: params.last_contribution_receipt_amount,
    },
    ITEMIZED_CONTRIBUTIONS_TIMEOUT_MS
  );
  return JSON.stringify(data, null, 2);
}

export function registerItemizedContributionsTool(server: McpServer): void {
  server.tool(
    "fec_itemized_contributions",
    "Get itemized individual contributions (Schedule A) to a committee, optionally filtered by contributor name/employer/occupation/state/date/amount.",
    {
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00358796\"]"),
      contributor_name: z.string().optional().describe("Contributor name search text"),
      contributor_state: z.string().length(2).optional().describe("Two-letter state code"),
      contributor_employer: z.string().optional(),
      contributor_occupation: z.string().optional(),
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
        const text = await itemizedContributions(params);
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
