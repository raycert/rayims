# 10 — Operations Runbook

Operational steps for the V1 hosted Supabase project: internal users, roles, passwords
and access checks. Placeholders are written like `<user email>`. **Never put passwords,
keys, tokens, the database password or project-specific secrets in this file, in the
repository, or in chat.**

## Read first

1. **Public sign-up must stay disabled.** Dashboard → Authentication → Sign In /
   Providers → "Allow new users to sign up" must be **OFF** and "Allow anonymous
   sign-ins" **OFF**. If sign-up is on, anyone holding the (public) publishable key can
   create an account with full V1 access. Check it any time:
   `GET <project url>/auth/v1/settings` with header `apikey: <publishable key>` must show
   `"disable_signup": true`.
2. **Do not run `supabase config push` against the hosted project** under the current
   workflow. `supabase/config.toml` is a CLI template that differs from the hosted
   settings (auth, pooler, storage); a push would overwrite them and could re-enable
   sign-up. Schema changes go through `supabase db push` (migrations). `supabase config
   diff` is read-only and safe.
3. **Secrets stay out of the repo.** `.env.local` and `.env.test.local` are git-ignored;
   `.env.local` holds only the project URL, the publishable key and the bucket name. Never
   commit or paste a secret/service-role key, the database password, an access token or
   a user password.

## Roles

V1 has two roles, `admin` and `consultant`, with **identical access in the app** (ADR-014),
except that **only admins can administer frameworks and framework items** (create, edit,
controlled delete; ADR-016). Consultants can browse and search them. The database enforces
this. The role lives in `public.profiles.role`. New users are `consultant`. Roles can only be
changed by an administrator with SQL access (below); the app and the API cannot change
them, not even for an admin.

Run SQL in the dashboard **SQL Editor** (runs as `postgres`), or with the Supabase CLI
after `supabase login` and `supabase link`:
`npx supabase db query --linked "<sql>"`.

## Create an internal user

1. Dashboard → Authentication → Users → **Add user** → **Create new user**.
2. Enter the email and a strong, unique temporary password (use a password manager;
   hand it over out of band).
