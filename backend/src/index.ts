import { createApp } from './app';
import { testDbConnection } from './db';
import { startLineScheduler } from './services/lineScheduler.service';
import { warnIfChatMode } from './services/lineBotInfo';

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  testDbConnection().catch((err) => {
    console.error('❌ DB Connection Error:', err.message);
  });
  startLineScheduler();
  warnIfChatMode().catch(() => undefined);
});
