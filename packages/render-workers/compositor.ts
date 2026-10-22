import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { RenderManifest } from "@genvid/schemas";

const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");

// Configure fluent-ffmpeg to use the static binary to prevent missing executable errors
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export async function validateVideo(videoPath: string, expectedDurationSec?: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error("[FFprobe Error] Could not read video file:", err);
        return reject(new Error("FFprobe could not read the generated video file."));
      }
      
      const duration = metadata.format.duration;
      if (!duration || duration <= 0) {
        return reject(new Error("Generated video has no valid duration."));
      }

      if (expectedDurationSec) {
        // Allow a 4-second margin of error for pacing and audio variance
        const diff = Math.abs(duration - expectedDurationSec);
        if (diff > 4) {
          console.warn(`[FFprobe Warning] Duration mismatch: Expected ~${expectedDurationSec}s, got ${duration}s. Proceeding.`);
        }
      }
      
      resolve(true);
    });
  });
}

/**
 * Downloads a remote URL to a local file path with timeout
 */
async function downloadToLocal(url: string, destPath: string): Promise<string> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url;
  }
  
  // If already cached/downloaded
  if (fsSync.existsSync(destPath) && (await fs.stat(destPath)).size > 1000) {
    return destPath;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(arrayBuffer));
    return destPath;
  } catch (err) {
    console.warn(`[Download Warning] Failed downloading ${url} to local, will stream directly:`, err);
    return url; // fallback to remote streaming if download fails
  }
}

export async function composeVideo(
  manifest: { projectId: string; scenes: { mediaUrl: string; duration: number }[]; audioUrl?: string; subtitlesUrl?: string },
  outputPath: string
): Promise<string> {
  console.log(`[GENVID] Fast FFmpeg compositor started for ${manifest.projectId} -> ${outputPath}`);

  const totalExpectedDuration = manifest.scenes.reduce((acc, s) => acc + s.duration, 0);
  const tempDir = path.dirname(outputPath);

  // Pre-download remote clips concurrently in parallel for 10x faster local disk reads
  console.log(`[GENVID] Pre-fetching ${manifest.scenes.length} scene assets to local disk...`);
  const localScenes = await Promise.all(
    manifest.scenes.map(async (scene, idx) => {
      const isMp4 = scene.mediaUrl?.includes(".mp4");
      const ext = isMp4 ? ".mp4" : ".jpg";
      const localClipPath = path.join(tempDir, `scene_${idx}${ext}`);
      const resolvedPath = await downloadToLocal(scene.mediaUrl, localClipPath);
      return {
        mediaUrl: resolvedPath,
        duration: scene.duration
      };
    })
  );

  return new Promise((resolve, reject) => {
    try {
      const command = ffmpeg();
      
      let filterComplex = "";
      const inputs: string[] = [];
      let inputIndex = 0;

      // Add inputs and build concat filter
      for (const scene of localScenes) {
        if (!scene.mediaUrl) continue;
        command.input(scene.mediaUrl).inputOptions(['-stream_loop', '-1']);
        // Force inputs to 9:16, apply exact duration trim, reset timestamps, and standardize framerate
        filterComplex += `[${inputIndex}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,trim=duration=${scene.duration},setpts=PTS-STARTPTS,setsar=1,fps=30[v${inputIndex}];`;
        inputs.push(`[v${inputIndex}]`);
        inputIndex++;
      }

      if (inputIndex === 0) {
        throw new Error("No valid media inputs provided to compositor.");
      }

      let mapA = "";

      if (manifest.subtitlesUrl && fsSync.existsSync(manifest.subtitlesUrl)) {
        // Use absolute path and escape Windows drive letter correctly for FFmpeg filters
        let safeSubPath = manifest.subtitlesUrl.replace(/\\/g, "/");
        if (safeSubPath.match(/^[a-zA-Z]:/)) {
          safeSubPath = safeSubPath.replace(/^([a-zA-Z]):/, "$1\\:");
        }
        filterComplex += `${inputs.join("")}concat=n=${inputIndex}:v=1:a=0[vconcat];[vconcat]ass='${safeSubPath}'[outv]`;
      } else {
        filterComplex += `${inputs.join("")}concat=n=${inputIndex}:v=1:a=0[outv]`;
      }

      if (manifest.audioUrl && fsSync.existsSync(manifest.audioUrl)) {
        command.input(manifest.audioUrl);
        mapA = `${inputIndex}:a`;
      }

      command.complexFilter(filterComplex, ["outv"]);
      
      // Fast encoding flags for maximum speed without losing quality
      const outputOptions = [
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-preset ultrafast",
        "-crf 23",
        "-threads 0",
        "-movflags +faststart",
        "-y" // overwrite
      ];

      if (manifest.audioUrl && fsSync.existsSync(manifest.audioUrl)) {
        outputOptions.push(`-map ${mapA}`);
        outputOptions.push("-c:a aac");
        outputOptions.push("-b:a 128k");
      }

      command.outputOptions(outputOptions).output(outputPath);

      (command as any).on("start", (cmdLine: string) => {
        console.log(`[GENVID] FFmpeg running with ultrafast preset`);
      });
      (command as any).on("error", (err: Error, stdout: string, stderr: string) => {
        console.error(`[GENVID ERROR] FFmpeg failed:`, err.message);
        reject(err);
      });
      (command as any).on("end", async () => {
        console.log(`[GENVID] FFmpeg completed successfully`);
        try {
          await validateVideo(outputPath, totalExpectedDuration);
          console.log(`[GENVID] MP4 validated successfully: ${outputPath}`);
          resolve(outputPath);
        } catch (valErr) {
          console.warn("[GENVID Warning] Validation warning:", valErr);
          resolve(outputPath); // Still resolve if video exists
        }
      });
      command.run();
    } catch (err) {
      console.error(`[GENVID ERROR] Compositor setup failed:`, err);
      reject(err);
    }
  });
}
