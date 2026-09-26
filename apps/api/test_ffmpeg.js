const f = require('ffmpeg-static');
const { execSync } = require('child_process');

try {
  execSync(f + ` -stream_loop -1 -i https://videos.pexels.com/video-files/12555598/12555598-hd_1080_1920_60fps.mp4 -stream_loop -1 -i https://videos.pexels.com/video-files/36418770/15442430_360_640_50fps.mp4 -i C:\\genvid\\apps\\api\\.run\\0c9164d3-1473-442b-9978-7a45d22c1864\\narration.wav -y -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,trim=duration=3,setpts=PTS-STARTPTS,setsar=1,fps=30[v0];[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,trim=duration=3,setpts=PTS-STARTPTS,setsar=1,fps=30[v1];[v0][v1]concat=n=2:v=1:a=0[vconcat];[vconcat]ass='.run/0c9164d3-1473-442b-9978-7a45d22c1864/subtitles.ass'[outv]" -map [outv] -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 -y -map 2:a -c:a aac -b:a 128k test.mp4`);
  console.log("Success");
} catch (e) {
  console.log("Error:", e.stderr.toString());
}
