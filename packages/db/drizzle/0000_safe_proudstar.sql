CREATE TYPE "public"."asset_type" AS ENUM('scene_image', 'scene_video', 'scene_audio', 'merged_audio', 'subtitles_ass', 'background_music', 'final_video', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."project_mode" AS ENUM('idea', 'verbatim_script');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'queued', 'generating_script', 'storyboard', 'generating_media', 'generating_voice', 'aligning', 'mixing', 'compositing', 'uploading', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."render_step" AS ENUM('script_gen', 'image_gen', 'tts', 'alignment', 'composition');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scene_id" uuid,
	"asset_type" "asset_type" NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text,
	"mime_type" text,
	"file_size_bytes" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"niche" text,
	"target_audience" text,
	"brand_voice" text,
	"logo_url" text,
	"brand_colors" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"look_phrase" text NOT NULL,
	"reference_image_url" text,
	"voice_key" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"avatar_url" text,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"credits_remaining" integer DEFAULT 50 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_profile_id" uuid,
	"character_id" uuid,
	"title" text,
	"mode" "project_mode" DEFAULT 'idea' NOT NULL,
	"input_text" text NOT NULL,
	"duration_sec" integer DEFAULT 30 NOT NULL,
	"aspect_ratio" text DEFAULT '9:16' NOT NULL,
	"style_key" text DEFAULT 'cinematic' NOT NULL,
	"seed" integer DEFAULT 42 NOT NULL,
	"voice_key" text DEFAULT 'en-IN-calm-male' NOT NULL,
	"caption_preset" text DEFAULT 'bold-pop' NOT NULL,
	"music_key" text,
	"language" text DEFAULT 'en-IN' NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"error_message" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"scene_json" jsonb,
	"manifest_json" jsonb,
	"output_video_url" text,
	"thumbnail_url" text,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"schedule_status" text DEFAULT 'draft' NOT NULL,
	"queued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"step" "render_step" NOT NULL,
	"qstash_message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scene_index" integer NOT NULL,
	"narration" text NOT NULL,
	"visual_prompt" text NOT NULL,
	"character_refs" text[] DEFAULT '{}',
	"target_duration" real NOT NULL,
	"motion" text,
	"transition_in" text,
	"image_url" text,
	"audio_url" text,
	"actual_duration" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery" ADD CONSTRAINT "gallery_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery" ADD CONSTRAINT "gallery_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_profile_id_business_profiles_id_fk" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_project" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_user" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_gallery_user" ON "gallery" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_gallery_public" ON "gallery" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_projects_user" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_projects_created" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_render_jobs_project" ON "render_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_render_jobs_status" ON "render_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_scenes_project" ON "scenes" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_project_scene_idx" ON "scenes" USING btree ("project_id","scene_index");