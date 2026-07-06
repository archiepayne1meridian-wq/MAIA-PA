CREATE TABLE `mercury_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`medium` text NOT NULL,
	`context` text NOT NULL,
	`incoming_message` text,
	`draft` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`slack_ts` text,
	`created_at` integer NOT NULL
);
