import os
import sys

def preload():
    print("Preloading Kokoro models...")
    try:
        from kokoro import KPipeline
        # Initialize pipeline to trigger model download
        pipeline = KPipeline(lang_code='a')
        print("Models downloaded successfully!")
    except Exception as e:
        print(f"Error preloading: {e}")

if __name__ == "__main__":
    preload()
