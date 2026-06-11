CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`type` text NOT NULL,
	`agent` text,
	`slack_user` text,
	`input` text,
	`output` text,
	`status` text NOT NULL,
	`duration_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_event_id_unique` ON `activity` (`event_id`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`slack_message_ts` text,
	`slack_channel` text,
	`requested_by` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
