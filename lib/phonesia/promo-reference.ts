export type PromoCampaignReference = {
  id: string;
  historical: boolean;
  snapshot_complete: boolean;
  state: string;
  selected_declared: number;
  documented_recipients: number;
  unreconstructable_count: number;
};

export type PromoReferenceResolution =
  | { kind: "new" }
  | { kind: "legacy" }
  | { kind: "unknown" }
  | { kind: "persistent"; campaign: PromoCampaignReference }
  | { kind: "historical_incomplete"; campaign: PromoCampaignReference };

export function resolvePromoReference(input: {
  hasOverride: boolean;
  legacyCount: number;
  campaigns: PromoCampaignReference[];
}): PromoReferenceResolution {
  if (!input.hasOverride) return { kind: "new" };

  const campaign = input.campaigns[0];
  if (campaign?.historical || (campaign && !campaign.snapshot_complete)) {
    return { kind: "historical_incomplete", campaign };
  }
  if (campaign) return { kind: "persistent", campaign };
  if (input.legacyCount > 0) return { kind: "legacy" };
  return { kind: "unknown" };
}

export function isDocumentedResumeRecipientState(state: string): boolean {
  return state !== "accepted" && state !== "uncertain";
}
