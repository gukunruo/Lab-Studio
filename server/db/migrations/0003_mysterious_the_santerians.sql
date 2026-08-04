CREATE TABLE `lesson_annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` text NOT NULL,
	`annotations` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_annotations_lesson_id_unique` ON `lesson_annotations` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `lesson_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` text NOT NULL,
	`content` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_documents_lesson_id_unique` ON `lesson_documents` (`lesson_id`);