CREATE TABLE `maia_daily_log` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`linkedin_posts` integer DEFAULT 0 NOT NULL,
	`diana_sessions_count` integer DEFAULT 0 NOT NULL,
	`athena_sessions` integer DEFAULT 0 NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`tasks_total` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maia_daily_log_date_unique` ON `maia_daily_log` (`date`);--> statement-breakpoint
CREATE TABLE `maia_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`completed` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maia_weekly_intentions` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`focus_areas` text NOT NULL,
	`raw_input` text NOT NULL,
	`created_at` integer NOT NULL
);
