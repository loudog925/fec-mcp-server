# fec-mcp-server

A Model Context Protocol (MCP) server exposing live Federal Election Commission
(FEC) campaign finance data, backed by the [OpenFEC API](https://api.open.fec.gov/developers/).

Runs locally as a stdio MCP server — no database, no caching, every tool call
hits the live API. For bulk/historical FEC data backed by a local database,
see the separate `FECDownload` project.

## Setup

1. Get a free FEC API key: https://api.open.fec.gov/developers/
2. `git clone https://github.com/loudog925/fec-mcp-server.git`
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

## Running the HTTP transport

The repository also includes a Streamable HTTP entry point for a hosted
deployment or a secure MCP tunnel:

```powershell
npm run build
npm run start:http
```

It serves MCP at `http://localhost:3000/mcp` and a liveness check at
`http://localhost:3000/healthz`. Set `PORT` when the host supplies a port, and
set `MCP_HTTP_HOST=0.0.0.0` when the service must accept connections from a
container or hosted platform. Set `MCP_ALLOWED_HOSTS` to a comma-separated list
of public hostnames when deploying it (for example,
`MCP_ALLOWED_HOSTS=fec-mcp-server.onrender.com`). The HTTP transport is
stateless, so it works with hosted platforms and can scale across instances
without session-aware routing.

This endpoint has no authentication by default. Put it behind Secure MCP
Tunnel or add an authentication layer before exposing it on a public URL.

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

Restart Claude Desktop/Code afterward.

The `env` block is optional. The server resolves `.env` against its own
install location rather than the current working directory, so a `.env` in
the project root is picked up no matter where Claude launches the process
from. Supplying `env` here still works and takes precedence – a real
environment variable always beats the file. Prefer the `.env` file: it is
gitignored, whereas `claude_desktop_config.json` is not, which makes it the
easier place to leak a key from.

If the server shows up as failed with no `fec_*` tools, it exited at startup
because no key was found. The reason is in the MCP server log
(`%APPDATA%\Claude\logs\` on Windows). Note that the `env` block does no
shell expansion – `%FEC_API_KEY%` or `$env:FEC_API_KEY` is passed through as
a literal string, which starts cleanly but then fails every call with a 403.

## Tools

| Tool | Purpose |
|---|---|
| `fec_candidate_search` | Search federal candidates by name, state, office, party, or a single candidate_id for direct lookup |
| `fec_financial_summary` | A candidate's aggregated financial totals |
| `fec_committee_search` | Search committees by name, ID, affiliated candidate, state, party, type |
| `fec_committee_reports` | A committee's period-by-period financial reports (cash on hand, receipts, disbursements, debts) |
| `fec_itemized_contributions` | Schedule A itemized contributions to a committee |
| `fec_itemized_expenditures` | Schedule B itemized disbursements by a committee |
| `fec_independent_expenditures` | Schedule E independent expenditures for/against a candidate |
| `fec_loans` | Schedule C loans, endorsements, and loan guarantees, by committee or by lender/payee name across all committees |
| `fec_debts` | Schedule D debts and obligations, by committee or by creditor/debtor name across all committees |
| `fec_donor_search` | Find a donor's contributions across all committees |
| `fec_spending_search` | Find spending by vendor/description across all committees |
| `fec_filings` | A candidate's or committee's filings by form type (RFAIs, quarterly reports, etc.) or amendment status |
| `fec_elections` | Candidates in a race with financial totals, or an aggregate race summary; supports zip-based lookups |
| `fec_calendar` | FEC calendar events, report filing deadlines, or election dates |
| `fec_legal_search` | Search advisory opinions, enforcement cases (MURs), ADRs, administrative fines, and statutes |
| `fec_filing_review` | A structured "first 15 minutes" review of a committee's latest report: summary numbers, authoritative filing page count joined by `file_number`, change table vs. prior reports, committee ecosystem, and a primary-timing guard |
| `fec_contribution_breakdown` | Schedule A contributions by contributor state, employer, occupation, or dollar-size bucket |
| `fec_spending_breakdown` | Schedule B disbursements by FEC purpose category (with an unclassified-share figure) or by recipient/vendor |

Each report summary returned by `fec_filing_review` includes the report's `file_number`
and OpenFEC's authoritative `pages` value from the filings endpoint. `file_number` is
the stable join key for cross-referencing local or bulk datasets such as FECDownload.
Because `fec_filing_review` intentionally compares only current report versions, its
page counts exclude superseded filings. To measure all pages actually filed, including
amendments, use `fec_filings` and count each relevant `file_number` once.

Every search tool accepts `per_page` (max 100) and `page` to walk result sets beyond the first page.

`fec_itemized_contributions`, `fec_itemized_expenditures`, `fec_independent_expenditures`,
`fec_donor_search`, and `fec_spending_search` additionally accept `last_index` plus an
endpoint-specific tiebreaker field (`last_contribution_receipt_date` for Schedule A,
`last_disbursement_date` for Schedule B, `last_expenditure_date` for Schedule E — matching
each schedule's default sort field). These come from the previous response's
`pagination.last_indexes` object — pass them back on the next call instead of `page` when
paging deep into a large result set, since FEC's offset-based `page` pagination isn't
reliable past the first several thousand records. Verified against live responses (see
`npm run smoke`).

For `fec_itemized_contributions`, `fec_donor_search`, and `fec_itemized_expenditures`
specifically (Schedule A/B), `page` is a hard guard, not just documentation: FEC's
`page`-based paging on these endpoints silently caps out and re-returns page 1 with a normal
HTTP 200 once you request deep enough, so a naive page-counting pull can end up triple-counting
one page while looking like a stratified sample. These three tools reject `page` past
`FEC_MAX_PAGE` (default 10, override via env), throw if the response's `pagination.page` doesn't
match the page you asked for (proof the cap was hit), and attach a `pagination_warning` field to
the response for any page in between. Use `last_index` instead once you hit the cap.

`fec_legal_search` is the one exception to the `per_page`/`page` convention — it uses the
FEC legal search endpoint's own `from_hit` (0-indexed offset) and `hits_returned` (max 200)
params instead.

`fec_calendar`'s `filing_deadlines` mode deduplicates upstream results: FEC's
`/reporting-dates/` endpoint returns fully duplicate rows per
`(due_date, report_type, report_type_full, report_year)` combination with no
filer-level discriminator field. The tool collapses each group to one row and adds a
`filer_count` field (how many raw rows were collapsed into it) rather than surfacing
raw duplicates — `pagination.count` reflects the deduped total, not FEC's raw count.
`create_date`/`update_date` are also normalized to bare `YYYY-MM-DD` across
`election_dates` and `filing_deadlines` modes (upstream formats differ per mode); see
`FEC_MCP_NOTES.md` section 9 for details and live-verified numbers.

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
| `FEC_MAX_PAGE` | No | 10 | Deep-paging ceiling for `fec_itemized_contributions` / `fec_donor_search` / `fec_itemized_expenditures`; requests for `page` beyond this are rejected |
| `FEC_RATE_LIMIT_RETRIES` | No | 3 | How many times to retry an HTTP 429 before giving up |
| `FEC_RATE_LIMIT_BASE_MS` | No | 1000 | Base delay for exponential backoff on 429 (used when the API doesn't send `Retry-After`) |

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

## Acknowledgments

`fec_elections`, `fec_calendar`, and `fec_legal_search` — and the endpoint-specific
keyset pagination approach for Schedule A/B/E — were designed after studying
[cyanheads/openfec-mcp-server](https://github.com/cyanheads/openfec-mcp-server), which
covers this same OpenFEC API surface with a different tool/parameter design. Param
mappings (office code → full word, calendar category IDs, legal search field names)
and the legal-document payload-trimming approach are adapted from that project; this
server's implementations, param shapes, and tests were written independently rather
than copied.
