# GenVid Status

**Active Milestone:** Milestone 0 (M0)
**Active Task:** Provide API Keys and configure local Python dependencies to run the M0 pipeline.

## Implemented
- **apps/web**: Scaffolded config
- **apps/api**: CLI skeleton `cli.ts` (using `tsx`) implemented.
- **packages/schemas**: Zod schemas for `ProjectSpec`, `SceneJSON`, and `RenderManifest` defined.
- **packages/providers**: Base `GeminiProvider` implemented using `@google/genai`.
- **packages/prompts**: Base system prompt string generator implemented.
- **packages/pipeline**: `runM0Pipeline` orchestrator function scaffolded.
- **render-workers**: Python stubs for Kokoro TTS (`tts.py`) and faster-whisper alignment (`align.py`) created. Typescript stub for Compositor created.

## Blockers
- Real API keys (`GEMINI_API_KEY`) are needed to test the M0 pipeline.
- Python runtime with Kokoro and faster-whisper installed is needed to execute the mocked python steps.

## Last Exit Test
- `pnpm m0-render` successfully executes the script up to the point of Gemini API invocation, where it fails correctly due to the lack of API credentials.
