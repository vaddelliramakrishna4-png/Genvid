import { GoogleGenAI } from "@google/genai";
import { ProjectSpec, SceneJSON, SceneJSONSchema } from "@genvid/schemas";
import { LLMProvider, ImageProvider } from "./index";

export class GeminiProvider implements LLMProvider, ImageProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateScript(spec: ProjectSpec, systemPrompt: string): Promise<SceneJSON> {
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.4-flash",
      "gemini-3.3-flash",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-2.5-computer-use-preview-10-2025"
    ];

    let lastError: any = null;
    let responseText = "";
    
    let attempt = 0;
    while (!responseText && attempt < 1) {
      attempt++;
      for (const modelName of modelsToTry) {
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
          break; // Success
        } catch (err: any) {
          console.warn(`[GEMINI] Model ${modelName} failed on attempt ${attempt}:`, err?.message || err);
          lastError = err;
        }
      }
      if (!responseText) {
        console.log(`[GEMINI] Attempt ${attempt} failed. Retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    if (!responseText) {
      console.warn(`[GEMINI] All models failed after 5 attempts. Last error: ${lastError?.message}`);
      console.warn(`[GEMINI] Falling back to local dynamic script generation based on user input.`);
      
      const words = spec.input.split(" ").filter(w => w.length > 3);
      const keywords = words.slice(0, 3).join(" ") || "abstract";
      
      return {
        title: "Dynamic Video",
        scenes: [
          {
            id: 1,
            narration: spec.input,
            visual_prompt: `${keywords} high quality cinematic`,
            target_duration: 6
          }
        ]
      } as any;
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
