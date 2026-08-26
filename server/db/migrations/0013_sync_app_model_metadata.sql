UPDATE `ai_models`
SET `display_name` = 'GPT 5.4', `capabilities` = '["streaming","reasoning_effort"]', `context_window` = 128000, `rpm_limit` = 5, `tpm_limit` = 10000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'gpt-5.4';
--> statement-breakpoint
UPDATE `ai_models`
SET `display_name` = 'GPT 5.5', `capabilities` = '["streaming","reasoning_effort"]', `context_window` = 128000, `rpm_limit` = 50, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'gpt-5.5';
--> statement-breakpoint
UPDATE `ai_models`
SET `display_name` = 'GPT 5.6 Sol', `context_window` = 128000, `rpm_limit` = 50, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'gpt-5.6-sol';
--> statement-breakpoint
UPDATE `ai_models`
SET `capabilities` = '["streaming"]', `context_window` = 1000000, `rpm_limit` = 50, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` IN ('deepseek-v4-pro', 'deepseek-v4-flash');
--> statement-breakpoint
UPDATE `ai_models`
SET `display_name` = 'Doubao Seed 2.0 mini', `context_window` = 256000, `rpm_limit` = 5, `tpm_limit` = 10000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'doubao-seed-2.0-mini';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 1000000, `rpm_limit` = 20, `tpm_limit` = 20000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'gemini-3-pro-preview';
--> statement-breakpoint
UPDATE `ai_models`
SET `display_name` = 'GLM 5.2', `context_window` = 1000000, `rpm_limit` = 30, `tpm_limit` = 500000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'glm-5.2';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 256000, `rpm_limit` = 30, `tpm_limit` = 50000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'kimi-k2-7-code';
--> statement-breakpoint
UPDATE `ai_models`
SET `rpm_limit` = 20, `tpm_limit` = 0, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'gpt-image-2';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 5, `tpm_limit` = 10000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-opus-4.6';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 20, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-opus-4.7';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 20, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-opus-4.8';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 50, `tpm_limit` = 500000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-opus-5';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 100, `tpm_limit` = 200000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-sonnet-4.6';
--> statement-breakpoint
UPDATE `ai_models`
SET `context_window` = 200000, `rpm_limit` = 50, `tpm_limit` = 500000, `updated_at` = strftime('%s', 'now') * 1000
WHERE `model_id` = 'claude-sonnet-5';
