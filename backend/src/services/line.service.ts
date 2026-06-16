import sql from '../db';
import {
  isLineEventEnabled,
  LineEventType,
  LineNotifyConfig,
  resolveLineRecipients,
} from './lineConfig';

type FlexOptions = {
  title: string;
  items: { label: string; value: string; color?: string }[];
  footer?: string;
  accentColor?: string;
};

export async function pushLineFlex(to: string, flexMessage: object) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.warn('[LINE] ⚠️ Missing LINE_CHANNEL_ACCESS_TOKEN in .env');
    return false;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to, messages: [flexMessage] }),
  });

  if (response.ok) return true;

  const errorData = await response.json().catch(() => ({}));
  console.error(`[LINE] ❌ Messaging API failed (${response.status}):`, errorData);
  return false;
}

export async function pushLineText(to: string, text: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return false;

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });

  return response.ok;
}

async function pushLineNotifyFallback(token: string, message: string) {
  const params = new URLSearchParams();
  params.append('message', `\n${message}`);

  await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

/**
 * Sends a notification via LINE Messaging API (Flex) with LINE Notify fallback.
 */
export async function sendLineNotify(
  message: string,
  eventType: LineEventType,
  flexOptions?: FlexOptions,
  tenantId?: string,
  options?: { skipEventCheck?: boolean },
) {
  try {
    const targetTenant = tenantId || 'bkj';
    const settings = await sql`
      SELECT value FROM settings WHERE key = 'line_notify' AND tenant_id = ${targetTenant}
    `;
    if (!settings?.length) return;

    const config = settings[0].value as LineNotifyConfig;
    if (!config?.enabled) return;
    if (!options?.skipEventCheck && !isLineEventEnabled(config, eventType)) return;

    const recipients = resolveLineRecipients(config);
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (channelAccessToken && recipients.length) {
      let sent = false;
      for (const to of recipients) {
        const payload = flexOptions
          ? createFlexPayload(to, flexOptions)
          : { to, messages: [{ type: 'text', text: message }] };

        console.log(`[LINE] Sending ${eventType} notification to ${to}...`);
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${channelAccessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          sent = true;
          console.log(`[LINE] ✅ ${eventType} notification sent via Messaging API`);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[LINE] ❌ Messaging API failed (${response.status}):`, errorData);
        }
      }
      if (sent) return;
    } else {
      if (!channelAccessToken) console.warn('[LINE] ⚠️ Missing LINE_CHANNEL_ACCESS_TOKEN in .env');
      if (!recipients.length) console.warn('[LINE] ⚠️ Missing userId(s) in DB settings');
    }

    if (config.token) {
      await pushLineNotifyFallback(config.token, message);
    }
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
  }
}

function createFlexPayload(
  to: string,
  options: FlexOptions,
) {
  const accentColor = options.accentColor || '#06C755';

  return {
    to,
    messages: [
      {
        type: 'flex',
        altText: options.title,
        contents: {
          type: 'bubble',
          size: 'mega',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: accentColor,
            contents: [
              {
                type: 'text',
                text: options.title,
                weight: 'bold',
                color: '#ffffff',
                size: 'sm',
              },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: options.items.map((item) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: item.label,
                  size: 'xs',
                  color: '#8c8c8c',
                  flex: 2,
                },
                {
                  type: 'text',
                  text: item.value,
                  size: 'xs',
                  color: item.color || '#333333',
                  align: 'end',
                  weight: 'bold',
                  flex: 4,
                  wrap: true,
                },
              ],
            })),
          },
          footer: options.footer
            ? {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'separator', color: '#f0f0f0' },
                  {
                    type: 'text',
                    text: options.footer,
                    size: 'xxs',
                    color: '#aaaaaa',
                    margin: 'md',
                    align: 'center',
                  },
                ],
              }
            : undefined,
        },
      },
    ],
  };
}
