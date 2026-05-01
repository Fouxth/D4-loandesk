import { createApp } from "../src/app";

let cachedApp: any;

export default function handler(req: any, res: any) {
  try {
    if (!cachedApp) {
      cachedApp = createApp();
    }

    // Log the request for debugging on Vercel
    if (process.env.DEBUG_API === 'true') {
      console.log(`[API Request] ${req.method} ${req.url}`);
    }

    // Ensure the URL is correctly handled for Express
    if (typeof req.url === "string" && !req.url.startsWith("/api")) {
      req.url = `/api${req.url}`;
    }

    return cachedApp(req, res);
  } catch (err) {
    console.error('API handler crash', err);

    const body = {
      error: 'Server error',
      message: err instanceof Error ? err.message : String(err),
    };
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}
