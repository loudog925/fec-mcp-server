import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchPaginatedFEC } from "../fecClient.js";

export interface ItemizedExpendituresParams {
  committee_id?: string[];
  recipient_name?: string;
  recipient_state?: string;
  disbursement_description?: string;
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
  page?: number;
  last_index?: string;
  last_disbursement_date?: string;
}

export async function itemizedExpenditures(
  params: ItemizedExpendituresParams
): Promise<string> {
  const { committee_id, recipient_name } = params;
  if ((!committee_id || committee_id.length === 0) && !recipient_name) {
    throw new Error(
      "Provide at least committee_id or recipient_name to search itemized expenditures."
    );
  }
  const data = await fetchPaginatedFEC("/schedules/schedule_b/", {
    committee_id: committee_id?.map((id) => id.toUpperCase()),
    recipient_name,
    recipient_state: params.recipient_state,
    disbursement_description: params.disbursement_description,
    min_date: params.min_date,
    max_date: params.max_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    per_page: params.per_page ?? 20,
    page: params.page,
    last_index: params.last_index,
    last_disbursement_date: params.last_disbursement_date,
  });
  return JSON.stringify(data, null, 2);
}

export function registerItemizedExpendituresTool(server: McpServer): void {
  server.tool(
    "fec_itemized_expenditures",
    "Get itemized disbursements (Schedule B) made by a committee, optionally filtered by recipient name/state/description/date/amount.",
    {
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00358796\"]"),
      recipient_name: z.string().optional().describe("Recipient/vendor name search text"),
      recipient_state: z.string().length(2).optional().describe("Two-letter state code"),
      disbursement_description: z.string().optional().describe("Free-text purpose/description search"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z
        .number()
        .min(1)
        .optional()
        .describe(
          "Page number for results beyond the first (default 1). This endpoint silently " +
            "caps deep page-based paging; requests beyond FEC_MAX_PAGE (default 10) are " +
            "rejected and a mismatched pagination.page in the response throws. Use " +
            "last_index for paging deeper."
        ),
      last_index: z
        .string()
        .optional()
        .describe(
          "Cursor from the previous response's pagination.last_indexes.last_index, for paging deeper into large result sets than `page` can reliably reach"
        ),
      last_disbursement_date: z
        .string()
        .optional()
        .describe(
          "Cursor from the previous response's pagination.last_indexes.last_disbursement_date; pass alongside last_index"
        ),
    },
    async (params) => {
      try {
        const text = await itemizedExpenditures(params);
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
