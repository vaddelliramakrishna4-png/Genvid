# Placeholder for faster-whisper alignment
# Will take a merged audio file and known script text to generate .ass subtitles

import sys
import os

def format_time(seconds):
    hours = int(seconds / 3600)
    minutes = int((seconds % 3600) / 60)
    seconds = seconds % 60
    return f"{hours}:{minutes:02}:{seconds:05.2f}"

def main():
    if len(sys.argv) < 4:
        print("Usage: python align.py <audio.wav> <script.txt> <output.ass>")
        sys.exit(1)
        
    audio = sys.argv[1]
    script = sys.argv[2]
    output = sys.argv[3]
    
    print(f"[Faster-Whisper] Aligning {audio} with script -> {output}")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed. Run: pip install faster-whisper")
        sys.exit(1)

    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True)

    ass_lines = [
        "[Script Info]",
        "Title: GenVid Subtitles",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: None",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    for segment in segments:
        for word in segment.words:
            start_t = format_time(word.start)
            end_t = format_time(word.end)
            text = word.word.strip()
            # ASS Dialog format
            ass_lines.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{text}")

    with open(output, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_lines))
        
    print(f"[Faster-Whisper] Saved subtitles to {output}")

if __name__ == "__main__":
    main()
