import sql from '../db';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Get HTTP Headers required to call Discord API
 */
function getDiscordHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing DISCORD_BOT_TOKEN in environment settings');
  }
  return {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Ensures a Text Channel named after the tenantId exists within the specified Discord Guild.
 * If it doesn't exist, it creates one and returns its Channel ID.
 */
export async function getOrCreateTenantChannel(tenantId: string): Promise<string> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    throw new Error('Missing DISCORD_GUILD_ID in environment settings');
  }

  // 1. Check if we already have the channel ID cached in database settings
  const settingsKey = `discord_channel_id`;
  const cachedSettings = await sql`
    SELECT value FROM settings WHERE tenant_id = ${tenantId} AND key = ${settingsKey}
  `;

  if (cachedSettings && cachedSettings.length > 0 && cachedSettings[0].value?.channelId) {
    return cachedSettings[0].value.channelId;
  }

  // 2. Normalize channel name (Discord channel names must be lowercase, alphanumeric/dashes)
  const channelName = tenantId.toLowerCase().replace(/[^a-z0-9-_]/g, '');

  console.log(`[Discord] Checking channels in guild ${guildId} for name: ${channelName}`);
  
  // 3. Fetch list of channels from Guild
  const channelsResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    method: 'GET',
    headers: getDiscordHeaders(),
  });

  if (!channelsResponse.ok) {
    const errorText = await channelsResponse.text();
    throw new Error(`Failed to fetch Discord channels: ${channelsResponse.status} - ${errorText}`);
  }

  const channels = await channelsResponse.json();
  let targetChannel = channels.find((c: any) => c.name === channelName && c.type === 0); // type 0 is GUILD_TEXT

  // 4. Create channel if not found
  if (!targetChannel) {
    console.log(`[Discord] Channel #${channelName} not found. Creating one...`);
    const createResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: getDiscordHeaders(),
      body: JSON.stringify({
        name: channelName,
        type: 0, // Text Channel
        topic: `Storage channel for tenant ${tenantId}`,
        permission_overwrites: [
          {
            id: guildId, // @everyone role ID is the guild ID in Discord
            type: 0, // role
            deny: '1024', // VIEW_CHANNEL flag (0x400 = 1024)
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create Discord channel: ${createResponse.status} - ${errorText}`);
    }

    targetChannel = await createResponse.json();
    console.log(`[Discord] Successfully created channel #${channelName} with ID ${targetChannel.id}`);
  } else {
    console.log(`[Discord] Found existing channel #${channelName} with ID ${targetChannel.id}`);
  }

  // 5. Cache the Channel ID in DB settings for high efficiency
  await sql`
    INSERT INTO settings (tenant_id, key, value, updated_at)
    VALUES (${tenantId}, ${settingsKey}, ${JSON.stringify({ channelId: targetChannel.id })}, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id, key) DO UPDATE 
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `;

  return targetChannel.id;
}

export async function getOrCreateChannelByName(channelName: string, topic?: string): Promise<string> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    throw new Error('Missing DISCORD_GUILD_ID in environment settings');
  }

  const normName = channelName.toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const settingsKey = `discord_channel_id_${normName}`;
  const cachedSettings = await sql`
    SELECT value FROM settings WHERE tenant_id = 'system' AND key = ${settingsKey}
  `;

  if (cachedSettings && cachedSettings.length > 0 && cachedSettings[0].value?.channelId) {
    return cachedSettings[0].value.channelId;
  }

  console.log(`[Discord] Checking channels in guild ${guildId} for name: ${normName}`);
  
  const channelsResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    method: 'GET',
    headers: getDiscordHeaders(),
  });

  if (!channelsResponse.ok) {
    const errorText = await channelsResponse.text();
    throw new Error(`Failed to fetch Discord channels: ${channelsResponse.status} - ${errorText}`);
  }

  const channels = await channelsResponse.json();
  let targetChannel = channels.find((c: any) => c.name === normName && c.type === 0);

  if (!targetChannel) {
    console.log(`[Discord] Channel #${normName} not found. Creating one...`);
    const createResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: getDiscordHeaders(),
      body: JSON.stringify({
        name: normName,
        type: 0, // Text Channel
        topic: topic || `Storage channel for ${normName}`,
        permission_overwrites: [
          {
            id: guildId,
            type: 0,
            deny: '1024', // VIEW_CHANNEL flag
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create Discord channel: ${createResponse.status} - ${errorText}`);
    }

    targetChannel = await createResponse.json();
    console.log(`[Discord] Successfully created channel #${normName} with ID ${targetChannel.id}`);
  } else {
    console.log(`[Discord] Found existing channel #${normName} with ID ${targetChannel.id}`);
  }

  await sql`
    INSERT INTO settings (tenant_id, key, value, updated_at)
    VALUES ('system', ${settingsKey}, ${JSON.stringify({ channelId: targetChannel.id })}, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id, key) DO UPDATE 
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `;

  return targetChannel.id;
}

/**
 * Uploads a file (Buffer) to the tenant's dedicated Discord channel or a named channel
 * @returns The CDN URL of the uploaded image
 */
export async function uploadFileToDiscord(
  tenantId: string, 
  fileBuffer: Buffer, 
  fileName: string, 
  mimeType: string,
  customizedMessage?: string,
  targetChannelName?: string
): Promise<string> {
  const channelId = targetChannelName
    ? await getOrCreateChannelByName(targetChannelName, `Dedicated storage channel for ${targetChannelName}`)
    : await getOrCreateTenantChannel(tenantId);
  console.log(`[Discord] Uploading file ${fileName} (${mimeType}) to channel ${channelId}`);

  // We need to construct a multipart/form-data request manually or using FormData
  const formData = new FormData();
  // Safe Node Buffer to Blob conversion
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  formData.append('files[0]', blob, fileName);
  
  // Discord requires payload_json if we want to add content/embeds, otherwise we can just upload files
  formData.append('payload_json', JSON.stringify({
    content: customizedMessage || `📎 อัปโหลดรูปภาพหลักฐานจากระบบของ ${tenantId} (${new Date().toLocaleString('th-TH')})`,
  }));

  const token = process.env.DISCORD_BOT_TOKEN;
  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to Discord: ${response.status} - ${errorText}`);
  }

  const message = await response.json();
  const attachment = message.attachments?.[0];

  if (!attachment || !attachment.url) {
    throw new Error('Discord response did not contain any valid attachment URLs');
  }

  // Return the direct CDN link
  console.log(`[Discord] ✅ Upload complete! URL: ${attachment.url}`);
  return attachment.url;
}

/**
 * Discord CDN attachment URLs are signed and expire after ~24h (the ex/is/hm
 * query params). A URL stored in the DB days ago will 404. This asks Discord to
 * re-sign a batch of URLs so the underlying (still-present) files load again.
 *
 * Returns a Map of original URL → freshly signed URL. On any failure it returns
 * an empty map so callers can fall back to the stored URL instead of breaking.
 */
export async function refreshDiscordUrls(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || urls.length === 0) return result;

  // Discord caps refresh-urls at 50 URLs per request.
  const CHUNK = 50;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const batch = urls.slice(i, i + CHUNK);
    try {
      const resp = await fetch(`${DISCORD_API_BASE}/attachments/refresh-urls`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attachment_urls: batch }),
      });

      if (!resp.ok) {
        console.error(`[Discord] refresh-urls failed: ${resp.status} - ${await resp.text()}`);
        continue;
      }

      const data = await resp.json();
      for (const item of data.refreshed_urls ?? []) {
        if (item?.original && item?.refreshed) {
          result.set(item.original, item.refreshed);
        }
      }
    } catch (e: any) {
      console.error(`[Discord] refresh-urls error: ${e.message}`);
    }
  }

  return result;
}
