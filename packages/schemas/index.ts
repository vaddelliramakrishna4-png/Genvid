import { z } from "zod";

export const ProjectSpecSchema = z.object({
  projectId: z.string(),
  mode: z.enum(["idea", "verbatim_script"]),
  input: z.string(),
  businessProfileId: z.string().nullable(),
  characterId: z.string().nullable(),
  spec: z.object({
    durationSec: z.number(),
    aspectRatio: z.literal("9:16"),
    styleKey: z.string(),
    seed: z.number(),
    voiceKey: z.string(),
    captionPreset: z.string(),
    musicKey: z.string(),
    language: z.string(),
  }),
});
export type ProjectSpec = z.infer<typeof ProjectSpecSchema>;

export const SceneSchema = z.object({
  id: z.number(),
  narration: z.string(),
  visual_prompt: z.string(),
  character_refs: z.array(z.string()).default([]),
  target_duration: z.number(),
  motion: z.string().optional(),
  transition_in: z.string().optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const SceneJSONSchema = z.object({
  title: z.string(),
  scenes: z.array(SceneSchema),
});
export type SceneJSON = z.infer<typeof SceneJSONSchema>;

export const RenderManifestSchema = z.object({
  projectId: z.string(),
  timeline: z.array(
    z.object({
      sceneId: z.number(),
      imagePath: z.string(),
      audioPath: z.string(),
      duration: z.number(),
      motion: z.string().optional(),
      transition: z.string().optional(),
    })
  ),
  subtitlesPath: z.string(),
  musicPath: z.string().optional(),
  duckingLevel: z.number().default(-15),
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;
