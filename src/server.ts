import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiKey } from "./fecClient.js";
import { getLogContext, log, truncate, withLogContext } from "./logger.js";
import { registerCandidateSearchTool } from "./tools/candidates.js";
import { registerFinancialSummaryTool } from "./tools/financials.js";
import { registerItemizedContributionsTool } from "./tools/contributions.js";
import { registerItemizedExpendituresTool } from "./tools/expenditures.js";
import { registerIndependentExpendituresTool } from "./tools/independentExp.js";
import { registerDonorSearchTool } from "./tools/donors.js";
import { registerSpendingSearchTool } from "./tools/spending.js";
import { registerFilingsTool } from "./tools/filings.js";
import { registerCommitteeSearchTool } from "./tools/committees.js";
import { registerCommitteeReportsTool } from "./tools/committeeReports.js";
import { registerLoansTool } from "./tools/loans.js";
import { registerDebtsTool } from "./tools/debts.js";
import { registerElectionsTool } from "./tools/elections.js";
import { registerCalendarTool } from "./tools/calendar.js";
import { registerLegalSearchTool } from "./tools/legal.js";
import { registerFilingReviewTool } from "./tools/filingReview.js";
import { registerContributionBreakdownTool } from "./tools/contributionBreakdown.js";
import { registerSpendingBreakdownTool } from "./tools/spendingBreakdown.js";

export function createFecServer(): McpServer {
  getApiKey();

  const server = new McpServer({
    name: "fec-mcp-server",
    version: "0.1.0",
  });

  instrumentTools(server);

  registerCandidateSearchTool(server);
  registerFinancialSummaryTool(server);
  registerItemizedContributionsTool(server);
  registerItemizedExpendituresTool(server);
  registerIndependentExpendituresTool(server);
  registerDonorSearchTool(server);
  registerSpendingSearchTool(server);
  registerFilingsTool(server);
  registerCommitteeSearchTool(server);
  registerCommitteeReportsTool(server);
  registerLoansTool(server);
  registerDebtsTool(server);
  registerElectionsTool(server);
  registerCalendarTool(server);
  registerLegalSearchTool(server);
  registerFilingReviewTool(server);
  registerContributionBreakdownTool(server);
  registerSpendingBreakdownTool(server);

  return server;
}

type ToolResult = { isError?: boolean; content?: { type: string; text?: string }[] };

// Wrap every handler registered through server.tool() so each call logs its
// duration, outcome, upstream FEC call count, and (on failure) the error text
// the model saw. Tools catch their own errors and return isError results, so
// without this the server-side logs would never show why a call failed.
function instrumentTools(server: McpServer): void {
  const originalTool = server.tool.bind(server) as (...args: unknown[]) => unknown;
  (server as { tool: unknown }).tool = (...args: unknown[]) => {
    const name = String(args[0]);
    const handler = args[args.length - 1] as (...handlerArgs: unknown[]) => Promise<ToolResult>;
    args[args.length - 1] = (...handlerArgs: unknown[]) =>
      withLogContext({ tool: name, fec_calls: 0 }, async () => {
        const startedAt = Date.now();
        const params = handlerArgs.length > 1 ? handlerArgs[0] : undefined;
        try {
          const result = await handler(...handlerArgs);
          const fields = {
            ms: Date.now() - startedAt,
            fec_calls: getLogContext()?.fec_calls ?? 0,
            ...(process.env.LOG_TOOL_ARGS !== "false" && params !== undefined
              ? { args: truncate(JSON.stringify(params)) }
              : {}),
          };
          if (result?.isError) {
            const text = result.content?.find((c) => c.type === "text")?.text ?? "";
            log("warn", "tool_call", { ...fields, ok: false, error: truncate(text) });
          } else {
            log("info", "tool_call", { ...fields, ok: true });
          }
          return result;
        } catch (err) {
          log("error", "tool_call", {
            ms: Date.now() - startedAt,
            ok: false,
            error: truncate(String((err as Error)?.stack ?? err)),
          });
          throw err;
        }
      });
    return originalTool(...args);
  };
}
