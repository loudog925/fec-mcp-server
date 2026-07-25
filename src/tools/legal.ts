import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFEC } from "../fecClient.js";

export interface LegalSearchParams {
  query?: string;
  type?: "advisory_opinions" | "murs" | "adrs" | "admin_fines" | "statutes";
  ao_number?: string;
  case_number?: string;
  respondent?: string;
  regulatory_citation?: string;
  statutory_citation?: string;
  min_penalty_amount?: number;
  max_penalty_amount?: number;
  min_date?: string;
  max_date?: string;
  from_hit?: number;
  hits_returned?: number;
}

interface LegalDoc {
  highlights?: unknown[];
  document_highlights?: unknown;
  documents?: Array<Record<string, unknown>>;
  document_count?: number;
  document_categories?: unknown[];
  commission_votes?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// Raw legal documents can carry full highlight/document/vote arrays that
// blow past 100KB per record — trim them down to what's actually useful
// before returning, so a handful of results don't blow out the context window.
function trimLegalDoc(doc: LegalDoc): LegalDoc {
  const d: LegalDoc = { ...doc };

  if (Array.isArray(d.highlights) && d.highlights.length > 3) {
    d.highlights = d.highlights.slice(0, 3);
  }
  delete d.document_highlights;

  if (Array.isArray(d.documents) && d.documents.length > 0) {
    const categories = [...new Set(d.documents.map((doc2) => doc2.category).filter(Boolean))];
    d.document_count = d.documents.length;
    d.document_categories = categories;
    delete d.documents;
  }

  if (Array.isArray(d.commission_votes) && d.commission_votes.length > 0) {
    d.commission_votes = d.commission_votes.map((v) => ({
      vote_date: v.vote_date,
      action: typeof v.action === "string" ? v.action.slice(0, 200) : v.action,
    }));
  }

  return d;
}

// Unlike every other FEC endpoint this server wraps, /legal/search/ does NOT
// return {results: [...]}. It returns a per-type envelope —
// {advisory_opinions: [...], murs: [...], adrs: [...], admin_fines: [...],
// statutes: [...], total_all, total_<type>} — since a query can span multiple
// document types at once. Flatten it into a single tagged list so callers get
// a consistent shape.
interface LegalSearchEnvelope {
  advisory_opinions?: LegalDoc[];
  murs?: LegalDoc[];
  adrs?: LegalDoc[];
  admin_fines?: LegalDoc[];
  statutes?: LegalDoc[];
  total_all?: number;
  [key: string]: unknown;
}

const DOCUMENT_TYPE_KEYS: Array<[keyof LegalSearchEnvelope, string]> = [
  ["advisory_opinions", "advisory_opinion"],
  ["murs", "mur"],
  ["adrs", "adr"],
  ["admin_fines", "admin_fine"],
  ["statutes", "statute"],
];

export async function legalSearch(params: LegalSearchParams): Promise<string> {
  const hasFilter =
    params.query ||
    params.type ||
    params.ao_number ||
    params.case_number ||
    params.respondent ||
    params.regulatory_citation ||
    params.statutory_citation;
  if (!hasFilter) {
    throw new Error(
      "Provide at least query, type, ao_number, case_number, respondent, regulatory_citation, or statutory_citation to search legal documents."
    );
  }

  const envelope = (await fetchFEC("/legal/search/", {
    q: params.query,
    type: params.type,
    ao_no: params.ao_number,
    case_no: params.case_number,
    case_respondents: params.respondent,
    ao_regulatory_citation: params.regulatory_citation,
    ao_statutory_citation: params.statutory_citation,
    min_penalty_amount: params.min_penalty_amount,
    max_penalty_amount: params.max_penalty_amount,
    min_date: params.min_date,
    max_date: params.max_date,
    from_hit: params.from_hit ?? 0,
    hits_returned: params.hits_returned ?? 20,
  })) as LegalSearchEnvelope;

  const results: LegalDoc[] = [];
  for (const [key, documentType] of DOCUMENT_TYPE_KEYS) {
    const docs = envelope[key];
    if (Array.isArray(docs)) {
      for (const doc of docs) {
        results.push(trimLegalDoc({ ...doc, document_type: documentType }));
      }
    }
  }

  return JSON.stringify(
    { results, total_count: envelope.total_all ?? results.length },
    null,
    2
  );
}

export function registerLegalSearchTool(server: McpServer): void {
  server.tool(
    "fec_legal_search",
    "Search FEC legal documents: advisory opinions, enforcement cases (MURs), alternative dispute resolutions, administrative fines, and statutes.",
    {
      query: z.string().optional().describe("Full-text search across legal documents"),
      type: z
        .enum(["advisory_opinions", "murs", "adrs", "admin_fines", "statutes"])
        .optional()
        .describe("Document type filter. Omit to search all types. admin_fines is slow without a query or respondent filter."),
      ao_number: z.string().optional().describe("Specific advisory opinion number, e.g. \"2024-01\""),
      case_number: z.string().optional().describe("Specific MUR or ADR case number"),
      respondent: z.string().optional().describe("Respondent name (enforcement cases)"),
      regulatory_citation: z.string().optional().describe("CFR citation, e.g. \"11 CFR 112.4\""),
      statutory_citation: z.string().optional().describe("U.S.C. citation, e.g. \"52 U.S.C. 30106\""),
      min_penalty_amount: z.number().optional().describe("Minimum penalty amount (enforcement cases)"),
      max_penalty_amount: z.number().optional().describe("Maximum penalty amount"),
      min_date: z.string().optional().describe("Earliest document date, YYYY-MM-DD"),
      max_date: z.string().optional().describe("Latest document date, YYYY-MM-DD"),
      from_hit: z.number().int().min(0).optional().describe("Offset for pagination, 0-indexed (default 0)"),
      hits_returned: z.number().int().min(1).max(200).optional().describe("Results per page (default 20, max 200)"),
    },
    async (params) => {
      try {
        const text = await legalSearch(params);
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
