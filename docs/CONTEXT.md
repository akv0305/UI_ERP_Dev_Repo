# UIE ERP — CONTEXT (read first, every session)

Client: Unique Infra Engineers Pvt Ltd, Hyderabad (infra/EPC). Developer: PNM Smart Solutions.
Source authority: signed contract (if any) > approved proposal (client-inputs/) > client process
statement > client samples > CQ answers > PD/OQ decisions. Register: docs/REGISTER.md.

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

In: Administration & platform, shared UI framework, Purchase, Stores, Planning (WBS),
and only the masters these consume.
Later (Phase 1, not now): HR, Plant & Machinery, Subcontract, portals, purchase invoice
capture, Tally export, site returns/transfers/adjustments, dashboards, DPR.
Out (Phase 2 per proposal): tender, finance & accounting, client RA billing, real estate,
customer portal, live statutory integrations, advanced analytics.

## Menu (PD-023, PD-025)

Home · Purchase · Stores · Planning · Masters · Administration.
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
Keep source files under ~300 lines (review tooling truncates long files).
