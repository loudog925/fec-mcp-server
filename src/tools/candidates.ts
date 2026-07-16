import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface CandidateSearchParams {
  q?: string;
  state?: string;
  party?: string;
  office?: "H" | "S" | "P";
  cycle?: number[];
  per_page?: number;
}

export async function candidateSearch(params: CandidateSearchParams): Promise<string> {
  const { q, state, party, office, cycle, per_page } = params;
  if (!q && !state && !office && !party) {
    throw new Error(
      "Provide at least one of: q (candidate name), state, office, or party to search candidates."
    );
  }
  const data = await fetchFEC("/candidates/search/", {
    q,
    state,
    party,
    office,
    cycle,
    per_page: per_page ?? 20,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCandidateSearchTool(server: McpServer): void {
  server.tool(
    "fec_candidate_search",
    "Search federal (House, Senate, Presidential) candidates by name, state, office, or party.",
    {
      q: z.string().optional().describe("Candidate name search text"),
      state: z.string().length(2).optional().describe("Two-letter state code, e.g. CA"),
      party: z.string().optional().describe("Party code, e.g. DEM, REP"),
      office: z.enum(["H", "S", "P"]).optional().describe("H = House, S = Senate, P = President"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
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
