-- ============================================================================
-- GenVid Database Schema (Supabase / PostgreSQL)
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Requires: Supabase project with Auth enabled
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";           -- gen_random_uuid()
create extension if not exists "pg_trgm";            -- fuzzy text search


-- ---------------------------------------------------------------------------
-- 1. PROFILES  (extends Supabase auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique,
  full_name       text,
  avatar_url      text,
  subscription_tier text not null default 'free'
                  check (subscription_tier in ('free', 'starter', 'pro', 'enterprise')),
  credits_remaining integer not null default 50,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'User profile data synced from Supabase Auth via trigger.';


-- ---------------------------------------------------------------------------
-- 2. BUSINESS PROFILES  (optional brand context for video generation)
-- ---------------------------------------------------------------------------
create table if not exists public.business_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  niche           text,            -- e.g. "tech reviews", "cooking", "fitness"
  target_audience text,
  brand_voice     text,            -- e.g. "casual & witty", "professional"
  logo_url        text,
  brand_colors    jsonb default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.business_profiles is
  'Brand/business context that shapes AI-generated scripts.';


-- ---------------------------------------------------------------------------
-- 3. CHARACTERS  (pinned visual characters for consistent look across scenes)
-- ---------------------------------------------------------------------------
create table if not exists public.characters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  look_phrase     text not null,   -- locked visual description used in every scene
  reference_image_url text,        -- Supabase Storage path
  voice_key       text,            -- TTS voice identifier
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.characters is
  'Reusable characters with a locked visual description for consistent generation.';


-- ---------------------------------------------------------------------------
-- 4. PROJECTS  (one project = one video generation request)
-- ---------------------------------------------------------------------------
create type public.project_mode as enum ('idea', 'verbatim_script');
create type public.project_status as enum (
  'draft',
  'queued',
  'generating_script',
  'generating_media',
  'generating_voice',
  'aligning',
  'compositing',
  'completed',
  'failed',
  'cancelled'
);

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  character_id    uuid references public.characters(id) on delete set null,

  -- Input
  title           text,
  mode            public.project_mode not null default 'idea',
  input_text      text not null,   -- the idea or verbatim script

  -- Spec (mirrors ProjectSpec.spec in @genvid/schemas)
  duration_sec    integer not null default 30,
  aspect_ratio    text not null default '9:16',
  style_key       text not null default 'cinematic',
  seed            integer not null default 42,
  voice_key       text not null default 'en-IN-calm-male',
  caption_preset  text not null default 'bold-pop',
  music_key       text,
  language        text not null default 'en-IN',

  -- Pipeline state
  status          public.project_status not null default 'draft',
  error_message   text,
  progress        integer not null default 0 check (progress between 0 and 100),

  -- Output
  scene_json      jsonb,           -- cached SceneJSON from the LLM
  manifest_json   jsonb,           -- cached RenderManifest
  output_video_url text,           -- Supabase Storage path to final .mp4
  thumbnail_url   text,

  -- Credits
  credits_charged integer not null default 0,

  -- Timestamps
  queued_at       timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_projects_user      on public.projects(user_id);
create index idx_projects_status    on public.projects(status);
create index idx_projects_created   on public.projects(created_at desc);

comment on table public.projects is
  'Each row = one video generation job. Tracks full lifecycle from idea to final MP4.';


-- ---------------------------------------------------------------------------
-- 5. SCENES  (individual scenes within a project)
-- ---------------------------------------------------------------------------
create table if not exists public.scenes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  scene_index     integer not null,   -- 0-based ordering

  -- Content (from SceneJSON)
  narration       text not null,
  visual_prompt   text not null,
  character_refs  text[] default '{}',
  target_duration real not null,      -- seconds
  motion          text,               -- e.g. "zoom-in", "pan-left"
  transition_in   text,               -- e.g. "xfade", "fade"

  -- Generated assets (Supabase Storage paths)
  image_url       text,
  audio_url       text,
  actual_duration real,               -- measured after TTS

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (project_id, scene_index)
);

create index idx_scenes_project on public.scenes(project_id);

comment on table public.scenes is
  'One scene per row. Generated by LLM, then enriched with image/audio asset URLs.';


-- ---------------------------------------------------------------------------
-- 6. RENDER JOBS  (QStash job tracking for async rendering pipeline)
-- ---------------------------------------------------------------------------
create type public.render_step as enum (
  'script_gen',
  'image_gen',
  'tts',
  'alignment',
  'composition'
);

create table if not exists public.render_jobs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  step            public.render_step not null,
  qstash_message_id text,            -- QStash message ID for tracking
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'completed', 'failed', 'retrying')),
  attempt         integer not null default 0,
  max_attempts    integer not null default 3,
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,
  metadata        jsonb default '{}'::jsonb,   -- step-specific data
  created_at      timestamptz not null default now()
);

create index idx_render_jobs_project on public.render_jobs(project_id);
create index idx_render_jobs_status  on public.render_jobs(status);

