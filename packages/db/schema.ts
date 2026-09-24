import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  real,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const projectModeEnum = pgEnum("project_mode", [
  "idea",
  "verbatim_script",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "queued",
  "generating_script",
  "generating_media",
  "generating_voice",
  "aligning",
  "compositing",
  "completed",
  "failed",
  "cancelled",
]);

export const renderStepEnum = pgEnum("render_step", [
  "script_gen",
  "image_gen",
  "tts",
  "alignment",
  "composition",
]);

export const assetTypeEnum = pgEnum("asset_type", [
  "scene_image",
  "scene_audio",
  "merged_audio",
  "subtitles_ass",
  "background_music",
  "final_video",
  "thumbnail",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  creditsRemaining: integer("credits_remaining").notNull().default(50),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const businessProfiles = pgTable("business_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  niche: text("niche"),
  targetAudience: text("target_audience"),
  brandVoice: text("brand_voice"),
  logoUrl: text("logo_url"),
  brandColors: jsonb("brand_colors").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lookPhrase: text("look_phrase").notNull(),
  referenceImageUrl: text("reference_image_url"),
  voiceKey: text("voice_key"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    businessProfileId: uuid("business_profile_id").references(() => businessProfiles.id, { onDelete: "set null" }),
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),

    // Input
    title: text("title"),
    mode: projectModeEnum("mode").notNull().default("idea"),
    inputText: text("input_text").notNull(),

    // Spec
    durationSec: integer("duration_sec").notNull().default(30),
    aspectRatio: text("aspect_ratio").notNull().default("9:16"),
    styleKey: text("style_key").notNull().default("cinematic"),
    seed: integer("seed").notNull().default(42),
    voiceKey: text("voice_key").notNull().default("en-IN-calm-male"),
    captionPreset: text("caption_preset").notNull().default("bold-pop"),
    musicKey: text("music_key"),
    language: text("language").notNull().default("en-IN"),

    // Pipeline state
    status: projectStatusEnum("status").notNull().default("draft"),
    errorMessage: text("error_message"),
    progress: integer("progress").notNull().default(0),

    // Output
    sceneJson: jsonb("scene_json"),
    manifestJson: jsonb("manifest_json"),
    outputVideoUrl: text("output_video_url"),
    thumbnailUrl: text("thumbnail_url"),

    // Credits
    creditsCharged: integer("credits_charged").notNull().default(0),

    // Timestamps
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_projects_user").on(table.userId),
    statusIdx: index("idx_projects_status").on(table.status),
    createdIdx: index("idx_projects_created").on(table.createdAt),
  })
);

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sceneIndex: integer("scene_index").notNull(),

    // Content
    narration: text("narration").notNull(),
    visualPrompt: text("visual_prompt").notNull(),
    characterRefs: text("character_refs").array().default([]),
    targetDuration: real("target_duration").notNull(),
    motion: text("motion"),
    transitionIn: text("transition_in"),

    // Generated assets
    imageUrl: text("image_url"),
    audioUrl: text("audio_url"),
    actualDuration: real("actual_duration"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_scenes_project").on(table.projectId),
    uniqueScene: uniqueIndex("scenes_project_scene_idx").on(table.projectId, table.sceneIndex),
  })
);

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    step: renderStepEnum("step").notNull(),
    qstashMessageId: text("qstash_message_id"),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_render_jobs_project").on(table.projectId),
    statusIdx: index("idx_render_jobs_status").on(table.status),
  })
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    assetType: assetTypeEnum("asset_type").notNull(),
    storagePath: text("storage_path").notNull(),
    publicUrl: text("public_url"),
    mimeType: text("mime_type"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_assets_project").on(table.projectId),
  })
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_credit_tx_user").on(table.userId),
  })
);

export const gallery = pgTable(
  "gallery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title"),
    description: text("description"),
    isPublic: boolean("is_public").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_gallery_user").on(table.userId),
    publicIdx: index("idx_gallery_public").on(table.isPublic),
  })
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const profilesRelations = relations(profiles, ({ many }) => ({
  businessProfiles: many(businessProfiles),
  characters: many(characters),
  projects: many(projects),
  creditTransactions: many(creditTransactions),
  gallery: many(gallery),
}));

export const businessProfilesRelations = relations(businessProfiles, ({ one, many }) => ({
  user: one(profiles, { fields: [businessProfiles.userId], references: [profiles.id] }),
  projects: many(projects),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  user: one(profiles, { fields: [characters.userId], references: [profiles.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  businessProfile: one(businessProfiles, { fields: [projects.businessProfileId], references: [businessProfiles.id] }),
  character: one(characters, { fields: [projects.characterId], references: [characters.id] }),
  scenes: many(scenes),
  renderJobs: many(renderJobs),
  assets: many(assets),
  gallery: many(gallery),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
  assets: many(assets),
}));

export const renderJobsRelations = relations(renderJobs, ({ one }) => ({
  project: one(projects, { fields: [renderJobs.projectId], references: [projects.id] }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  project: one(projects, { fields: [assets.projectId], references: [projects.id] }),
  scene: one(scenes, { fields: [assets.sceneId], references: [scenes.id] }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(profiles, { fields: [creditTransactions.userId], references: [profiles.id] }),
  project: one(projects, { fields: [creditTransactions.projectId], references: [projects.id] }),
}));

export const galleryRelations = relations(gallery, ({ one }) => ({
  user: one(profiles, { fields: [gallery.userId], references: [profiles.id] }),
  project: one(projects, { fields: [gallery.projectId], references: [projects.id] }),
}));
