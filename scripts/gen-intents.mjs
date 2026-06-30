#!/usr/bin/env node
// Codegen: shared/alara-intents.json  ->  committed artifacts in each Docker
// build context (single source of truth, no runtime cross-container sharing):
//   frontend/src/lib/alara/intents.generated.ts
//   backend/app/intents_generated.py
//
// Both artifacts embed the SAME INTENT_SPEC_HASH so the planner responses/logs
// can prove the two services were built from identical rules.
//
// Usage:
//   node scripts/gen-intents.mjs           # (re)generate both artifacts
//   node scripts/gen-intents.mjs --check   # exit 1 if either artifact is stale
//
// The `--check` mode is the anti-drift guard wired into predev/prebuild + a
// parity test: if someone edits the spec but forgets to regenerate, it fails.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = join(ROOT, 'shared', 'alara-intents.json');
const TS_PATH = join(ROOT, 'frontend', 'src', 'lib', 'alara', 'intents.generated.ts');
const PY_PATH = join(ROOT, 'backend', 'app', 'intents_generated.py');

/** Stable canonical JSON (sorted keys) so the hash only changes when the
 *  meaningful spec content changes, not on key reordering or whitespace. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const hash = createHash('sha256').update(canonical(spec)).digest('hex').slice(0, 16);

const payload = {
  vocab: spec.vocab,
  intents: spec.intents,
  fallback: spec.fallback,
};
const payloadJson = JSON.stringify(payload, null, 2);

const tsFile = `// AUTO-GENERATED from shared/alara-intents.json by scripts/gen-intents.mjs.
// DO NOT EDIT BY HAND. Run \`npm run gen:intents\` (or edit the spec) instead.
//
// Single source of truth for Alara's deterministic intent routing — the
// frontend offline planner (planner.ts) and backend planner (llm.py) are both
// generated from the same spec, so they cannot drift.

export const INTENT_SPEC_HASH = ${JSON.stringify(hash)};

export interface IntentEntity {
  extractor: string;
  stop?: string;
  optional?: boolean;
}

export interface IntentMetric {
  default?: string;
  invoiceCountTriggers?: string;
}

export interface IntentSpec {
  name: string;
  priority: number;
  positive: string[];
  negative: string[];
  requires: string[];
  tool?: string;
  handler?: string;
  entities: Record<string, IntentEntity>;
  args: Record<string, unknown>;
  metric: IntentMetric | null;
  dateRange: 'none' | 'parse' | 'carryover';
  presentation: string;
  clarify: boolean;
  supportsReferences: boolean;
}

const SPEC = ${payloadJson} as {
  vocab: Record<string, string>;
  intents: IntentSpec[];
  fallback: { final_text: string };
};

export const VOCAB: Record<string, string> = SPEC.vocab;
export const INTENTS: IntentSpec[] = SPEC.intents;
export const FALLBACK_TEXT: string = SPEC.fallback.final_text;
`;

const pyFile = `# AUTO-GENERATED from shared/alara-intents.json by scripts/gen-intents.mjs.
# DO NOT EDIT BY HAND. Run \`node scripts/gen-intents.mjs\` (or edit the spec) instead.
#
# Single source of truth for Alara's deterministic intent routing — the backend
# planner (_plan_from_spec in llm.py) and the frontend planner (planner.ts) are
# both generated from the same spec, so they cannot drift.

import json

INTENT_SPEC_HASH = ${JSON.stringify(hash)}

_SPEC = json.loads(
    r"""${payloadJson}"""
)

VOCAB: dict = _SPEC["vocab"]
INTENTS: list = _SPEC["intents"]
FALLBACK_TEXT: str = _SPEC["fallback"]["final_text"]
`;

const targets = [
  { path: TS_PATH, content: tsFile, label: 'frontend/src/lib/alara/intents.generated.ts' },
  { path: PY_PATH, content: pyFile, label: 'backend/app/intents_generated.py' },
];

const check = process.argv.includes('--check');
let stale = false;
for (const t of targets) {
  let existing = null;
  try {
    existing = readFileSync(t.path, 'utf8');
  } catch {
    existing = null;
  }
  if (check) {
    if (existing !== t.content) {
      stale = true;
      console.error(`[gen-intents] STALE: ${t.label} (run \`node scripts/gen-intents.mjs\`)`);
    }
  } else if (existing !== t.content) {
    writeFileSync(t.path, t.content);
    console.log(`[gen-intents] wrote ${t.label}`);
  } else {
    console.log(`[gen-intents] up to date: ${t.label}`);
  }
}

if (check && stale) process.exit(1);
if (check) console.log(`[gen-intents] OK — both artifacts match spec (hash ${hash}).`);
else console.log(`[gen-intents] done (hash ${hash}).`);
