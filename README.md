# fec-mcp-server

A Model Context Protocol (MCP) server exposing live Federal Election Commission
(FEC) campaign finance data, backed by the [OpenFEC API](https://api.open.fec.gov/developers/).

Runs locally as a stdio MCP server — no database, no caching, every tool call
hits the live API. For bulk/historical FEC data backed by a local database,
see the separate `FECDownload` project.

## Setup

1. Get a free FEC API key: https://api.open.fec.gov/developers/
2. `git clone <this repo's URL>`
3. `cd fec-mcp-server`
4. `npm install`
5. `npm run build`
6. Copy `.env.example` to `.env` and fill in your key:
   ```
   FEC_API_KEY=your_real_key_here
   ```

## Running it standalone (manual smoke test)

```powershell
node dist/index.js
```

The process will hang, waiting on stdio — that's expected; it's ready. Stop
it with Ctrl+C. If `FEC_API_KEY` isn't set (no `.env` and not in the
environment), it prints an error and exits immediately instead.

## Wiring it into Claude Desktop / Claude Code

Add an entry to your MCP config (Claude Desktop's `claude_desktop_config.json`,
or Claude Code's MCP config), pointing at the built entrypoint and supplying
the API key directly:

```json
{
  "mcpServers": {
    "fec": {
      "command": "node",
      "args": ["C:\\GitHub\\fec-mcp-server\\dist\\index.js"],
      "env": {
        "FEC_API_KEY": "your_real_key_here"
      }
    }
  }
}
```

Restart Claude Desktop/Code afterward. When Claude launches the server this
way, the `env` block above is what supplies the key — the local `.env` file
is only used when you run `node dist/index.js` yourself.

## Tools

| Tool | Purpose |
|---|---|
| `fec_candidate_search` | Search federal candidates by name, state, office, party |
| `fec_financial_summary` | A candidate's aggregated financial totals |
| `fec_itemized_contributions` | Schedule A itemized contributions to a committee |
| `fec_itemized_expenditures` | Schedule B itemized disbursements by a committee |
| `fec_independent_expenditures` | Schedule E independent expenditures for/against a candidate |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_compliance_flags` | RFAIs and amendments on a candidate's or committee's filings |

## Testing

```powershell
npm test
```

Runs the Vitest suite with `fetch` mocked — no network access or API key
required. There is no automated live end-to-end suite; after building, do a
manual smoke test through Claude Desktop/Code with a few real questions per
tool (e.g. "search for federal candidates named Smith in California").

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `FEC_API_KEY` | Yes | — | From https://api.open.fec.gov/developers/ |
| `FEC_API_TIMEOUT_MS` | No | 30000 (60000 for `fec_donor_search` / `fec_spending_search`) | Per-request timeout override |
