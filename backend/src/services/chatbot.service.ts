import sql from '../db';
import { getBangkokDateStr } from './lineConfig';


/**
 * Helper to reply to LINE messages
 */
export async function replyLineMessage(replyToken: string, messages: any[]): Promise<boolean> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error('[LINE] ❌ Cannot reply — missing LINE_CHANNEL_ACCESS_TOKEN');
    return false;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    });

    if (response.ok) {
      console.log('[LINE] ✅ Reply sent');
      return true;
    }

    const errorData = await response.text();
    console.error(`[LINE] ❌ Reply API failed (${response.status}):`, errorData);
    return false;
  } catch (error) {
    console.error('[LINE] ❌ Failed to reply message:', error);
    return false;
  }
}

export async function pushLineMessages(userId: string, messages: any[]): Promise<boolean> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken || !userId) return false;

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ to: userId, messages }),
    });

    if (response.ok) {
      console.log(`[LINE] ✅ Push sent to ${userId}`);
      return true;
    }

    const errorData = await response.text();
    console.error(`[LINE] ❌ Push API failed (${response.status}):`, errorData);
    return false;
  } catch (error) {
    console.error('[LINE] ❌ Failed to push message:', error);
    return false;
  }
}

export async function pushLineText(userId: string, text: string): Promise<boolean> {
  return pushLineMessages(userId, [{ type: 'text', text }]);
}

/** Reply in chat thread first; push to user if reply fails (manual chat / auto-reply safe) */
export async function deliverMessages(
  userId: string,
  replyToken: string,
  messages: any[],
): Promise<boolean> {
  const replied = await replyLineMessage(replyToken, messages);
  if (replied) return true;
  if (userId) return pushLineMessages(userId, messages);
  return false;
}

export async function replyOrPush(userId: string, replyToken: string, messages: any[]) {
  await deliverMessages(userId, replyToken, messages);
}

/**
 * Reply with User ID (setup flow — no tenant check required)
 */
export async function replyWithUserId(userId: string, replyToken: string) {
  await replyOrPush(userId, replyToken, [
    {
      type: 'text',
      text: `รหัส User ID ของคุณคือ:\n${userId}\n\nคัดลอกรหัสนี้ไปใส่ในช่อง "LINE User ID" ในหน้าตั้งค่าของระบบได้เลยครับ 🚀`,
    },
  ]);
}

function isTokenRequest(lowerCmd: string): boolean {
  const normalized = lowerCmd.replace(/\s+/g, ' ').trim();
  return (
    normalized === 'token' ||
    normalized === 'id' ||
    normalized === 'user id' ||
    normalized === 'userid' ||
    normalized === 'user' ||
    normalized === 'uid' ||
    normalized.startsWith('token ')
  );
}

function findTenantForUser(userId: string) {
  const jsonArr = JSON.stringify([userId]);
  return sql`
    SELECT tenant_id, value FROM settings 
    WHERE key = 'line_notify' AND (
      (value->>'userId') = ${userId}
      OR COALESCE(value->'userIds', '[]'::jsonb) @> ${jsonArr}::jsonb
    )
    LIMIT 1
  `;
}

/**
 * Handle incoming LINE text messages
 */
