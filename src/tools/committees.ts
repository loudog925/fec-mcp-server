import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CommitteeSearchParams {
  q?: string;
  committee_id?: string[];
  candidate_id?: string[];
  state?: string;
  party?: string;
  committee_type?: string;
  designation?: string;
  organization_type?: string;
  cycle?: number[];
  treasurer_name?: string;
  per_page?: number;
}

export async function committeeSearch(params: CommitteeSearchParams): Promise<string> {
  const { q, committee_id, candidate_id, state, party } = params;
  const hasCommitteeId = committee_id && committee_id.length > 0;
  const hasCandidateId = candidate_id && candidate_id.length > 0;
  if (!q && !hasCommitteeId && !hasCandidateId && !state && !party) {
    throw new Error(
      "Provide at least one of: q (committee name), committee_id, candidate_id, state, or party to search committees."
    );
  }
  const data = await fetchFEC("/committees/", {
    q,
    committee_id: committee_id?.map((id) => id.toUpperCase()),
    candidate_id: candidate_id?.map((id) => id.toUpperCase()),
    state,
    party,
    committee_type: params.committee_type,
    designation: params.designation,
    organization_type: params.organization_type,
    cycle: params.cycle,
    treasurer_name: params.treasurer_name,
    per_page: params.per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCommitteeSearchTool(server: McpServer): void {
  server.tool(
    "fec_committee_search",
    "Search FEC committees by name, ID, affiliated candidate, state, party, type, or designation. Also serves as a single-committee lookup by passing committee_id directly.",
    {
      q: z.string().optional().describe("Committee name search text"),
      committee_id: z.array(z.string()).optional().describe("FEC committee IDs, e.g. [\"C00401224\"]"),
      candidate_id: z.array(z.string()).optional().describe("Find committees affiliated with these FEC candidate IDs"),
      state: z.string().length(2).optional().describe("Two-letter state code"),
      party: z.string().optional().describe("Party code, e.g. DEM, REP"),
      committee_type: z.string().optional().describe("FEC committee type code"),
      designation: z.string().optional().describe("FEC designation code"),
      organization_type: z.string().optional().describe("FEC organization type code"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      treasurer_name: z.string().optional().describe("Treasurer name search text"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
    },
    async (params) => {
      try {
        const text = await committeeSearch(params);
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
