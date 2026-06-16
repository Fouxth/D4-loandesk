import { Router } from 'express';
import crypto from 'crypto';
import { handleBotCommand, replyOrPush } from '../services/chatbot.service';
import { fetchLineBotInfo } from '../services/lineBotInfo';

const router = Router();

type LineEvent = {
  type: string;
  source?: { userId?: string };
  replyToken?: string;
  message?: { type?: string; text?: string };
};

function parseWebhookEvents(req: { body?: { events?: LineEvent[] }; rawBody?: Buffer }): LineEvent[] {
  if (Array.isArray(req.body?.events) && req.body.events.length > 0) {
    return req.body.events;
  }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  if (!Buffer.isBuffer(rawBody)) return [];

  try {
    const parsed = JSON.parse(rawBody.toString('utf8')) as { events?: LineEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

async function processLineEvent(event: LineEvent) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;

  if (event.type === 'follow' && userId && replyToken) {
    console.log(`[LINE Webhook] follow from ${userId}`);
    await replyOrPush(userId, replyToken, [
      {
        type: 'text',
        text: `ยินดีต้อนรับ D4-Loandesk 👋\n\nรหัส User ID ของคุณคือ:\n${userId}\n\nนำไปใส่ในหน้า Settings → การแจ้งเตือน ได้เลยครับ\nพิมพ์ "วิธีใช้" ดูคำสั่งอื่นๆ`,
      },
    ]);
    return;
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text ?? '';
    console.log(`[LINE Webhook] message "${text}" from ${userId ?? 'unknown'}`);

    if (!userId || !replyToken) return;
    await handleBotCommand(text, userId, replyToken);
  }
}

/**
 * Webhook for LINE Messaging API
 * Listens for "token" message and replies with the user's User ID.
 */
router.get('/', (_req, res) => {
  res.send('LINE Webhook is ready! (Please use POST for LINE events)');
});

router.get('/status', async (_req, res) => {
  const info = await fetchLineBotInfo();
  res.json({
    ok: !!info,
    chatMode: info?.chatMode ?? null,
    basicId: info?.basicId ?? null,
    displayName: info?.displayName ?? null,
    botCanReply: info?.chatMode === 'bot',
    hint:
      info?.chatMode === 'chat'
        ? 'Bot อยู่โหมด Chat — ไป manager.line.biz → ตั้งค่า → การตอบกลับ → เลือก Webhook (Bot)'
        : null,
  });
});

router.post('/', (req, res) => {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (channelSecret) {
      const signature = String(req.headers['x-line-signature'] ?? '');
      const rawBody = (req as { rawBody?: Buffer }).rawBody;
      if (!Buffer.isBuffer(rawBody)) {
        console.error('[LINE Webhook] Missing rawBody — cannot verify signature');
        return res.sendStatus(400);
      }

      const expectedSignature = crypto
        .createHmac('sha256', channelSecret)
        .update(rawBody)
        .digest('base64');

      if (signature !== expectedSignature) {
        console.error('[LINE Webhook] Invalid signature — check LINE_CHANNEL_SECRET');
        console.error(`Received: ${signature}, Expected: ${expectedSignature}`);
        return res.sendStatus(401);
      }
    }

    const events = parseWebhookEvents(req);
    if (events.length === 0) {
      console.warn('[LINE Webhook] POST received but no events array');
      return res.sendStatus(200);
    }

    console.log(`[LINE Webhook] ${events.length} event(s)`);

    // LINE requires 200 within ~1s — process events after ack
    res.sendStatus(200);

    void (async () => {
      for (const event of events) {
        try {
          await processLineEvent(event);
        } catch (error) {
          console.error('[LINE Webhook] event error:', error);
        }
      }
    })();
  } catch (error) {
    console.error('[LINE Webhook] error:', error);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

export default router;
