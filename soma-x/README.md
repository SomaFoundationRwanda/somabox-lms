# Soma-X Web Frontend

The Next.js frontend for SOMABOX LMS. It lives in this monorepo next to the backend
(`../soma-x-backend`); there is no separate backend repository to clone.

Full local setup (dependencies, database, env files) is in the [root README](../README.md).
In short, from the repository root:

```bash
pnpm install
cp .env.example .env                  # one .env for every app (see the root README)
pnpm dev                              # backend on :3000, frontend on :3001
```

To run only the frontend (the backend must already be running):

```bash
pnpm --filter soma-x run dev
```

The backend address the frontend calls is built in at build time from the root `.env`
(`PUBLIC_BACKEND_URL`, or `http://localhost:<BACKEND_PORT>`), in `next.config.mjs`. Only public
values reach the browser; the rest of the `.env` stays on the server.
