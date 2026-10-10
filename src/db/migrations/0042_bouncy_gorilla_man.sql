CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_content` text NOT NULL,
	`hook_text` text NOT NULL,
	`slides` text NOT NULL,
	`caption` text NOT NULL,
	`hashtags` text NOT NULL,
	`image_urls` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
