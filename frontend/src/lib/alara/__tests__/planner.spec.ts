import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { planLocal } from '../planner';
import { INTENT_SPEC_HASH } from '../intents.generated';

// The shared corpus is the single golden the backend planner is also asserted
// against (backend/tests/test_planner.py). FE == golden  ∧  BE == golden  ⟹
// FE == BE, so this file is the frontend half of the planner-parity guarantee.
const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(here, '../../../../../shared/alara-utterances.json');

interface Expect {
  tools: string[];
  args: Record<string, unknown>[];
  final_text: string | null;
}
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as {
  cases: { utterance: string; expect: Expect }[];
};

function normalize(message: string): Expect {
  const r = planLocal(message);
  return {
    tools: r.tool_calls.map((c) => c.name),
    args: r.tool_calls.map((c) => c.args),
    final_text: r.final_text ?? null,
  };
}

describe('frontend planner — shared corpus parity', () => {
  for (const c of corpus.cases) {
    it(c.utterance, () => {
      expect(normalize(c.utterance)).toEqual(c.expect);
    });
  }
});

describe('frontend planner — behavioural (G)', () => {
  it('today vs lifetime: "aaj ki total sales" → query_data(sales_today), not a trend chart', () => {
    expect(planLocal('aaj ki total sales kitni hain').tool_calls[0]).toMatchObject({
      name: 'query_data',
      args: { template: 'sales_today' },
    });
  });

  it('best customer by revenue vs invoice_count', () => {
    expect(planLocal('top 5 customers by number of invoices').tool_calls[0].args).toMatchObject({
      ranking_metric: 'invoice_count',
    });
    expect(planLocal('top 3 customers').tool_calls[0].args).toMatchObject({ ranking_metric: 'revenue' });
  });

  it('multi-tool request returns one call per requested view, in order', () => {
    const r = planLocal('pichle 3 hafton ki sales trend aur top 3 customers dikhao');
    expect(r.tool_calls.map((c) => c.args.kind)).toEqual(['sales_trend', 'top_customers']);
  });

  it('simple lookup ("X last time kab aaya") stays a single customer_visit call', () => {
    const r = planLocal('Sindh Dairy kitne din se nahi aaya');
    expect(r.tool_calls).toHaveLength(1);
    expect(r.tool_calls[0].name).toBe('customer_visit');
  });

  it('exposes the intent spec hash', () => {
    expect(planLocal('hello').intent_spec_hash).toBe(INTENT_SPEC_HASH);
  });
});
