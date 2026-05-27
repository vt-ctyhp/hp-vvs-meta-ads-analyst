export type MetaInboxVocabularyOption = {
  key: string;
  label: string;
  description: string;
  example?: string;
};

export const META_INBOX_QUEUE_CATEGORIES = [
  {
    key: "cash_for_gold",
    label: "Cash for Gold",
    description: "Customers responding to cash-for-gold, selling, trade-in, or gold-buying offers.",
  },
  {
    key: "book_appointment",
    label: "Book Appointment",
    description: "Customers trying to schedule a visit, consultation, viewing, or phone follow-up.",
  },
  {
    key: "us_product",
    label: "US Product",
    description: "Product inquiries tied to the US store, US inventory, or US-market ads.",
  },
  {
    key: "vn_product",
    label: "VN Product",
    description: "Product inquiries tied to Vietnam inventory, Vietnam service, or Vietnam-market ads.",
  },
  {
    key: "us_promotions",
    label: "US Promotions",
    description: "Conversations attributed to US WKDS, OOAK, or other US promotional campaigns.",
  },
  {
    key: "vn_promotions",
    label: "VN Promotions",
    description: "Conversations attributed to Vietnam WKDS, OOAK, or other VN promotional campaigns.",
  },
  {
    key: "custom_jewelry",
    label: "Custom Jewelry",
    description: "Custom design, redesign, CAD, made-to-order, or inspiration-photo conversations.",
  },
  {
    key: "repair_service",
    label: "Repair / Service",
    description: "Repair, resizing, cleaning, appraisal, warranty, or service conversations.",
  },
  {
    key: "general_inquiry",
    label: "General Inquiry",
    description: "Valid customer questions without a more specific queue match.",
  },
  {
    key: "uncategorized_needs_review",
    label: "Uncategorized / Needs Review",
    description: "Missing, unclear, or low-confidence routing that needs human review.",
  },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_SOURCE_CHANNELS = [
  {
    key: "facebook_message",
    label: "Facebook Message",
    description: "Private Messenger conversation with a Facebook Page.",
  },
  {
    key: "instagram_message",
    label: "Instagram Message",
    description: "Private Instagram message with the connected professional account.",
  },
  {
    key: "facebook_public_comment",
    label: "Facebook Public Comment",
    description: "Public comment on Facebook content or ads.",
  },
  {
    key: "instagram_public_comment",
    label: "Instagram Public Comment",
    description: "Public comment on Instagram media or ads.",
  },
  {
    key: "private_reply_from_comment",
    label: "Private Reply from Comment",
    description: "Private conversation started from a supported public comment reply flow.",
  },
  {
    key: "ad_referral",
    label: "Ad Referral / Click-to-Message",
    description: "Conversation that includes Meta referral, ad, or click-to-message context.",
  },
  {
    key: "other_unknown",
    label: "Other / Unknown",
    description: "Source channel is missing, unsupported, or not confidently classified yet.",
  },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_CONVERSATION_STATUSES = [
  {
    key: "new_inquiry",
    label: "New Inquiry",
    description: "Customer started a conversation and no sales user has meaningfully handled it yet.",
    example: "Customer messages from an ad: \"How much is this ring?\"",
  },
  {
    key: "needs_reply",
    label: "Needs Reply",
    description: "Customer is waiting on a response from sales.",
    example: "Customer asks whether Saturday appointment times are available.",
  },
  {
    key: "waiting_on_customer",
    label: "Waiting On Customer",
    description: "Sales has replied and the next move is the customer's.",
    example: "Sales asked for budget, ring size, or design preference.",
  },
  {
    key: "follow_up_needed",
    label: "Follow-Up Needed",
    description: "Sales owes a future touch even if the customer has not replied.",
    example: "Sales needs to check back tomorrow after customer confirms budget.",
  },
  {
    key: "appointment_scheduled",
    label: "Appointment Scheduled",
    description: "Conversation produced a booking, consultation, viewing, or visit.",
  },
  {
    key: "closed",
    label: "Closed",
    description: "Conversation no longer needs active work and was not a qualified lost opportunity.",
  },
  {
    key: "lost_lead",
    label: "Lost Lead",
    description: "A real buying opportunity existed, but the opportunity ended.",
  },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_LEAD_QUALITY_LABELS = [
  {
    key: "high_intent",
    label: "High Intent",
    description: "Customer shows buying signals and enough detail for a clear next action.",
    example: "Asks for an appointment, quote, deposit process, or custom-design timeline.",
  },
  {
    key: "medium_intent",
    label: "Medium Intent",
    description: "Customer shows real interest but not enough commitment or detail yet.",
    example: "Asks general pricing or whether custom work is possible.",
  },
  {
    key: "low_intent",
    label: "Low Intent",
    description: "Customer shows weak buying signal or shallow engagement.",
    example: "Sends only \"price?\" or gives no budget, timeline, or design detail.",
  },
  {
    key: "not_a_fit",
    label: "Not A Fit",
    description: "Real person, but the business should not pursue as a qualified opportunity.",
    example: "Wrong service, budget far below offering, or unsupported location/timeline.",
  },
  {
    key: "spam_invalid",
    label: "Spam / Invalid",
    description: "Not a real customer opportunity.",
    example: "Bot, scam, unrelated solicitation, nonsense, or duplicate spam.",
  },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_LEAD_QUALITY_REASON_TAGS = [
  { key: "asked_appointment", label: "Asked Appointment", description: "Asked about booking, availability, consultation, or visit." },
  { key: "asked_price", label: "Asked Price", description: "Asked for price, estimate, quote, discount, or budget range." },
  { key: "budget_shared", label: "Budget Shared", description: "Provided a budget or target spend." },
  { key: "design_details_shared", label: "Design Details Shared", description: "Shared inspiration, reference photos, size, metal, stone, or style details." },
  { key: "custom_design", label: "Custom Design", description: "Asked about custom jewelry, redesign, CAD, 3D, or made-to-order work." },
  { key: "diamond_inquiry", label: "Diamond Inquiry", description: "Asked about diamonds, lab/natural, shape, carat, quality, or stone sourcing." },
  { key: "repair_service", label: "Repair / Service", description: "Asked about repair, resizing, cleaning, appraisal, or service work." },
  { key: "price_shopping", label: "Price Shopping", description: "Appears mainly focused on comparing price or requesting the lowest price." },
  { key: "budget_mismatch", label: "Budget Mismatch", description: "Budget appears too low or misaligned with the offering." },
  { key: "timeline_mismatch", label: "Timeline Mismatch", description: "Needed timing likely cannot be met." },
  { key: "wrong_product_service", label: "Wrong Product / Service", description: "Asked for something the business does not offer or does not want to pursue." },
  { key: "unresponsive", label: "Unresponsive", description: "Stopped replying after sales response or follow-up." },
  { key: "duplicate", label: "Duplicate", description: "Same customer or conversation already exists elsewhere." },
  { key: "spam_bot", label: "Spam / Bot", description: "Automated, scam, unrelated solicitation, or nonsense." },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_OUTCOMES = [
  { key: "no_outcome_yet", label: "No Outcome Yet", description: "Conversation is still active or no business result is known." },
  { key: "booked", label: "Booked", description: "Conversation produced a booking, consultation, viewing, or appointment." },
  { key: "showed_up", label: "Showed Up", description: "Customer attended the booked appointment or visit." },
  { key: "no_show", label: "No-show", description: "Customer missed the booked appointment or visit." },
  { key: "browsed", label: "Browsed", description: "Customer engaged or came in but did not buy or commit." },
  { key: "sold", label: "Sold", description: "Purchase, deposit, order, or sale was committed." },
  { key: "lost", label: "Lost", description: "Opportunity ended without sale." },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_LOST_REASONS = [
  { key: "no_response", label: "No Response", description: "Customer stopped responding." },
  { key: "price_concerns", label: "Price Concerns", description: "Customer objected to price or value." },
  { key: "bought_elsewhere", label: "Bought Elsewhere", description: "Customer bought from another jeweler or source." },
  { key: "timeline_issue", label: "Timeline Issue", description: "Timing did not work for the customer or business." },
  { key: "budget_not_aligned", label: "Budget Not Aligned", description: "Customer budget did not match the offering." },
  { key: "design_not_preferred", label: "Design Not Preferred", description: "Customer did not like available design options." },
  { key: "cancelled_by_client", label: "Cancelled by Client", description: "Customer cancelled the opportunity." },
  { key: "duplicate_lead", label: "Duplicate Lead", description: "Lead duplicates another known customer or conversation." },
  { key: "lost_after_no_show", label: "Lost After No Show", description: "Customer no-showed and opportunity ended." },
  { key: "other", label: "Other", description: "Known loss reason not covered by another canonical value." },
] as const satisfies readonly MetaInboxVocabularyOption[];

export const META_INBOX_CUSTOMER_CONTACT_METHODS = [
  { key: "phone", label: "Phone", description: "Customer phone number captured in the inbox." },
  { key: "email", label: "Email", description: "Customer email address captured in the inbox." },
] as const satisfies readonly MetaInboxVocabularyOption[];

export type MetaInboxQueueCategoryKey = (typeof META_INBOX_QUEUE_CATEGORIES)[number]["key"];
export type MetaInboxSourceChannelKey = (typeof META_INBOX_SOURCE_CHANNELS)[number]["key"];
export type MetaInboxConversationStatusKey =
  (typeof META_INBOX_CONVERSATION_STATUSES)[number]["key"];
export type MetaInboxLeadQualityKey = (typeof META_INBOX_LEAD_QUALITY_LABELS)[number]["key"];
export type MetaInboxLeadQualityReasonTagKey =
  (typeof META_INBOX_LEAD_QUALITY_REASON_TAGS)[number]["key"];
export type MetaInboxOutcomeKey = (typeof META_INBOX_OUTCOMES)[number]["key"];
export type MetaInboxLostReasonKey = (typeof META_INBOX_LOST_REASONS)[number]["key"];
export type MetaInboxCustomerContactMethodKey =
  (typeof META_INBOX_CUSTOMER_CONTACT_METHODS)[number]["key"];

export function metaInboxVocabularyKeys<const TOption extends readonly { key: string }[]>(
  options: TOption,
) {
  return options.map((option) => option.key) as Array<TOption[number]["key"]>;
}

export function metaInboxVocabularyOption<
  const TOption extends readonly MetaInboxVocabularyOption[],
>(options: TOption, key: string | null | undefined) {
  return options.find((option) => option.key === key) || null;
}

export function metaInboxVocabularyLabel<
  const TOption extends readonly MetaInboxVocabularyOption[],
>(options: TOption, key: string | null | undefined, fallback = "Unknown") {
  return metaInboxVocabularyOption(options, key)?.label || fallback;
}
