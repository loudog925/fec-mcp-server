import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// The full, validated value list from webservices/args.py's disbursment_purpose_list —
// broader than what a live sample of a handful of committees turned up (that sample
// missed POLLING). Coarser than the primer's 11 functional categories; a rules-based
// split into finer buckets (Digital vs Media, Field vs Payroll) is not built here.
const PURPOSE_CATEGORIES = [
  "ADMINISTRATIVE",
  "ADVERTISING",
  "CONTRIBUTIONS",
  "EVENTS",
  "FUNDRAISING",
  "LOAN-REPAYMENTS",
  "MATERIALS",
  "OTHER",
  "POLLING",
  "REFUNDS",
  "TRANSFERS",
  "TRAVEL",
] as const;

export interface SpendingBreakdownParams {
  mode: "by_purpose" | "by_recipient";
  committee_id: string[];
  cycle?: number[];
  purpose?: (typeof PURPOSE_CATEGORIES)[number][];
  recipient_name?: string[];
  per_page?: number;
  page?: number;
}

interface PurposeRow {
  committee_id?: string;
  cycle?: number;
  purpose?: string;
  total?: unknown;
  [key: string]: unknown;
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// The primer's Layer 3 requirement (implementing-the-primer.md §0.3): report the
// unclassified share as a first-class number rather than let it hide inside "OTHER".
// Only meaningful per (committee_id, cycle) group, and only complete if the response
// wasn't truncated by paging — by_purpose has at most 12 possible categories, so the
// default per_page comfortably covers one group, but a caller who filters to specific
// committee_ids/cycles across many groups should watch pagination.count.
function summarizeUnclassifiedShare(rows: PurposeRow[]): Array<{
  committee_id?: string;
  cycle?: number;
  total: number;
  other_total: number;
  unclassified_share: number | null;
}> {
  const groups = new Map<string, { committee_id?: string; cycle?: number; total: number; other_total: number }>();
  for (const row of rows) {
    const key = `${row.committee_id ?? ""}::${row.cycle ?? ""}`;
    const entry = groups.get(key) ?? { committee_id: row.committee_id, cycle: row.cycle, total: 0, other_total: 0 };
    const amount = num(row.total);
    entry.total += amount;
    if (row.purpose === "OTHER") entry.other_total += amount;
    groups.set(key, entry);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    unclassified_share: g.total !== 0 ? g.other_total / g.total : null,
  }));
}

export async function spendingBreakdown(params: SpendingBreakdownParams): Promise<string> {
  const { mode, committee_id } = params;
  if (!committee_id || committee_id.length === 0) {
    throw new Error("committee_id is required, e.g. [\"C00401224\"]");
  }
  const upperCommitteeIds = committee_id.map((id) => id.toUpperCase());

  if (mode === "by_purpose") {
    const data = (await fetchFEC("/schedules/schedule_b/by_purpose/", {
      committee_id: upperCommitteeIds,
      cycle: params.cycle,
      purpose: params.purpose,
      per_page: params.per_page ?? 20,
      page: params.page,
    })) as { results?: PurposeRow[] };
    const unclassified_share_by_group = summarizeUnclassifiedShare(data.results ?? []);
    return JSON.stringify({ ...data, unclassified_share_by_group }, null, 2);
  }

  const data = await fetchFEC("/schedules/schedule_b/by_recipient/", {
    committee_id: upperCommitteeIds,
    cycle: params.cycle,
    recipient_name: params.recipient_name,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerSpendingBreakdownTool(server: McpServer): void {
  server.tool(
    "fec_spending_breakdown",
    "Break a committee's itemized disbursements (Schedule B) down by FEC's functional " +
      "purpose category (memo-safe — excludes memo-coded pass-through rows) or by " +
      "recipient/vendor (primer §6 and §7). by_purpose mode also returns " +
      "unclassified_share_by_group: the share of spending FEC's own OTHER bucket " +
      "doesn't classify, per committee/cycle, so it's a visible number rather than " +
      "hidden inside a category breakdown. by_recipient mode includes each recipient's " +
      "share of the committee's total disbursements, and separately reports the memo " +
      "total beneath each payee (useful for spotting a parent payee whose category " +
      "shouldn't be trusted because memo-coded sub-vendors sit underneath it).",
    {
      mode: z.enum(["by_purpose", "by_recipient"]).describe("Which breakdown to return"),
      committee_id: z.array(z.string()).min(1).describe("FEC committee IDs, e.g. [\"C00401224\"]"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2024]"),
      purpose: z
        .array(z.enum(PURPOSE_CATEGORIES))
        .optional()
        .describe("Filter to specific purpose categories (by_purpose mode only)"),
      recipient_name: z
        .array(z.string())
        .optional()
        .describe("Filter to specific recipient/vendor names (by_recipient mode only)"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await spendingBreakdown(params);
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
