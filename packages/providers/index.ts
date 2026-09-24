import { ProjectSpec, SceneJSON } from "@genvid/schemas";

export interface LLMProvider {
  generateScript(spec: ProjectSpec, systemPrompt: string): Promise<SceneJSON>;
}

export interface ImageProvider {
  generateImage(prompt: string, seed: number, aspectRatio: string): Promise<Buffer>;
}

export interface VideoAssetProvider {
  searchVideo(query: string, orientation?: "landscape" | "portrait" | "square"): Promise<string | null>;
}

export interface TTSProvider {
  generateAudio(text: string, voiceKey: string): Promise<Buffer>;
}

export * from "./gemini";
export * from "./pexels";
