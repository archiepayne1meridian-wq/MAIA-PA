ALTER TABLE `apollo_calls` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `stage_reached` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `filler_words_json` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `winning_phrases_json` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `saved_phrase_indices_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `follow_up_notes` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `follow_up_date` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `drop_reason` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `prospect_quality` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `call_summary` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `reminder_set` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `reminder_type` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `reminder_date` text;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `email_sent` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `apollo_calls` ADD `dropped` integer DEFAULT 0 NOT NULL;