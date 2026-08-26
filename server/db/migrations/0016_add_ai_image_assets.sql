CREATE TABLE `ai_image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`extension` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` integer NOT NULL
);
