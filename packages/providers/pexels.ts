import { VideoAssetProvider } from "./index";

export class PexelsProvider implements VideoAssetProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY || "";
    if (!this.apiKey) {
      console.warn("PEXELS_API_KEY is missing. Video search will fail.");
    }
  }

  private usedVideoIds = new Set<number>();

  async searchVideo(query: string, orientation: "landscape" | "portrait" | "square" = "portrait", minDuration: number = 0): Promise<string | null> {
    try {
      // Pexels API video search
      const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=15`, {
        headers: {
          "Authorization": this.apiKey
        }
      });

      if (!response.ok) {
        console.error("Pexels API error:", response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      
      if (data.videos && data.videos.length > 0) {
        // Find the best quality video file from the first UNUSED result that is LONG ENOUGH
        let video = data.videos.find((v: any) => !this.usedVideoIds.has(v.id) && v.duration >= minDuration);
        
        if (!video) {
          // Fallback 1: Any unused video regardless of duration (we'll have to loop it later)
          video = data.videos.find((v: any) => !this.usedVideoIds.has(v.id));
        }
        
        if (!video) {
          // Fallback 2: Re-use a video if all 15 are used (rare)
          video = data.videos[Math.floor(Math.random() * data.videos.length)];
        }
        
        this.usedVideoIds.add(video.id);
        
        // Prefer HD quality
        const hdFiles = video.video_files.filter((f: any) => f.quality === "hd" || f.quality === "fhd");
        if (hdFiles.length > 0) {
          // Sort by highest resolution / height for portrait
          hdFiles.sort((a: any, b: any) => b.height - a.height);
          return hdFiles[0].link;
        }

        // Fallback to highest quality available
        if (video.video_files && video.video_files.length > 0) {
          return video.video_files[0].link;
        }
      }

      return null;
    } catch (error) {
      console.error("Failed to search Pexels:", error);
      return null;
    }
  }
}
