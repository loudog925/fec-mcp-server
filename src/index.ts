#!/usr/bin/env node
import "dotenv/config";
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
import { registerComplianceFlagsTool } from "./tools/compliance.js";

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
registerComplianceFlagsTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
