import { GoogleGenAI } from "@google/genai";
import { ProjectSpec, SceneJSON, SceneJSONSchema } from "@genvid/schemas";
import { LLMProvider, ImageProvider } from "./index";

export class GeminiProvider implements LLMProvider, ImageProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateScript(spec: ProjectSpec, systemPrompt: string): Promise<SceneJSON> {
    const modelName = "gemini-3.1-flash-lite";
    console.log(`[GEMINI] model=${modelName}`);

    let responseText = "";
    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: spec.input,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });
      responseText = response.text || "{}";
    } catch (err: any) {
      console.error(`[GEMINI ERROR] Model ${modelName} failed:`, err?.message || err);
      throw err;
    }

    if (!responseText) {
      throw new Error("Gemini returned empty response text");
    }

    // Strip markdown formatting if Gemini included it
    const cleanText = responseText.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleanText);
    return SceneJSONSchema.parse(parsed);
  }

  async generateImage(prompt: string, seed: number, aspectRatio: string): Promise<Buffer> {
    // Note: aspect ratio mapping (e.g., 9:16 to supported strings) would go here
    const response = await this.ai.models.generateImages({
      model: "imagen-3.0-generate-002", // placeholder for Nano Banana / 2.5 Flash Image 
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: aspectRatio, 
        // seed is not directly on top-level config for all models, passing as needed
      },
    });

    const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
    if (!base64Image) {
      throw new Error("Failed to generate image from Gemini");
    }
    
    return Buffer.from(base64Image, "base64");
  }
}
