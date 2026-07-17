import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface FilingsParams {
  candidate_id?: string;
  committee_id?: string;
  form_type?: string[];
  is_amended?: boolean;
  per_page?: number;
}

export async function filings(params: FilingsParams): Promise<string> {
  const { candidate_id, committee_id, form_type, is_amended, per_page } = params;
  if (!candidate_id && !committee_id) {
    throw new Error("Provide exactly one of candidate_id or committee_id.");
  }
  if (candidate_id && committee_id) {
    throw new Error("Provide only one of candidate_id or committee_id, not both.");
  }
  const path = candidate_id
    ? `/candidate/${encodeURIComponent(candidate_id.toUpperCase())}/filings/`
    : `/committee/${encodeURIComponent((committee_id as string).toUpperCase())}/filings/`;
  const data = await fetchFEC(path, {
    form_type: form_type ?? ["RFAI"],
    is_amended,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerFilingsTool(server: McpServer): void {
  server.tool(
    "fec_filings",
    "Get a candidate's or committee's filings, optionally filtered by form type (e.g. \"F3X\" for quarterly reports; defaults to [\"RFAI\"] for compliance/Request-for-Additional-Information checks) or amendment status.",
    {
      candidate_id: z.string().optional().describe("FEC candidate ID (provide this or committee_id, not both)"),
      committee_id: z.string().optional().describe("FEC committee ID (provide this or candidate_id, not both)"),
      form_type: z
        .array(z.string())
        .optional()
        .describe("Filing form types to filter on, e.g. [\"F3X\"]; defaults to [\"RFAI\"]"),
      is_amended: z.boolean().optional().describe("Filter to only amended (true) or only original (false) filings"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await filings(params);
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
