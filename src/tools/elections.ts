import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// FEC's /elections/ family takes the office as a full word, not the
// single-letter code used everywhere else in this API.
const OFFICE_API_FORM: Record<"H" | "S" | "P", string> = {
  H: "house",
  S: "senate",
  P: "president",
};

export interface ElectionsParams {
  mode?: "search" | "summary";
  office: "H" | "S" | "P";
  cycle: number;
  state?: string;
  district?: string;
  zip?: string;
  election_full?: boolean;
  per_page?: number;
  page?: number;
}

export async function elections(params: ElectionsParams): Promise<string> {
  const { mode = "search", office, cycle, state, district, zip } = params;

  if (cycle % 2 !== 0) {
    throw new Error(
      "cycle must be an even year — federal election cycles are two-year periods ending in even years (e.g. 2024, 2026)."
    );
  }
  if (mode === "summary" && zip) {
    throw new Error(
      "Summary mode does not support zip. Use mode \"search\" for ZIP-based lookups, or remove zip and use state/district for summary mode."
    );
  }
  if (!zip) {
    if ((office === "S" || office === "H") && !state) {
      throw new Error(
        "state is required for senate/house races unless a zip is provided."
      );
    }
    if (office === "H" && !district) {
      throw new Error(
        "district is required for house races unless a zip is provided."
      );
    }
  }

  const office_full = OFFICE_API_FORM[office];
  const election_full = params.election_full ?? true;

  if (mode === "summary") {
    const data = (await fetchFEC("/elections/summary/", {
      office: office_full,
      cycle,
      state,
      district,
      election_full,
    })) as { independent_expenditures_note?: string; [key: string]: unknown };
    // Observed live: this aggregate can be off by orders of magnitude (e.g.
    // trillions of dollars for a single race) because it double-counts
    // across overlapping reporting periods upstream. Flag it rather than
    // let callers treat it as a reliable dollar figure.
    data.independent_expenditures_note =
      "The independent_expenditures aggregate here is unreconciled upstream and may be" +
      " wildly inflated due to double-counting across reporting periods. For a verified" +
      " figure, use fec_independent_expenditures for the race's candidates instead.";
    return JSON.stringify(data, null, 2);
  }

  if (zip) {
    const data = await fetchFEC("/elections/search/", {
      office: office_full,
      cycle,
      zip,
      per_page: params.per_page ?? 20,
      page: params.page,
    });
    return JSON.stringify(data, null, 2);
  }

  const data = await fetchFEC("/elections/", {
    office: office_full,
    cycle,
    state,
    district,
    election_full,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerElectionsTool(server: McpServer): void {
  server.tool(
    "fec_elections",
    "Look up federal election races: candidates running with financial totals (mode search), or an aggregate race financial summary (mode summary). Search mode supports zip-based lookups.",
    {
      mode: z
        .enum(["search", "summary"])
        .optional()
        .describe("search = candidates in a race with totals (default). summary = aggregate race summary."),
      office: z.enum(["H", "S", "P"]).describe("Office sought: H=House, S=Senate, P=President"),
      cycle: z.number().int().describe("Election cycle year, must be even, e.g. 2024"),
      state: z.string().length(2).optional().describe("Two-letter state code; required for S/H unless zip is given"),
      district: z.string().optional().describe("Two-digit district number, e.g. \"07\"; required for H unless zip is given"),
      zip: z.string().optional().describe("ZIP code — finds the race covering this ZIP. Search mode only."),
      election_full: z
        .boolean()
        .optional()
        .describe("Expand to the full election period (4yr president, 6yr senate, 2yr house). Default true. Ignored for zip-based searches."),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await elections(params);
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
