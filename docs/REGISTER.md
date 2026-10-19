# REGISTER — next free: PD-045 · CQ-110 · OQ-36 · PDEF-035 · CR-003

## Decisions

| ID | Decision | Status |
| --- | --- | --- |
| PD-001 | (retired — demo is not a source) | RETIRED |
| PD-002 | Stack: Next.js, TS, Tailwind, shadcn/ui, PostgreSQL, Prisma | APPROVED |
| PD-003 | Numbering: series per company/docType/project?/FY; number taken in same transaction (SELECT…FOR UPDATE); drafts unnumbered | APPROVED |
| PD-004 | Audit: append-only event per write, same transaction; approved docs immutable; change = revision + re-approval | APPROVED (audit trail built G-04a) |
| PD-005 | Planning view computed from ledger per WBS node × item; recursive roll-up | APPROVED, provisional |
| PD-006 | Money (18,2), qty (18,3). Additions: rate (18,4), UOM factor (18,6), tax % (5,2), round each line half-up then sum, arithmetic server-side | APPROVED; additions PROPOSED |
| PD-007 | (retired — see PD-017) | RETIRED |
| PD-008 | Approval ladder: ≤2L PM-Purchase · 2–10L VP · 10–25L VP→ED · 25–50L VP+ED→FD · >50L VP+ED→MD. Configurable | APPROVED; CQ-22,23,24 open |
| PD-009 | QC: PM accepts → stock; rejects → rejected-material return | APPROVED; CQ-45,78 open |
| PD-010 | Indent is the only requisition document in Phase A | APPROVED; OQ-08 open |
| PD-011 | Multi-company/SPV/JV: companyId on business tables, user access per company/project, enforced in API | APPROVED |
| PD-012 | 3-tier: Next.js web → NestJS API → PostgreSQL | APPROVED |
| PD-013 | Structural master fields only until client samples arrive | APPROVED in principle; G-04 fields = PD-031 |
| PD-014 | en-IN, INR, IST, DD-MM-YYYY (date-time HH:mm), FY Apr–Mar | APPROVED |
| PD-015 | No hard-coded UI text/colours; Zod in packages/contracts; pages fetch, components props-only | APPROVED |
| PD-016 | Dev: Netlify (web), Hostinger (api), Neon (DB). Prod: one VM, private repo | APPROVED |
| PD-017 | No demo decision inherited | APPROVED |
| PD-018 | No Redis/worker in dev: sessions + lockout in PostgreSQL, in-memory rate limit | APPROVED (built G-03) |
| PD-019 | Local: Windows 10 + VS Code + Node, no Docker; DB = Neon | APPROVED |
| PD-020 | File storage and email deferred (Cloudflare R2; Resend/Hostinger mail) | APPROVED |
| PD-021 | Browser calls same-origin /api/*; Next.js rewrites to API_BASE_URL; no CORS | APPROVED (cookie verified G-03) |
| PD-022 | Hostinger api: type "Other", root "/", build `build:api`, entry `apps/api/dist/main.js`; Node 22 | PROPOSED (deploy test pending) |
| PD-023 | Menu: Home · Purchase · Stores · Planning · Masters · Administration. Approvals via bell + Home list | APPROVED |
| PD-024 | Theme defaults in apps/web/config/theme.ts (Demo-uie look), all configurable | APPROVED |
| PD-025 | Every menu item, screen and action gated by permission code | APPROVED |
| PD-026 | G-02c Genspark choices; shell sizes moved to theme.layout | APPROVED |
| PD-027 | G-02d Genspark choices (16) | APPROVED |
| PD-028 | Password login, argon2id, PostgreSQL sessions (httpOnly cookie), lockout 5 fails/15 min, permissions from DB | APPROVED |
| PD-029 | Username required, email optional+unique, password ≥8 letter+digit, 12 h session, forced first change, 10 logins/min/IP, last-admin protection | APPROVED |
| PD-030 | G-03 Genspark choices (27) incl. Prisma 7 config, case-insensitive unique indexes | APPROVED |
| PD-031 | G-04 masters + statutory fields (all optional, validated when entered): Company (PAN, TAN, CIN, LLPIN, entity type Company/SPV/JV, address, state, PIN); GST registrations per state (GSTIN check digit, state + PAN match); State master (GST codes, seeded, read-only); Project (billing GST registration); Site (address, contact); Store | APPROVED (built G-04a) |
| PD-032 | Item master + Excel import from client Material List | APPROVED — detailed in PD-040 |
| PD-033 | Scoped access: admin grants users one or more companies / projects / sites and roles; API refuses outside access; top-bar switcher | APPROVED — detailed in PD-037 |
| PD-034 | G-04a rules: codes immutable, no deactivate with active children, no create under inactive parent, no hard deletes (deactivate only), append-only audit, GST billing addresses, site contact | APPROVED (built G-04a) |
| PD-035 | G-04a Genspark choices (20) incl. audit FK ON DELETE RESTRICT, request id via AsyncLocalStorage, secrets dropped from audit snapshots, audit date filters whole days IST, CODE_IMMUTABLE / GSTIN_PAN_MISMATCH errors | APPROVED |
| PD-036 | Brand logo as Demo-uie: full logo 48 px above login card, app name below card; sidebar header full logo 32 px / mark 30 px when collapsed, links to Home; files in apps/web/public/brand; paths + sizes in theme.ts; initials fallback | APPROVED (built G-04a2) |
| PD-037 | Scoped roles (OQ-25 Option 1): each user_roles row = role + scope (GLOBAL / COMPANY / PROJECT / SITE); access derived from assignments down the hierarchy; menu = union of permissions; API checks permission against the record's scope; administration.* and ADMINISTRATOR only GLOBAL; out-of-scope record = 404; canManage per row; option endpoints for form pick lists; switcher context stored on session, auto-select when only one; existing links migrated to GLOBAL; findUsersWithRoleCovering helper for PD-008 | APPROVED (built G-04b, 9f9e1b1) |
| PD-038 | G-04b Genspark choices: removed assignments deleted from user_roles (user audit snapshot keeps before/after); site-scoped holders not returned by findUsersWithRoleCovering; site assignment makes its project selectable in switcher; create checks scope before parent existence (403, existence not revealed); visible-but-not-manageable = 403; roles with administration.* flagged requiresGlobalScope in role options | APPROVED |
| PD-039 | Genspark AI Code stopped after G-04b. Manual loop from G-05: Claude gives complete files + commands, owner pastes in VS Code, runs checks, branch dev/G-xx, Claude reviews SHA, ff-merge to main; migrations create-only then approved | APPROVED |
| PD-040 | Item master: Category (Group) IG-0001 · Item ITM-000001 · Units with decimals 0–3 · Use = Stock and issue / Stock only · HSN, GST % optional · no hard deletes · full audit · tabs Items / Categories / Units | APPROVED — built G-05a (54066c1) |
| PD-041 | Item master codes and approval flow: (1) codes = last saved code + 1 inside the save transaction under a per-series lock; no gaps, no reuse (IG-0001 categories, ITM-000001 items); batch-1 sequences dropped. (2) Rejected is its own status; maker edits and resubmits. (3) Approved items are locked; holder of masters.items.approve may "Reopen for edit" (remarks required) → Draft; reopened item blocked for new documents until re-approved; past documents unchanged (OQ-27). (4) Submit, approve, reject, reopen recorded in Audit Log as UPDATE with before/after status. (5) Self-approval allowed for items only (OQ-28). Case-insensitive unique: unit code, unit name, category name. | APPROVED |
| PD-042 | Item Excel import/export: upload → editable preview grid → import → results; no file stored (5 MB / 2,000 rows) · header detection (first 10 rows, Description + Unit + Group required) · unit/category matched by normalised spelling, unmatched = red with DB pick list + "apply to all rows with this spelling" · no auto-create of units/categories · duplicates (vs DB and within file) red, imported only if edited, else skipped · similar-item check = yellow warning (OQ-30 C: same category + same size + same numbers, similarity ≥ 0.85), imported as written unless corrected · "Check again" re-validates on API · Ready + yellow rows created in one transaction as Pending approval · bulk approve (max 200) · export in import layout · exceljs (MIT) · no migration | APPROVED — batch 1 G-05b |
| PD-043 | Shared item catalogue access: items view at any scope; items manage/approve GLOBAL only | APPROVED — 4cd0a8a, CI #55 |
| PD-044 | Vendor master (G-06): VEN-0001 no gaps; legal/trade name, type, PAN, Udyam+MSME category, address, payment terms, credit limit; GST rows, bank accounts, contacts; Draft→Pending→Approved; view any scope, manage/approve GLOBAL only | APPROVED — batch 1 on dev/G-06 |

## Owner questions

| ID | Question | Status |
| --- | --- | --- |
| OQ-01,02,09,13–17 | (see history) | CLOSED |
| OQ-03 | Adopt terminology/theme/Zod rules | CLOSED → PD-015 |
| OQ-04 | Excel library? | CLOSED — exceljs (MIT), PD-042 |
| OQ-05 | Purchase/Stores reports in Phase A | DEFERRED |
| OQ-06 | Opening stock import | WITH CLIENT |
| OQ-07 | Rate precision | OPEN → PD-006 additions |
| OQ-08 | Meaning of "WBS will send the Indent" | OPEN |
| OQ-10 | UIE-only or resold (tenant layer)? | OPEN |
| OQ-11 | Login identifier | CLOSED — username/emp code or email |
| OQ-12 | Locale defaults | CLOSED → PD-014 |
| OQ-18 | Laptop Node/pnpm | CLOSED — Node 22.23.3, pnpm 12.9.1 |
| OQ-19 | Genspark runs commands? | CLOSED — yes, on laptop |
| OQ-20 | Generic error text, seconds in date-time | CLOSED — keep text; no seconds |
| OQ-21 | G-03 single run | CLOSED — ran in parts |
| OQ-22 | Can users have no email? | OPEN (assumed yes) |
| OQ-23 | `trust proxy` value per deployment | OPEN — at deploy |
| OQ-24 | User access model (company-wide vs per project) | CLOSED → PD-033 |
| OQ-25 | Roles per scope (Option 1) or global (Option 2)? | CLOSED — Option 1 → PD-037 |
| OQ-26 | Tagline under the logo? Text? | OPEN — default none |
| OQ-27 | Edited approved item while pending: usable or blocked? | CLOSED — blocked for new documents until re-approved; past documents unchanged |
| OQ-28 | Self-approval of items? | CLOSED — item master only: holder of masters.items.approve (VP) may approve own item; all other documents keep maker-checker; audit records both actions |
| OQ-29 | Can a Pending item be edited? | CLOSED — no; only Draft and Rejected are editable; Approved needs Reopen (PD-041) |
| OQ-30 | How to detect spelling mistakes in the import | CLOSED — C: similar-item check (description + size vs existing items and other rows in the file; near-match ≥ 0.85 = yellow warning, exact = red duplicate); own code, no library, no migration (PD-042 item 11) |
| OQ-31 | Duplicate rows in the file: first row kept, later copies flagged even when the first row is red | CLOSED — owner: keep as is |
| OQ-32 | Item use for imported items | CLOSED — owner: Item use column in the import grid, default Stock and issue, apply-to-all; sent per row to /api/items/import |
| OQ-33 | Bulk approve selection: current page only, only pending items | CLOSED — ok (1ec42cb, CI #53) |
| OQ-34 | Roles with item manage/approve global-only in user form/API | CLOSED — 7a5ed5e, CI #56 |
| OQ-35 | Vendor details: (a) unregistered = no GST rows, GST rows reuse company types; (b) no self-approval (OQ-28 items-only); (c) PAN and Udyam unique among vendors; (d) approved vendor locked incl. GST + bank (reopen to change), contacts always editable, bank number masked for non-managers | PROPOSED — confirm "OQ-35 ok" |


## Client questions

CQ-01..CQ-78 drafted in chat; to be consolidated into docs/CLIENT-QUESTIONS.md.
| CQ-79 | Does an SPV/JV record its parent company / JV partners (with share %)? | OPEN |
| CQ-80 | Store structure: Project → Site → Store, or one store per site/project? | CLOSED — Project → Site → Store |
| CQ-82 | PO number `UIEPL/xxxx/xxxx/26-27`: what are the two middle parts? | OPEN |
| CQ-83 | PO sample shows tax lines and also "Inclusive of GST @ 18%": which applies? | OPEN |
| CQ-84..CQ-97 | Sample review questions (Indent book, PO format, Material List) drafted in chat; to be consolidated into docs/CLIENT-QUESTIONS.md | OPEN |
| CQ-98 | Item / category codes | ANSWERED (owner) — category IG-0001 auto; label "Category (Group)"; item ITM-000001 proposed |
| CQ-99 | HSN and GST rates per item | OPEN — may come in final Excel, else entered after import |
| CQ-100 | Tools, furniture, laptops, AC: stocked or assets? | ANSWERED (owner) — per-item option: Stock and issue / Stock only |
| CQ-101 | Plant Spares group "will give later" | ANSWERED (owner) — categories entered separately; rows without a known category skipped |
| CQ-107 | Material List: Group names in Sheet1 differ from "Abstrct" sheet — "Oil & Lubricants" vs "Lubricants & Oil"; not in Abstract: Water Supply & Plumbing (105), Tools (57), Shuttering material (15), Safety Items (14), Structural steel (6); probable typos "Safety material" (1), "Shutting Material" (1). Client to confirm final category list before import | OPEN — client |
| CQ-108 | Who approves a new vendor (VP like items, Purchase Manager, or no approval)? | OPEN — client |
| CQ-109 | Does the client have an existing vendor list (Excel) to import? | OPEN — client |

## Defects

| ID | Defect | Status |
| --- | --- | --- |
| PDEF-001..005 | Demo-doc defects | WITHDRAWN |
| PDEF-006 | Assumed Genspark scaffold existed | CLOSED |
| PDEF-007 | CI failed pnpm 24 h release-age check | CLOSED |
| PDEF-008 | Laptop Node 20.20; project expects 22 | CLOSED — Node 22.23.3 installed |
| PDEF-009 | .prettierignore missing docs/client-inputs | CLOSED (G-02) |
| PDEF-010 | Exception filter validation payload | CLOSED (G-02) |
| PDEF-011 | G-02 prompt lost mid-run | CLOSED — parts committed separately |
| PDEF-012 | minimumReleaseAgeExclude added | CLOSED (G-02b) |
| PDEF-013 | formatINR/formatQty number-only | CLOSED (G-02c) |
| PDEF-014 | Permission check at build time | CLOSED (G-02d, G-03) |
| PDEF-015 | PendingScreen read permissions | CLOSED (G-02d) |
| PDEF-016 | Row action click also fires row click | CLOSED — browser checked |
| PDEF-017 | Rows not keyboard-accessible | CLOSED — browser checked |
| PDEF-018 | DIRECT_URL in local .env is a placeholder | CLOSED — real URL set |
| PDEF-019 | Login + users/roles not tested in a browser | CLOSED — browser test passed |
| PDEF-020 | REGISTER/CONTEXT not updated after G-01 | CLOSED |
| PDEF-021 | Hard-coded aria-labels in sidebar, top bar, breadcrumbs | CLOSED (G-04a2, 7e36ffa) |
| PDEF-022 | G-04a masters + audit log screens not tested in a browser | CLOSED — browser test passed |
| PDEF-023 | G-04b Part 4 not run (credits exhausted) | CLOSED — local checks, migrate status and browser test passed |
| PDEF-027 | Migration drop_code_sequences: duplicate folders from two migrate runs; Neon and repo out of step | CLOSED — only 20261014080823_drop_code_sequences kept in repo and Neon (d672e03, CI #41); no data lost |
| PDEF-028 | Unit dialog: Save/Cancel bar covered the Decimal places field (sticky footer + translate-centred dialog taller than half the screen) | FIXED — DialogContent scrolls itself (max-h + overflow-y-auto), 54066c1 |
| PDEF-029 | CI #46 failed at Test: two wrong examples in import-matching.spec.ts — (1) Flexible/Flexbule is 84.6%, below the 0.85 OQ-30 C threshold; (2) category test used two rows with the same description+size+unit, so the second was correctly flagged DUPLICATE_IN_FILE. Code correct | FIXED — examples changed (Flexble Pipe; Spanner Set) |
| PDEF-030 | (as before) | FIXED — CI #49 green on 120c503 |
| PDEF-031 | Import grid: no visible scroll bars, Issues column cut off on the right | FIXED — grid scrolls inside a 70dvh box with sticky header (cdf5fc1, CI #51) |
| PDEF-032 | View-only user saw Items menu but got Not authorised | FIXED — 4cd0a8a, CI #55 |
| PDEF-033 | Roles screen allowed global-only permissions on a role given below GLOBAL | FIXED — 7a5ed5e, CI #56 (ROLE_ASSIGNED_BELOW_GLOBAL) |
| PDEF-034 | schema.prisma comments above ItemCategory and Item held leftover find/replace text ("… becomes ///") | FIX GIVEN — G-06 batch 1 |

## Change requests

| ID | Change | Status |
| --- | --- | --- |
| CR-001 | Admin screen to edit theme (move theme to DB) | DEFERRED |
| CR-002 | Tailwind canonical classes: `x-[var(--token)]` → `x-(--token)` repo-wide | PROPOSED — role-form.tsx done by owner |

## Genspark runs (closed — manual from G-05, PD-039)

| Run | Model | Credits | Branch | Commit |
| --- | --- | --- | --- | --- |
| G-01 | DeepSeek V4 Pro | 636 | gen/G-01 | 4996308 |
| G-02 Part A | not recorded | 2,229 | gen/G-02 | f079af2 |
| G-02b | DeepSeek V4 Pro | 206 | gen/G-02 | 6bc46b9 |
| G-02c | DeepSeek V4 Pro | 147 | gen/G-02 | 546dccf |
| G-02d | DeepSeek V4 Pro | 380 | gen/G-02 | 71e00f6 |
| G-03 | Claude Sonnet 5 | 3,074 | gen/G-03 | 343af17 |
| G-04a | Claude Sonnet 5 | 3,805 | gen/G-04a | dd0d383 |
| G-04a2 | DeepSeek V4 Pro | 80 | gen/G-04a2 | 7e36ffa |
| G-04b | Claude Sonnet 5 | 6,115 (stopped before Part 4) | gen/G-04b | 9f9e1b1 |
| G-05b-1 | Preview on real file: 509 rows read, 3 ready / 0 warning / 506 error — errors due to empty Unit and Category masters, not code | VERIFIED |
| G-05b-2a | Import and bulk approve API | DONE — 05210c8 + 120c503, CI #49 |
| G-05b-2b | Import screen (upload, summary, unmatched pickers, editable grid, Check again, Import, results, Import from Excel button) | DONE — 860f8ca, CI #50; scroll fix PDEF-031 |