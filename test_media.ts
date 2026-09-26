import { getDb } from "./packages/db/client";
import { insertScenes, createAsset, updateScene, getScenesByProject } from "./packages/db/queries";
import { PexelsProvider } from "./packages/providers/pexels";

async function run() {
  const projectId = "50be7a48-f3c9-45ef-a7ef-75817a58463a";
  const scenes = await getScenesByProject(projectId);
  
  const pexelsProvider = new PexelsProvider();
  
  for (const scene of scenes) {
    try {
      console.log("Processing scene:", scene.id);
      const query = scene.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
      console.log("Query:", query);
      
      let mediaUrl = await pexelsProvider.searchVideo(query, "portrait");
      console.log("Media URL:", mediaUrl);
      
      if (!mediaUrl) {
        mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
      }

      console.log("Creating asset...");
      await createAsset({
        projectId,
        sceneId: scene.id,
        assetType: mediaUrl.endsWith(".mp4") ? "scene_video" : "scene_image",
        storagePath: mediaUrl,
        mimeType: mediaUrl.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
        fileSizeBytes: 0,
      });

      console.log("Updating scene...");
      await updateScene(scene.id, { imageUrl: mediaUrl });
      console.log("Success for scene:", scene.id);
    } catch (err) {
      console.error(`Media retrieval failed for scene ${scene.sceneIndex}:`, err);
    }
  }
}

run();
