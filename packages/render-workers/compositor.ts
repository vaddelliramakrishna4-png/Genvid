import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import { RenderManifest } from "@genvid/schemas";

// Tell fluent-ffmpeg where to find the static binary
ffmpeg.setFfmpegPath(ffmpegStatic as string);

export async function composeVideo(
  manifest: { projectId: string; scenes: { mediaUrl: string; duration: number }[]; audioUrl?: string; subtitlesUrl?: string },
  outputPath: string
): Promise<string> {
  console.log(`[GENVID] FFmpeg started for ${manifest.projectId} -> ${outputPath}`);

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
        // Need to use relative path to avoid drive letter colon escaping issues in FFmpeg
        const relativeSubPath = path.relative(process.cwd(), manifest.subtitlesUrl).replace(/\\/g, "/");
        filterComplex += `${inputs.join("")}concat=n=${inputIndex}:v=1:a=0[vconcat];[vconcat]ass='${relativeSubPath}'[outv]`;
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
      (command as any).on("end", () => {
          console.log(`[GENVID] FFmpeg completed`);
          console.log(`[GENVID] MP4 created: ${outputPath}`);
          resolve(outputPath);
        });
      command.run();
    } catch (err) {
      console.error(`[GENVID ERROR] Compositor setup failed:`, err);
      reject(err);
    }
  });
}
