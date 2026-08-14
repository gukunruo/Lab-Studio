CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_key` text NOT NULL,
	`quote_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`type_name` text DEFAULT '' NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
