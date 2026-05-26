import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyLabel,
} from "../../../lib/meta-inbox-vocabulary.ts";

export function computeConversationSearchHaystack(conversation: MetaInboxQueueDisplayItem) {
  return [
    conversation.brand,
    conversation.channel,
    conversation.type,
    conversation.status,
    conversation.sender,
    conversation.profile?.username,
    conversation.preview,
    conversation.routingExplanation,
    conversation.firstTouch?.campaign_umbrella_id,
    conversation.firstTouch?.campaign_id,
    conversation.firstTouch?.adset_id,
    conversation.firstTouch?.ad_id,
    conversation.firstTouch?.creative_id,
    conversation.firstTouch?.ref,
    metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, conversation.queueCategoryKey),
    metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, conversation.sourceChannel),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}
