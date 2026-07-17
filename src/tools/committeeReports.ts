import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CommitteeReportsParams {
  committee_id: string;
  cycle?: number[];
  year?: number[];
  is_amended?: boolean;
  min_receipt_date?: string;
  max_receipt_date?: string;
  min_receipts_amount?: number;
  max_receipts_amount?: number;
  min_disbursements_amount?: number;
  max_disbursements_amount?: number;
  min_cash_on_hand_end_period_amount?: number;
  max_cash_on_hand_end_period_amount?: number;
  min_debts_owed_amount?: number;
  max_debts_owed_amount?: number;
  per_page?: number;
  page?: number;
}

export async function committeeReports(params: CommitteeReportsParams): Promise<string> {
  const { committee_id, is_amended } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC(
    `/committee/${encodeURIComponent(committee_id.toUpperCase())}/reports/`,
    {
      cycle: params.cycle,
      year: params.year,
      is_amended,
      most_recent: is_amended === undefined ? true : undefined,
      min_receipt_date: params.min_receipt_date,
      max_receipt_date: params.max_receipt_date,
      min_receipts_amount: params.min_receipts_amount,
      max_receipts_amount: params.max_receipts_amount,
      min_disbursements_amount: params.min_disbursements_amount,
      max_disbursements_amount: params.max_disbursements_amount,
      min_cash_on_hand_end_period_amount: params.min_cash_on_hand_end_period_amount,
      max_cash_on_hand_end_period_amount: params.max_cash_on_hand_end_period_amount,
      min_debts_owed_amount: params.min_debts_owed_amount,
      max_debts_owed_amount: params.max_debts_owed_amount,
      per_page: params.per_page ?? 20,
      page: params.page,
    }
  );
  return JSON.stringify(data, null, 2);
}

export function registerCommitteeReportsTool(server: McpServer): void {
  server.tool(
    "fec_committee_reports",
    "Get a committee's period-by-period financial reports: cash on hand, receipts, disbursements, and debts per reporting period. Defaults to only the current version of each report unless is_amended is set.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      year: z.array(z.number()).optional().describe("Calendar years"),
      is_amended: z
        .boolean()
        .optional()
        .describe("Filter to only amended (true) or only original (false) reports; omit to see only the current version of each"),
      min_receipt_date: z.string().optional().describe("YYYY-MM-DD"),
      max_receipt_date: z.string().optional().describe("YYYY-MM-DD"),
      min_receipts_amount: z.number().optional(),
      max_receipts_amount: z.number().optional(),
      min_disbursements_amount: z.number().optional(),
      max_disbursements_amount: z.number().optional(),
      min_cash_on_hand_end_period_amount: z.number().optional(),
      max_cash_on_hand_end_period_amount: z.number().optional(),
      min_debts_owed_amount: z.number().optional(),
      max_debts_owed_amount: z.number().optional(),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await committeeReports(params);
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
