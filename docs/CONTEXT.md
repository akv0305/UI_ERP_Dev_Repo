# UIE ERP — CONTEXT (read first, every session)

Client: Unique Infra Engineers Pvt Ltd, Hyderabad. Developer: PNM Smart Solutions.
Authority: contract > approved proposal > client process statement > samples > CQ > PD/OQ.
Register: docs/REGISTER.md (next-free header). Patterns: docs/PATTERNS.md. Current task: docs/NEXT.md.

## Stack
apps/web — Next.js, TS strict, Tailwind, shadcn/ui; no DB access (PD-012). components/erp/ frozen;
all wording in config/terminology.ts; theme in config/theme.ts; pages fetch (container), components props-only (presenter).
apps/api — NestJS, Prisma 7, PostgreSQL on Neon. Service + mapper + <module>-errors.ts per module.
Audit Log written in the same transaction (PD-004). Numbers gapless via series lock (PD-003/041).
packages/contracts — one Zod schema file per entity + permission codes; web reads its built dist.
Auth: argon2id, PostgreSQL sessions, httpOnly cookie; scoped roles GLOBAL/COMPANY/PROJECT/SITE (PD-037).
Not in dev: Redis, worker, Docker, file storage, email.

## Local
Windows 10, PowerShell, VS Code, Node 22, pnpm. web :3000, api :3001. Secrets only in apps/api/.env.

## Rules (binding)
1. Never guess fields, files, components, props. Read the file at the commit SHA first.
2. File won't load → ask owner to paste it or Select-String output. Large files in chunks.
3. Numbers (PD, CQ, OQ, PDEF, CR) only from the REGISTER.md header; check the header against the last row of each section; never reuse.
4. Business questions → OQ rows before code, each with a recommended option.
5. Every batch includes docs changes in the existing format.
6. Fix only real errors, from the real file.
7. Never commit client personal data (PDEF-048). Test data synthetic only.
8. Outside Phase A scope → CR, not code.

## Batch workflow (PD-039)
1. Branch dev/G-xx from main. 2. Claude gives complete files (full path) + commands.
3. Owner runs pnpm typecheck, lint, test; pastes full errors. 4. Migrations: create-only → SQL reviewed → apply.
5. Commit, push, CI green → owner sends SHA + CI # → Claude reviews raw files → next batch.
6. Group done → ff-merge to main. One batch at a time.

## On hold
PO print · approval delegation (OQ-97) · PDEF-048 repo history.

## Rules (binding)

1. Never invent a requirement, field, key, prop or function name. Not in a file read this session → ask or write UNREAD and stop.
2. Read the actual file at the given commit SHA before proposing a change. Can't read → say so, stop.
3. Failed fetch twice / owner says file doesn't exist → change approach, don't ask again.
4. Register numbers come from REGISTER.md only. Retired numbers are never reused.
5. Build errors: fix exactly those, from the real file; state which earlier instruction caused them.
6. Outside scope below → propose a CR, don't build.
7. One step at a time. Status checkpoint (done / pending / next free numbers) every 2–3 replies.

## Stack

apps/web Next.js + TypeScript strict + Tailwind + shadcn/ui — frontend only, no DB access (PD-012).
apps/api NestJS + TypeScript strict + Prisma 7 (PostgreSQL on Neon) — long-running server.
packages/contracts Zod schemas + permission codes shared by web and api.
Auth: username/email + password, argon2id, sessions in PostgreSQL, httpOnly cookie (PD-028/029).
Access: scoped role assignments GLOBAL / COMPANY / PROJECT / SITE (PD-037).
Not in dev: Redis, worker, Docker, Nginx, file storage, email (PD-018, PD-020).

## Environments (PD-016, PD-019, PD-021)

Local: Windows 10, Node 22.23.3, pnpm 12.9.1, PowerShell (execution policy RemoteSigned), VS Code.
Repo folder = the one Genspark used. web :3000, api :3001. No Docker.
Secrets only in apps/api/.env (git-ignored). Never commit or paste connection strings.
Dev: web → Netlify · api → Hostinger Node.js app · DB → Neon.
Prod: one VM (private repo).
Browser always calls /api/* on the web origin; Next.js rewrites forward to API_BASE_URL.

## Scope — Phase A

In: Administration & platform (incl. Approval Workflows, PD-054), shared UI framework, Purchase, Stores,
Planning (WBS), Employee Master (PD-045), and only the masters these consume.
Later (Phase 1, not now): HR beyond Employee Master, Plant & Machinery, Subcontract, portals, purchase invoice
capture, Tally export, site returns/transfers/adjustments, dashboards, DPR.
Out (Phase 2 per proposal): tender, finance & accounting, client RA billing, real estate,
customer portal, live statutory integrations, advanced analytics.

## Menu (PD-023, PD-025)

Home · Purchase · Stores · Planning · Masters · HR · Administration.
No Approvals menu: approvals via notification bell + "Pending for my approval" on Home.
Every item, screen and action is shown only with its permission code.

## Working loop (PD-039 — manual, from G-05)

1. Owner creates branch dev/G-xx from main.
2. Claude gives COMPLETE files (full path, whole content) + exact commands. Owner pastes in VS Code;
   Copilot suggestions on those files are not accepted.
3. Owner runs pnpm typecheck, lint, test (and build when asked); pastes full error text back.
4. DB changes: `prisma migrate dev --create-only` first → owner sends SQL → Claude approves → apply.
5. Green + browser test OK → commit, push dev/G-xx, send SHA → Claude reviews at
   raw.githubusercontent.com/akv0305/UI_ERP_Dev_Repo/<sha>/<path> → git merge --ff-only into main, push.
Long files: if Claude cannot read a whole file, it asks the owner for the needed sections (Select-String output) instead of guessing.

