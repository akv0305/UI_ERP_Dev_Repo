# REGISTER — next free: PD-038 · CQ-98 · OQ-27 · PDEF-023 · CR-002

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
| PD-032 | Item master + Excel import from client Material List | APPROVED — G-05 |
| PD-033 | Scoped access: admin grants users one or more companies / projects / sites and roles; API refuses outside access; top-bar switcher | APPROVED — detailed in PD-037 |
| PD-034 | G-04a rules: codes immutable, no deactivate with active children, no create under inactive parent, no hard deletes (deactivate only), append-only audit, GST billing addresses, site contact | APPROVED (built G-04a) |
| PD-035 | G-04a Genspark choices (20) incl. audit FK ON DELETE RESTRICT, request id via AsyncLocalStorage, secrets dropped from audit snapshots, audit date filters whole days IST, CODE_IMMUTABLE / GSTIN_PAN_MISMATCH errors | APPROVED |
| PD-036 | Brand logo as Demo-uie: full logo 48 px above login card, app name below card; sidebar header full logo 32 px / mark 30 px when collapsed, links to Home; files in apps/web/public/brand; paths + sizes in theme.ts; initials fallback | APPROVED (built G-04a2) |
| PD-037 | Scoped roles (OQ-25 Option 1): each user_roles row = role + scope (GLOBAL / COMPANY / PROJECT / SITE); access derived from assignments down the hierarchy; menu = union of permissions; API checks permission against the record's scope; administration.* and ADMINISTRATOR only GLOBAL; out-of-scope record = 404; canManage per row; option endpoints for form pick lists; switcher context stored on session, auto-select when only one; existing links migrated to GLOBAL; findUsersWithRoleCovering helper for PD-008 | PROPOSED — G-04b |

## Owner questions

| ID | Question | Status |
| --- | --- | --- |
| OQ-01,02,09,13–17 | (see history) | CLOSED |
| OQ-03 | Adopt terminology/theme/Zod rules | CLOSED → PD-015 |
| OQ-04 | Libraries (PDF, Excel, email) | OPEN — per package |
| OQ-05 | Purchase/Stores reports in Phase A | DEFERRED |
| OQ-06 | Opening stock import | WITH CLIENT |
| OQ-07 | Rate precision | OPEN → PD-006 additions |
| OQ-08 | Meaning of "WBS will send the Indent" | OPEN |
| OQ-10 | UIE-only or resold (tenant layer)? | OPEN |
| OQ-11 | Login identifier | CLOSED — username/emp code or email |
| OQ-12 | Locale defaults | CLOSED → PD-014 |
| OQ-18 | Laptop Node/pnpm | CLOSED — Node 20.20 (see PDEF-008), pnpm 12.9.1 |
| OQ-19 | Genspark runs commands? | CLOSED — yes, on laptop |
| OQ-20 | Generic error text, seconds in date-time | CLOSED — keep text; no seconds |
| OQ-21 | G-03 single run | CLOSED — ran in parts |
| OQ-22 | Can users have no email? | OPEN (assumed yes) |
| OQ-23 | `trust proxy` value per deployment | OPEN — at deploy |
| OQ-24 | User access model (company-wide vs per project) | CLOSED → PD-033 |
| OQ-25 | Roles per scope (Option 1) or global (Option 2)? | CLOSED — Option 1 → PD-037 |
| OQ-26 | Tagline under the logo? Text? | OPEN — default none |

## Client questions

CQ-01..CQ-78 drafted in chat; to be consolidated into docs/CLIENT-QUESTIONS.md.
| CQ-79 | Does an SPV/JV record its parent company / JV partners (with share %)? | OPEN |
| CQ-80 | Store structure: Project → Site → Store, or one store per site/project? | CLOSED — Project → Site → Store |
| CQ-82 | PO number `UIEPL/xxxx/xxxx/26-27`: what are the two middle parts? | OPEN |
| CQ-83 | PO sample shows tax lines and also "Inclusive of GST @ 18%": which applies? | OPEN |
| CQ-84..CQ-97 | Sample review questions (Indent book, PO format, Material List) drafted in chat; to be consolidated into docs/CLIENT-QUESTIONS.md | OPEN |

## Defects

| ID | Defect | Status |
| --- | --- | --- |
| PDEF-001..005 | Demo-doc defects | WITHDRAWN |
| PDEF-006 | Assumed Genspark scaffold existed | CLOSED |
| PDEF-007 | CI failed pnpm 24 h release-age check | CLOSED |
| PDEF-008 | Laptop Node 20.20; project expects 22 | OPEN — before VS Code phase |
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

## Change requests

| ID | Change | Status |
| --- | --- | --- |
| CR-001 | Admin screen to edit theme (move theme to DB) | DEFERRED |

## Genspark runs

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
