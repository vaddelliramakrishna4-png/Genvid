import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./client";
import {
  projects,
  scenes,
  renderJobs,
  assets,
  gallery,
  creditTransactions,
  profiles,
  businessProfiles,
  characters,
} from "./schema";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

// ─── Type Helpers ────────────────────────────────────────────────────────────

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;
export type Scene = InferSelectModel<typeof scenes>;
export type NewScene = InferInsertModel<typeof scenes>;
export type RenderJob = InferSelectModel<typeof renderJobs>;
export type Asset = InferSelectModel<typeof assets>;
export type Profile = InferSelectModel<typeof profiles>;
export type GalleryItem = InferSelectModel<typeof gallery>;

// ─── Profile Queries ─────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const db = getDb();
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return profile ?? null;
}

export async function updateProfile(
  userId: string,
  data: Partial<InferInsertModel<typeof profiles>>
) {
  const db = getDb();
  const [updated] = await db
    .update(profiles)
    .set(data)
    .where(eq(profiles.id, userId))
    .returning();
  return updated;
}

// ─── Project Queries ─────────────────────────────────────────────────────────

export async function createProject(data: NewProject) {
  const db = getDb();
  
  // Ensure the user's profile exists to prevent foreign key violations
  await db.insert(profiles)
    .values({ id: data.userId })
    .onConflictDoNothing();

  const [project] = await db.insert(projects).values(data).returning();
  return project;
}

export async function getProject(projectId: string) {
  const db = getDb();
  const result = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      scenes: { orderBy: [scenes.sceneIndex] },
      renderJobs: true,
      character: true,
      businessProfile: true,
    },
  });
  return result ?? null;
}

export async function getProjectsByUser(
  userId: string,
  limit = 20,
  offset = 0
) {
  const db = getDb();
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateProjectStatus(
  projectId: string,
  status: (typeof projects.$inferSelect)["status"],
  extra: Partial<InferInsertModel<typeof projects>> = {}
) {
  const db = getDb();
  const [updated] = await db
    .update(projects)
    .set({ status, ...extra })
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

export async function updateProject(projectId: string, data: Partial<InferInsertModel<typeof projects>>) {
  const db = getDb();
  const [updated] = await db
    .update(projects)
    .set(data)
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

export async function deleteProject(projectId: string) {
  const db = getDb();
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function updateProjectProgress(
  projectId: string,
  progress: number
) {
  const db = getDb();
  await db
    .update(projects)
    .set({ progress })
    .where(eq(projects.id, projectId));
}

// ─── Scene Queries ───────────────────────────────────────────────────────────

export async function insertScenes(scenesData: NewScene[]) {
  const db = getDb();
  return db.insert(scenes).values(scenesData).returning();
}

export async function getScenesByProject(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(scenes.sceneIndex);
}

export async function updateScene(
  sceneId: string,
  data: Partial<InferInsertModel<typeof scenes>>
) {
  const db = getDb();
  const [updated] = await db
    .update(scenes)
    .set(data)
    .where(eq(scenes.id, sceneId))
    .returning();
  return updated;
}

// ─── Render Job Queries ──────────────────────────────────────────────────────

export async function createRenderJob(
  data: InferInsertModel<typeof renderJobs>
) {
  const db = getDb();
  const [job] = await db.insert(renderJobs).values(data).returning();
  return job;
}

export async function updateRenderJob(
  jobId: string,
  data: Partial<InferInsertModel<typeof renderJobs>>
) {
  const db = getDb();
  const [updated] = await db
    .update(renderJobs)
    .set(data)
    .where(eq(renderJobs.id, jobId))
    .returning();
  return updated;
}

// ─── Asset Queries ───────────────────────────────────────────────────────────

export async function createAsset(data: InferInsertModel<typeof assets>) {
  const db = getDb();
  const [asset] = await db.insert(assets).values(data).returning();
  return asset;
}

export async function getAssetsByProject(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId));
}

// ─── Gallery Queries ─────────────────────────────────────────────────────────

export async function publishToGallery(
  data: InferInsertModel<typeof gallery>
) {
  const db = getDb();
  const [item] = await db.insert(gallery).values(data).returning();
  return item;
}

export async function getPublicGallery(limit = 20, offset = 0) {
  const db = getDb();
  return db.query.gallery.findMany({
    where: eq(gallery.isPublic, true),
    with: { project: true, user: true },
    orderBy: [desc(gallery.publishedAt)],
    limit,
    offset,
  });
}

export async function getUserGallery(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(gallery)
    .where(eq(gallery.userId, userId))
    .orderBy(desc(gallery.createdAt));
}

// ─── Credit Queries ──────────────────────────────────────────────────────────

export async function chargeCredits(
  userId: string,
  projectId: string,
  amount: number,
  reason: string
) {
  const db = getDb();

  // Get current balance
  const profile = await getProfile(userId);
  if (!profile) throw new Error("User not found");
  if (profile.creditsRemaining < amount) {
    throw new Error("Insufficient credits");
  }

  const newBalance = profile.creditsRemaining - amount;

  // Deduct
  await db
    .update(profiles)
    .set({ creditsRemaining: newBalance })
    .where(eq(profiles.id, userId));

  // Log transaction
  const [tx] = await db
    .insert(creditTransactions)
    .values({
      userId,
      projectId,
      amount: -amount,
      reason,
      balanceAfter: newBalance,
    })
    .returning();

  // Also update project
  await db
    .update(projects)
    .set({ creditsCharged: amount })
    .where(eq(projects.id, projectId));

  return tx;
}
