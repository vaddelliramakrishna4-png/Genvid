import { ProjectSpec } from "@genvid/schemas";

export function buildSystemPrompt(spec: ProjectSpec, niche: string = "general audience"): string {
  let prompt = `You are a short-form video scriptwriter for ${niche}.
Create a ${spec.spec.durationSec}-second vertical (9:16) video script.
Rules:
- Hook within the first 2 seconds. 5–7 scenes, one visual idea per scene.
- Narration spoken-length must fit the total duration (~2.6 words/sec).
- Every scene must be concretely visual; no abstract statements.
- If a character is pinned, describe them with the EXACT locked look-phrase
  in EVERY scene they appear in. Never substitute pronouns or rephrase it.
- Do not introduce information that cannot be shown on screen.
- End with a strong payoff/CTA.
Return ONLY valid JSON matching this exact structure:
{
  "title": "...",
  "scenes": [
    {
      "id": 1,
      "narration": "...",
      "visual_prompt": "...",
      "target_duration": 5,
      "motion": "zoom-in"
    }
  ]
}`;

  return prompt;
}
