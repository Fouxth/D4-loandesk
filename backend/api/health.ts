export default function handler(_req: any, res: any) {
  // Keep this endpoint independent from Express/DB so it always answers.
  // This helps validate Vercel runtime + env configuration even if the app crashes.
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
