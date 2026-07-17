import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface DebtsParams {
  committee_id: string;
  creditor_debtor_name?: string;
  nature_of_debt?: string;
  report_year?: number[];
  min_payment_period?: string;
  max_payment_period?: string;
  min_amount_incurred?: number;
  max_amount_incurred?: number;
  min_amount_outstanding_beginning?: number;
  max_amount_outstanding_beginning?: number;
  min_amount_outstanding_close?: number;
  max_amount_outstanding_close?: number;
  min_coverage_start_date?: string;
  max_coverage_start_date?: string;
  min_coverage_end_date?: string;
  max_coverage_end_date?: string;
  per_page?: number;
}

export async function debts(params: DebtsParams): Promise<string> {
  const { committee_id } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC("/schedules/schedule_d/", {
    committee_id: committee_id.toUpperCase(),
    creditor_debtor_name: params.creditor_debtor_name,
    nature_of_debt: params.nature_of_debt,
    report_year: params.report_year,
    min_payment_period: params.min_payment_period,
    max_payment_period: params.max_payment_period,
    min_amount_incurred: params.min_amount_incurred,
    max_amount_incurred: params.max_amount_incurred,
    min_amount_outstanding_beginning: params.min_amount_outstanding_beginning,
    max_amount_outstanding_beginning: params.max_amount_outstanding_beginning,
    min_amount_outstanding_close: params.min_amount_outstanding_close,
    max_amount_outstanding_close: params.max_amount_outstanding_close,
    min_coverage_start_date: params.min_coverage_start_date,
    max_coverage_start_date: params.max_coverage_start_date,
    min_coverage_end_date: params.min_coverage_end_date,
    max_coverage_end_date: params.max_coverage_end_date,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerDebtsTool(server: McpServer): void {
  server.tool(
    "fec_debts",
    "Get a committee's debts and obligations (Schedule D): creditor/debtor, nature of debt, amount incurred, outstanding balance beginning/close of period.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      creditor_debtor_name: z.string().optional().describe("Creditor/debtor name search text"),
      nature_of_debt: z.string().optional().describe("Nature of debt description"),
      report_year: z.array(z.number()).optional().describe("Calendar years"),
      min_payment_period: z.string().optional().describe("YYYY-MM-DD"),
      max_payment_period: z.string().optional().describe("YYYY-MM-DD"),
      min_amount_incurred: z.number().optional(),
      max_amount_incurred: z.number().optional(),
      min_amount_outstanding_beginning: z.number().optional(),
      max_amount_outstanding_beginning: z.number().optional(),
      min_amount_outstanding_close: z.number().optional(),
      max_amount_outstanding_close: z.number().optional(),
      min_coverage_start_date: z.string().optional().describe("YYYY-MM-DD"),
      max_coverage_start_date: z.string().optional().describe("YYYY-MM-DD"),
      min_coverage_end_date: z.string().optional().describe("YYYY-MM-DD"),
      max_coverage_end_date: z.string().optional().describe("YYYY-MM-DD"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await debts(params);
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
