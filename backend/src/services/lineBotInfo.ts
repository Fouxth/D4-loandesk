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
  // Silent startup check — errors logged only on action failure
}
