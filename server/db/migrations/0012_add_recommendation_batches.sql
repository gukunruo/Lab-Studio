CREATE TABLE `ai_recommendation_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `items` text DEFAULT '[]' NOT NULL,
  `delivered_count` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
