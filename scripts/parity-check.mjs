#!/usr/bin/env node
// Structural parity gate: proves the frontend and backend planners were built
// from the SAME intent spec. (Behavioural parity — that both produce the same
// tool calls — is enforced by the corpus suites: `npm test` in frontend/ and
// `pytest` in backend/, which both assert against shared/alara-utterances.json.)
//
// Checks:
//   1. Generated artifacts are in sync with shared/alara-intents.json.
//   2. INTENT_SPEC_HASH is identical across the TS and Python artifacts.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1. artifacts in sync with the spec
execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-intents.mjs'), '--check'], { stdio: 'inherit' });

// 2. hash identical across the two generated artifacts
const ts = readFileSync(join(ROOT, 'frontend', 'src', 'lib', 'alara', 'intents.generated.ts'), 'utf8');
const py = readFileSync(join(ROOT, 'backend', 'app', 'intents_generated.py'), 'utf8');
const tsHash = ts.match(/INTENT_SPEC_HASH = "([0-9a-f]+)"/)?.[1];
const pyHash = py.match(/INTENT_SPEC_HASH = "([0-9a-f]+)"/)?.[1];

if (!tsHash || !pyHash || tsHash !== pyHash) {
  console.error(`[parity] FAIL — intent_spec_hash mismatch (frontend=${tsHash}, backend=${pyHash}).`);
  process.exit(1);
}

console.log(`[parity] OK — frontend & backend built from the same spec (intent_spec_hash=${tsHash}).`);
console.log('[parity] Run `npm test` (frontend) + `pytest` (backend) for full behavioural parity.');
