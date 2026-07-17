import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CandidateSearchParams {
  q?: string;
  candidate_id?: string[];
  state?: string;
  party?: string;
  office?: "H" | "S" | "P";
  cycle?: number[];
  per_page?: number;
  page?: number;
}

export async function candidateSearch(params: CandidateSearchParams): Promise<string> {
  const { q, candidate_id, state, party, office, cycle, per_page, page } = params;
  const hasCandidateId = candidate_id && candidate_id.length > 0;
  if (!q && !hasCandidateId && !state && !office && !party) {
    throw new Error(
      "Provide at least one of: q (candidate name), candidate_id, state, office, or party to search candidates."
    );
  }
  if (candidate_id && candidate_id.length === 1 && !q && !state && !office && !party) {
    // The /candidates/search/ list endpoint returns the same summary fields
    // regardless of filters — only the singular /candidate/{id}/ detail
    // endpoint includes richer fields like candidate_status, active_through,
    // incumbent_challenge, and election_years.
    const data = await fetchFEC(
      `/candidate/${encodeURIComponent(candidate_id[0].toUpperCase())}/`,
      { cycle }
    );
    return JSON.stringify(data, null, 2);
  }
  const data = await fetchFEC("/candidates/search/", {
    q,
    candidate_id: candidate_id?.map((id) => id.toUpperCase()),
    state,
    party,
    office,
    cycle,
    per_page: per_page ?? 20,
    page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCandidateSearchTool(server: McpServer): void {
  server.tool(
    "fec_candidate_search",
    "Search federal (House, Senate, Presidential) candidates by name, state, office, or party. Passing a single candidate_id does a direct lookup with richer detail (status, incumbent/challenger, active_through, election_years) than the list search returns.",
    {
      q: z.string().optional().describe("Candidate name search text"),
      candidate_id: z.array(z.string()).optional().describe("FEC candidate IDs, e.g. [\"S0GA00559\"]"),
      state: z.string().length(2).optional().describe("Two-letter state code, e.g. CA"),
      party: z.string().optional().describe("Party code, e.g. DEM, REP"),
      office: z.enum(["H", "S", "P"]).optional().describe("H = House, S = Senate, P = President"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await candidateSearch(params);
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
