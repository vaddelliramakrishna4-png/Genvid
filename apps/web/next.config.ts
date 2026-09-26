import type { NextConfig } from "next";
import path from "path";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Disable PWA in dev to avoid aggressive caching
  workboxOptions: {
    exclude: [/\/api\//], // Exclude API routes from service worker cache
  },
});

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
  async rewrites() {
    const apiDest = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? "https://genvid.onrender.com" : "http://127.0.0.1:3001");
    return [
      {
        source: "/api/:path*",
        destination: `${apiDest}/api/:path*`,
      },
    ];
  },
};

export default withPWA(nextConfig);
