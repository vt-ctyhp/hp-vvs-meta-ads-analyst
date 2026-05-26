// PROTOTYPE — throwaway data for the /convert/inbox layout distill prototype.
// Delete with the rest of the inbox-prototype/ directory once the winning
// variant is folded into the real SocialInboxClient.

export type SeedQueueCategory =
  | "cash_for_gold"
  | "book_appointment"
  | "us_product"
  | "vn_product"
  | "custom_jewelry"
  | "repair_service"
  | "general_inquiry"
  | "uncategorized_needs_review";

export type SeedSourceChannel =
  | "facebook_message"
  | "instagram_message"
  | "facebook_public_comment"
  | "instagram_public_comment"
  | "private_reply_from_comment"
  | "ad_referral"
  | "other_unknown";

export type SeedWorkflowStatus =
  | "new_inquiry"
  | "needs_reply"
  | "waiting_on_customer"
  | "follow_up_needed"
  | "appointment_scheduled"
  | "closed"
  | "lost_lead";

export type SeedLeadQuality =
  | "high_intent"
  | "medium_intent"
  | "low_intent"
  | "not_a_fit"
  | "spam_invalid"
  | null;

export type SeedOutcome =
  | "no_outcome_yet"
  | "booked"
  | "showed_up"
  | "no_show"
  | "sold"
  | "lost";

export type SeedBrand = "HP" | "VVS";
export type SeedItemKind = "thread" | "comment";

export const QUEUE_CATEGORIES: { key: SeedQueueCategory; label: string }[] = [
  { key: "cash_for_gold", label: "Cash for gold" },
  { key: "book_appointment", label: "Book appointment" },
  { key: "us_product", label: "US Product" },
  { key: "vn_product", label: "VN Product" },
  { key: "custom_jewelry", label: "Custom jewelry" },
  { key: "repair_service", label: "Repair service" },
  { key: "general_inquiry", label: "General inquiry" },
  { key: "uncategorized_needs_review", label: "Needs review" },
];

export const SOURCE_CHANNELS: { key: SeedSourceChannel; label: string }[] = [
  { key: "facebook_message", label: "Facebook message" },
  { key: "instagram_message", label: "Instagram message" },
  { key: "facebook_public_comment", label: "Facebook comment" },
  { key: "instagram_public_comment", label: "Instagram comment" },
  { key: "private_reply_from_comment", label: "Private reply from comment" },
  { key: "ad_referral", label: "Ad referral" },
  { key: "other_unknown", label: "Other" },
];

export const STATUS_LABELS: Record<SeedWorkflowStatus, string> = {
  new_inquiry: "New inquiry",
  needs_reply: "Needs reply",
  waiting_on_customer: "Waiting on customer",
  follow_up_needed: "Follow-up needed",
  appointment_scheduled: "Appointment scheduled",
  closed: "Closed",
  lost_lead: "Lost lead",
};

export const LEAD_QUALITY_LABELS: Record<NonNullable<SeedLeadQuality>, string> = {
  high_intent: "High intent",
  medium_intent: "Medium intent",
  low_intent: "Low intent",
  not_a_fit: "Not a fit",
  spam_invalid: "Spam / invalid",
};

export const OUTCOME_LABELS: Record<SeedOutcome, string> = {
  no_outcome_yet: "No outcome yet",
  booked: "Booked",
  showed_up: "Showed up",
  no_show: "No show",
  sold: "Sold",
  lost: "Lost",
};

export const REASON_TAGS = [
  "asked_appointment",
  "asked_price",
  "asked_shipping",
  "wrong_service",
  "already_has_product",
  "timing_issue",
  "budget_issue",
  "duplicate",
  "spam_bot",
] as const;

export type SeedAttachment = {
  id: string;
  type: "photo" | "video" | "file";
  label: string;
  mime: string;
  sizeBytes: number;
};

export type SeedMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  sentMin: number;
  author?: string;
  attachments?: SeedAttachment[];
};

export type SeedAttribution = {
  campaignUmbrella: string;
  campaign: string;
  adSet: string;
  ad: string;
  creative: string;
  sourcePermalink: string;
} | null;

export type SeedContactMethod = {
  id: string;
  kind: "email" | "phone";
  value: string;
  source: "advisor_entered" | "ad_lead_form" | "system";
};

