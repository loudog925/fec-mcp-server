import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// Confirmed live and against webservices/args.py's schedule_a_by_size validator:
// these are the only five bucket boundaries the aggregate uses. Per docs.py's SIZE
// field: 0 = "$200 and under" (includes unitemized), 200 = "$200.01-499.99",
// 500 = "$500-999.99", 1000 = "$1000-1999.99", 2000 = "$2000+".
const SIZE_BUCKETS = [0, 200, 500, 1000, 2000] as const;

function num(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface SizeRow {
  committee_id?: string;
  cycle?: number;
  size?: number;
  total?: unknown;
  [key: string]: unknown;
}

// "Grassroots share" and "large-dollar share" are a distinct, binary cut from the
// five raw buckets -- the recurring question is small-dollar vs. large-dollar, not
// "what's the $500-999.99 share." Grassroots = FEC's own $200-and-under bucket
// (already includes unitemized, per docs.py). Large-dollar = the $2000+ bucket.
//
// Caveat that has to travel with large_dollar_share: the $2000+ bucket is a fixed
// reporting-threshold artifact, not "maxed out to the legal limit" -- the actual
// per-election individual limit is $3,500 for the 2025-2026 cycle ($7,000/cycle
// across primary + general). This is a proxy for "not itemized-small," not a claim
// about reliance on donors at their legal cap -- see implementing-the-primer.md §4.
function summarizeSizeProfile(rows: SizeRow[]): Array<{
  committee_id?: string;
  cycle?: number;
  total: number;
  grassroots_total: number;
  grassroots_share: number | null;
  large_dollar_total: number;
  large_dollar_share: number | null;
}> {
  const groups = new Map<
    string,
    { committee_id?: string; cycle?: number; total: number; grassroots_total: number; large_dollar_total: number }
  >();
  for (const row of rows) {
    const key = `${row.committee_id ?? ""}::${row.cycle ?? ""}`;
    const entry =
      groups.get(key) ??
      { committee_id: row.committee_id, cycle: row.cycle, total: 0, grassroots_total: 0, large_dollar_total: 0 };
    const amount = num(row.total);
    entry.total += amount;
    if (row.size === 0) entry.grassroots_total += amount;
    if (row.size === 2000) entry.large_dollar_total += amount;
    groups.set(key, entry);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    grassroots_share: g.total !== 0 ? g.grassroots_total / g.total : null,
    large_dollar_share: g.total !== 0 ? g.large_dollar_total / g.total : null,
  }));
}

interface StateRow {
  committee_id?: string;
  cycle?: number;
  state?: string;
  total?: unknown;
  [key: string]: unknown;
}

// The recurring question for by_state is usually binary -- how much is home-state
// vs. everywhere-else money -- not the full per-state table. Deliberately not
// inferred from the committee's own registered address (committee.state): that's a
// compliance-firm mailing address which can differ from the race's actual state
// (particularly for House seats, where district matters too), so this only computes
// anything when the caller supplies home_state explicitly -- e.g. from a candidate
// lookup's office/state fields, which is the semantically correct source.
function summarizeGeography(
  rows: StateRow[],
  homeState: string
): Array<{
  committee_id?: string;
  cycle?: number;
  total: number;
  in_state_total: number;
  in_state_share: number | null;
  out_of_state_total: number;
  out_of_state_share: number | null;
}> {
  const upperHomeState = homeState.toUpperCase();
  const groups = new Map<
    string,
    { committee_id?: string; cycle?: number; total: number; in_state_total: number; out_of_state_total: number }
  >();
  for (const row of rows) {
    const key = `${row.committee_id ?? ""}::${row.cycle ?? ""}`;
    const entry =
      groups.get(key) ??
      { committee_id: row.committee_id, cycle: row.cycle, total: 0, in_state_total: 0, out_of_state_total: 0 };
    const amount = num(row.total);
    entry.total += amount;
    if ((row.state ?? "").toUpperCase() === upperHomeState) entry.in_state_total += amount;
    else entry.out_of_state_total += amount;
    groups.set(key, entry);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    in_state_share: g.total !== 0 ? g.in_state_total / g.total : null,
    out_of_state_share: g.total !== 0 ? g.out_of_state_total / g.total : null,
  }));
}

export interface ContributionBreakdownParams {
  mode: "by_state" | "by_employer" | "by_occupation" | "by_size";
  committee_id: string[];
  cycle?: number[];
  state?: string[];
  home_state?: string;
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

  if (mode === "by_size") {
    const typed = data as { results?: SizeRow[] };
    const size_profile_by_group = summarizeSizeProfile(typed.results ?? []);
    return JSON.stringify({ ...typed, size_profile_by_group }, null, 2);
  }
  if (mode === "by_state" && params.home_state) {
    const typed = data as { results?: StateRow[] };
    const geographic_summary_by_group = summarizeGeography(typed.results ?? [], params.home_state);
    return JSON.stringify({ ...typed, geographic_summary_by_group }, null, 2);
  }
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
      "reported elsewhere. by_size mode also returns size_profile_by_group: a " +
      "grassroots_share (that $200-and-under bucket) and large_dollar_share (the " +
      "$2000+ bucket) per committee/cycle. large_dollar_share is a proxy for " +
      "\"not itemized-small,\" not a claim about donors at their legal contribution " +
      "cap — the 2025-2026 per-election individual limit is $3,500 ($7,000/cycle " +
      "across primary and general), which this tool cannot check without paging " +
      "raw Schedule A rows by contributor. by_state mode returns " +
      "geographic_summary_by_group (in_state vs. out_of_state totals/shares) when " +
      "home_state is supplied — deliberately not inferred from the committee's own " +
      "registered address, since a compliance firm's mailing address can differ from " +
      "the race's actual state; pass the candidate's office state instead. Only pass " +
      "home_state for a candidate committee (designation P or A) — for a PAC, party " +
      "committee, or other unauthorized committee there is no \"home state\" a donor " +
      "can meaningfully be in- or out-of-state relative to, so leave it unset and use " +
      "the raw by_state breakdown instead.",
    {
      mode: z
        .enum(["by_state", "by_employer", "by_occupation", "by_size"])
        .describe("Which breakdown to return"),
      committee_id: z.array(z.string()).min(1).describe("FEC committee IDs, e.g. [\"C00401224\"]"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      state: z.array(z.string()).optional().describe("Filter to specific two-letter state codes (by_state mode only)"),
      home_state: z
        .string()
        .length(2)
        .optional()
        .describe(
          "The candidate's office state (by_state mode only). When supplied, adds " +
            "geographic_summary_by_group: in-state vs. out-of-state totals and shares. Only " +
            "meaningful for a candidate committee (designation P or A) — leave unset for PACs, " +
            "party committees, and other unauthorized committees, which have no race-tied home state."
        ),
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