export async function handleBotCommand(text: string, userId: string, replyToken: string) {
  const cmd = text.trim();
  const lowerCmd = cmd.toLowerCase();

  // Setup / help — no tenant check
  if (isTokenRequest(lowerCmd)) {
    await replyWithUserId(userId, replyToken);
    return;
  }

  if (lowerCmd === 'วิธีใช้' || lowerCmd === 'help') {
    await handleHelp(userId, replyToken);
    return;
  }

  if (lowerCmd === 'สวัสดี' || lowerCmd === 'hello' || lowerCmd === 'hi') {
    await deliverMessages(userId, replyToken, [
      {
        type: 'text',
        text: 'สวัสดีครับ 👋\nพิมพ์ "token" เพื่อรับ User ID\nพิมพ์ "วิธีใช้" ดูคำสั่งทั้งหมด',
      },
    ]);
    return;
  }

  const settings = await findTenantForUser(userId);
  if (!settings?.length) {
    await deliverMessages(userId, replyToken, [
      {
        type: 'text',
        text: 'ยังไม่ได้ลงทะเบียน User ID ในระบบ\nพิมพ์ "token" เพื่อรับรหัส User ID\nพิมพ์ "วิธีใช้" ดูคำสั่งทั้งหมด',
      },
    ]);
    return;
  }
  const tenantId = settings[0].tenantId;

  try {
    if (lowerCmd === 'สรุป' || lowerCmd === 'summary') {
      await handleSummary(userId, replyToken, tenantId);
    } else if (lowerCmd === 'ค้างชำระ' || lowerCmd === 'overdue') {
      await handleOverdue(userId, replyToken, tenantId);
    } else if (lowerCmd === 'เก็บวันนี้' || lowerCmd === 'today') {
      await handleCollectToday(userId, replyToken, tenantId);
    } else if (lowerCmd.startsWith('ยอด ')) {
      const searchName = cmd.substring(4).trim();
      if (searchName) {
        await handleCustomerSearch(userId, replyToken, searchName, tenantId);
      } else {
        await deliverMessages(userId, replyToken, [
          { type: 'text', text: 'กรุณาระบุชื่อลูกค้า เช่น: ยอด สมชาย' },
        ]);
      }
    } else {
      await deliverMessages(userId, replyToken, [
        {
          type: 'text',
          text: 'ไม่พบคำสั่งนี้ 😅\nพิมพ์ "วิธีใช้" เพื่อดูคำสั่งทั้งหมด',
        },
      ]);
    }
  } catch (error) {
    console.error('Bot command error:', error);
    await deliverMessages(userId, replyToken, [
      { type: 'text', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง 🔧' },
    ]);
  }
}

/**
 * Command: สรุป
 */
async function handleSummary(userId: string, replyToken: string, tenantId: string) {
  // Get today's logical date in local timezone
  const today = getBangkokDateStr();

  const [[payments], [loans], [expenses]] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payments WHERE payment_date = ${today} AND tenant_id = ${tenantId}`,
    sql`SELECT COALESCE(SUM(principal::numeric), 0) as total FROM loans WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok') = ${today} AND tenant_id = ${tenantId}`,
    sql`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM expenses WHERE expense_date = ${today} AND tenant_id = ${tenantId}`
  ]);

  const totalCollected = Number(payments?.total || 0);
  const totalLent = Number(loans?.total || 0);
  const totalExpense = Number(expenses?.total || 0);
  const netFlow = totalCollected - totalLent - totalExpense;

  const flexMessage = {
    type: 'flex',
    altText: '📊 สรุปยอดประจำวัน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#8b5cf6',
        contents: [
          { type: 'text', text: '📊 สรุปยอดประจำวัน', weight: 'bold', color: '#ffffff', size: 'sm' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: 'รับชำระเงิน', size: 'sm', color: '#8c8c8c', flex: 2 },
              { type: 'text', text: `${totalCollected.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'sm', color: '#10b981', align: 'end', weight: 'bold', flex: 3 }
            ]
          },
          {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: 'ปล่อยกู้ใหม่', size: 'sm', color: '#8c8c8c', flex: 2 },
              { type: 'text', text: `${totalLent.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'sm', color: '#0ea5e9', align: 'end', weight: 'bold', flex: 3 }
            ]
          },
          {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: 'รายจ่าย', size: 'sm', color: '#8c8c8c', flex: 2 },
              { type: 'text', text: `${totalExpense.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'sm', color: '#f59e0b', align: 'end', weight: 'bold', flex: 3 }
            ]
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box', layout: 'horizontal', margin: 'md', contents: [
              { type: 'text', text: 'กระแสเงินสด', size: 'sm', color: '#333333', weight: 'bold', flex: 2 },
              { type: 'text', text: `${netFlow.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'md', color: netFlow >= 0 ? '#10b981' : '#ef4444', align: 'end', weight: 'bold', flex: 3 }
            ]
          }
        ]
      }
    }
  };

  await deliverMessages(userId, replyToken, [flexMessage]);
}

/**
 * Command: ยอด <ชื่อ>
 */
