# FEC MCP Server — Design

Date: 2026-07-16

## Purpose

Build a custom Model Context Protocol (MCP) server exposing Federal Election
Commission (FEC) campaign finance data as tools for Claude Desktop/Code,
backed by the live OpenFEC REST API (https://api.open.fec.gov/developers/).

This is a learning project first (understand MCP server construction and the
OpenFEC API deeply), with an explicit intent to extend and customize it over
time — not just a clone of an existing implementation. It's a companion to,
not a replacement for, the existing `C:\GitHub\FECDownload` project, which
bulk-downloads FEC filings into a local SQL Server database and exposes them
via Data API Builder (DAB) as a separate MCP server. This new server instead
calls the live OpenFEC API directly per-request — no local database, no
caching — for real-time lookups (current candidates, committees,
contributions, expenditures) that DAB's bulk/historical data doesn't cover.

Inspired by (not forked from) https://github.com/sh-patterson/fec-mcp-server,
a TypeScript MCP server with a similar tool set.

## Architecture

- **Language/runtime**: TypeScript, Node.js 20+.
- **MCP SDK**: official `@modelcontextprotocol/sdk`.
- **Transport**: stdio — launched as a local subprocess by Claude
  Desktop/Code. No persistent network server, no remote hosting for v1.
- **Data source**: live calls to `api.open.fec.gov` per tool invocation. No
  local cache, no database.
- **Repo location**: `c:\GitHub\fec-mcp-server`, pushed to a new **private**
  repository on the user's personal GitHub account.

```
Claude Desktop/Code
      │
      ▼  (stdio)
fec-mcp-server (Node.js)
      │
      ▼  (HTTPS + API key)
api.open.fec.gov  (live FEC API)
```

## Project structure

```
fec-mcp-server/
  src/
    index.ts              # MCP server entrypoint, registers all tools
    fecClient.ts           # HTTP wrapper: base URL, API key header, timeout, error normalization
    tools/
      candidates.ts         # candidate search
      financials.ts         # committee financial summary
      contributions.ts      # itemized Schedule A (individual contributions)
      expenditures.ts       # itemized Schedule B (disbursements)
      independentExp.ts     # independent expenditures (Schedule E)
      donors.ts              # donor search across filings
      spending.ts            # spending/vendor search across committees
      compliance.ts          # compliance flags (RFAIs, amendments)
  tests/
    *.test.ts              # Vitest, one file per tool group, mocked HTTP
  .env.example
  .gitignore
  package.json
  tsconfig.json
  README.md
```

## Tools (v1 scope — matches reference repo's 8 tools)

1. **Candidate search** — find federal candidates, filterable by year, office, state, party.
2. **Financial summaries** — committee receipts, disbursements, cash on hand, burn rate.
3. **Itemized contributions** — Schedule A donor-level contribution records.
4. **Itemized expenditures** — Schedule B disbursement records (recipient/purpose).
5. **Independent expenditures** — Schedule E, Super PAC spending for/against candidates.
6. **Donor search** — find individual contributors by name/employer/occupation across filings.
7. **Spending search** — expenditures by description or vendor across all committees.
8. **Compliance flags** — RFAIs (Requests for Additional Information) and amendments.

## Config & auth

- `FEC_API_KEY` (required) read from `process.env`.
- `.env` (gitignored; `.env.example` committed as a template) loaded via
  `dotenv`, used for local PowerShell runs/manual testing.
- When Claude Desktop/Code launches the server, its MCP config JSON sets
  `FEC_API_KEY` directly as the subprocess `env` — no `.env` file needed in
  that path. Whichever mechanism actually sets the env var wins; both can
  coexist without conflict since the code only reads `process.env`.
- Optional `FEC_API_TIMEOUT_MS` env var — default 30s, 60s for the
  search-heavy tools (donor search, spending search).
- Server fails fast with a clear startup error if `FEC_API_KEY` is missing.

## Error handling

`fecClient.ts` centralizes all HTTP calls to OpenFEC and normalizes failures
into clear MCP tool errors:

- **429 (rate limited)** → explicit "rate limited, try again shortly" message.
- **4xx (bad params)** → surface the FEC API's own error message back through
  the tool result.
- **5xx / network / timeout** → generic "FEC API unavailable" error; does not
  crash the server process.

Each tool validates its own required parameters (e.g. candidate search needs
at least a name or state) before calling out, returning a helpful message
rather than letting a bad request hit the API.

## Testing

- Vitest unit tests, one file per tool group, mocking the HTTP layer — no
  network access or API key required to run tests or in CI.
- Manual smoke test once the server is wired up: run it locally, connect via
  Claude Desktop/Code, ask a few real FEC questions per tool, and eyeball the
  results against the OpenFEC API docs.
- No automated live e2e test suite in v1.

## Hosting / distribution

- `git init` locally, scaffold the project, get it working end-to-end.
- Create a new **private** GitHub repository under the user's personal
  account, push the code.
- To run it (this machine or elsewhere): `git clone` → `npm install` →
  `npm run build` → add an entry to Claude Desktop/Code's MCP config
  pointing at `node dist/index.js`, with `FEC_API_KEY` set in that config's
  `env` block → restart Claude.
- GitHub is used purely for source control/version history in v1 — no CI/CD,
  no remote/network-hosted server. This may be revisited later once the
  server is stable, but is explicitly out of scope for now.

## Out of scope for v1

- Local caching or database-backed storage of FEC API responses.
- Remote/network-hosted deployment (e.g. Fly.io, Render, a VPS) — GitHub is
  source-control only, not an execution host.
- GitHub Actions CI/CD.
- Automated live end-to-end tests against the real OpenFEC API.
- Any overlap with FECDownload's bulk historical/DAB-based data — this
  server is scoped to live, per-request OpenFEC API lookups only.
