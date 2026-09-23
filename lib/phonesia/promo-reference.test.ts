import assert from "node:assert/strict";
import test from "node:test";

import {
  isDocumentedResumeRecipientState,
  resolvePromoReference,
} from "./promo-reference.ts";

test("a valid new promo does not require send history", () => {
  assert.deepEqual(
    resolvePromoReference({ hasOverride: false, legacyCount: 0, campaigns: [] }),
    { kind: "new" },
  );
});

test("an existing legacy promo keeps its correct reference", () => {
  assert.deepEqual(
    resolvePromoReference({ hasOverride: true, legacyCount: 3, campaigns: [] }),
    { kind: "legacy" },
  );
});

test("an unknown URL promo key is rejected", () => {
  assert.deepEqual(
    resolvePromoReference({ hasOverride: true, legacyCount: 0, campaigns: [] }),
    { kind: "unknown" },
  );
});

test("historical incomplete campaigns cannot be reconstructed from current clients", () => {
  const campaign = {
    id: "e6964dee-865a-4dbf-95dc-223e0c2fece2",
    historical: true,
    snapshot_complete: false,
    state: "needs_review",
    selected_declared: 497,
    documented_recipients: 286,
    unreconstructable_count: 211,
  };
  assert.deepEqual(
    resolvePromoReference({ hasOverride: true, legacyCount: 0, campaigns: [campaign] }),
    { kind: "historical_incomplete", campaign },
  );
});

test("resume eligibility excludes accepted and uncertain outcomes", () => {
  assert.equal(isDocumentedResumeRecipientState("accepted"), false);
  assert.equal(isDocumentedResumeRecipientState("uncertain"), false);
  assert.equal(isDocumentedResumeRecipientState("pending"), true);
  assert.equal(isDocumentedResumeRecipientState("rejected"), true);
});
