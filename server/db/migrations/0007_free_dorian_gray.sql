CREATE TABLE `ai_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_key` text NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`model_id` text NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`provider` text NOT NULL,
	`category` text NOT NULL,
	`vendor` text NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`context_window` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_models_model_id_unique` ON `ai_models` (`model_id`);