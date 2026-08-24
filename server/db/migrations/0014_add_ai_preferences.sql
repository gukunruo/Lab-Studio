CREATE TABLE `ai_preferences` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_key` text NOT NULL,
  `preferences` text DEFAULT '{}' NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_preferences_user_key_unique` ON `ai_preferences` (`user_key`);