CREATE TABLE `athena_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`tab` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`note` text,
	`product_id` text,
	`difficulty` integer DEFAULT 0 NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`next_review` text NOT NULL,
	`total_reviews` integer DEFAULT 0 NOT NULL,
	`correct_streak` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `athena_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`sales_angles` text NOT NULL,
	`mcqs` text NOT NULL,
	`podcast_script` text,
	`podcast_audio_url` text,
	`source_filename` text NOT NULL,
	`mcq_count` integer DEFAULT 0 NOT NULL,
	`card_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `athena_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tab` text NOT NULL,
	`cards_reviewed` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text
);
