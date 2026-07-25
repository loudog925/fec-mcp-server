import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

const CATEGORY_IDS = [
  "20", "21", "22", "23", "24", "25", "26", "27", "28", "29",
  "32", "33", "34", "36", "37", "38", "39", "40",
] as const;

export interface CalendarParams {
  mode?: "events" | "filing_deadlines" | "election_dates";
  state?: string;
  office?: "H" | "S" | "P";
  report_type?: string;
  report_year?: number;
  category?: (typeof CATEGORY_IDS)[number];
  election_year?: number;
  description?: string;
  min_date?: string;
  max_date?: string;
  per_page?: number;
  page?: number;
}

export async function calendar(params: CalendarParams): Promise<string> {
  const mode = params.mode ?? "events";
  const per_page = params.per_page ?? 20;
  const page = params.page;

  if (mode === "filing_deadlines") {
    const data = await fetchFEC("/reporting-dates/", {
      min_due_date: params.min_date,
      max_due_date: params.max_date,
      report_type: params.report_type,
      report_year: params.report_year,
      per_page,
      page,
    });
    return JSON.stringify(data, null, 2);
  }

  if (mode === "election_dates") {
    const data = await fetchFEC("/election-dates/", {
      min_election_date: params.min_date,
      max_election_date: params.max_date,
      election_state: params.state,
      office_sought: params.office,
      election_year: params.election_year,
      per_page,
      page,
    });
    return JSON.stringify(data, null, 2);
  }

  const data = await fetchFEC("/calendar-dates/", {
    min_start_date: params.min_date,
    max_start_date: params.max_date,
    description: params.description,
    calendar_category_id: params.category,
    per_page,
    page,
  });
  return JSON.stringify(data, null, 2);
}

export function registerCalendarTool(server: McpServer): void {
  server.tool(
    "fec_calendar",
    "Look up FEC calendar events (mode events), report filing deadlines (mode filing_deadlines), or election dates (mode election_dates).",
    {
      mode: z
        .enum(["events", "filing_deadlines", "election_dates"])
        .optional()
        .describe("events = FEC calendar events (default). filing_deadlines = report due dates. election_dates = upcoming/past elections."),
      state: z.string().length(2).optional().describe("Two-letter state code. election_dates mode."),
      office: z.enum(["H", "S", "P"]).optional().describe("Office sought. election_dates mode."),
      report_type: z.string().optional().describe("Report type code (e.g. \"Q1\", \"Q2\"). filing_deadlines mode."),
      report_year: z.number().int().optional().describe("Report year. filing_deadlines mode."),
      category: z
        .enum(CATEGORY_IDS)
        .optional()
        .describe(
          "Calendar category ID. events mode. 20=Commission Meetings, 21=Reporting Deadlines, 22=Conferences and Outreach, 23=AOs and Rules, 24=Other, 25=Quarterly, 26=Monthly, 27=Pre and Post-Elections, 28=EC Periods, 29=IE Periods, 32=Open Meetings, 33=Conferences, 34=Roundtables, 36=Election Dates, 37=Federal Holidays, 38=FEA Periods, 39=Executive Sessions, 40=Public Hearings."
        ),
      election_year: z.number().int().optional().describe("Election year. election_dates mode."),
      description: z.string().optional().describe("Full-text event description search. events mode."),
      min_date: z.string().optional().describe("Earliest date, YYYY-MM-DD"),
      max_date: z.string().optional().describe("Latest date, YYYY-MM-DD"),
      per_page: z.number().min(1).max(100).optional().describe("Results per page (default 20)"),
      page: z.number().min(1).optional().describe("Page number for results beyond the first (default 1)"),
    },
    async (params) => {
      try {
        const text = await calendar(params);
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
