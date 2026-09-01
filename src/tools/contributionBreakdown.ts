import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// Confirmed live and against webservices/args.py's schedule_a_by_size validator:
// these are the only four bucket boundaries the aggregate uses.
const SIZE_BUCKETS = [0, 200, 500, 1000, 2000] as const;

export interface ContributionBreakdownParams {
  mode: "by_state" | "by_employer" | "by_occupation" | "by_size";
  committee_id: string[];
  cycle?: number[];
  state?: string[];
  employer?: string[];
  occupation?: string[];
  size?: (typeof SIZE_BUCKETS)[number][];
  hide_null?: boolean;
  per_page?: number;
  page?: number;
}

export async function contributionBreakdown(params: ContributionBreakdownParams): Promise<string> {
  const { mode, committee_id } = params;
  if (!committee_id || committee_id.length === 0) {
    throw new Error("committee_id is required, e.g. [\"C00401224\"]");
  }
  const upperCommitteeIds = committee_id.map((id) => id.toUpperCase());

  const paths: Record<ContributionBreakdownParams["mode"], string> = {
    by_state: "/schedules/schedule_a/by_state/",
    by_employer: "/schedules/schedule_a/by_employer/",
    by_occupation: "/schedules/schedule_a/by_occupation/",
    by_size: "/schedules/schedule_a/by_size/",
  };

  const data = await fetchFEC(paths[mode], {
    committee_id: upperCommitteeIds,
    cycle: params.cycle,
    state: mode === "by_state" ? params.state : undefined,
    hide_null: mode === "by_state" ? params.hide_null : undefined,
    employer: mode === "by_employer" ? params.employer : undefined,
    occupation: mode === "by_occupation" ? params.occupation : undefined,
    size: mode === "by_size" ? params.size : undefined,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerContributionBreakdownTool(server: McpServer): void {
  server.tool(
    "fec_contribution_breakdown",
    "Break a committee's itemized contributions (Schedule A) down by contributor state, " +
      "employer, occupation, or dollar-size bucket (primer §4: geographic concentration, " +
      "employer/occupation clustering, small-vs-large donor mix). Note on by_size: FEC's " +
      "$200-and-under bucket combines itemized contributions of $200 or less with " +
      "unitemized contributions — it is not the same population as the unitemized total " +
      "reported elsewhere.",
    {
      mode: z
        .enum(["by_state", "by_employer", "by_occupation", "by_size"])
        .describe("Which breakdown to return"),
      committee_id: z.array(z.string()).min(1).describe("FEC committee IDs, e.g. [\"C00401224\"]"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      state: z.array(z.string()).optional().describe("Filter to specific two-letter state codes (by_state mode only)"),
      hide_null: z.boolean().optional().describe("Omit rows with no resolvable state (by_state mode only)"),
      employer: z.array(z.string()).optional().describe("Filter to specific employer names (by_employer mode only)"),
      occupation: z.array(z.string()).optional().describe("Filter to specific occupations (by_occupation mode only)"),
      size: z
        .array(z.union([z.literal(0), z.literal(200), z.literal(500), z.literal(1000), z.literal(2000)]))
        .optional()
        .describe("Filter to specific size buckets: 0, 200, 500, 1000, or 2000 (by_size mode only)"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await contributionBreakdown(params);
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
