ALTER TABLE `muse_entries` ADD `has_file` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `file_name` text;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `file_type` text;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `file_size` integer;--> statement-breakpoint
ALTER TABLE `muse_entries` ADD `file_data` blob;