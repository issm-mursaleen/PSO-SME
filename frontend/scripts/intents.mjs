// Local-dev convenience wrapper around the repo-root intent codegen.
//
// When the repo-root spec/codegen is present (normal local dev), regenerate the
// committed Alara intent artifacts so they never go stale. Inside the Docker
// build only `frontend/` is in the build context, so the root script is absent —
// we then no-op and use the committed `intents.generated.ts` as-is. CI's
// `check:intents` + the parity test are what actually guard against staleness.
//
// Args are forwarded (e.g. `--check`); a non-zero exit from the root script
// propagates so `check:intents` still fails on drift.

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootScript = join(repoRoot, 'scripts', 'gen-intents.mjs');

if (existsSync(rootScript)) {
  execFileSync(process.execPath, [rootScript, ...process.argv.slice(2)], { stdio: 'inherit' });
} else {
  console.log('[gen-intents] repo-root spec not present (Docker build) — using committed artifact.');
}
