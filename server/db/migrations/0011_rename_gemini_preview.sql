INSERT OR IGNORE INTO `ai_models` (
  `model_id`, `display_name`, `provider`, `category`, `vendor`, `capabilities`, `context_window`, `rpm_limit`, `tpm_limit`, `sort_order`, `enabled`, `created_at`, `updated_at`
) VALUES (
  'gemini-3-pro-preview', 'Gemini 3 Pro Preview', 'openai-compatible', 'chat', 'google', '["streaming"]', 128000, 20, 20000, 23, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
);
--> statement-breakpoint
UPDATE `ai_models`
SET `display_name` = 'Gemini 3 Pro Preview', `rpm_limit` = 20, `tpm_limit` = 20000
WHERE `model_id` = 'gemini-3-pro-preview';
--> statement-breakpoint
DELETE FROM `ai_models`
WHERE `model_id` = 'gemini-3-pro';