export type SeedSendAttempt = {
  id: string;
  status: "approved" | "queued" | "sent" | "failed_retryable";
  body: string;
  createdMin: number;
  author: string;
  error?: string;
};

export type SeedSavedReply = {
  id: string;
  title: string;
  body: string;
  scope: "personal" | "shared";
};

export type SeedNote = {
  id: string;
  type: "internal_note" | "manager_coaching";
  body: string;
  authorName: string;
  createdMin: number;
};

export type SeedQaScorecard = {
  id: string;
  overallScore: number;
  scores: {
    tone: number;
    completeness: number;
    accuracy: number;
    nextStep: number;
    speed: number;
    policyCompliance: number;
  };
  coachingNote: string;
  reviewer: string;
  reviewedAdvisor: string;
  createdMin: number;
};

export type SeedAuditEvent = {
  id: string;
  type:
    | "state.queue_changed"
    | "state.status_changed"
    | "state.lead_quality_set"
    | "state.outcome_set"
    | "state.assigned"
    | "contact_method.added"
    | "contact_method.edited"
    | "note.added"
    | "qa_scorecard.added"
    | "send_attempt.queued"
    | "send_attempt.failed"
    | "comment_action.hidden";
  label: string;
  summary: string;
  actor: string;
  createdMin: number;
};

export type SeedPresence = {
  advisor: string;
  activity: "viewing" | "typing" | "replying";
  agoSec: number;
};

export type SeedReplyWindow =
  | { state: "open"; remainingDays: number }
  | { state: "closing"; remainingHours: number }
  | { state: "closed"; closedDaysAgo: number };

export type SeedConversation = {
  id: string;
  sender: string;
  handle: string | null;
  initials: string;
  brand: SeedBrand;
  itemKind: SeedItemKind;
  sourceChannel: SeedSourceChannel;
  queueCategory: SeedQueueCategory;
  workflowStatus: SeedWorkflowStatus;
  leadQuality: SeedLeadQuality;
  outcome: SeedOutcome;
  preview: string;
  ageMin: number;
  overSla: boolean;
  unread: number;
  assigned: string | null;
  attribution: SeedAttribution;
  routingConfidence: number;
  routingExplanation: string;
  contactMethods: SeedContactMethod[];
  replyWindow: SeedReplyWindow;
  presences: SeedPresence[];
  thread: SeedMessage[];
  sendAttempts: SeedSendAttempt[];
  notes: SeedNote[];
  qaScorecards: SeedQaScorecard[];
  auditEvents: SeedAuditEvent[];
};

const ATTR_CUSHION: SeedAttribution = {
  campaignUmbrella: "US Product · Q2 Engagement",
  campaign: "Cushion Cut · Engagement · Apr-May",
  adSet: "Cushion Cut · Lookalike 1% · US",
  ad: "Cushion Cut Carousel · Slide 2",
  creative: "Studio video · Pavé band · :15",
  sourcePermalink: "https://facebook.com/123/posts/cushion-cut-carousel",
};

const ATTR_PROPOSAL: SeedAttribution = {
  campaignUmbrella: "Book Appointment · Engagement",
  campaign: "Proposal Stories · Reels · May",
  adSet: "Proposal Stories · Interest · US",
  ad: "Proposal Reel · Story 3",
  creative: "Reel · :30 · 'I said yes'",
  sourcePermalink: "https://instagram.com/reels/proposal-reel-3",
};

const ATTR_SOLITAIRE: SeedAttribution = {
  campaignUmbrella: "VVS · US Product",
  campaign: "Solitaire Highlight · IG Stories",
  adSet: "Solitaire · Engaged in last 12mo",
  ad: "Solitaire Highlight · v3",
  creative: "Carousel · Solitaire · 4-image",
  sourcePermalink: "https://instagram.com/p/solitaire-highlight",
};

const ATTR_INTERNATIONAL: SeedAttribution = {
  campaignUmbrella: "US Product · International",
  campaign: "International Engagement · Apr",
  adSet: "Worldwide ex-US · Engaged",
  ad: "International Atelier · v2",
  creative: "Photo · Atelier hand-shot",
  sourcePermalink: "https://facebook.com/posts/intl-engagement",
};

