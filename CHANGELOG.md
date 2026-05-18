# Changelog

All notable changes to MegaZPanel are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Phase 1: Nodes / Servers / Allocations

### Added
- **Database schema (Prisma):** `Node`, `Allocation`, `Server`, `ServerVariable`
  models plus the `ServerInstallStatus` enum. Cross-cutting relations:
  `User.servers (ServerOwner)`, `Egg.servers`, `EggVariable.serverVariables`,
  `Node.{allocations, servers}`, `Allocation.{server, primaryFor}`,
  `Server.{defaultAllocation, allocations, variables}`. Initial migration is
  committed at `backend/prisma/migrations/20260518073134_init/migration.sql`.
- **Backend module `nodes`** (`/api/admin/nodes`): list/get/create/update/delete
  + `POST /:id/rotate-token`. Plaintext daemon token (`mzpd_<48 url-safe chars>`)
  is shown ONCE at create / rotate; only the argon2 hash is stored. Capacity
  fields: `maxMemoryMb`, `maxDiskMb`, overallocation %s. Heartbeat fields are
  populated by the daemon (Phase 2). Delete-guard: refuses if any server is
  attached.
- **Backend module `allocations`** (`/api/admin/nodes/:nodeId/allocations`,
  flat `/api/admin/allocations/:id`): list/create/bulk-create/update/delete.
  Bulk creation accepts an inclusive port range (max 1000), de-duplicates.
- **Backend module `servers`** (`/api/admin/servers` admin, `/api/client/servers`
  for owners): list/get/create/update/suspend/delete + owner-scoped
  `list-mine` and `get-by-identifier`. Server creation is transactional:
  validates the egg, claims the chosen allocation atomically, and seeds
  `ServerVariable` rows. 8-character lowercase identifier generated via nanoid.
- **Frontend admin route group `(admin)/`** with persistent sidebar (Lucide
  icons, active-state highlight) + mobile horizontal nav + admin role guard.
  Pages:
  - `/admin` — overview with live stat cards (servers/nodes/users) and quick
    actions.
  - `/admin/nodes` — searchable table with online/maintenance badges based on
    last heartbeat.
  - `/admin/nodes/new` — 4-card form, then a one-time **token reveal** screen
    with copy + show-toggle.
  - `/admin/nodes/[id]` — detail + token rotate (re-reveals plaintext) + delete
    + nested allocations panel with bulk port-range form.
  - `/admin/servers` — table with identifier, owner, node, egg, resources,
    status (combines suspended / install state / runtime state) and inline
    suspend/unsuspend toggle.
  - `/admin/servers/new` — 5-card wizard (Identity / Placement / Egg / Variables
    / Resources). Loads users + nodes + eggs upfront, allocations per node
    (filtered to unassigned), egg detail prefills image + startup + variable
    defaults. Locked variables disabled.
  - `/admin/users` — search, inline role editor (click roles to edit), inline
    create user card, delete with self-protection.
- **Frontend user-side**:
  - `/servers` — header bar with admin shortcut + theme toggle + sign out;
    server cards in a 1/2/3-col responsive grid with gradient hero strip,
    status pill, memory + disk mini-cards, and primary allocation address.
  - `/servers/[identifier]` — sticky header with status pill + tabs nav
    (`Overview` / `Console` / `Files` / `Backups` / `Settings`). Overview
    functional: 4 resource cards, suspended banner, connection panel
    (image, startup with code block), allocations table with primary badge,
    egg variables (filtered to userViewable), metadata. Other tabs are
    placeholder pages awaiting Phase 2 (daemon).
- **Frontend feature modules** under `src/features/`: `nodes`, `servers`,
  `admin-users`, `eggs` — each with its own `api.ts` + `types.ts`. New shared
  utility `src/shared/hooks/use-mutation.ts` (`useMutation` + `useQuery`) so
  feature code doesn't have to re-implement state-machine plumbing.

### Changed
- **Frontend**: switched `next.config.mjs` from `output: "export"` (static)
  to `output: "standalone"` (Next.js custom server). Dynamic routes
  (`/admin/nodes/[id]`, `/servers/[identifier]/*`) require runtime data and
  cannot be pre-rendered at build time.
- **Deployment** updated to match the new frontend mode:
  - New systemd template `deploy/systemd/megazpanel-frontend.service.tpl`
    (`MemoryMax=192M`, hardened, runs `node .next/standalone/server.js`).
  - `deploy/install/install-panel.sh` copies `.next/static` and `public/`
    into the standalone tree, renders the new frontend service, and waits
    for the chosen `FRONTEND_PORT` (default 3001) before continuing.
  - `deploy/nginx/panel.conf.tpl` reverse-proxies `/` and `/_next/static/` to
    the frontend port instead of serving from a static root. nginx 1.18-compatible
    syntax (`listen 443 ssl http2;` inline).
  - `install.conf` now records `FRONTEND_PORT`.
  - Telegram monitor's `SYSTEMD_UNITS` includes `megazpanel-frontend`.

### Notes
- This phase ships schema + admin CRUD + read-only user-side server pages.
  Real container lifecycle, console, file manager, etc. require the Go daemon
  (Phase 2). Servers stay in `pending` install status until the daemon claims
  them.
- `MEGAZPANEL_REPO_URL` env override remains supported for forks; the
  one-liner installer no longer prompts for the repo URL.
