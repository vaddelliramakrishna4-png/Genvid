import { PexelsProvider } from "./packages/providers/dist/pexels.js";

async function run() {
  const pexelsProvider = new PexelsProvider();
  
  try {
    const query = "coffee pouring over ice cubes";
    let mediaUrl = await pexelsProvider.searchVideo(query, "portrait");
    console.log("Media URL:", mediaUrl);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
