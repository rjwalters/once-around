# Alignment report receiver operations

The Pages app stays static. `apps/report-worker` is a separate Cloudflare Worker with one public write route, `POST /reports`, and private D1 storage. It has no public report query, listing, download, deletion or receipt lookup route. Browser users must tap **Send report**; opening the page, starting sensors, capturing, copying and downloading do not upload anything.

The phone and browser descriptions are optional, editable and limited to 80 characters each. Empty descriptions become `Unknown`. Only a browser family and major version are suggested locally; the full User-Agent is not submitted. Reports include the app commit/build time and measurement metadata. The report coordinate checkbox is separate from the existing copy/download checkbox and initially unchecked. The receiver enforces omission of both latitude and longitude when consent is false, and requires both bounded coordinates when true. It accepts no images or extra fields. These are **self-reported measurements, not anonymous data**: UTC and expected sky directions can help infer location even without coordinates.

## Local development and checks

From the repository root:

```sh
CI=true pnpm install --frozen-lockfile
pnpm --filter once-around-report-worker migrate:local
pnpm --filter once-around-report-worker dev
```

In another terminal, build WASM once and start the page with the local receiver:

```sh
pnpm build:wasm
VITE_ALIGNMENT_REPORT_ENDPOINT=http://localhost:8787/reports pnpm dev
```

Visit `http://localhost:5173/test.html`. HTTP receiver URLs are accepted only for localhost/127.0.0.1 in Vite development mode. Other endpoints must be full HTTPS URLs ending in `/reports`, without credentials, query or fragment. With the endpoint unset, Send is disabled with an explanation; local captures and copy/download still work. There are no client credentials.

Local Wrangler uses the explicit `local` environment, a placeholder local database ID and namespace `12602`, with storage under `.wrangler/`. It does not use the production database. The default environment is disabled and has a placeholder account ID so an unqualified deploy cannot publish a working collector into an ambient account.

```sh
pnpm test:unit
pnpm typecheck:worker
pnpm test:worker
pnpm typecheck
pnpm build
pnpm exec playwright test tests/alignment-diagnostic.spec.ts
```

Web and Worker unit tests do not load WASM. The Worker integration tests use **Wrangler, actual local workerd and actual D1** with the real migration in an isolated temporary directory, then remove it. They test HTTP storage, unknown/oversized JSON rejection, no public reads, stable receipts, a concurrent unique-key race, and the scheduled 90-day deletion. No Cloudflare credentials are needed. Browser tests route their configured test receiver locally and cover consent, no automatic submission, pending/receipt UI, a failed network request, retry and unchanged offline exports. They require the WASM build and Playwright Chromium. CI runs both suites, Worker/web typechecks and a production build.

## Production configuration and deployment

The checked-in `production` environment is bound to the verified Once Around account `251e6e8626d921603fdc3f0d75576bc6`, Worker `once-around-reports` and D1 database `once-around-alignment-reports`. Account/database IDs and the receiver URL are public configuration, not secrets. Deployment is explicit; do not provision into whichever other account happens to be accessible through Wrangler OAuth.

The configured public endpoint is:

`https://once-around-reports.personal-account-251.workers.dev/reports`

`apps/web/.env.production` sets this public Vite endpoint for production builds. Local development has no endpoint by default. The existing `deploy:preview` script explicitly clears it; other preview build pipelines must also set `VITE_ALIGNMENT_REPORT_ENDPOINT` to an empty string or to an isolated preview receiver. CORS rejects Pages preview domains at the production Worker. Do not configure a preview to use the production D1 binding. To enable collection in a preview, create a separate preview D1 database and Worker configuration, a different rate-limit namespace, and only its exact preview origins. Do not use wildcard origins. Preview configuration files and local state are gitignored.

After independent review and merge, an authorized operator can apply the migration and deploy. First verify the account with the intended credential:

```sh
# On the maintainer's machine this file is managed by encrypted chezmoi.
# It contains the scoped Worker/D1 credential, never web build variables.
set -a
source ~/.cloudflare/rjwalters/workers-once-around-reports.env
set +a
pnpm --filter once-around-report-worker exec wrangler whoami
pnpm --filter once-around-report-worker migrate:production
pnpm --filter once-around-report-worker deploy:production
```

