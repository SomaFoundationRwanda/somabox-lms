# Soma-X Web Frontend

The Next.js frontend for SOMABOX LMS. It lives in this monorepo next to the backend
(`../soma-x-backend`); there is no separate backend repository to clone.

Full local setup (dependencies, database, env files) is in the [root README](../README.md).
In short, from the repository root:

```bash
pnpm install
cp soma-x/.env.example soma-x/.env    # NEXT_PUBLIC_SERVER_URL=http://localhost:3000
pnpm dev:app                          # backend on :3000, frontend on :3001
```

To run only the frontend (the backend must already be running):

```bash
pnpm --filter soma-x run dev
```
