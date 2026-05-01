import { createApp } from "../src/app";

export default function handler(req: any, res: any) {
  try {
    const app = createApp();

    // This function is mounted under /api/* on Vercel.
    // Our Express app expects routes to include /api prefix.
    if (typeof req.url === "string" && !req.url.startsWith("/api")) {
      req.url = `/api${req.url}`;
    }

    return app(req, res);
  } catch (err) {
    console.error('API handler crash', err);

    const body = {
      error: 'Server error',
      message: err instanceof Error ? err.message : String(err),
    };
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return;
  }
}