Use a Worker credential with Workers Scripts Write and D1 Write in the verified account, separately from Pages deployment permissions. Keep credentials out of source, shell history and build artifacts. Use the existing Pages deployment flow with its own credential (`~/.cloudflare/rjwalters/pages-rjwalters.env` on the maintainer's machine) after the receiver is available. Build after merge so submitted build metadata identifies the released source.

Production exact allowed origins are `https://once-around.pages.dev` and `https://oncearound.org`. Add a newly configured custom origin deliberately on the server before enabling its client. Allowed preflight headers are `Content-Type` and `Idempotency-Key`; credentials are not allowed. Missing origin, unsupported methods/content types, compressed payloads, malformed origin configuration, missing bindings, disabled collection and missing trusted client IP fail closed. Responses are not cacheable. **CORS is not authentication**: a non-browser client can forge an allowed Origin. Validation does not prove device identity or measurement accuracy.

The Worker uses the Cloudflare rate-limit binding before reading/storing a report. It allows approximately 20 requests per minute per trusted `CF-Connecting-IP`, represented by a minute-specific SHA-256 key; IP addresses are not written to D1 or application logs. It fails closed if the limiter errors or is missing. Rate-limited requests receive `429` and `Retry-After: 60`. Cloudflare counters are permissive, eventually consistent and local to each data center; the minute boundary can also permit a burst. Mobile users sharing an IP share this allowance. This is modest abuse control, not authentication, a strict global quota or bot protection. Application code logs no request bodies, IPs, full User-Agent or database exceptions; Worker observability is disabled in the configuration. Cloudflare's infrastructure still processes the network request.

## Wire contract and storage

`apps/web/src/alignment-report-schema.ts` is the shared, WASM-free versioned contract. The server rejects missing/unknown keys at every level, nonfinite numbers and out-of-range values. Each UTF-8 request is capped at **65,536 bytes while streaming**, regardless of absent or understated Content-Length, and contains 1–10 captures.

| Field                                    | Contract and units                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`, `angleUnit`, `errorConvention` | Fixed `once-around-alignment-report-v1`, `degrees`, `measured minus expected; signed shortest differences`                                                                                                                                                           |
| `coordinatesIncluded`                    | Boolean; controls exact GPS coordinate keys for every capture                                                                                                                                                                                                        |
| `device.phone`, `device.browser`         | Nonempty strings up to 80 characters, no control characters; client sends `Unknown` when blank                                                                                                                                                                       |
| `build.commit`, `build.time`             | 7–40 lowercase hex characters or `unknown`; valid ISO UTC milliseconds in years 2000–2099                                                                                                                                                                            |
| `captures[].target`, `utc`               | `Moon` or `Sun`; valid ISO UTC milliseconds in years 2000–2099                                                                                                                                                                                                       |
| `expected`, `measured`, `rawMeasured`    | Altitude −90 to 90 degrees (expected must be above 0); azimuth [0, 360), clockwise from north                                                                                                                                                                        |
| `errors`                                 | Signed shortest altitude/azimuth differences [−180, 180); great-circle separation [0, 180]                                                                                                                                                                           |
| `gps`                                    | Accuracy [0, 100] meters, Unix `timestamp` milliseconds in 2000–2099, `ageMs` [0, 30000); optional latitude [−90, 90]/longitude [−180, 180] only with consent                                                                                                        |
| `orientation`                            | Alpha [0, 360), beta [−180, 180], gamma [−90, 90] degrees; nonnegative monotonic `receivedAt` milliseconds bounded by the safe integer limit; `ageMs` [0, 3000); `headingReference` absolute or webkit-compass; `compassAccuracy` null (unknown) or [0, 180] degrees |
| `screenRotation`, `magneticDeclination`  | [0, 360) and [−180, 180] degrees respectively                                                                                                                                                                                                                        |

The existing `once-around-alignment-v1` copy/download format is unchanged. The submission envelope is separate. Magnetic declination is applied once to `measured`; `rawMeasured` preserves the original optical-axis direction. No calibration correction is stored or applied.

Each manual submission carries a UUID v4 `Idempotency-Key`. The browser keeps the exact serialized body and key in tab memory for retries of unchanged data, including after a timeout or lost success response. A changed report receives a new key. A unique D1 constraint and prepared insert/select statements return the original receipt for the same key plus canonical validated payload fingerprint, including simultaneous retries. Reusing the key with a different payload returns `409`. The response contains only a random receipt ID and server receipt UTC. Idempotency lasts while the row exists; a reloaded tab or new key is a new report. Nothing is stored in browser localStorage.

D1 rows contain `receipt_id`, `idempotency_key`, `payload_sha256`, server Unix-millisecond `received_at` and canonical `payload_json`. The daily `03:17 UTC` cron deletes rows whose **server receipt time** is more than 90 days old; deletion can occur up to one daily interval later. Client timestamps cannot extend retention. Deletion removes the receipt/idempotency record as well. Cloudflare-managed recovery copies follow D1's separate recovery policy; do not export reports to a public bucket or repository.

## Private query, export and deletion

These are authenticated operator commands, never browser API routes. From `apps/report-worker`, using the correct Worker/D1 credential:

```sh
pnpm exec wrangler d1 execute REPORTS --env production --remote --command \
  "SELECT receipt_id, datetime(received_at / 1000, 'unixepoch') AS received_utc, json_extract(payload_json, '$.device.phone') AS phone, json_extract(payload_json, '$.device.browser') AS browser FROM alignment_reports ORDER BY received_at DESC LIMIT 50"

# Full export contains voluntary coordinates and other potentially identifying data.
# Keep it private and delete it when the investigation is complete.
umask 077
pnpm exec wrangler d1 export REPORTS --env production --remote --output /tmp/alignment-reports.sql

# Replace the literal below with the specific UUID receipt to delete.
pnpm exec wrangler d1 execute REPORTS --env production --remote --command \
  "DELETE FROM alignment_reports WHERE receipt_id = 'REPLACE_WITH_RECEIPT_UUID'"

# Manual retention run if a daily cron failed:
pnpm exec wrangler d1 execute REPORTS --env production --remote --command \
  "DELETE FROM alignment_reports WHERE received_at < (unixepoch() * 1000 - 7776000000)"
```

Use `--env local --local` for local queries. For comparisons, privately retrieve `payload_json` and group captures by device/browser, build, target, heading reference and screen rotation; retain the reported GPS/motion uncertainty and use great-circle error near the zenith. Treat descriptions and measurements as untrusted data. Reports do not establish compass calibration and browser tests do not replace physical phone observations.

To suspend new collection, set production `REPORTS_ENABLED` to `false`, redeploy, and clear the frontend endpoint on its next build. Scheduled retention continues while collection is disabled, provided the D1 binding and cron remain configured. Keep the D1 database private and retain the cron during any collection pause.

Cloudflare references: [rate-limit bindings and limitations](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler local binding API](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy), [D1 data export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/).
