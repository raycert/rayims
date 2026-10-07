# RayIMS regression harness

These are the acceptance / regression scripts RayIMS has been verified with since Phase 4. They were
written and run from a scratch folder during Phases 3-6; **Phase 7A moved them into the repository
unchanged in behaviour** (only hard-coded paths were made relative, see "What changed when they were
preserved"). They are plain Node scripts (no Jest / Vitest / Cypress): a headless browser drives the real
UI of a production build, and the **hosted** Supabase project is used for data.

> They are **not** unit tests and **not** safe to run against a database you care about without reading
> "Fixtures and cleanup". `npm test` is deliberately not defined.

## What is here

`tests/regression/` holds everything, flat (suites import `./common.mjs` and their `*-fixtures.mjs`).

| File pattern | Role |
| --- | --- |
| `common.mjs` | Shared helpers: reads the env files, `signIn()`, `dbQuery()` (SQL through `supabase db query --linked`), REST `http()`, reporter. `REPO` is derived from its own location. |
| `pXX-test.mjs` | One suite per phase slice (see the table below). Prints `PASS` / `FAIL` per check and `N/N passed, F failed`. |
| `pXX-fixtures.mjs` | Creates (and removes) that suite's data. Every suite has its own name prefix (`P6D-ACCEPT-`, `P7A-ACCEPT-`, ...). |
| `pXX-post-verify.mjs` | Run after a suite: confirms the suite left nothing behind (where it exists). |
| `pXX-snapshot.mjs`, `p6a-schema.mjs`, `p6e-schema.mjs`, `p7a-schema.mjs`, `residue.mjs`, `clean-both.mjs` | Safety tools: fingerprint of the genuine (non-fixture) data, of the schema / RLS / grants / Storage configuration, and a leftover check. Used before and after a phase. |
| `p6c-unit.mjs`, `p7a-unit.mjs`, `p7c-unit.mjs` | The only suites that need **no server and no database** (report rules; date helpers in four time zones; the Bulk Upload matcher). `npm run test:unit` runs the first. |
| `p6a-local.mjs`, `p6b-local.mjs`, `p7b-local.mjs`, `p7d-local.mjs` | Migration tests on an in-process Postgres (PGlite). **Not runnable from a plain checkout**: they need `@electric-sql/pglite`, which is not a dependency (see "Known gaps"). `p7b-local` was run by copying it into a folder where PGlite is installed and setting `RAYIMS_MIGRATIONS` to `supabase/migrations/`. |
| `run.mjs` | Runs suites one after another and reports a summary (`npm run test:regression`). |

### Suites

| Suite | Covers | Runs independently |
| --- | --- | --- |
| `p4b5` | Verification Excel import (4B.5) | yes (extra, not in the default list) |
| `p4c1`, `p4c2` | Findings (4C-1 / 4C-2) | yes |
| `p4d1`, `p4d2` | Actions, NC response (4D) | yes |
| `p4e`, `p4e6` | Evidence (4E, 4E.6) | yes |
| `p4f` | Controlled delete (4F) | yes |
| `p5a`, `p5b` | Documents, Versions (extra) | yes |
| `p5c`, `p5d`, `p5e`, `p5f` | Gap Assessment, follow-up, register import, Gap Assessment export | yes |
| `p5g` | Phase 5 acceptance (extra) | yes |
| `p6a`, `p6b`, `p6c`, `p6d` | Finding numbering, Activity Summary, Activity Report data, DOCX export | yes |
| `p6e` | Phase 6 acceptance scenario (extra, slow) | yes |
| `p7a`, `p7a-activity` | Phase 7A: Home, dates / time zones, deep link, Activity filters, mobile; minimal Activity smoke test | yes |
| `p7d` | Phase 7D: Expected Records (create / edit, Document Detail, read-only Gap Assessment context, import column / aliases / merge / conflict, export column, isolation, mobile / desktop; needs the 7D migration applied) | yes |
| `p7c` | Phase 7C: Bulk Document Upload (Match Review, confirm, sequential per-file upload, failures and retry, isolation, Vietnamese, mobile / desktop, 30-file batch) | yes (writes real files to the hosted private bucket; about 15 minutes) |
| `p7b` | Phase 7B: Document / Version delete protection, one open Gap Assessment, deterministic latest review, races (needs the 7B migration applied to the hosted project) | yes |
| `p4b` (`p4b-test.mjs`) | Original 4B execution suite | **no** - needs the `P4B_IDS` environment variable (fixture ids from a harness that was never preserved) |

`run.mjs --list` prints the default ("core") list and the extra list.

## Prerequisites

1. **Node 24** (the unit tests import TypeScript source directly through Node's type stripping).
2. `npm install` (adds `playwright-core` and `jszip` as dev dependencies - see below).
3. **A Chromium-family browser**. The scripts launch Microsoft Edge from
   `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; set `RAYIMS_BROWSER_PATH` to use another
   executable (Chrome, Chromium). No browser is downloaded by `npm install`.
4. **Supabase CLI access to the hosted project**: `npx supabase@latest` must be able to run
   `db query --linked` (the project is linked and you are logged in). It is used for fixtures and for reading
   database state.
5. **Environment files** (git-ignored, never committed; secrets are read inside the process and not printed):
   - `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STORAGE_BUCKET`
   - `.env.test.local`: `RAYIMS_ADMIN_EMAIL`, `RAYIMS_ADMIN_PASSWORD`, `RAYIMS_CONSULTANT_EMAIL`, `RAYIMS_CONSULTANT_PASSWORD`
     (one Admin and one Consultant account of the hosted project).
6. **A production build served on `127.0.0.1:3105`**:

   ```
   npm run build
   npx next start -p 3105 -H 127.0.0.1
   ```

   (`RAYIMS_APP_URL` changes the address `run.mjs` probes, but the suites themselves use port 3105.)

## Running

```
npm run test:unit                      # report rules (no server, no database)
node tests/regression/p7a-unit.mjs     # date helpers in 4 time zones (no server, no database)
npm run test:regression                # the core list, one suite after another (long: tens of minutes)
node tests/regression/run.mjs p6d p7a  # chosen suites
node tests/regression/p7a-test.mjs     # one suite directly (prints every check)
```

Each suite creates its fixtures first (clearing any earlier ones of its own prefix) and removes them at the
end. If a run is interrupted, running the same suite again cleans up first; `residue.mjs` shows what is left.
Logs of `run.mjs` are written to `<TEMP>/rayims-regression/<suite>.txt`.

A first pass can fail on the network alone (the data lives in the hosted project and every check talks to
it): re-run before treating a timeout as a regression, and never record a suite as passed unless its total
line says `N/N passed, 0 failed`.

## Fixtures and cleanup

- Fixtures use a per-suite prefix (`P4C1-ACCEPT-`, ..., `P7A-ACCEPT-`) on clients, sites, projects and
  everything below them, and clean up by that prefix only. Genuine data (the Chinh Long and Test 1 clients and
  their projects) is never touched by design.
- **Before and after a phase** take the safety fingerprints: `node tests/regression/p7a-snapshot.mjs save`
  before, `node tests/regression/p7a-snapshot.mjs` after (compares and reports any difference), and
  `node tests/regression/p7a-schema.mjs > before.json` / `after.json` for the schema, RLS, grants and Storage.
  (The `p6e-*` versions do the same for the Phase 6 prefix; copy one and change the prefix for a new phase.)
- **Destructive vs read-only:** every `*-test.mjs` creates and deletes its own fixture rows and Storage
  objects, so treat them all as destructive to the hosted project's *fixture* data. Only the snapshot,
  schema, residue and unit scripts are read-only.
- The suites assume the hosted project has **no genuine pending work** that would show up in cross-project
  lists (for example the Phase 7A Home empty-state check expects no upcoming Activities, overdue Actions or
  open Gap Assessments outside fixtures).

## Dependencies (dev only)

| Package | Why it is required |
| --- | --- |
| `playwright-core` | Drives the browser in 26 of the suites (`import { chromium } from "playwright-core"`). It is the "core" package: it does not download browsers; the suites use the installed Edge / Chrome. |
| `jszip` | `p6d-test.mjs` and `p6e-test.mjs` open the exported `.docx` (a zip) to check its XML, and `p4b5-helpers.mjs` builds / reads workbooks. It was previously found only as a transitive dependency of `exceljs` / `docx`; it is declared so the suites do not depend on that accident. |

`exceljs` is already an application dependency and is used by the suites to read the exported workbooks.
`@electric-sql/pglite` (used only by `p6a-local.mjs` and `p6b-local.mjs`) was **not** added.

## Known gaps (stated honestly)

- **4B (`p4b-test.mjs`) cannot run.** It needs `P4B_IDS` from a fixture harness that exists only in the
  history of an old session. Its features are exercised indirectly by the later Verification / Finding /
  Activity suites; there is no direct replacement.
- **No standalone Phase 3 suite exists.** Activity create / edit / status / site / consultant / time and the
  Master Plan are covered by the Phase 6E scenario (`p6e`), `p4e6`, `p4f`, `p6b` and, since 7A, by
  `p7a` (Activity Detail, Master Plan overdue). A dedicated minimal Activity smoke test was assessed in 7A
  (see `docs/08_TESTING.md`).
- `p6a-local.mjs` / `p6b-local.mjs` / `p7b-local.mjs` / `p7d-local.mjs` need PGlite (not installed) and have not been run from the repository itself (`p7b-local` passed 26/26 and `p7d-local` 10/10 from a folder with PGlite installed).
- The suites need the hosted Supabase project and a local browser; there is no CI. They are run by hand
  at the end of a phase.
- `p7c` creates test files under `<TEMP>/p7c-files` (including 31 files of about 10 MB for the total-size warning) and simulates Storage failures by aborting / delaying the browser's Storage request; it needs the 7B migration applied. The file input is server-rendered, so a selection made before hydration is ignored: the suite waits for network idle and re-selects.
- Since Phase 7B a Document with Versions and a Version with reviews cannot be deleted by cascade: fixtures must delete reviews, then versions, then documents (all current cleanups do).
- The import page's file input is server-rendered: a file chosen before hydration is lost (and React ignores a repeat of the identical selection). Every suite that selects an import file now waits for network idle first (5F, 5G, 7C, 7D); the symptom of a missing wait was a 60 – 90 s "import preview never appears" timeout in `p5f` / `p5g`.
- The suites assume the export columns of the current phase (Phase 7D inserted "Expected Records" before "Review Comments"): a positional assertion in an older suite must follow the product, not the other way round.
- Some suites read application source files (`lib/queries/*.ts`, `lib/mutations/*.ts`) to assert that a
  pattern is present; a refactor of those files can legitimately require a test update.
- Browser: Edge is the browser the results were produced with; other Chromium builds are expected to work
  but have not been recorded.

## What changed when they were preserved (Phase 7A)

- Hard-coded `D:/App/RayIMS` paths were replaced by `REPO` (from `common.mjs`); `process.env.TEMP` falls
  back to the OS temp directory; the Edge path can be overridden with `RAYIMS_BROWSER_PATH`.
- Files that were scratch / diagnostic only (`*-probe*`, `p4e-diag`, `p4c1-test.orig`) and generated JSON
  fingerprints were not copied.
- `run.mjs`, `p7a-*` and this README are new. No existing check was changed to make it pass.
