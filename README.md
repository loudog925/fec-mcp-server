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
node --use-system-ca dist/index.js
```

The process will hang, waiting on stdio — that's expected; it's ready. Stop
it with Ctrl+C. If `FEC_API_KEY` isn't set (no `.env` and not in the
environment), it prints an error and exits immediately instead.

The `--use-system-ca` flag (also baked into `npm start`) makes Node trust
the same certificate store as the rest of the OS. On a corporate network
with an SSL-inspecting proxy, Node's default TLS stack rejects the proxy's
injected certificate even though Windows/PowerShell/curl trust it — every
tool call fails immediately with a TLS certificate error, which without
this flag surfaces from the tools as a generic "request failed or timed
out" message. See Troubleshooting below.

## Wiring it into Claude Desktop / Claude Code

Add an entry to your MCP config (Claude Desktop's `claude_desktop_config.json`,
or Claude Code's MCP config), pointing at the built entrypoint and supplying
the API key directly:

```json
{
  "mcpServers": {
    "fec": {
      "command": "node",
      "args": ["--use-system-ca", "C:\\GitHub\\fec-mcp-server\\dist\\index.js"],
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
| `fec_committee_search` | Search committees by name, ID, affiliated candidate, state, party, type |
| `fec_committee_reports` | A committee's period-by-period financial reports (cash on hand, receipts, disbursements, debts) |
| `fec_itemized_contributions` | Schedule A itemized contributions to a committee |
| `fec_itemized_expenditures` | Schedule B itemized disbursements by a committee |
| `fec_independent_expenditures` | Schedule E independent expenditures for/against a candidate |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_filings` | A candidate's or committee's filings by form type (RFAIs, quarterly reports, etc.) or amendment status |

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
| `FEC_API_TIMEOUT_MS` | No | 30000 (60000 for `fec_itemized_contributions` / `fec_donor_search` / `fec_spending_search`) | Per-request timeout override |

## Troubleshooting: every tool times out

If every tool fails, not just one, work through these in order:

1. **Is `FEC_API_KEY` a real key, not `DEMO_KEY`?** `DEMO_KEY` shares a
   global quota of 40 calls/hour across everyone using it on the internet
   — it exhausts almost immediately under any real usage. A registered
   personal key gets 1000 calls/hour. Rate-limited calls surface as a
   distinct `RATE_LIMITED` error, not a timeout — if you're seeing that
   error specifically, this is the cause.
2. **Are you on a network with an SSL-inspecting proxy** (common on
   corporate networks)? Node's TLS stack doesn't trust the OS certificate
   store by default, so a proxy-injected certificate that Windows/curl
   trust can still make every Node `fetch` call fail immediately with a
   `SELF_SIGNED_CERT_IN_CHAIN` (or similar) error. This is now surfaced
   as an explicit "TLS certificate error" message telling you to add
   `--use-system-ca` (see above) — if you're on an older build without
   that message, a generic "request failed or timed out" from every tool,
   immediately rather than after a real delay, is the same symptom.
3. **Is `fec_itemized_contributions` slow/timing out on broad queries?**
   An unnarrowed `contributor_name` search on Schedule A (no date range,
   no `committee_id`) has been observed taking ~26s upstream — the tool
   uses a 60s timeout to give headroom, but a `min_date`/`max_date` range
   will make it faster and more reliable.
