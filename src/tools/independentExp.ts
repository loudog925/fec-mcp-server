import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface IndependentExpendituresParams {
  candidate_id?: string[];
  committee_id?: string[];
  support_oppose_indicator?: "S" | "O";
  min_date?: string;
  max_date?: string;
  min_amount?: number;
  max_amount?: number;
  per_page?: number;
  page?: number;
}

export async function independentExpenditures(
  params: IndependentExpendituresParams
): Promise<string> {
  const { candidate_id, committee_id } = params;
  if ((!candidate_id || candidate_id.length === 0) && (!committee_id || committee_id.length === 0)) {
    throw new Error(
      "Provide at least candidate_id or committee_id to search independent expenditures."
    );
  }
  const data = await fetchFEC("/schedules/schedule_e/", {
    candidate_id: candidate_id?.map((id) => id.toUpperCase()),
    committee_id: committee_id?.map((id) => id.toUpperCase()),
    support_oppose_indicator: params.support_oppose_indicator,
    min_date: params.min_date,
    max_date: params.max_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerIndependentExpendituresTool(server: McpServer): void {
  server.tool(
    "fec_independent_expenditures",
    "Get independent expenditures (Schedule E) — Super PAC and other spending supporting or opposing a candidate.",
    {
      candidate_id: z.array(z.string()).optional().describe("FEC candidate IDs, e.g. [\"S0OH00133\"]"),
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs (the spender)"),
      support_oppose_indicator: z
        .enum(["S", "O"])
        .optional()
        .describe("S = support, O = oppose"),
      min_date: z.string().optional().describe("YYYY-MM-DD"),
      max_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await independentExpenditures(params);
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
