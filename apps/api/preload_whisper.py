import os
import sys

def preload():
    print("Preloading Faster Whisper model...")
    try:
        from faster_whisper import WhisperModel
        # This will download the tiny.en model if not cached
        model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
        print("Faster Whisper model downloaded successfully!")
    except Exception as e:
        print(f"Error preloading whisper: {e}")

if __name__ == "__main__":
    preload()
