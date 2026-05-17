# MegaZPanel — Frontend (auth module)

Next.js 15 (App Router, **static export**) · TypeScript strict · Tailwind v4 · shadcn/ui · React Hook Form · Zod · Axios · Zustand · sonner · framer-motion · next-themes.

## Setup

```bash
cd frontend
cp .env.example .env.local
# install (use bun, pnpm, or npm — Next 15 works on all)
bun install      # or: pnpm install / npm install
bun run dev      # starts dev server on :3000
```

Static production build:

```bash
bun run build    # outputs to ./out/
# serve ./out/ with Caddy/Nginx; reverse-proxy /api -> backend
```

## Pages

| Route | File |
|---|---|
| `/login` | `src/app/(auth)/login/page.tsx` |
| `/register` | `src/app/(auth)/register/page.tsx` |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` |
| `/reset-password?token=…` | `src/app/(auth)/reset-password/page.tsx` |
| `/verify-email?token=…` | `src/app/(auth)/verify-email/page.tsx` |
| `/dashboard` | `src/app/(protected)/dashboard/page.tsx` |

`(auth)` and `(protected)` are route groups, not URL segments. Auth/guest guards are implemented as **client-side layout effects** (Next middleware does not run in static export).

## Backend API contract

The frontend talks to `${NEXT_PUBLIC_API_BASE_URL}` (default `/api`). Auth is handled with **HttpOnly cookies** set by the backend; the frontend never reads the access/refresh tokens.

CSRF: backend sets a non-HttpOnly cookie `mzp_csrf`; the Axios client echoes it in the `X-CSRF-Token` header on state-changing requests.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ email, name, password }` | `{ user }` + sets session cookies |
| POST | `/auth/login` | `{ email, password, rememberMe }` | `{ user }` + sets session cookies |
| POST | `/auth/logout` | `{}` | `204` + clears session cookies |
| POST | `/auth/refresh` | `{}` | `{ user }` + rotates session cookies |
| GET | `/auth/me` | — | `{ user }` |
| POST | `/auth/forgot-password` | `{ email }` | `204` (always, even on unknown email) |
| POST | `/auth/reset-password` | `{ token, password }` | `204` |
| POST | `/auth/verify-email` | `{ token }` | `204` |
| POST | `/auth/resend-verification` | `{ email }` | `204` |

Errors are returned as JSON: `{ code?: string, message: string, errors?: Record<string,string[]> }` with appropriate HTTP status codes (`400`, `401`, `409`, `429`, `500`).

The `AuthUser` shape expected by the frontend:

```ts
{
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  roles: string[];
  createdAt: string; // ISO8601
}
```

## Notable behavior

- **Auto refresh**: Axios response interceptor catches `401` from non-auth routes, calls `POST /auth/refresh` once (deduped across concurrent requests), then retries the original request.
- **Bootstrap**: on app load, `AuthProvider` calls `GET /auth/me`. If `401`, it tries `POST /auth/refresh` once before deciding the user is unauthenticated.
- **Remember me**: sent as a flag on `/auth/login`. Backend decides cookie max-age accordingly (e.g., 30 days vs session).
- **Guards**: `(auth)` redirects authenticated users to `/dashboard`; `(protected)` redirects unauthenticated users to `/login`.
- **Toasts**: `sonner` for success/error feedback (top-right).

## Folder layout

```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/{login,register,forgot-password,reset-password,verify-email}/page.tsx
│   │   ├── (auth)/layout.tsx
│   │   ├── (protected)/dashboard/page.tsx
│   │   ├── (protected)/layout.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/ui/{button,input,label,card,checkbox,sonner}.tsx
│   ├── features/auth/
│   │   ├── api.ts
│   │   ├── components/{auth-card,login-form,register-form,forgot-password-form,reset-password-form,verify-email-card,password-input}.tsx
│   │   ├── hooks.ts
│   │   ├── index.ts          # public surface
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── shared/
│   │   ├── components/{theme-toggle,loading-spinner}.tsx
│   │   ├── lib/{axios,utils}.ts
│   │   └── providers/{auth-provider,theme-provider}.tsx
│   └── stores/auth-store.ts
├── package.json · tsconfig.json · next.config.mjs · postcss.config.mjs
├── components.json · .eslintrc.json · .prettierrc.json · .gitignore
└── .env.example
```
