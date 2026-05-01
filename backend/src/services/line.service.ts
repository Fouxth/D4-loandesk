import sql from '../db';

export async function sendLineNotify(message: string, eventType: 'payment' | 'loan' | 'expense' | 'fraud') {
  try {
    const settings = await sql`SELECT value FROM settings WHERE key = 'line_notify'`;
    if (!settings || settings.length === 0) return;
    
    const config = settings[0].value;
    
    // Check if LINE notify is enabled and has a token
    if (!config || !config.enabled || !config.token) return;
    
    // Check if this specific event type is enabled
    if (config.events && config.events[eventType] === false) return;

    const params = new URLSearchParams();
    params.append('message', `\n${message}`); // Prefix with newline as LINE Notify usually appends the app name before it

    await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
  } catch (error) {
    console.error('Failed to send LINE notify:', error);
  }
}
