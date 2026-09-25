# Placeholder for Kokoro-82M TTS
# Will take scene text and output a .wav file

import sys
import os
import numpy as np
import soundfile as sf

def main():
    if len(sys.argv) < 3:
        print("Usage: python tts.py <text> <output.wav>")
        sys.exit(1)
        
    text = sys.argv[1]
    output = sys.argv[2]
    
    print(f"[Kokoro TTS] Generating audio for text: '{text}' -> {output}")
    try:
        from kokoro import KPipeline
    except ImportError:
        print("Error: kokoro package not installed. Run: pip install kokoro soundfile numpy torch")
        sys.exit(1)
        
    # 'a' => American English. We'll use 'af_heart' as a default voice.
    pipeline = KPipeline(lang_code='a') 
    generator = pipeline(
        text, voice='af_heart', speed=1, split_pattern=r'\n+'
    )
    
    all_audio = []
    for i, (gs, ps, audio) in enumerate(generator):
        all_audio.append(audio)
        
    if len(all_audio) > 0:
        full_audio = np.concatenate(all_audio)
        sf.write(output, full_audio, 24000)
        print(f"[Kokoro TTS] Successfully saved to {output}")
    else:
        print("[Kokoro TTS] No audio generated!")
        sys.exit(1)

if __name__ == "__main__":
    main()
