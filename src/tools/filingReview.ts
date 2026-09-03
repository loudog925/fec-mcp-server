import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

// OpenFEC returns some numeric fields as JSON numbers and others (inconsistently,
// even within the same report row) as numeric strings. Coerce defensively rather
// than assume either.
function num(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface ReportRow {
  report_form?: string;
  report_type?: string;
  coverage_start_date?: string;
  coverage_end_date?: string;
  cash_on_hand_beginning_period?: unknown;
  cash_on_hand_end_period?: unknown;
  total_receipts_period?: unknown;
  total_disbursements_period?: unknown;
  debts_owed_by_committee?: unknown;
  debts_owed_to_committee?: unknown;
  total_operating_expenditures_period?: unknown;
  total_loans_received_period?: unknown;
  transfers_from_other_authorized_committee_period?: unknown;
  transfers_from_affiliated_committee_period?: unknown;
  total_offsets_to_operating_expenditures_period?: unknown;
  other_receipts_period?: unknown;
  most_recent?: boolean;
  file_number?: number;
  [key: string]: unknown;
}

interface CommitteeInfo {
  name?: string;
  designation?: string;
  designation_full?: string;
  committee_type?: string;
  committee_type_full?: string;
  candidate_ids?: string[];
  [key: string]: unknown;
}

const DESIGNATION_LABELS: Record<string, string> = {
  P: "principal_campaign_committee",
  A: "other_authorized_committee",
  J: "joint_fundraising_committee",
  D: "leadership_pac",
  U: "unauthorized",
};

function daysBetween(startIso?: string, endIso?: string): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

// The primer's §3 "adjusted receipts" formula: OpenFEC has no field containing
// "adjusted" on the reports models, so this is our own construction, only valid
// for Form 3 (candidate committees) where all five component fields are
// confirmed present with these exact names. Form 3P uses different field names
// for the transfer component (transfers_from_affiliated_committee_period) and
// Form 3X's field set diverges too much (no other_receipts_period, no
// total_offsets_to_operating_expenditures_period) to safely reuse this formula,
// so both are left uncomputed rather than guessed at.
function computeFundraisingReceipts(report: ReportRow): {
  fundraising_receipts: number;
  components: Record<string, number>;
} | null {
  if (report.report_form !== "Form 3") return null;
  const components = {
    total_receipts_period: num(report.total_receipts_period),
    total_loans_received_period: num(report.total_loans_received_period),
    transfers_from_other_authorized_committee_period: num(
      report.transfers_from_other_authorized_committee_period
    ),
    total_offsets_to_operating_expenditures_period: num(
      report.total_offsets_to_operating_expenditures_period
    ),
    other_receipts_period: num(report.other_receipts_period),
  };
  const fundraising_receipts =
    components.total_receipts_period -
    components.total_loans_received_period -
    components.transfers_from_other_authorized_committee_period -
    components.total_offsets_to_operating_expenditures_period -
    components.other_receipts_period;
  return { fundraising_receipts, components };
}

interface ReportSummary {
  report_type?: string;
  coverage_start_date?: string;
  coverage_end_date?: string;
  coverage_days: number | null;
  cash_on_hand_beginning_period: number;
  cash_on_hand_end_period: number;
  total_receipts_period: number;
  total_disbursements_period: number;
  debts_owed_by_committee: number;
  debts_owed_to_committee: number;
  effective_cash_position: number;
  headline_burn_rate: number | null;
  cash_accumulation: number;
  receipts_per_day: number | null;
  disbursements_per_day: number | null;
  fundraising: {
    label: string;
    fundraising_receipts: number;
    components: Record<string, number>;
    operating_burn_rate: number | null;
  } | null;
}

function summarizeReport(report: ReportRow): ReportSummary {
  const cashBeginning = num(report.cash_on_hand_beginning_period);
  const cashEnd = num(report.cash_on_hand_end_period);
  const receipts = num(report.total_receipts_period);
  const disbursements = num(report.total_disbursements_period);
  const debtsOwedBy = num(report.debts_owed_by_committee);
  const debtsOwedTo = num(report.debts_owed_to_committee);
  const operatingExpenditures = num(report.total_operating_expenditures_period);

  const fundraisingResult = computeFundraisingReceipts(report);
  const fundraising = fundraisingResult
    ? {
        label:
          "Not an FEC-reported figure — this tool's own formula (total receipts minus " +
          "loans, inter-committee transfers, offsets to operating expenditures, and " +
          "other receipts), valid for Form 3 only.",
        fundraising_receipts: fundraisingResult.fundraising_receipts,
        components: fundraisingResult.components,
        operating_burn_rate:
          fundraisingResult.fundraising_receipts !== 0
            ? operatingExpenditures / fundraisingResult.fundraising_receipts
            : null,
      }
    : null;

  const coverageDays = daysBetween(report.coverage_start_date, report.coverage_end_date);

  return {
    report_type: report.report_type,
    coverage_start_date: report.coverage_start_date,
    coverage_end_date: report.coverage_end_date,
    coverage_days: coverageDays,
    cash_on_hand_beginning_period: cashBeginning,
    cash_on_hand_end_period: cashEnd,
    total_receipts_period: receipts,
    total_disbursements_period: disbursements,
    debts_owed_by_committee: debtsOwedBy,
    debts_owed_to_committee: debtsOwedTo,
    effective_cash_position: cashEnd - debtsOwedBy,
    headline_burn_rate: receipts !== 0 ? disbursements / receipts : null,
    cash_accumulation: cashEnd - cashBeginning,
    // Normalizes for comparing periods of different lengths (e.g. a 12-day
    // pre-primary report against a full quarter) -- see period_length_mismatch
    // on the change table below, which flags exactly when this matters.
    receipts_per_day: coverageDays ? receipts / coverageDays : null,
    disbursements_per_day: coverageDays ? disbursements / coverageDays : null,
    fundraising,
  };
}

interface ChangeTableRow {
  from_report_type?: string;
  from_coverage_end_date?: string;
  to_report_type?: string;
  to_coverage_end_date?: string;
  receipts_change: number;
  disbursements_change: number;
  cash_on_hand_end_change: number;
  debts_owed_by_committee_change: number;
  coverage_days_from: number | null;
  coverage_days_to: number | null;
  period_length_mismatch: boolean;
}

function diffConsecutive(newer: ReportSummary, older: ReportSummary): ChangeTableRow {
  const daysFrom = older.coverage_days;
  const daysTo = newer.coverage_days;
  let periodLengthMismatch = false;
  if (daysFrom && daysTo) {
    const ratio = Math.max(daysFrom, daysTo) / Math.min(daysFrom, daysTo);
    periodLengthMismatch = ratio >= 1.5;
  }
  return {
    from_report_type: older.report_type,
    from_coverage_end_date: older.coverage_end_date,
    to_report_type: newer.report_type,
    to_coverage_end_date: newer.coverage_end_date,
    receipts_change: newer.total_receipts_period - older.total_receipts_period,
    disbursements_change: newer.total_disbursements_period - older.total_disbursements_period,
    cash_on_hand_end_change: newer.cash_on_hand_end_period - older.cash_on_hand_end_period,
    debts_owed_by_committee_change:
      newer.debts_owed_by_committee - older.debts_owed_by_committee,
    coverage_days_from: daysFrom,
    coverage_days_to: daysTo,
    period_length_mismatch: periodLengthMismatch,
  };
}

interface EcosystemEntry {
  committee_id?: string;
  name?: string;
  designation?: string;
}

async function fetchEcosystem(candidateIds: string[]): Promise<Record<string, EcosystemEntry[]>> {
  const data = (await fetchFEC("/committees/", {
    candidate_id: candidateIds.map((id) => id.toUpperCase()),
    per_page: 100,
  })) as { results?: Array<{ committee_id?: string; name?: string; designation?: string }> };

  const buckets: Record<string, EcosystemEntry[]> = {};
  for (const row of data.results ?? []) {
    const key = DESIGNATION_LABELS[row.designation ?? ""] ?? `designation_${row.designation ?? "unknown"}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({ committee_id: row.committee_id, name: row.name, designation: row.designation });
  }
  return buckets;
}

interface PrimaryGuardResult {
  candidate_id: string;
  office?: string;
  state?: string;
  primary_election_date?: string;
  report_coverage_end_date?: string;
  status: "pre-primary" | "post-primary" | "unknown";
}

// §15's "has the primary already happened" check. Only attempted for a
// principal campaign committee (designation P) tied to exactly one candidate —
// with more than one candidate_id or a non-P designation there's no single
// unambiguous race to check against.
async function checkPrimaryTiming(
  committee: CommitteeInfo,
  latest: ReportSummary
): Promise<PrimaryGuardResult | null> {
  if (committee.designation !== "P") return null;
  const candidateIds = committee.candidate_ids ?? [];
  if (candidateIds.length !== 1) return null;
  const candidateId = candidateIds[0];

  const candidateData = (await fetchFEC(`/candidate/${encodeURIComponent(candidateId)}/`)) as {
    results?: Array<{ office?: string; state?: string }>;
  };
  const candidate = candidateData.results?.[0];
  if (!candidate?.office) return null;

  const coverageYear = latest.coverage_end_date
    ? new Date(latest.coverage_end_date).getUTCFullYear()
    : undefined;
  const electionYear = coverageYear !== undefined && coverageYear % 2 !== 0 ? coverageYear + 1 : coverageYear;

  const electionData = (await fetchFEC("/election-dates/", {
    election_state: candidate.state,
    office_sought: candidate.office,
    election_year: electionYear,
    per_page: 20,
  })) as { results?: Array<{ election_date?: string; election_type_full?: string }> };

  const primaryRow = electionData.results?.find((r) =>
    /primary/i.test(r.election_type_full ?? "")
  );
  if (!primaryRow?.election_date) return null;

  const primaryDate = primaryRow.election_date.slice(0, 10);
  let status: PrimaryGuardResult["status"] = "unknown";
  if (latest.coverage_end_date) {
    status = latest.coverage_end_date.slice(0, 10) >= primaryDate ? "post-primary" : "pre-primary";
  }

  return {
    candidate_id: candidateId,
    office: candidate.office,
    state: candidate.state,
    primary_election_date: primaryDate,
    report_coverage_end_date: latest.coverage_end_date,
    status,
  };
}

export interface FilingReviewParams {
  committee_id: string;
  cycle?: number[];
  reports_to_compare?: number;
}

export async function filingReview(params: FilingReviewParams): Promise<string> {
  const { committee_id } = params;
  if (!committee_id || !committee_id.trim()) {
    throw new Error("committee_id is required, e.g. C00401224");
  }
  const upperCommitteeId = committee_id.toUpperCase();
  const reportsToCompare = Math.min(Math.max(params.reports_to_compare ?? 3, 2), 6);

  const committeeData = (await fetchFEC(`/committee/${encodeURIComponent(upperCommitteeId)}/`, {
    cycle: params.cycle,
  })) as { results?: CommitteeInfo[] };
  const committee = committeeData.results?.[0];
  if (!committee) {
    throw new Error(`No committee found for ${upperCommitteeId}.`);
  }

  const reportsData = (await fetchFEC(`/committee/${encodeURIComponent(upperCommitteeId)}/reports/`, {
    cycle: params.cycle,
    most_recent: true,
    sort: "-coverage_end_date",
    per_page: 100,
  })) as { results?: ReportRow[] };

  // See src/tools/committeeReports.ts: most_recent=true is not honored
  // server-side, so filter client-side on each row's own flag.
  const currentReports = (reportsData.results ?? [])
    .filter((r) => r.most_recent !== false)
    .sort((a, b) => (b.coverage_end_date ?? "").localeCompare(a.coverage_end_date ?? ""))
    .slice(0, reportsToCompare);

  if (currentReports.length === 0) {
    return JSON.stringify(
      {
        committee: { committee_id: upperCommitteeId, name: committee.name },
        message: "No reports found for this committee" + (params.cycle ? " in the given cycle." : "."),
      },
      null,
      2
    );
  }

  const summaries = currentReports.map(summarizeReport);
  const latest = summaries[0];

  const changeTable: ChangeTableRow[] = [];
  for (let i = 0; i < summaries.length - 1; i++) {
    changeTable.push(diffConsecutive(summaries[i], summaries[i + 1]));
  }

  let ecosystem: Record<string, EcosystemEntry[]> | null = null;
  if (committee.candidate_ids && committee.candidate_ids.length > 0) {
    try {
      ecosystem = await fetchEcosystem(committee.candidate_ids);
    } catch {
      ecosystem = null;
    }
  }

  let primaryTiming: PrimaryGuardResult | null = null;
  try {
    primaryTiming = await checkPrimaryTiming(committee, latest);
  } catch {
    primaryTiming = null;
  }

  // Lead with what kind of committee this is, always — the designation/type
  // determines which of the checks below even apply, and burying that as an
  // aside (rather than the frame for everything else) is a common analysis
  // error in itself.
  const caveats: string[] = [
    `This is a ${committee.committee_type_full ?? committee.committee_type ?? "committee"} ` +
      `(${committee.designation_full ?? committee.designation ?? "designation unknown"}).` +
      (committee.designation !== "P"
        ? " Ecosystem and primary-timing checks only apply to principal campaign " +
          "committees, so both are skipped below."
        : ""),
  ];
  if (latest.fundraising) {
    caveats.push(
      "fundraising_receipts and operating_burn_rate are this tool's own formula, not " +
        "an FEC-reported figure — see the fundraising.label field on each report summary."
    );
  }
  if (changeTable.some((row) => row.period_length_mismatch)) {
    caveats.push(
      "Some compared periods differ substantially in length (coverage_days) — burn " +
        "rate comparisons across them are not directly comparable without normalizing per day."
    );
  }
  if (primaryTiming) {
    caveats.push(
      `As of this report's coverage_end_date, the primary election is ${primaryTiming.status}` +
        ` (primary date: ${primaryTiming.primary_election_date}) — comparing this committee` +
        " against an opponent from the wrong stage of the race is a common analysis error."
    );
  }

  return JSON.stringify(
    {
      committee: {
        committee_id: upperCommitteeId,
        name: committee.name,
        designation: committee.designation,
        designation_full: committee.designation_full,
        committee_type: committee.committee_type,
        committee_type_full: committee.committee_type_full,
        candidate_ids: committee.candidate_ids,
      },
      report_form: currentReports[0].report_form,
      reports: summaries,
      change_table: changeTable,
      ecosystem,
      primary_timing_guard: primaryTiming,
      caveats,
    },
    null,
    2
  );
}

export function registerFilingReviewTool(server: McpServer): void {
  server.tool(
    "fec_filing_review",
    "Run a structured 'first 15 minutes' review of a committee's most recent FEC filing: " +
      "the seven summary numbers (cash, receipts, disbursements, debt, effective cash " +
      "position) plus receipts/disbursements per day of the coverage period (for " +
      "comparing periods of different lengths, e.g. a 12-day pre-primary report vs. a " +
      "full quarter), a change table against prior reports, the candidate's committee " +
      "ecosystem (JFCs/leadership PAC/other authorized committees), and — for principal " +
      "campaign committees — a check on whether the primary election has already " +
      "happened as of this report. Returns structured evidence and caveats for the " +
      "calling model to synthesize into a narrative; it does not write the narrative itself.",
    {
      committee_id: z.string().min(1).describe("FEC committee ID, e.g. C00401224"),
      cycle: z.array(z.number()).optional().describe("Two-year election cycles, e.g. [2026]"),
      reports_to_compare: z
        .number()
        .min(2)
        .max(6)
        .optional()
        .describe("How many of the most recent reports to include in the change table (default 3)"),
    },
    async (params) => {
      try {
        const text = await filingReview(params);
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
