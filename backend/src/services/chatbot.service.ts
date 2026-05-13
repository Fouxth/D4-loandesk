import sql from '../db';

/**
 * Helper to reply to LINE messages
 */
async function replyLineMessage(replyToken: string, messages: any[]) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return;

  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      body: JSON.stringify({
        replyToken,
        messages
      })
    });
  } catch (error) {
    console.error('Failed to reply message:', error);
  }
}

/**
 * Handle incoming LINE text messages
 */
export async function handleBotCommand(text: string, userId: string, replyToken: string) {
  const cmd = text.trim();
  const lowerCmd = cmd.toLowerCase();

  // 1. Always allow 'token' or 'id' for setup
  if (lowerCmd === 'token' || lowerCmd === 'id') {
    await replyLineMessage(replyToken, [
      {
        type: 'text',
        text: `รหัส User ID ของคุณคือ:\n${userId}\n\nคัดลอกรหัสนี้ไปใส่ในช่อง "LINE User ID" ในหน้าตั้งค่าของระบบได้เลยครับ 🚀`
      }
    ]);
    return;
  }

  // 2. Security Check: Only allow configured admin
  const settings = await sql`SELECT value FROM settings WHERE key = 'line_notify'`;
  if (!settings || settings.length === 0) return;
  const config = settings[0].value;

  if (config.userId !== userId) {
    // Unauthorized user, silently ignore to prevent spam
    return;
  }

  // 3. Process Commands
  try {
    if (lowerCmd === 'สรุป' || lowerCmd === 'summary') {
      await handleSummary(replyToken);
    } 
    else if (lowerCmd === 'ค้างชำระ' || lowerCmd === 'overdue') {
      await handleOverdue(replyToken);
    }
    else if (lowerCmd.startsWith('ยอด ')) {
      const searchName = cmd.substring(4).trim();
      if (searchName) {
        await handleCustomerSearch(replyToken, searchName);
      } else {
        await replyLineMessage(replyToken, [{ type: 'text', text: 'กรุณาระบุชื่อลูกค้า เช่น: ยอด สมชาย' }]);
      }
    }
    else if (lowerCmd === 'วิธีใช้' || lowerCmd === 'help') {
      await handleHelp(replyToken);
    }
    else {
      // Optional: Inform user command not found
      await replyLineMessage(replyToken, [{ 
        type: 'text', 
        text: 'ขออภัยครับ ไม่พบคำสั่งนี้ 😅\nพิมพ์ "วิธีใช้" เพื่อดูคำสั่งทั้งหมดครับ' 
      }]);
    }
  } catch (error) {
    console.error('Bot command error:', error);
    await replyLineMessage(replyToken, [{ type: 'text', text: 'เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาลองใหม่อีกครั้ง 🔧' }]);
  }
}

/**
 * Command: สรุป
 */
async function handleSummary(replyToken: string) {
  // Get today's logical date in local timezone
  const today = new Date().toISOString().split('T')[0];

  const [[payments], [loans], [expenses]] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date = ${today}`,
    sql`SELECT COALESCE(SUM(principal), 0) as total FROM loans WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok') = ${today}`,
    sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date = ${today}`
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

  await replyLineMessage(replyToken, [flexMessage]);
}

/**
 * Command: ยอด <ชื่อ>
 */
async function handleCustomerSearch(replyToken: string, name: string) {
  const customers = await sql`
    SELECT id, full_name, phone 
    FROM customers 
    WHERE full_name ILIKE ${'%' + name + '%'} 
    LIMIT 3
  `;

  if (customers.length === 0) {
    await replyLineMessage(replyToken, [{ type: 'text', text: `❌ ไม่พบข้อมูลลูกค้าที่ชื่อคล้าย "${name}"` }]);
    return;
  }

  const messages: any[] = [];

  for (const customer of customers) {
    const loans = await sql`
      SELECT * FROM loans 
      WHERE customer_id = ${customer.id} AND status IN ('active', 'overdue')
    `;

    if (loans.length === 0) {
      messages.push({ type: 'text', text: `👤 ${customer.fullName}\n✅ ไม่มียอดหนี้ค้างชำระ (ปิดยอดหมดแล้ว)` });
      continue;
    }

    let totalRemaining = 0;
    const loanDetails = [];

    for (const loan of loans) {
      const allPayments = await sql`SELECT amount FROM payments WHERE loan_id = ${loan.id}`;
      const totalPaid = allPayments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
      const remaining = Math.max(Number(loan.is_interest_only ? loan.principal : loan.totalPayable) - totalPaid, 0);
      
      totalRemaining += remaining;
      
      loanDetails.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `📝 ${loan.loan_number}`, size: 'xs', color: '#8c8c8c', flex: 2 },
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

  await replyLineMessage(replyToken, messages);
}

/**
 * Command: ค้างชำระ
 */
async function handleOverdue(replyToken: string) {
  const today = new Date().toISOString().split('T')[0];
  
  const overdueLoans = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.status IN ('active', 'overdue') AND l.due_date < ${today}
    ORDER BY l.due_date ASC
    LIMIT 10
  `;

  if (overdueLoans.length === 0) {
    await replyLineMessage(replyToken, [{ type: 'text', text: '🎉 เยี่ยมมาก! วันนี้ไม่มีลูกค้าค้างชำระเลยครับ' }]);
    return;
  }

  const items = overdueLoans.map(loan => {
    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(loan.due_date).getTime()) / (1000 * 60 * 60 * 24));
    return {
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: `👤 ${loan.customer_name}`, size: 'xs', color: '#333333', flex: 3, wrap: true },
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

  await replyLineMessage(replyToken, [flexMessage]);
}

/**
 * Command: วิธีใช้
 */
async function handleHelp(replyToken: string) {
  const text = `🤖 คำสั่งที่บอทเข้าใจครับ:

📊 "สรุป" - ดูข้อมูลรับ-จ่ายของวันนี้
🔍 "ยอด [ชื่อ]" - ดูยอดคงเหลือของลูกค้า (เช่น ยอด สมชาย)
🚨 "ค้างชำระ" - ดูรายชื่อคนที่เลยกำหนด
❓ "วิธีใช้" - ดูข้อความนี้อีกครั้ง`;

  await replyLineMessage(replyToken, [{ type: 'text', text }]);
}