const ATTR_LABGROWN: SeedAttribution = {
  campaignUmbrella: "VVS · Lab Grown",
  campaign: "Lab Grown Showcase · May",
  adSet: "Lab Grown · Lookalike 2% · US",
  ad: "Lab Grown · Radiant feature",
  creative: "Video · Lab-grown side-by-side · :20",
  sourcePermalink: "https://instagram.com/reels/labgrown-radiant",
};

const ATTR_CUSTOM: SeedAttribution = {
  campaignUmbrella: "HP · Custom · Walk-in",
  campaign: "Custom Design · Walk-in to DM",
  adSet: "Custom · Past customer · 12mo",
  ad: "Custom Design · Atelier visit",
  creative: "Photo · Hand-fitting bench",
  sourcePermalink: "https://facebook.com/posts/custom-design-visit",
};

export const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    id: "c-001",
    sender: "Emma Tran",
    handle: "@emmaposes",
    initials: "ET",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "us_product",
    workflowStatus: "needs_reply",
    leadQuality: "high_intent",
    outcome: "no_outcome_yet",
    preview:
      "is the cushion cut emerald still available in 1.2ct? saw it on the carousel ad last week",
    ageMin: 23,
    overSla: true,
    unread: 2,
    assigned: null,
    attribution: ATTR_CUSHION,
    routingConfidence: 0.91,
    routingExplanation:
      "Mentions specific ad creative and stone spec. High-intent product inquiry; routed to US Product queue.",
    contactMethods: [
      { id: "cm-1", kind: "email", value: "emma.tran@gmail.com", source: "advisor_entered" },
    ],
    replyWindow: { state: "open", remainingDays: 6 },
    presences: [{ advisor: "Mia", activity: "viewing", agoSec: 8 }],
    thread: [
      {
        id: "m-1",
        direction: "inbound",
        body: "hi! saw the cushion cut emerald on the carousel ad last week — is it still available in 1.2ct?",
        sentMin: 23,
      },
      {
        id: "m-2",
        direction: "inbound",
        body: "the green stone with the gold pavé band, second slide",
        sentMin: 22,
        attachments: [
          {
            id: "a-1",
            type: "photo",
            label: "Screenshot of carousel slide 2",
            mime: "image/jpeg",
            sizeBytes: 184_320,
          },
        ],
      },
      {
        id: "m-3",
        direction: "outbound",
        body: "Hi Emma — thank you for reaching out. The 1.2ct cushion cut emerald with the gold pavé band is still available. I've attached the spec sheet and a clearer studio photo.",
        sentMin: 14,
        author: "Mia · HP",
      },
      {
        id: "m-4",
        direction: "outbound",
        body: "Would you like to come in for a viewing this Saturday between 2-5pm? Or we can do a video call if that's easier.",
        sentMin: 13,
        author: "Mia · HP",
      },
      {
        id: "m-5",
        direction: "inbound",
        body: "video call works! saturday 2pm. is that 2pm pacific?",
        sentMin: 6,
      },
    ],
    sendAttempts: [
      {
        id: "sa-1",
        status: "sent",
        body: "Hi Emma — thank you for reaching out. The 1.2ct cushion cut emerald…",
        createdMin: 14,
        author: "Mia",
      },
      {
        id: "sa-2",
        status: "sent",
        body: "Would you like to come in for a viewing this Saturday between 2-5pm?…",
        createdMin: 13,
        author: "Mia",
      },
    ],
    notes: [
      {
        id: "n-1",
        type: "internal_note",
        body: "Returning customer. Bought solitaire pendant in 2024. Prefers video calls — short attention span on long DMs.",
        authorName: "Mia",
        createdMin: 35,
      },
    ],
    qaScorecards: [],
    auditEvents: [
      {
        id: "e-1",
        type: "state.queue_changed",
        label: "Queue: Needs review → US Product",
        summary: "Auto-routed by intent model with 91% confidence.",
        actor: "System",
        createdMin: 23,
      },
      {
        id: "e-2",
        type: "state.lead_quality_set",
        label: "Lead quality: High intent",
        summary: "Mentions specific product spec and ad creative.",
        actor: "Mia",
        createdMin: 18,
      },
      {
        id: "e-3",
        type: "send_attempt.queued",
        label: "Reply sent",
        summary: "First response. 9 min from first inbound.",
        actor: "Mia",
        createdMin: 14,
      },
      {
        id: "e-4",
        type: "note.added",
        label: "Internal note added",
        summary: "Mia · Returning customer note.",
        actor: "Mia",
        createdMin: 12,
      },
    ],
  },
  {
    id: "c-002",
    sender: "Linh Nguyen",
    handle: null,
    initials: "LN",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "facebook_message",
    queueCategory: "book_appointment",
    workflowStatus: "needs_reply",
    leadQuality: "high_intent",
    outcome: "no_outcome_yet",
    preview:
      "hi! we just got engaged 🎉 can we book a consultation for next Saturday afternoon?",
    ageMin: 4,
    overSla: false,
    unread: 1,
    assigned: null,
    attribution: ATTR_PROPOSAL,
    routingConfidence: 0.97,
    routingExplanation: "Explicit consultation booking request. Routed to Book Appointment.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [
      {
        id: "m-1",
        direction: "inbound",
        body: "hi! we just got engaged 🎉 can we book a consultation for next Saturday afternoon?",
        sentMin: 4,
      },
    ],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [
      {
        id: "e-1",
        type: "state.queue_changed",
        label: "Queue: → Book appointment",
        summary: "Auto-routed (confidence 97%).",
        actor: "System",
        createdMin: 4,
      },
    ],
  },
  {
    id: "c-003",
    sender: "Madison Pham",
    handle: "@madisonp",
    initials: "MP",
    brand: "VVS",
    itemKind: "comment",
    sourceChannel: "instagram_public_comment",
    queueCategory: "general_inquiry",
    workflowStatus: "needs_reply",
    leadQuality: "medium_intent",
    outcome: "no_outcome_yet",
    preview: "what's the price for this please ❤️❤️❤️",
    ageMin: 47,
    overSla: true,
    unread: 1,
    assigned: null,
    attribution: ATTR_SOLITAIRE,
    routingConfidence: 0.74,
    routingExplanation: "Public price ask on Solitaire post. Routed to General inquiry pending advisor judgment.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [
      {
        id: "m-1",
        direction: "inbound",
        body: "what's the price for this please ❤️❤️❤️",
        sentMin: 47,
      },
    ],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [
      {
        id: "e-1",
        type: "state.queue_changed",
        label: "Queue: → General inquiry",
        summary: "Public comment on Solitaire ad.",
        actor: "System",
        createdMin: 47,
      },
    ],
  },
  {
    id: "c-004",
    sender: "Sophia Le",
    handle: null,
    initials: "SL",
    brand: "VVS",
    itemKind: "thread",
    sourceChannel: "facebook_message",
    queueCategory: "repair_service",
    workflowStatus: "waiting_on_customer",
    leadQuality: "medium_intent",
    outcome: "no_outcome_yet",
    preview: "thanks for the resize quote — going to confirm with my partner and get back",
    ageMin: 18,
    overSla: false,
    unread: 0,
    assigned: "Mia",
    attribution: null,
    routingConfidence: 0.88,
    routingExplanation: "Resize quote. Repair service queue.",
    contactMethods: [
      { id: "cm-1", kind: "phone", value: "+1 408 555 0162", source: "advisor_entered" },
    ],
    replyWindow: { state: "open", remainingDays: 5 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-005",
    sender: "Hannah Vu",
    handle: "@hannahvu",
    initials: "HV",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "repair_service",
    workflowStatus: "needs_reply",
    leadQuality: "medium_intent",
    outcome: "no_outcome_yet",
    preview: "could you send me the care guide for the pavé band? also do you do warranty repairs?",
    ageMin: 9,
    overSla: false,
    unread: 1,
    assigned: null,
    attribution: null,
    routingConfidence: 0.83,
    routingExplanation: "Care + warranty question. Repair service queue.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-006",
    sender: "Olivia Doan",
    handle: null,
    initials: "OD",
    brand: "HP",
    itemKind: "comment",
    sourceChannel: "facebook_public_comment",
    queueCategory: "general_inquiry",
    workflowStatus: "needs_reply",
    leadQuality: "low_intent",
    outcome: "no_outcome_yet",
    preview: "do you ship to Australia?",
    ageMin: 62,
    overSla: true,
    unread: 1,
    assigned: null,
    attribution: ATTR_INTERNATIONAL,
    routingConfidence: 0.69,
    routingExplanation: "Shipping question. General inquiry.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 5 },
    presences: [],
    thread: [
      { id: "m-1", direction: "inbound", body: "do you ship to Australia?", sentMin: 62 },
    ],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-007",
    sender: "Chloe Bui",
    handle: "@chloebui",
    initials: "CB",
    brand: "VVS",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "custom_jewelry",
    workflowStatus: "closed",
    leadQuality: "high_intent",
    outcome: "sold",
    preview:
      "we're back home — picked up the ring yesterday and it's PERFECT. thank you so much",
    ageMin: 154,
    overSla: false,
    unread: 0,
    assigned: "Mia",
    attribution: null,
    routingConfidence: 0.95,
    routingExplanation: "Custom commission completion.",
    contactMethods: [
      { id: "cm-1", kind: "email", value: "chloe.bui@protonmail.com", source: "advisor_entered" },
    ],
    replyWindow: { state: "open", remainingDays: 6 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [
      {
        id: "qa-1",
        overallScore: 4.7,
        scores: {
          tone: 5,
          completeness: 5,
          accuracy: 5,
          nextStep: 4,
          speed: 4,
          policyCompliance: 5,
        },
        coachingNote:
          "Beautiful handling end-to-end. Slight delay on follow-up after ring sizing; minor.",
        reviewer: "Khoa",
        reviewedAdvisor: "Mia",
        createdMin: 1440,
      },
    ],
    auditEvents: [],
  },
  {
    id: "c-008",
    sender: "Ava Hoang",
    handle: null,
    initials: "AH",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "facebook_message",
    queueCategory: "book_appointment",
    workflowStatus: "appointment_scheduled",
    leadQuality: "high_intent",
    outcome: "booked",
    preview: "the appointment confirmation came through, see you saturday. quick q — can I park near?",
    ageMin: 38,
    overSla: false,
    unread: 0,
    assigned: "Khoa",
    attribution: ATTR_PROPOSAL,
    routingConfidence: 0.94,
    routingExplanation: "Atelier visit confirmation.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-009",
    sender: "Isabella Phan",
    handle: "@isaphan",
    initials: "IP",
    brand: "VVS",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "us_product",
    workflowStatus: "needs_reply",
    leadQuality: "high_intent",
    outcome: "no_outcome_yet",
    preview: "second opinion — is the lab-grown 2ct radiant from your last reel still in stock?",
    ageMin: 11,
    overSla: false,
    unread: 1,
    assigned: null,
    attribution: ATTR_LABGROWN,
    routingConfidence: 0.89,
    routingExplanation: "Product stock check. US Product queue.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-010",
    sender: "Mia Truong",
    handle: "@miatruong",
    initials: "MT",
    brand: "HP",
    itemKind: "comment",
    sourceChannel: "instagram_public_comment",
    queueCategory: "general_inquiry",
    workflowStatus: "closed",
    leadQuality: "low_intent",
    outcome: "no_outcome_yet",
    preview: "🥰🥰🥰 dreaming of this for my anniversary",
    ageMin: 91,
    overSla: false,
    unread: 0,
    assigned: null,
    attribution: null,
    routingConfidence: 0.55,
    routingExplanation: "Aspirational comment. No action required.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 4 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-011",
    sender: "Aria Vo",
    handle: null,
    initials: "AV",
    brand: "VVS",
    itemKind: "thread",
    sourceChannel: "facebook_message",
    queueCategory: "custom_jewelry",
    workflowStatus: "needs_reply",
    leadQuality: "high_intent",
    outcome: "no_outcome_yet",
    preview:
      "is there any way to expedite the engraving? need it by next thursday for our anniversary",
    ageMin: 6,
    overSla: false,
    unread: 1,
    assigned: null,
    attribution: null,
    routingConfidence: 0.92,
    routingExplanation: "Custom engraving timeline. Custom jewelry queue.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-012",
    sender: "Lily Dang",
    handle: "@lilydang",
    initials: "LD",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "custom_jewelry",
    workflowStatus: "follow_up_needed",
    leadQuality: "high_intent",
    outcome: "no_outcome_yet",
    preview:
      "happy to wait until June — just wanted to confirm the design we agreed on last visit",
    ageMin: 142,
    overSla: false,
    unread: 0,
    assigned: "Khoa",
    attribution: ATTR_CUSTOM,
    routingConfidence: 0.96,
    routingExplanation: "Returning custom commission.",
    contactMethods: [],
    replyWindow: { state: "closing", remainingHours: 18 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-013",
    sender: "Bao Tran",
    handle: null,
    initials: "BT",
    brand: "HP",
    itemKind: "thread",
    sourceChannel: "facebook_message",
    queueCategory: "cash_for_gold",
    workflowStatus: "needs_reply",
    leadQuality: "medium_intent",
    outcome: "no_outcome_yet",
    preview:
      "I have an old gold chain my grandmother left, around 18g. Do you do cash for gold or just trade-in?",
    ageMin: 27,
    overSla: true,
    unread: 1,
    assigned: null,
    attribution: null,
    routingConfidence: 0.88,
    routingExplanation: "Cash-for-gold question; routed to Cash for gold queue.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 6 },
    presences: [{ advisor: "Khoa", activity: "typing", agoSec: 4 }],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
  {
    id: "c-014",
    sender: "Phuong Le",
    handle: "@phuongle",
    initials: "PL",
    brand: "VVS",
    itemKind: "thread",
    sourceChannel: "instagram_message",
    queueCategory: "vn_product",
    workflowStatus: "needs_reply",
    leadQuality: "medium_intent",
    outcome: "no_outcome_yet",
    preview: "Em ở Việt Nam, có thể đặt vòng cổ kim cương được không?",
    ageMin: 14,
    overSla: false,
    unread: 1,
    assigned: null,
    attribution: null,
    routingConfidence: 0.82,
    routingExplanation: "Vietnamese-market product question; VN Product queue.",
    contactMethods: [],
    replyWindow: { state: "open", remainingDays: 7 },
    presences: [],
    thread: [],
    sendAttempts: [],
    notes: [],
    qaScorecards: [],
    auditEvents: [],
  },
];

// Field names mirror MetaInboxManagerDashboardMetric in
// src/lib/meta-inbox-manager-dashboard.ts so the prototype can swap to
// real data without renaming.
export const SEED_TEAM_METRICS = {
  needsReply: 9,
  unassigned: 6,
  staleConversations: 3,
  missedFollowUps: 2,
  failedSends: 0,
  retryBacklog: 0,
  missingLeadQuality: 5,
  closeoutIncomplete: 1,
  qaScorecardsReviewed: 14,
  averageQaScore: 4.3,
  labelCompletenessPercent: 78,
  averageFirstResponseMinutes: 11,
  medianFirstResponseMinutes: 8,
};

export const SEED_LAST_SYNC = {
  status: "success" as const,
  completedMinAgo: 4,
};

export const SEED_ADVISORS = [
  { name: "Mia", initials: "M", load: 4, status: "active" as const },
  { name: "Khoa", initials: "K", load: 3, status: "active" as const },
  { name: "Vy", initials: "V", load: 0, status: "off" as const },
];

export const SEED_SAVED_REPLIES: SeedSavedReply[] = [
  {
    id: "sr-1",
    title: "Stone availability — engagement",
    body: "Thank you for reaching out. Yes, that stone is available. Would you like to come in for a viewing or schedule a video call to see it in detail?",
    scope: "shared",
  },
  {
    id: "sr-2",
    title: "Atelier visit — directions + parking",
    body: "Looking forward to seeing you! We're at 1234 Lincoln Ave. Street parking is free after 6pm, and there's a public lot one block north on Adams.",
    scope: "shared",
  },
  {
    id: "sr-3",
    title: "Care guide — pavé bands",
    body: "I'll send the care guide right away. The short version: take it off when applying lotion or perfume, store it flat in the pouch we provided, and bring it in every 6 months for a complimentary clean and prong check.",
    scope: "personal",
  },
];

export function fmtAge(min: number): string {
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function platformOf(channel: SeedSourceChannel): "FB" | "IG" {
  return channel.startsWith("facebook") || channel === "private_reply_from_comment"
    ? "FB"
    : channel === "ad_referral" || channel === "other_unknown"
      ? "FB"
      : "IG";
}

export function itemBadge(channel: SeedSourceChannel): "Msg" | "Cmt" | "Adref" {
  if (channel === "facebook_message" || channel === "instagram_message")
    return "Msg";
  if (channel === "facebook_public_comment" || channel === "instagram_public_comment")
    return "Cmt";
  if (channel === "ad_referral") return "Adref";
  return "Msg";
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}
