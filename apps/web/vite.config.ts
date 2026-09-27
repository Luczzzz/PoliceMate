import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webPort = Number(process.env.PM_WEB_PORT ?? "5173");
const serverPort = Number(process.env.PM_SERVER_PORT ?? "8787");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      // H5 只与 PoliceMate 后端同源通信；Dify 凭据不进入客户端。
      "/api": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