comment on table public.render_jobs is
  'Tracks each async pipeline step dispatched via QStash/Upstash.';


-- ---------------------------------------------------------------------------
-- 7. ASSETS  (all generated files: images, audio, subtitles, video)
-- ---------------------------------------------------------------------------
create type public.asset_type as enum (
  'scene_image',
  'scene_audio',
  'merged_audio',
  'subtitles_ass',
  'background_music',
  'final_video',
  'thumbnail'
);

create table if not exists public.assets (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  scene_id        uuid references public.scenes(id) on delete set null,
  asset_type      public.asset_type not null,
  storage_path    text not null,       -- Supabase Storage bucket path
  public_url      text,                -- signed or public URL
  mime_type       text,
  file_size_bytes bigint,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index idx_assets_project on public.assets(project_id);

comment on table public.assets is
  'Registry of all generated artifacts stored in Supabase Storage.';


-- ---------------------------------------------------------------------------
-- 8. CREDIT TRANSACTIONS  (audit log for credit usage)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  amount          integer not null,    -- negative = spend, positive = topup/refund
  reason          text not null,       -- e.g. "video_generation", "topup_stripe", "refund"
  balance_after   integer not null,
  created_at      timestamptz not null default now()
);

create index idx_credit_tx_user on public.credit_transactions(user_id);

comment on table public.credit_transactions is
  'Audit log of every credit spend/topup for billing transparency.';


-- ---------------------------------------------------------------------------
-- 9. USER GALLERY  (saved / published videos)
-- ---------------------------------------------------------------------------
create table if not exists public.gallery (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  title           text,
  description     text,
  is_public       boolean not null default false,
  view_count      integer not null default 0,
  like_count      integer not null default 0,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_gallery_user   on public.gallery(user_id);
create index idx_gallery_public on public.gallery(is_public) where is_public = true;

comment on table public.gallery is
  'User-curated gallery of finished videos that can be published publicly.';


-- ---------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables
alter table public.profiles           enable row level security;
alter table public.business_profiles  enable row level security;
alter table public.characters         enable row level security;
alter table public.projects           enable row level security;
alter table public.scenes             enable row level security;
alter table public.render_jobs        enable row level security;
alter table public.assets             enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.gallery            enable row level security;

-- Profiles: users see/edit only their own
create policy "profiles_select_own"  on public.profiles  for select using (auth.uid() = id);
create policy "profiles_update_own"  on public.profiles  for update using (auth.uid() = id);

-- Business Profiles
create policy "bp_select_own" on public.business_profiles for select using (auth.uid() = user_id);
create policy "bp_insert_own" on public.business_profiles for insert with check (auth.uid() = user_id);
create policy "bp_update_own" on public.business_profiles for update using (auth.uid() = user_id);
create policy "bp_delete_own" on public.business_profiles for delete using (auth.uid() = user_id);

-- Characters
create policy "char_select_own" on public.characters for select using (auth.uid() = user_id);
create policy "char_insert_own" on public.characters for insert with check (auth.uid() = user_id);
create policy "char_update_own" on public.characters for update using (auth.uid() = user_id);
create policy "char_delete_own" on public.characters for delete using (auth.uid() = user_id);

-- Projects
create policy "proj_select_own" on public.projects for select using (auth.uid() = user_id);
create policy "proj_insert_own" on public.projects for insert with check (auth.uid() = user_id);
create policy "proj_update_own" on public.projects for update using (auth.uid() = user_id);

-- Scenes (via project ownership)
create policy "scene_select_own" on public.scenes for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- Render Jobs (via project ownership)
create policy "rj_select_own" on public.render_jobs for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- Assets (via project ownership)
create policy "asset_select_own" on public.assets for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- Credit Transactions
create policy "ct_select_own" on public.credit_transactions for select using (auth.uid() = user_id);

-- Gallery: owner sees all; public sees published
create policy "gal_select_own"    on public.gallery for select using (auth.uid() = user_id);
create policy "gal_select_public" on public.gallery for select using (is_public = true);
create policy "gal_insert_own"    on public.gallery for insert with check (auth.uid() = user_id);
create policy "gal_update_own"    on public.gallery for update using (auth.uid() = user_id);
create policy "gal_delete_own"    on public.gallery for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 11. AUTO-UPDATE TRIGGERS  (updated_at timestamps)
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_business_profiles_updated_at
  before update on public.business_profiles
  for each row execute function public.handle_updated_at();

create trigger set_characters_updated_at
  before update on public.characters
  for each row execute function public.handle_updated_at();

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

create trigger set_scenes_updated_at
  before update on public.scenes
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 12. AUTO-CREATE PROFILE ON SIGNUP  (Supabase Auth trigger)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 13. SUPABASE STORAGE BUCKETS  (run these separately or via dashboard)
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values
--   ('project-assets', 'project-assets', false),
--   ('avatars',        'avatars',        true),
--   ('gallery',        'gallery',        true);

-- Storage policies would go here (allow users to upload to their own folder etc.)


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
