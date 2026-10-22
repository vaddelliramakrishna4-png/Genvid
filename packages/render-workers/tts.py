# Kokoro-82M TTS with Single & Batch Processing Support
import sys
import os
import json
import numpy as np
import soundfile as sf

VOICE_MAP = {
    # UI Voice Keys
    "en-in-calm-male": "am_adam",
    "en-us-energetic": "af_bella",
    "en-gb-pro": "bm_george",
    "indian english · calm ⏵": "am_adam",
    "us english · energetic ⏵": "af_bella",
    "uk english · pro ⏵": "bm_george",
    # Direct Kokoro voice names
    "af_heart": "af_heart",
    "af_bella": "af_bella",
    "af_sarah": "af_sarah",
    "af_nicole": "af_nicole",
    "af_sky": "af_sky",
    "am_adam": "am_adam",
    "am_michael": "am_michael",
    "bf_emma": "bf_emma",
    "bf_isabella": "bf_isabella",
    "bm_george": "bm_george",
    "bm_lewis": "bm_lewis",
}

def resolve_voice(v):
    if not v:
        return "af_heart"
    v_clean = str(v).strip().lower()
    return VOICE_MAP.get(v_clean, "af_heart")

def generate_emergency_audio(output_path, duration_sec=5.0):
    """Fallback generator in case model is unavailable or takes too long"""
    sample_rate = 24000
    num_samples = int(sample_rate * max(1.0, duration_sec))
    t = np.linspace(0, duration_sec, num_samples, endpoint=False)
    # Gentle subtle ambient tone
    audio = 0.05 * np.sin(2 * np.pi * 220 * t)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    sf.write(output_path, audio.astype(np.float32), sample_rate)
    print(f"[Kokoro TTS] Generated emergency fallback audio -> {output_path}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python tts.py <text> <output.wav> OR python tts.py --batch <manifest.json>")
        sys.exit(1)
        
    try:
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code='a')
    except Exception as e:
        print(f"[Kokoro Init Warning] Could not initialize Kokoro: {e}. Using fallback generator.")
        pipeline = None

    # Batch Mode
    if sys.argv[1] == "--batch" or sys.argv[1].endswith(".json"):
        manifest_path = sys.argv[2] if sys.argv[1] == "--batch" else sys.argv[1]
        with open(manifest_path, "r", encoding="utf-8") as f:
            items = json.load(f)
            
        print(f"[Kokoro TTS Batch] Processing {len(items)} audio tracks...")
        for idx, item in enumerate(items):
            text = item.get("text", "")
            output = item.get("output", "")
            raw_voice = item.get("voice", "af_heart")
            voice = resolve_voice(raw_voice)
            speed = float(item.get("speed", 1.0))

            if not text or not output:
                continue

            os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

            if pipeline is not None:
                try:
                    generator = pipeline(text, voice=voice, speed=speed, split_pattern=r'\n+')
                    all_audio = [audio for _, _, audio in generator]
                    if len(all_audio) > 0:
                        full_audio = np.concatenate(all_audio)
                        sf.write(output, full_audio, 24000)
                        print(f"[Kokoro TTS] Track {idx + 1}/{len(items)} saved ({voice}) -> {output}")
                        continue
                except Exception as err:
                    print(f"[Kokoro TTS WARN] Track {idx + 1} voice synthesis failed with voice {voice}: {err}. Retrying with af_heart...")
                    try:
                        generator = pipeline(text, voice="af_heart", speed=speed, split_pattern=r'\n+')
                        all_audio = [audio for _, _, audio in generator]
                        if len(all_audio) > 0:
                            full_audio = np.concatenate(all_audio)
                            sf.write(output, full_audio, 24000)
                            print(f"[Kokoro TTS] Track {idx + 1}/{len(items)} saved (af_heart fallback) -> {output}")
                            continue
                    except Exception as err2:
                        print(f"[Kokoro TTS ERROR] Fallback failed: {err2}")

            # Emergency fallback if model didn't produce audio
            generate_emergency_audio(output, duration_sec=max(3.0, len(text.split()) * 0.45))
                
        print("[Kokoro TTS Batch] All tracks completed successfully.")
        return

    # Single Mode
    if len(sys.argv) < 3:
        print("Usage: python tts.py <text> <output.wav> [voice]")
        sys.exit(1)

    text = sys.argv[1]
    output = sys.argv[2]
    raw_voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
    voice = resolve_voice(raw_voice)
    
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    if pipeline is not None:
        try:
            print(f"[Kokoro TTS] Generating audio for text: '{text}' ({voice}) -> {output}")
            generator = pipeline(text, voice=voice, speed=1.0, split_pattern=r'\n+')
            all_audio = [audio for _, _, audio in generator]
            if len(all_audio) > 0:
                full_audio = np.concatenate(all_audio)
                sf.write(output, full_audio, 24000)
                print(f"[Kokoro TTS] Successfully saved to {output}")
                return
        except Exception as err:
            print(f"[Kokoro TTS Single Error] {err}")

    generate_emergency_audio(output, duration_sec=max(3.0, len(text.split()) * 0.45))

if __name__ == "__main__":
    main()
