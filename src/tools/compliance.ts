import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface ComplianceFlagsParams {
  candidate_id?: string;
  committee_id?: string;
  request_type?: string[];
  is_amended?: boolean;
  per_page?: number;
}

export async function complianceFlags(params: ComplianceFlagsParams): Promise<string> {
  const { candidate_id, committee_id, request_type, is_amended, per_page } = params;
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
    request_type: request_type ?? ["RFAI"],
    is_amended,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerComplianceFlagsTool(server: McpServer): void {
  server.tool(
    "fec_compliance_flags",
    "Check a candidate's or committee's filings for compliance flags: RFAIs (Requests for Additional Information) by default, or amendments via is_amended.",
    {
      candidate_id: z.string().optional().describe("FEC candidate ID (provide this or committee_id, not both)"),
      committee_id: z.string().optional().describe("FEC committee ID (provide this or candidate_id, not both)"),
      request_type: z
        .array(z.string())
        .optional()
        .describe("Filing request types to filter on, defaults to [\"RFAI\"]"),
      is_amended: z.boolean().optional().describe("Filter to only amended (true) or only original (false) filings"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await complianceFlags(params);
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
