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
7. One step at a time. One Genspark prompt at a time.

## Stack

apps/web Next.js + TypeScript strict + Tailwind + shadcn/ui — frontend only, no DB access (PD-012).
apps/api NestJS + TypeScript strict — long-running server (PD-012).
packages/contracts Zod schemas shared by web and api.
PostgreSQL via Prisma — added when schema work starts (Neon in dev).
Not in dev: Redis, worker, Docker, Nginx, file storage, email (PD-018, PD-020).

## Environments (PD-016, PD-019, PD-021)

Local: Windows 10, VS Code, Node 22 LTS, pnpm. web :3000, api :3001. No Docker.
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

## Menu (proposed — confirm at G-02)

Dashboard · Purchase · Stores · Planning · Masters · Approvals · Administration

## Working loop

Genspark pushes to branch gen/G-xx → owner sends branch + commit SHA → Claude reviews
files at raw.githubusercontent.com/akv0305/UI_ERP_Dev_Repo/<sha>/<path> → merge.
Keep source files under ~300 lines (review tooling truncates long files).
