// AUTO-GENERATED from shared/alara-intents.json by scripts/gen-intents.mjs.
// DO NOT EDIT BY HAND. Run `npm run gen:intents` (or edit the spec) instead.
//
// Single source of truth for Alara's deterministic intent routing — the
// frontend offline planner (planner.ts) and backend planner (llm.py) are both
// generated from the same spec, so they cannot drift.

export const INTENT_SPEC_HASH = "a40337af5102682b";

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

const SPEC = {
  "vocab": {
    "csvExport": "(csv|excel|xlsx?|spreadsheet|sheet|export|download)",
    "comparison": "(compare|comparison)",
    "supplierItems": "(item|line)",
    "supplierDirectoryWords": "(directory|list|contact)",
    "payableTrigger": "(payable|outstanding|overdue|due|pending|payment)"
  },
  "intents": [
    {
      "name": "record_sale",
      "priority": 200,
      "positive": [
        "\\b(liya|le liya|saman|kharid|becha|sale|bika)\\b"
      ],
      "negative": [],
      "requires": [
        "customer",
        "amount"
      ],
      "tool": "record_sale",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "ne|ka|ki"
        },
        "amount": {
          "extractor": "amount"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "confirmation",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "add_customer",
      "priority": 195,
      "positive": [
        "(naya customer|add customer|new customer)"
      ],
      "negative": [],
      "requires": [],
      "handler": "addCustomer",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "confirmation",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "get_invoice_by_id",
      "priority": 190,
      "positive": [
        "(dikhao|kholo|show|preview|dekho)"
      ],
      "negative": [],
      "requires": [
        "invoice_id"
      ],
      "tool": "get_invoice",
      "entities": {
        "invoice_id": {
          "extractor": "invoiceId"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "invoice",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "get_invoice_by_customer",
      "priority": 185,
      "positive": [
        "\\b(bill|invoice)\\b",
        "(last|pichla|pichli|purana|purani|previous|recent|dikhao|dekho|kholo|preview)"
      ],
      "negative": [
        "@"
      ],
      "requires": [
        "customer"
      ],
      "tool": "get_invoice",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "ka|ki|ke"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "invoice",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "create_invoice",
      "priority": 180,
      "positive": [
        "\\b(bill|invoice)\\b"
      ],
      "negative": [],
      "requires": [],
      "handler": "createInvoice",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "invoice",
      "clarify": true,
      "supportsReferences": true
    },
    {
      "name": "bulk_remind",
      "priority": 175,
      "positive": [
        "(sab|sabko|sab ko|bulk|inactive|lapsed|purane|walon)",
        "(reminder|message|bhej|yaad|offer|outreach)"
      ],
      "negative": [],
      "requires": [],
      "tool": "bulk_remind",
      "entities": {},
      "args": {
        "filter": "inactive"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "list",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "draft_reminder",
      "priority": 170,
      "positive": [
        "(message|msg|reminder|remind|yaad dila|likh ?do|likho|draft|outreach)"
      ],
      "negative": [],
      "requires": [
        "customer"
      ],
      "tool": "draft_reminder",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "ko|ka|ki|ke"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "confirmation",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "customer_visit",
      "priority": 165,
      "positive": [
        "(kab aa\\w*|last time|aakhri baar|kitne din|kab aaye|visit kab|kab aya)"
      ],
      "negative": [],
      "requires": [
        "customer"
      ],
      "tool": "customer_visit",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "last|kab|kitne|aakhri|ka|ki|ko|ne"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "direct",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "list_customers_inactive",
      "priority": 160,
      "positive": [
        "(nahi aa\\w*|nahin aa\\w*|inactive|gayab)",
        "(din|days|customer|grahak|kaun|konsi|konse)"
      ],
      "negative": [],
      "requires": [],
      "tool": "list_customers",
      "entities": {
        "idle_days": {
          "extractor": "idleDays"
        }
      },
      "args": {
        "filter": "inactive"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "list",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "supplier_ops",
      "priority": 155,
      "positive": [
        "(purchase|purchases|payable|outstanding|overdue|due|payment|inventory receive|receive hui)"
      ],
      "negative": [],
      "requires": [],
      "handler": "supplierOps",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "parse",
      "presentation": "insight",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "supplier_directory",
      "priority": 150,
      "positive": [
        "(supplier)"
      ],
      "negative": [],
      "requires": [],
      "handler": "supplierDirectory",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "parse",
      "presentation": "insight",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "list_inventory",
      "priority": 145,
      "positive": [
        "(low stock|out of stock|stock khatam|reorder)",
        "(product|item|inventory|list|kaunsi|konsi|sku)"
      ],
      "negative": [],
      "requires": [],
      "handler": "listInventory",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "list",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "get_product",
      "priority": 140,
      "positive": [
        "(kitna stock|stock check|stock hai|kitne (units|pieces)|stock kitna)"
      ],
      "negative": [],
      "requires": [
        "product"
      ],
      "tool": "get_product",
      "entities": {
        "product": {
          "extractor": "nameBefore",
          "stop": "ka|ki|mein|ke|kitna|stock"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "direct",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "visualization_scan",
      "priority": 135,
      "positive": [],
      "negative": [],
      "requires": [],
      "handler": "vizScan",
      "entities": {},
      "args": {},
      "metric": {
        "default": "revenue",
        "invoiceCountTriggers": "(invoice count|invoice_count|transactions?|number of invoices)"
      },
      "dateRange": "parse",
      "presentation": "visualization",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "navigate_invoices",
      "priority": 130,
      "positive": [
        "^\\s*(inki\\s+|unki\\s+|in\\s+)?invoices?\\s*(bhi)?\\s*(dikhao|kholo|do|chahiye)?\\s*\\.?$"
      ],
      "negative": [],
      "requires": [],
      "tool": "navigate",
      "entities": {},
      "args": {
        "page": "invoices"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "navigate",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "suggest_next_steps",
      "priority": 125,
      "positive": [
        "(ab kya|next step|what next|kya karu|suggest|suggestion|recommend|advice|mashwara)"
      ],
      "negative": [],
      "requires": [],
      "tool": "suggest_next_steps",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "ke|ka|ki|ko|for",
          "optional": true
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "list",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "legacy_top_by_sales",
      "priority": 120,
      "positive": [
        "(sab se zyada|sabse zyada|most|best|top).*(business|sale|customer|grahak)|business.*(zyada|most)"
      ],
      "negative": [],
      "requires": [],
      "tool": "query_data",
      "entities": {},
      "args": {
        "template": "top_by_sales"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "insight",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "customer_insight",
      "priority": 115,
      "positive": [
        "(business|performance|profile|kaisa|kaisi|kitna|analysis|insight|360)"
      ],
      "negative": [],
      "requires": [
        "customer"
      ],
      "tool": "customer_insight",
      "entities": {
        "customer": {
          "extractor": "nameBefore",
          "stop": "ka|ki|ke|kaisa|kaisi"
        }
      },
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "insight",
      "clarify": false,
      "supportsReferences": true
    },
    {
      "name": "sales_today_explicit",
      "priority": 139,
      "positive": [
        "sales today"
      ],
      "negative": [],
      "requires": [],
      "tool": "query_data",
      "entities": {},
      "args": {
        "template": "sales_today"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "metric",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "sales_today_roman",
      "priority": 138,
      "positive": [
        "aaj",
        "sale"
      ],
      "negative": [],
      "requires": [],
      "tool": "query_data",
      "entities": {},
      "args": {
        "template": "sales_today"
      },
      "metric": null,
      "dateRange": "none",
      "presentation": "metric",
      "clarify": false,
      "supportsReferences": false
    },
    {
      "name": "navigate_open",
      "priority": 105,
      "positive": [
        "(^open |kholo|khol)"
      ],
      "negative": [],
      "requires": [],
      "handler": "navigateOpen",
      "entities": {},
      "args": {},
      "metric": null,
      "dateRange": "none",
      "presentation": "navigate",
      "clarify": false,
      "supportsReferences": false
    }
  ],
  "fallback": {
    "final_text": "Ji, main sale likh sakti hun, customer add/update kar sakti hun, invoice bana sakti hun, outreach message bhej sakti hun, ya koi page khol sakti hun. Kya karna hai?"
  }
} as {
  vocab: Record<string, string>;
  intents: IntentSpec[];
  fallback: { final_text: string };
};

export const VOCAB: Record<string, string> = SPEC.vocab;
export const INTENTS: IntentSpec[] = SPEC.intents;
export const FALLBACK_TEXT: string = SPEC.fallback.final_text;
