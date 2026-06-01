export const SALES_ERP_CORE_TABLES = [
  "appointment_artifacts",
  "appointment_events",
  "appointment_notice_reads",
  "appointment_notices",
  "appointment_read_model_import_staging",
  "broadcast_reads",
  "broadcast_targets",
  "broadcasts",
  "client_status",
  "client_status_history",
  "config",
  "customer_info",
  "customer_purge_runs",
  "customer_read_model_import_staging",
  "customer_read_model_owner_aliases",
  "customers",
  "data_cleanup_cases",
  "design_assets",
  "design_deck_slides",
  "design_deck_versions",
  "design_decks",
  "diamond_proposal_drafts",
  "diamond_quote_prep",
  "diamond_read_model_import_staging",
  "diamond_viewing",
  "diamond_viewing_requirement_events",
  "doc_number_sequences",
  "documents",
  "human_id_sequences",
  "intake_queue",
  "order_3d",
  "order_3d_revisions",
  "payment_ledger",
  "payment_read_model_import_staging",
  "post_consult_task_drafts",
  "post_consult_task_files",
  "quotations",
  "recording_analysis_groups",
  "recording_sessions",
  "root_appointments",
  "roster_schedule",
  "schedule_changes",
  "stones",
  "stones_sync",
  "storage_assets",
  "task_collaborators",
  "task_gen_queue",
  "task_log",
  "tasks",
  "templates",
  "user_roles",
  "users",
  "wax_requests",
] as const;

export const ANALYST_OWNED_TABLES = [
  "ad_notes",
  "ai_analysis_dashboards",
  "ai_analysis_runs",
  "ai_analysis_workbench_runs",
  "ai_chat_messages",
  "ai_chat_sessions",
  "ai_reply_prompt_profiles",
  "ai_reply_suggestion_feedback",
  "ai_reply_suggestions",
  "ai_reply_training_examples",
  "ai_reports",
  "ai_signals",
  "brand_voice_guidelines",
  "brands",
  "campaign_umbrella_overrides",
  "meta_ad_accounts",
  "meta_ad_labels",
  "meta_ad_pixels",
  "meta_ad_sets",
  "meta_ads",
  "meta_ads_backfill_chunks",
  "meta_ads_backfill_jobs",
  "meta_campaigns",
  "meta_creatives",
  "meta_custom_conversions",
  "meta_daily_insight_enrichments",
  "meta_daily_insights",
  "meta_inbox_attachments",
  "meta_inbox_comment_actions",
  "meta_inbox_conversation_events",
  "meta_inbox_conversations",
  "meta_inbox_customer_contact_methods",
  "meta_inbox_customer_profiles",
  "meta_inbox_first_touch_sources",
  "meta_inbox_notes",
  "meta_inbox_presence",
  "meta_inbox_qa_scorecards",
  "meta_inbox_queue_categories",
  "meta_inbox_saved_replies",
  "meta_inbox_send_attempts",
  "meta_inbox_team_members",
  "meta_inbox_team_queue_access",
  "meta_inbox_teams",
  "meta_social_comments",
  "meta_social_messages",
  "meta_social_pages",
  "meta_social_sync_runs",
  "meta_social_threads",
  "meta_insight_breakdown_backfill_chunks",
  "meta_insight_breakdown_daily",
  "reply_playbook_entries",
  "social_thread_summaries",
  "sync_runs",
  "website_conversions",
  "website_events",
  "website_sessions",
  "website_visitors",
] as const;

export const SHARED_REFERENCE_TABLES = [] as const;

export const ADS_ANALYST_ENVIRONMENTS = ["production", "staging"] as const;

export const DEFAULT_ADS_ANALYST_ENVIRONMENT = "production";

/**
 * Tables that the Phase 3 environment-scope migration added an `environment`
 * column to. New analyst-owned tables created after Phase 3 (e.g. ai_signals,
 * ad_notes) declare their `environment` column in their own migration and are
 * deliberately NOT included here, so the static Phase 3 assertion remains
 * stable across future analyst-table additions.
 */
export const ANALYST_ENVIRONMENT_SCOPED_TABLES = [
  "ai_analysis_dashboards",
  "ai_analysis_runs",
  "ai_chat_messages",
  "ai_chat_sessions",
  "ai_reply_suggestions",
  "ai_reports",
  "brand_voice_guidelines",
  "brands",
  "campaign_umbrella_overrides",
  "meta_ad_accounts",
  "meta_ad_sets",
  "meta_ads",
  "meta_ads_backfill_chunks",
  "meta_ads_backfill_jobs",
  "meta_campaigns",
  "meta_creatives",
  "meta_daily_insights",
  "meta_social_comments",
  "meta_social_messages",
  "meta_social_pages",
  "meta_social_sync_runs",
  "meta_social_threads",
  "reply_playbook_entries",
  "social_thread_summaries",
  "sync_runs",
  "website_events",
  "website_sessions",
] as const;

export type SalesErpCoreTable = (typeof SALES_ERP_CORE_TABLES)[number];
export type AnalystOwnedTable = (typeof ANALYST_OWNED_TABLES)[number];
export type AdsAnalystEnvironment = (typeof ADS_ANALYST_ENVIRONMENTS)[number];

const SALES_ERP_CORE_TABLE_SET = new Set<string>(SALES_ERP_CORE_TABLES);
const ANALYST_OWNED_TABLE_SET = new Set<string>(ANALYST_OWNED_TABLES);
const ADS_ANALYST_ENVIRONMENT_SET = new Set<string>(ADS_ANALYST_ENVIRONMENTS);

export function isSalesErpCoreTable(table: string): table is SalesErpCoreTable {
  return SALES_ERP_CORE_TABLE_SET.has(table);
}

export function isAnalystOwnedTable(table: string): table is AnalystOwnedTable {
  return ANALYST_OWNED_TABLE_SET.has(table);
}

export function isAdsAnalystEnvironment(value: string): value is AdsAnalystEnvironment {
  return ADS_ANALYST_ENVIRONMENT_SET.has(value);
}
