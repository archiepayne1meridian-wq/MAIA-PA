CREATE TABLE `apollo_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`call_date` text NOT NULL,
	`prospect_name` text,
	`transcript` text,
	`intelligence_json` text,
	`advisor_brief` text,
	`client_email` text,
	`muse_transcript_id` text,
	`muse_brief_id` text,
	`muse_email_id` text,
	`created_at` integer NOT NULL
);
