CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`source` text DEFAULT 'text' NOT NULL,
	`sentiment` text,
	`distress_flagged` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL
);