3. **Tick "Auto Confirm User".** Required: RayIMS has no email-confirmation flow, and an
   unconfirmed user cannot sign in (the login page then shows the generic "couldn't sign
   you in right now" message).
4. Check the profile row that a trigger creates automatically:
   `select id, email, role from public.profiles where email = '<user email>';`
   Expect one row with `role = 'consultant'`. Never insert profile rows by hand. If none
   appears, the migrations are not applied: stop and investigate.
5. Sign in at the RayIMS login page once to confirm.

## Promote (or demote) an admin

Only for an approved person: an admin can also change framework reference data used by
every project. Then:

```sql
update public.profiles set role = 'admin' where email = '<user email>';
```

Demote with `set role = 'consultant'`. Keep at least one admin.
Check: `select email, role from public.profiles order by role;`

## Reset a password

V1 has no password-reset or change-password screen, and the dashboard's recovery email
has no page to land on in RayIMS, so do not use it. Instead:

```sql
update auth.users
set encrypted_password = extensions.crypt('<new temporary password>', extensions.gen_salt('bf', 10)),
    updated_at = now()
where email = '<user email>';
```

- Use a strong, unique password and hand it over out of band. SQL Editor / CLI history may
  keep the statement, so never reuse that password anywhere else.
- Already-issued sessions keep working until their tokens expire (up to about an hour).

## Disable or remove a user

**Disable (reversible, preferred):** Dashboard → Authentication → Users → the user → **Ban
user**, or with SQL (`null` lifts it):

```sql
update auth.users set banned_until = now() + interval '30 days' where email = '<user email>';
update auth.users set banned_until = null where email = '<user email>';
```

New sign-ins and token refreshes are rejected (`user_banned`; the app shows the generic
message). An access token already issued stays valid until it expires (up to about an
hour, a documented limitation).

**Remove (permanent):** Dashboard → Authentication → Users → **Delete user**. Their profile
row is deleted, and their name is cleared from `created_by`, `reviewer_id`, `consultant_id`,
`uploaded_by` and `verified_by` (records survive but lose attribution). Prefer disabling
when attribution matters. Never delete the last admin.

## Verification checklist

After any user or settings change:

- [ ] `select email, role from public.profiles;` shows the expected roles, with at least one admin.
- [ ] Only the intended people are admins (admins can write framework reference data).
- [ ] The affected user can sign in at the login page and reach the dashboard; sign-out works.
- [ ] A wrong password shows "Invalid email or password."
- [ ] `/auth/v1/settings` reports `"disable_signup": true`; anonymous sign-ins are off.
- [ ] `.env.local` contains only the URL, the publishable key and the bucket name.
- [ ] `git status` shows no `.env*` file other than `.env.example`.

## Troubleshooting

- **"We couldn't sign you in right now" with the right password:** the account is banned,
  its email is unconfirmed (Auto Confirm was missed), a rate limit was hit, or Supabase is
  unreachable. Check the user's status in the dashboard.
- **User has no profile row:** the user was created before the migrations were applied.
  Ask the project owner before adding it by hand.

## Evidence files (Phase 4E)

- Evidence binaries live in the **private** bucket `rayims-files` (10 MB per object). Keys are
  `{project_id}/{uuid}-{sanitized-name}`; the database `files` row holds the key, never a URL.
  Never make the bucket public and never store signed URLs.
- The application removes an uploaded object again when its registration fails and deletes the
  object when the last reference to a file is removed. A crash between upload and registration
  can still leave an **orphan object**. To find orphans (SQL editor, read-only):
  `select o.name from storage.objects o where o.bucket_id = 'rayims-files' and not exists
  (select 1 from public.files f where f.storage_key = o.name);`
  Remove confirmed orphans through the Storage API / dashboard (not by SQL on `storage.objects`).
  The same query finds a Document Version file whose Storage removal failed during a version delete
  (the app then says "will need manual cleanup").
- A `files` row whose object is missing shows "File is unavailable." in the app; the metadata is
  kept on purpose — investigate before deleting it.

## Bulk Document Upload (Phase 7C)

- **Where:** Documents → Bulk Upload. It attaches files to existing Documents as new Versions; it never creates Documents.
- **Limits:** 50 files per batch (the page refuses to analyze more), 10 MB per file, PDF / Word / Excel / PowerPoint; a total
  over 300 MB is only a warning. Uploads are sequential — expect roughly the time of the same number of single uploads
  (about 1 – 3 s per small file on a good connection). There is no folder upload yet.
- **Failures are per file.** A failed file shows its reason and a **Retry** button (or **Retry Failed**); successful files are
  never rolled back and there is no batch rollback. A retry starts a fresh upload (new key), so it cannot duplicate a Version.
  Typical reasons: the connection dropped ("The upload failed. Check your connection and retry."), the Document became Not
  Applicable, or a Gap Assessment was opened on it meanwhile ("Complete the current Gap Assessment before uploading a new Version.").
- **If the page is closed or the browser crashes mid-batch:** the batch simply stops; files already registered are real
  Versions (check the Documents register). A file whose object was uploaded but not registered leaves one unreferenced Storage
  object — recover it with the same prefix-based orphan query as for a single Version upload ("Documents (Phase 5)" below).
- Nothing about a batch is stored (no history, no match information): to see what a batch created, look at the Versions'
  upload time and uploader on the Documents.

## Regression harness (Phase 7A)

- The acceptance / regression scripts live in `tests/regression` (see `tests/README.md`): they drive a
  production build in a headless browser against the **hosted** Supabase project, create fixtures with a
  per-suite prefix (`P7A-ACCEPT-`, ...) and remove them. Run them by hand at the end of a phase
  (`npm run build`, `npx next start -p 3105 -H 127.0.0.1`, then `npm run test:regression`).
- They need `.env.local` and `.env.test.local` (never committed), the linked Supabase CLI and a local
  Chromium-family browser. Take the snapshot / schema fingerprints before and after a phase; leave no fixtures behind.

## Activity Reports (Phase 6D)

- The Activity Report is generated on demand (Export Report on Activity Detail → .docx) from the
  current data and streamed to the browser. **RayIMS stores nothing**: no copy of an exported file, no
  export history, no Storage object — there is nothing to back up, clean up or retain. A report that must be
  kept is kept by whoever downloaded it; a new export always shows the current state.
- The export needs no extra service or setting (pure-JavaScript `docx` package, no headless browser).

## Finding numbers (Phase 6A)

- Numbers are assigned by the database (ADR-019); nothing in the app or the dashboard needs to set them.
- **Checks (SQL editor, read-only):**
  - Findings without a number — must be none (the column is NOT NULL):
    `select count(*) from public.issues where finding_no is null;`
  - Duplicate numbers — impossible (`UNIQUE (project_id, finding_no)`).
  - Counter behind the highest number (should never happen):
    `select i.project_id, max(i.finding_no) as max_no, c.last_finding_no from public.issues i left join
    public.project_finding_counters c on c.project_id = i.project_id group by i.project_id,
    c.last_finding_no having c.last_finding_no is null or c.last_finding_no < max(i.finding_no);`
- **Only forward repair** if that query ever returns a row: set the counter **up** to the highest
  number (`update public.project_finding_counters set last_finding_no = <max_no> where project_id =
  '<id>' and last_finding_no < <max_no>;`, or insert the missing row). **Never lower or reset a
  counter** and never renumber Findings — numbers may already be in client reports.

## Documents (Phase 5)

- **Expected Records / Required Evidence (Phase 7D)** is the Document's `expected_records` text: edited in Edit Document, imported from the optional
  "Expected Records" column of the Required Document workbook (create-only: an existing Document keeps its value) and exported in the Gap Assessment
  workbook. Read-only check: `select id, title, length(expected_records) from public.documents where expected_records is not null;`. Clearing it or changing it
  never affects Versions or assessments.
- Document Version files use the same private bucket, key scheme and orphan query as Evidence above.
- **More than one open Gap Assessment on a Version** cannot occur since Phase 7B (partial unique index
  `document_reviews_one_open_per_version_idx`; the app also reconciles). A diagnostic (SQL editor, read-only):
  `select document_version_id, count(*) from public.document_reviews where status = 'under_review'
  group by 1 having count(*) > 1;` — it should return no rows.
- **A Document / Version delete that is refused** ("…can no longer be deleted because a version / Gap Assessment now
  exists") means the database blocked it (ON DELETE RESTRICT, Phase 7B): something was added after the page was
  opened. Read-only checks: `select count(*) from public.document_versions where document_id = '<id>';` and
  `select count(*) from public.document_reviews where document_version_id = '<id>';`.
- **Which review decided a Document's status:** `select latest_review_id, status from public.document_register
  where document_id = '<id>';` (the highest `created_at`, ties by the higher `id`).
- **Excel import** is all-or-nothing by compensation (no database transaction): if the framework
  mappings fail, the Documents just created are deleted again. A crash in between could leave
  Documents without their mappings; they are visible in the register (no requirements) and can be
  completed or deleted in the app.
- **Dates:** date-only values (due dates, Activity dates) print the same day for every viewer; timestamps
  and "today" (overdue) use the viewer's own time zone in the browser (Phase 7A, BR-157 / BR-158); the
  exports use the downloading browser's zone. The deployment time zone no longer changes what is shown.
