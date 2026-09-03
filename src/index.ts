#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// Resolve .env against this file's own location, not process.cwd(). Claude
// Desktop/Code launches the server with its own working directory (commonly /
// or the app install dir), so a cwd-relative lookup silently misses the .env
// sitting next to the project and the server exits with no key. Real
// environment variables still win — dotenv does not overwrite what is already
// set, so an MCP config env block keeps taking precedence.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

try {
  getApiKey();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

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

const transport = new StdioServerTransport();
await server.connect(transport);
