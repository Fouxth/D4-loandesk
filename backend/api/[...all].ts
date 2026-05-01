import { createApp } from "../src/app";

const app = createApp();

export default function handler(req: any, res: any) {
  // This function is mounted under /api/* on Vercel.
  // Our Express app expects routes to include /api prefix.
  if (typeof req.url === "string" && !req.url.startsWith("/api")) {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
}
