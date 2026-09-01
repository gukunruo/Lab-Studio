CREATE TABLE `ai_image_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_key` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`aspect_ratio` text,
	`style` text,
	`created_at` integer NOT NULL
);
