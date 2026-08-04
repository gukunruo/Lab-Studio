CREATE TABLE `admin_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
