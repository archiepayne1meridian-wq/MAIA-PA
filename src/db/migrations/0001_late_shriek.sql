CREATE TABLE `mcq_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`module` text NOT NULL,
	`question` text NOT NULL,
	`correct` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`modules` text NOT NULL,
	`questions` text NOT NULL,
	`current_index` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `study_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`ef` real DEFAULT 2.5 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_reviewed_at` integer
);
--> statement-breakpoint
CREATE TABLE `study_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`quality` integer NOT NULL,
	`ef_after` real NOT NULL,
	`interval_after` integer NOT NULL,
	`reviewed_at` integer NOT NULL
);