async function handleCustomerSearch(
  userId: string,
  replyToken: string,
  name: string,
  tenantId: string,
) {
  const customers = await sql`
    SELECT id, full_name, phone 
    FROM customers 
    WHERE full_name ILIKE ${'%' + name + '%'} AND tenant_id = ${tenantId}
    LIMIT 3
  `;

  if (customers.length === 0) {
    await deliverMessages(userId, replyToken, [
      { type: 'text', text: `❌ ไม่พบข้อมูลลูกค้าที่ชื่อคล้าย "${name}"` },
    ]);
    return;
  }

  const messages: any[] = [];

  for (const customer of customers) {
    const loans = await sql`
      SELECT * FROM loans 
      WHERE customer_id = ${customer.id} AND status IN ('active', 'overdue') AND tenant_id = ${tenantId}
    `;

    if (loans.length === 0) {
      messages.push({ type: 'text', text: `👤 ${customer.fullName}\n✅ ไม่มียอดหนี้ค้างชำระ (ปิดยอดหมดแล้ว)` });
      continue;
    }

    let totalRemaining = 0;
    const loanDetails = [];

    for (const loan of loans) {
      const allPayments = await sql`SELECT amount FROM payments WHERE loan_id = ${loan.id} AND tenant_id = ${tenantId}`;
      const totalPaid = allPayments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
      const remaining = Math.max(Number(loan.isInterestOnly ? loan.principal : loan.totalPayable) - totalPaid, 0);
      
      totalRemaining += remaining;
      
      loanDetails.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `📝 ${loan.loanNumber}`, size: 'xs', color: '#8c8c8c', flex: 2 },
          { type: 'text', text: `${remaining.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'xs', color: '#ef4444', align: 'end', weight: 'bold', flex: 3 }
        ]
      });
    }

    messages.push({
      type: 'flex',
      altText: `ข้อมูลหนี้สินของ ${customer.fullName}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#3b82f6',
          contents: [
            { type: 'text', text: `👤 ${customer.fullName}`, weight: 'bold', color: '#ffffff', size: 'sm' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            ...loanDetails,
            { type: 'separator', margin: 'sm' },
            {
              type: 'box', layout: 'horizontal', margin: 'md', contents: [
                { type: 'text', text: 'ยอดรวมทั้งหมด', size: 'sm', color: '#333333', weight: 'bold', flex: 2 },
                { type: 'text', text: `${totalRemaining.toLocaleString('en-US', {minimumFractionDigits: 2})} ฿`, size: 'md', color: '#ef4444', align: 'end', weight: 'bold', flex: 3 }
              ]
            }
          ]
        }
      }
    });
  }

  await deliverMessages(userId, replyToken, messages);
}

/**
 * Command: ค้างชำระ
 */
