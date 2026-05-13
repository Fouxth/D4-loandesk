import sql from '../db';

/**
 * Sends a notification via LINE.
 * Supports Messaging API (Flex Message) and falls back to LINE Notify (Plain Text).
 */
export async function sendLineNotify(
  message: string, 
  eventType: 'payment' | 'loan' | 'expense' | 'fraud',
  flexOptions?: {
    title: string;
    items: { label: string; value: string; color?: string }[];
    footer?: string;
    accentColor?: string;
  }
) {
  try {
    // 1. Load settings from DB
    const settings = await sql`SELECT value FROM settings WHERE key = 'line_notify'`;
    if (!settings || settings.length === 0) return;
    
    const config = settings[0].value;
    
    // Check if LINE Notify is enabled
    if (!config || !config.enabled) return;
    
    // Check if this specific event type is enabled
    if (config.events && config.events[eventType] === false) return;

    // 2. Try Messaging API (Flex Message)
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (channelAccessToken && config.userId) {
      try {
        const payload = flexOptions 
          ? createFlexPayload(config.userId, flexOptions)
          : { to: config.userId, messages: [{ type: 'text', text: message }] };

        console.log(`[LINE] Sending ${eventType} notification to ${config.userId}...`);

        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          console.log(`[LINE] ✅ ${eventType} notification sent via Messaging API`);
          return;
        }
        
        const errorData = await response.json().catch(() => ({}));
        console.error(`[LINE] ❌ Messaging API failed (${response.status}):`, errorData);
      } catch (error) {
        console.error('[LINE] ❌ Failed to send via Messaging API:', error);
      }
    } else {
      if (!channelAccessToken) console.warn('[LINE] ⚠️ Missing LINE_CHANNEL_ACCESS_TOKEN in .env');
      if (!config.userId) console.warn('[LINE] ⚠️ Missing userId in DB settings');
    }

    // 3. Fallback to LINE Notify
    if (config.token) {
      const params = new URLSearchParams();
      params.append('message', `\n${message}`);

      await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
    }
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
  }
}

/**
 * Creates a beautiful Flex Message payload for LINE Messaging API
 */
function createFlexPayload(to: string, options: { title: string; items: { label: string; value: string; color?: string }[]; footer?: string; accentColor?: string }) {
  const accentColor = options.accentColor || '#06C755';
  
  return {
    to,
    messages: [
      {
        type: 'flex',
        altText: options.title,
        contents: {
          type: 'bubble',
          size: 'medium',
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
                size: 'sm'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: options.items.map(item => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: item.label,
                  size: 'xs',
                  color: '#8c8c8c',
                  flex: 2
                },
                {
                  type: 'text',
                  text: item.value,
                  size: 'xs',
                  color: item.color || '#333333',
                  align: 'end',
                  weight: 'bold',
                  flex: 4,
                  wrap: true
                }
              ]
            }))
          },
          footer: options.footer ? {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'separator',
                color: '#f0f0f0'
              },
              {
                type: 'text',
                text: options.footer,
                size: 'xxs',
                color: '#aaaaaa',
                margin: 'md',
                align: 'center'
              }
            ]
          } : undefined
        }
      }
    ]
  };
}
