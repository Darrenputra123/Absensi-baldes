import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok-free.dev",
    "groutier-roseate-juan.ngrok-free.dev",
    "localhost:3000",
    "127.0.0.1:3000"
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
