import { createApp } from "../src/app";

const app = createApp();

export default function handler(req: any, res: any) {
  // Force routing into Express' /health endpoint
  req.url = "/health";
  return app(req, res);
}
