# REGISTER — next free: PD-023 · CQ-79 · OQ-20 · PDEF-007 · CR-001

## Decisions

| ID     | Decision                                                                                                                                                                   | Status                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| PD-001 | (retired — demo is not a source)                                                                                                                                           | RETIRED                           |
| PD-002 | Stack per proposal S16: Next.js, TS, Tailwind, shadcn/ui, PostgreSQL, Prisma                                                                                               | APPROVED                          |
| PD-003 | Numbering: series per company/docType/project?/FY; number taken in same transaction (SELECT…FOR UPDATE); drafts unnumbered                                                 | APPROVED                          |
| PD-004 | Audit: append-only event per write, same transaction; approved docs immutable; change = revision + re-approval                                                             | APPROVED                          |
| PD-005 | Planning view computed from ledger per WBS node × item; recursive roll-up                                                                                                  | APPROVED, provisional (CQ-54..56) |
| PD-006 | Money Decimal(18,2), quantity Decimal(18,3). Proposed additions: rate (18,4), UOM factor (18,6), tax % (5,2), round each line half-up then sum, all arithmetic server-side | APPROVED; additions PROPOSED      |
| PD-007 | (retired — no demo decisions inherited, see PD-017)                                                                                                                        | RETIRED                           |
| PD-008 | Seed approval ladder: ≤2L PM-Purchase · 2–10L VP · 10–25L VP→ED · 25–50L VP+ED→FD · >50L VP+ED→MD. Fully configurable                                                      | APPROVED; CQ-22, 23, 24 open      |
| PD-009 | QC: PM accepts → stock; rejects → rejected-material return                                                                                                                 | APPROVED; CQ-45, 78 open          |
| PD-010 | Indent is the only requisition document in Phase A; PR/MR later                                                                                                            | APPROVED; OQ-08 open              |
| PD-011 | Multi-company/SPV/JV from day one: companyId on business tables, user access per company/project, enforced in API                                                          | APPROVED                          |
| PD-012 | 3-tier, not serverless: Next.js web → NestJS API → PostgreSQL                                                                                                              | APPROVED                          |
| PD-013 | Structural master fields only (Company/Project/Site; User loginId + optional email)                                                                                        | PROPOSED, before G-04             |
| PD-014 | en-IN, INR, IST, DD-MM-YYYY, FY Apr–Mar                                                                                                                                    | PROPOSED (OQ-12)                  |
| PD-015 | No hardcoded UI text (terminology config), no hardcoded colours (theme config), Zod only in packages/contracts, pages fetch / features receive props                       | PROPOSED, before G-02             |
| PD-016 | Dev: Netlify (web), Hostinger (api), Neon (DB). Prod: single VM, private repo                                                                                              | APPROVED                          |
| PD-017 | No demo decision inherited; each discussed when needed                                                                                                                     | APPROVED                          |
| PD-018 | Dev without Redis/worker: sessions + lockout in PostgreSQL, in-memory rate limit, jobs later in PostgreSQL                                                                 | PROPOSED, before G-03             |
| PD-019 | Local: Windows 10 + VS Code + Node, no Docker; DB = Neon, created at schema stage                                                                                          | APPROVED                          |
| PD-020 | File storage and email deferred (candidates: Cloudflare R2; Resend or Hostinger mail)                                                                                      | APPROVED                          |
| PD-021 | Browser calls same-origin /api/*; Next.js rewrites to API_BASE_URL; no CORS                                                                                                | PROPOSED (tested in G-01)         |
| PD-022 | Packages @uie/web, @uie/api, @uie/contracts; Node 22 LTS; Hostinger api = type "Other", root "/", build `build:api`, entry `apps/api/dist/main.js`                         | PROPOSED (deploy test after G-01) |

## Owner questions

| ID    | Question                                                           | Status                                                |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| OQ-01 | Configurable matrix vs proposal "3–4 levels"                       | CLOSED — PD-008 fits                                  |
| OQ-02 | Delivery plan mapping                                              | CLOSED — client's new plan; scope given incrementally |
| OQ-03 | Adopt terminology/theme/Zod/container rules                        | OPEN → PD-015                                         |
| OQ-04 | Libraries (auth, PDF, Excel, email)                                | OPEN — decided per package                            |
| OQ-05 | Purchase/Stores reports in Phase A                                 | DEFERRED                                              |
| OQ-06 | Opening stock import                                               | WITH CLIENT; item master Excel import is in scope     |
| OQ-07 | Rate precision                                                     | OPEN → PD-006 additions                               |
| OQ-08 | Meaning of "WBS will send the Indent"                              | OPEN                                                  |
| OQ-09 | Approve 3-tier                                                     | CLOSED — PD-012                                       |
| OQ-10 | UIE-only, or resold to other contractors (tenant layer)?           | OPEN                                                  |
| OQ-11 | Login by email or username/employee code?                          | OPEN                                                  |
| OQ-12 | Locale defaults                                                    | OPEN → PD-014                                         |
| OQ-13 | How Genspark output reaches GitHub                                 | CLOSED — local folder, pushes when told               |
| OQ-14 | Hostinger plan type                                                | CLOSED — web/cloud Node.js apps                       |
| OQ-15 | Local machine                                                      | CLOSED — PD-019                                       |
| OQ-16 | Dev storage/email                                                  | CLOSED — PD-020                                       |
| OQ-17 | Neon/Netlify accounts                                              | CLOSED — created when needed                          |
| OQ-18 | Laptop Node.js version; pnpm installed?                            | OPEN                                                  |
| OQ-19 | Can Genspark AI Code run terminal commands (install/build) itself? | OPEN                                                  |

## Client questions

CQ-01..CQ-78 drafted in chat; to be consolidated into docs/CLIENT-QUESTIONS.md as a separate step.

## Defects

| ID            | Defect                                                       | Status                        |
| ------------- | ------------------------------------------------------------ | ----------------------------- |
| PDEF-001..005 | Demo-doc defects                                             | WITHDRAWN — demo not a source |
| PDEF-006      | Claude assumed a Genspark scaffold existed instead of asking | CLOSED — rule 1               |

## Change requests

None.

## Genspark runs

| Run | Model | Credits before | after | Branch | Commit | Result |
| --- | ----- | -------------- | ----- | ------ | ------ | ------ |
