import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { RenderManifest } from "@genvid/schemas";

// Use system ffmpeg installed in Docker or PATH instead of ffmpeg-static
// to prevent platform binary mismatch errors in production.

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
        // Allow a 2-second margin of error
        const diff = Math.abs(duration - expectedDurationSec);
        if (diff > 2) {
          return reject(new Error(`Video duration mismatch. Expected ~${expectedDurationSec}s, got ${duration}s`));
        }
      }
      
      resolve(true);
    });
  });
}

export async function composeVideo(
  manifest: { projectId: string; scenes: { mediaUrl: string; duration: number }[]; audioUrl?: string; subtitlesUrl?: string },
  outputPath: string
): Promise<string> {
  console.log(`[GENVID] FFmpeg started for ${manifest.projectId} -> ${outputPath}`);

  const totalExpectedDuration = manifest.scenes.reduce((acc, s) => acc + s.duration, 0);

  return new Promise((resolve, reject) => {
    try {
      const command = ffmpeg();
      
      let filterComplex = "";
      const inputs: string[] = [];
      let inputIndex = 0;

      // Add inputs and build basic concat filter
      for (const scene of manifest.scenes) {
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

      let mapV = "[outv]";
      let mapA = "";

      if (manifest.subtitlesUrl) {
        // Use absolute path and escape Windows drive letter correctly for FFmpeg filters
        let safeSubPath = manifest.subtitlesUrl.replace(/\\/g, "/");
        if (safeSubPath.match(/^[a-zA-Z]:/)) {
          safeSubPath = safeSubPath.replace(/^([a-zA-Z]):/, "$1\\:");
        }
        filterComplex += `${inputs.join("")}concat=n=${inputIndex}:v=1:a=0[vconcat];[vconcat]ass='${safeSubPath}'[outv]`;
      } else {
        filterComplex += `${inputs.join("")}concat=n=${inputIndex}:v=1:a=0[outv]`;
      }

      if (manifest.audioUrl) {
        command.input(manifest.audioUrl);
        mapA = `${inputIndex}:a`;
      }

      command.complexFilter(filterComplex, ["outv"]);
      
      const outputOptions = [
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-preset fast",
        "-crf 23",
        "-y" // overwrite
      ];

      if (manifest.audioUrl) {
        outputOptions.push(`-map ${mapA}`);
        outputOptions.push("-c:a aac");
        outputOptions.push("-b:a 128k");
      }

      command.outputOptions(outputOptions).output(outputPath);
      (command as any).on("start", (cmdLine: string) => {
          console.log(`[GENVID] FFmpeg running command: ${cmdLine}`);
        });
      (command as any).on("error", (err: Error, stdout: string, stderr: string) => {
          console.error(`[GENVID ERROR] FFmpeg failed:`, err.message);
          console.error(`[GENVID ERROR] FFmpeg stderr:`, stderr);
          reject(err);
        });
      (command as any).on("end", async () => {
          console.log(`[GENVID] FFmpeg completed`);
          try {
            await validateVideo(outputPath, totalExpectedDuration);
            console.log(`[GENVID] MP4 validated successfully: ${outputPath}`);
            resolve(outputPath);
          } catch (valErr) {
            reject(valErr);
          }
        });
      command.run();
    } catch (err) {
      console.error(`[GENVID ERROR] Compositor setup failed:`, err);
      reject(err);
    }
  });
}
