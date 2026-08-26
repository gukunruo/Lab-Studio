ALTER TABLE `ai_conversations` ADD `parent_conversation_id` integer;
--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `branch_from_message_index` integer;
--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `digest` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `digest_message_count` integer NOT NULL DEFAULT 0;
