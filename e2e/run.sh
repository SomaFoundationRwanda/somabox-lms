#!/bin/sh
# Dev helper: run some specs reusing the last frontend build; prints only the results.
L="${TMPDIR:-/tmp}/e2e-run.log"
E2E_SKIP_BUILD=1 pnpm exec playwright test -c e2e/playwright.config.mjs "$@" > "$L" 2>&1
code=$?
grep -v '\[WebServer\]' "$L" | grep -vE '^\s*$|show-report|To open last' | tail -80
exit $code
