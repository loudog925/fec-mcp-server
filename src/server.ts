import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiKey } from "./fecClient.js";
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