async function handleOverdue(userId: string, replyToken: string, tenantId: string) {
  const today = getBangkokDateStr();
  
  const overdueLoans = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.status IN ('active', 'overdue') AND l.due_date < ${today} AND l.tenant_id = ${tenantId}
    ORDER BY l.due_date ASC
    LIMIT 10
  `;

  if (overdueLoans.length === 0) {
    await deliverMessages(userId, replyToken, [
      { type: 'text', text: '🎉 เยี่ยมมาก! วันนี้ไม่มีลูกค้าค้างชำระเลยครับ' },
    ]);
    return;
  }

  const items = overdueLoans.map(loan => {
    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(loan.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return {
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: `👤 ${loan.customerName}`, size: 'xs', color: '#333333', flex: 3, wrap: true },
        { type: 'text', text: `${daysOverdue} วัน`, size: 'xs', color: '#ef4444', align: 'end', weight: 'bold', flex: 2 }
      ]
    };
  });

  const flexMessage = {
    type: 'flex',
    altText: '🚨 รายชื่อค้างชำระ',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ef4444',
        contents: [
          { type: 'text', text: `🚨 ค้างชำระ (${overdueLoans.length} รายการ)`, weight: 'bold', color: '#ffffff', size: 'sm' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: items
      }
    }
  };

  await deliverMessages(userId, replyToken, [flexMessage]);
}

/**
 * Command: เก็บวันนี้
 */
async function handleCollectToday(userId: string, replyToken: string, tenantId: string) {
  const today = getBangkokDateStr();
  
  // Find active loans that haven't paid today
  const pendingLoans = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.status IN ('active', 'overdue') AND l.tenant_id = ${tenantId}
      AND NOT EXISTS (
        SELECT 1 FROM payments p 
        WHERE p.loan_id = l.id AND p.payment_date = ${today} AND p.tenant_id = ${tenantId}
      )
    ORDER BY l.created_at ASC
    LIMIT 20
  `;

  if (pendingLoans.length === 0) {
    await deliverMessages(userId, replyToken, [
      { type: 'text', text: '🎉 ยอดเยี่ยม! วันนี้เก็บเงินครบทุกรายการแล้วครับ' },
    ]);
    return;
  }

  const items = [];
  
  for (const loan of pendingLoans) {
    // Calculate total paid to find remaining installments
    const allPayments = await sql`SELECT amount FROM payments WHERE loan_id = ${loan.id} AND tenant_id = ${tenantId}`;
    const totalPaid = allPayments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
    
    let typeText = '';
    let remainingText = '';
    
    if (loan.isIndefinite) {
      typeText = 'ดอกลอย';
      const remainingBalance = Math.max(Number(loan.principal) - totalPaid, 0);
      remainingText = `ต้นคงเหลือ ${remainingBalance.toLocaleString('en-US', {minimumFractionDigits: 0})} ฿`;
    } else {
      typeText = `${loan.installmentsCount || '-'} วัน`;
      const installmentAmt = Number(loan.installmentAmount) || 1;
      const paidInstallments = Math.floor(totalPaid / installmentAmt);
      const remainingInstallments = Math.max(Number(loan.installmentsCount) - paidInstallments, 0);
      remainingText = `เหลือ ${remainingInstallments} งวด`;
    }

    const formattedInstallment = Number(loan.installmentAmount).toLocaleString('en-US', {minimumFractionDigits: 0});

    items.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      contents: [
        { 
          type: 'box', layout: 'horizontal', 
          contents: [
            { type: 'text', text: `👤 ${loan.customerName}`, size: 'sm', color: '#333333', weight: 'bold', flex: 2 },
            { type: 'text', text: `${formattedInstallment} ฿`, size: 'sm', color: '#10b981', align: 'end', weight: 'bold', flex: 1 }
          ]
        },
        { 
          type: 'box', layout: 'horizontal', margin: 'xs', 
          contents: [
            { type: 'text', text: `📌 ${typeText}`, size: 'xs', color: '#8c8c8c', flex: 1 },
            { type: 'text', text: `🎯 ${remainingText}`, size: 'xs', color: '#0ea5e9', align: 'end', weight: 'bold', flex: 1 }
          ]
        }
      ]
    });
    items.push({ type: 'separator', margin: 'md' });
  }

  // Remove the last separator
  if (items.length > 0) items.pop();

  const flexMessage = {
    type: 'flex',
    altText: '📋 รายการเก็บเงินวันนี้',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10b981',
        contents: [
          { type: 'text', text: `📋 ต้องเก็บวันนี้ (${pendingLoans.length} รายการ)`, weight: 'bold', color: '#ffffff', size: 'sm' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: items
      }
    }
  };

  await deliverMessages(userId, replyToken, [flexMessage]);
}


/**
 * Command: วิธีใช้
 */
async function handleHelp(userId: string, replyToken: string) {
  const text = `🤖 คำสั่งที่บอทเข้าใจครับ:

🔑 "token" - ดูรหัส User ID เพื่อผูกระบบ
📊 "สรุป" - ดูข้อมูลรับ-จ่ายของวันนี้
📋 "เก็บวันนี้" - ดูรายชื่อที่ต้องเก็บวันนี้
🔍 "ยอด [ชื่อ]" - ดูยอดคงเหลือของลูกค้า (เช่น ยอด สมชาย)
🚨 "ค้างชำระ" - ดูรายชื่อคนที่เลยกำหนด
❓ "วิธีใช้" - ดูข้อความนี้อีกครั้ง`;

  await deliverMessages(userId, replyToken, [{ type: 'text', text }]);
}
