export default function handler(_req: any, res: any) {
  // Keep this endpoint independent from Express/DB so it always answers.
  // Use plain Node response methods to avoid runtime mismatches.
  const body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
