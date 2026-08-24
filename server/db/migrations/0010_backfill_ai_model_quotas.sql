UPDATE `ai_models` SET `rpm_limit` = 50, `tpm_limit` = 200000 WHERE `model_id` IN ('gpt-5.5', 'deepseek-v4-pro', 'deepseek-v4-flash');
--> statement-breakpoint
UPDATE `ai_models` SET `rpm_limit` = 5, `tpm_limit` = 10000 WHERE `model_id` = 'doubao-seed-2.0-mini';
--> statement-breakpoint
REPLACE INTO `ai_models` (
  `model_id`, `display_name`, `provider`, `category`, `vendor`, `capabilities`, `context_window`, `rpm_limit`, `tpm_limit`, `sort_order`, `enabled`, `created_at`, `updated_at`
) VALUES (
  'gemini-3-pro-preview', 'Gemini 3 Pro Preview', 'openai-compatible', 'chat', 'google', '["streaming"]', 128000, 20, 20000, 23, 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
);
--> statement-breakpoint
UPDATE `ai_models` SET `rpm_limit` = NULL, `tpm_limit` = NULL WHERE `model_id` NOT IN ('gpt-5.5', 'deepseek-v4-pro', 'deepseek-v4-flash', 'doubao-seed-2.0-mini', 'gemini-3-pro-preview');
