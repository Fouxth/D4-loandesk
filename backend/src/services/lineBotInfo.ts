export type LineBotInfo = {
  userId: string;
  basicId: string;
  displayName: string;
  chatMode: 'chat' | 'bot';
};

export async function fetchLineBotInfo(): Promise<LineBotInfo | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as LineBotInfo;
  } catch {
    return null;
  }
}

export async function warnIfChatMode() {
  const info = await fetchLineBotInfo();
  if (!info) return;

  if (info.chatMode === 'chat') {
    console.warn('');
    console.warn('⚠️  [LINE] Bot อยู่โหมด "chat" — Bot ตอบกลับไม่ได้!');
    console.warn('    ไป manager.line.biz → ตั้งค่า → การตอบกลับ → เลือก "Webhook (Bot)"');
    console.warn(`    Account: ${info.displayName} (${info.basicId})`);
    console.warn('');
  } else {
    console.log(`[LINE] Bot mode OK (${info.basicId}, mode=${info.chatMode})`);
  }
}
