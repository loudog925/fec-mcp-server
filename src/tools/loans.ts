import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface LoansParams {
  committee_id: string;
  candidate_name?: string;
  loan_source_name?: string;
  min_incurred_date?: string;
  max_incurred_date?: string;
  min_amount?: number;
  max_amount?: number;
  min_payment_to_date?: string;
  max_payment_to_date?: string;
  per_page?: number;
}

export async function loans(params: LoansParams): Promise<string> {
  const { committee_id } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const data = await fetchFEC("/schedules/schedule_c/", {
    committee_id: committee_id.toUpperCase(),
    candidate_name: params.candidate_name,
    loan_source_name: params.loan_source_name,
    min_incurred_date: params.min_incurred_date,
    max_incurred_date: params.max_incurred_date,
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    min_payment_to_date: params.min_payment_to_date,
    max_payment_to_date: params.max_payment_to_date,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerLoansTool(server: McpServer): void {
  server.tool(
    "fec_loans",
    "Get a committee's loans, endorsements, and loan guarantees (Schedule C): loan source, original amount, incurred/payment dates.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      candidate_name: z.string().optional().describe("Candidate name search text"),
      loan_source_name: z.string().optional().describe("Loan source/lender name search text"),
      min_incurred_date: z.string().optional().describe("YYYY-MM-DD"),
      max_incurred_date: z.string().optional().describe("YYYY-MM-DD"),
      min_amount: z.number().optional().describe("Minimum original loan amount"),
      max_amount: z.number().optional().describe("Maximum original loan amount"),
      min_payment_to_date: z.string().optional().describe("YYYY-MM-DD"),
      max_payment_to_date: z.string().optional().describe("YYYY-MM-DD"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await loans(params);
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
