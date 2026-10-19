# Kokoro-82M TTS with Single & Batch Processing Support
import sys
import os
import json
import numpy as np
import soundfile as sf

def main():
    if len(sys.argv) < 2:
        print("Usage: python tts.py <text> <output.wav> OR python tts.py --batch <manifest.json>")
        sys.exit(1)
        
    try:
        from kokoro import KPipeline
    except ImportError:
        print("Error: kokoro package not installed. Run: pip install kokoro soundfile numpy torch")
        sys.exit(1)

    # Initialize KPipeline once in memory
    pipeline = KPipeline(lang_code='a')

    # Batch Mode
    if sys.argv[1] == "--batch" or sys.argv[1].endswith(".json"):
        manifest_path = sys.argv[2] if sys.argv[1] == "--batch" else sys.argv[1]
        with open(manifest_path, "r", encoding="utf-8") as f:
            items = json.load(f)
            
        print(f"[Kokoro TTS Batch] Processing {len(items)} audio tracks...")
        for idx, item in enumerate(items):
            text = item.get("text", "")
            output = item.get("output", "")
            voice = item.get("voice", "af_heart")
            speed = float(item.get("speed", 1.0))

            if not text or not output:
                continue

            generator = pipeline(text, voice=voice, speed=speed, split_pattern=r'\n+')
            all_audio = [audio for _, _, audio in generator]
            if len(all_audio) > 0:
                full_audio = np.concatenate(all_audio)
                sf.write(output, full_audio, 24000)
                print(f"[Kokoro TTS] Track {idx + 1}/{len(items)} saved to {output}")
            else:
                print(f"[Kokoro TTS ERROR] No audio for track {idx + 1}")
                
        print("[Kokoro TTS Batch] All tracks completed successfully.")
        return

    # Single Mode
    if len(sys.argv) < 3:
        print("Usage: python tts.py <text> <output.wav>")
        sys.exit(1)

    text = sys.argv[1]
    output = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
    
    print(f"[Kokoro TTS] Generating audio for text: '{text}' -> {output}")
    generator = pipeline(text, voice=voice, speed=1, split_pattern=r'\n+')
    all_audio = [audio for _, _, audio in generator]
    if len(all_audio) > 0:
        full_audio = np.concatenate(all_audio)
        sf.write(output, full_audio, 24000)
        print(f"[Kokoro TTS] Successfully saved to {output}")
    else:
        print("[Kokoro TTS] No audio generated!")
        sys.exit(1)

if __name__ == "__main__":
    main()
