import sql from '../db';
import { getBangkokDateStr, isLineEventEnabled, LineNotifyConfig, resolveLineRecipients } from './lineConfig';
import { pushLineFlex, pushLineText } from './line.service';

const DIGEST_LIMIT = 15;

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export async function fetchDueTodayLoans(tenantId: string, limit = DIGEST_LIMIT) {
  const today = getBangkokDateStr();
  return sql`
    SELECT l.loan_number, l.installment_amount, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
      AND l.status IN ('active', 'overdue')
      AND l.due_date = ${today}
    ORDER BY l.due_date ASC
    LIMIT ${limit}
  `;
}

export async function fetchOverdueLoans(tenantId: string, limit = DIGEST_LIMIT) {
  const today = getBangkokDateStr();
  return sql`
    SELECT l.loan_number, l.due_date, l.installment_amount, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
      AND l.status IN ('active', 'overdue')
      AND l.due_date < ${today}
    ORDER BY l.due_date ASC
    LIMIT ${limit}
  `;
}

export async function countOverdueLoans(tenantId: string) {
  const today = getBangkokDateStr();
  const [row] = await sql`
    SELECT COUNT(*)::int as count
    FROM loans l
    WHERE l.tenant_id = ${tenantId}
      AND l.status IN ('active', 'overdue')
      AND l.due_date < ${today}
  `;
  return Number(row?.count ?? 0);
}

export async function fetchPendingCollectionToday(tenantId: string, limit = DIGEST_LIMIT) {
  const today = getBangkokDateStr();
  return sql`
    SELECT l.loan_number, l.installment_amount, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
      AND l.status IN ('active', 'overdue')
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.loan_id = l.id AND p.payment_date = ${today} AND p.tenant_id = ${tenantId}
      )
    ORDER BY l.created_at ASC
    LIMIT ${limit}
  `;
}

function loanRow(label: string, sub: string, amount?: number) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'sm',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: label, size: 'xs', color: '#333333', weight: 'bold', flex: 3, wrap: true },
          {
            type: 'text',
            text: amount != null ? `${fmt(Number(amount))} ฿` : sub,
            size: 'xs',
            color: '#10b981',
            align: 'end',
            weight: 'bold',
            flex: 2,
          },
        ],
      },
      ...(amount != null
        ? [{
            type: 'text',
            text: sub,
            size: 'xxs',
            color: '#8c8c8c',
            margin: 'xs',
          }]
        : []),
    ],
  };
}

function buildSectionTitle(text: string, color: string) {
  return {
    type: 'text',
    text,
    size: 'sm',
    weight: 'bold',
    color,
    margin: 'lg',
  };
}

export async function sendMorningDigest(tenantId: string, config: LineNotifyConfig) {
  const recipients = resolveLineRecipients(config);
  if (!recipients.length) return;

  const includeMorning = isLineEventEnabled(config, 'morning_digest');
  const includeOverdue = isLineEventEnabled(config, 'overdue_alert');
  if (!includeMorning && !includeOverdue) return;

  const today = getBangkokDateStr();
  const bodyContents: any[] = [
    { type: 'text', text: `📅 ${today}`, size: 'xs', color: '#8c8c8c' },
  ];

  if (includeMorning) {
    const [dueToday, pending] = await Promise.all([
      fetchDueTodayLoans(tenantId),
      fetchPendingCollectionToday(tenantId),
    ]);

    bodyContents.push(buildSectionTitle(`📋 ยังไม่เก็บวันนี้ (${pending.length} ราย)`, '#10b981'));
    if (pending.length === 0) {
      bodyContents.push({ type: 'text', text: 'เก็บครบแล้ว 🎉', size: 'xs', color: '#8c8c8c' });
    } else {
      for (const row of pending) {
        bodyContents.push(
          loanRow(`👤 ${row.customerName}`, `📝 ${row.loanNumber}`, Number(row.installmentAmount)),
        );
      }
    }

    bodyContents.push(buildSectionTitle(`⏰ ครบกำหนดวันนี้ (${dueToday.length} ราย)`, '#f59e0b'));
    if (dueToday.length === 0) {
      bodyContents.push({ type: 'text', text: 'ไม่มีสัญญาครบกำหนดวันนี้', size: 'xs', color: '#8c8c8c' });
    } else {
      for (const row of dueToday) {
        bodyContents.push(
          loanRow(`👤 ${row.customerName}`, `📝 ${row.loanNumber}`, Number(row.installmentAmount)),
        );
      }
    }
  }

  if (includeOverdue) {
    const overdue = await fetchOverdueLoans(tenantId);
    const totalOverdue = await countOverdueLoans(tenantId);
    bodyContents.push(buildSectionTitle(`🚨 ค้างชำระ (${totalOverdue} ราย)`, '#ef4444'));
    if (overdue.length === 0) {
      bodyContents.push({ type: 'text', text: 'ไม่มีลูกค้าค้างชำระ 🎉', size: 'xs', color: '#8c8c8c' });
    } else {
      for (const row of overdue) {
        const days = Math.floor(
          (new Date(today).getTime() - new Date(row.dueDate).getTime()) / (1000 * 60 * 60 * 24),
        );
        bodyContents.push(
          loanRow(
            `👤 ${row.customerName}`,
            `📝 ${row.loanNumber} · ค้าง ${days} วัน`,
            Number(row.installmentAmount),
          ),
        );
      }
      if (totalOverdue > overdue.length) {
        bodyContents.push({
          type: 'text',
          text: `… และอีก ${totalOverdue - overdue.length} ราย`,
          size: 'xxs',
          color: '#8c8c8c',
          margin: 'md',
          align: 'center',
        });
      }
    }
  }

  const flex = {
    type: 'flex',
    altText: '☀️ สรุปประจำวัน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#8b5cf6',
        contents: [
          { type: 'text', text: '☀️ สรุปประจำวัน', weight: 'bold', color: '#ffffff', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'separator', color: '#f0f0f0' },
          {
            type: 'text',
            text: 'พิมพ์ "ค้างชำระ" หรือ "เก็บวันนี้" ใน Bot เพื่อดูเพิ่มเติม',
            size: 'xxs',
            color: '#aaaaaa',
            margin: 'md',
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };

  await Promise.all(recipients.map((to) => pushLineFlex(to, flex)));
}

export async function sendOverdueReminder(tenantId: string, config: LineNotifyConfig) {
  if (!isLineEventEnabled(config, 'overdue_alert')) return;

  const recipients = resolveLineRecipients(config);
  if (!recipients.length) return;

  const totalOverdue = await countOverdueLoans(tenantId);
  if (totalOverdue === 0) return;

  const overdue = await fetchOverdueLoans(tenantId);
  const today = getBangkokDateStr();

  const items = overdue.map((row) => {
    const days = Math.floor(
      (new Date(today).getTime() - new Date(row.dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: `👤 ${row.customerName}`, size: 'xs', color: '#333333', flex: 3, wrap: true },
        { type: 'text', text: `${days} วัน`, size: 'xs', color: '#ef4444', align: 'end', weight: 'bold', flex: 1 },
      ],
    };
  });

  const flex = {
    type: 'flex',
    altText: '🚨 แจ้งเตือนค้างชำระ',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#ef4444',
        contents: [
          {
            type: 'text',
            text: `🚨 ค้างชำระ (${totalOverdue} ราย)`,
            weight: 'bold',
            color: '#ffffff',
            size: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: items,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'separator', color: '#f0f0f0' },
          {
            type: 'text',
            text: totalOverdue > overdue.length
              ? `แสดง ${overdue.length} จาก ${totalOverdue} ราย · พิมพ์ "ค้างชำระ" ใน Bot`
              : 'พิมพ์ "ค้างชำระ" ใน Bot เพื่อดูรายละเอียด',
            size: 'xxs',
            color: '#aaaaaa',
            margin: 'md',
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };

  await Promise.all(recipients.map((to) => pushLineFlex(to, flex)));
}

export async function runScheduledLineNotifications(kind: 'morning' | 'evening') {
  const rows = await sql`
    SELECT tenant_id, value FROM settings WHERE key = 'line_notify'
  `;

  for (const row of rows) {
    const config = row.value as LineNotifyConfig;
    if (!config?.enabled) continue;

    try {
      if (kind === 'morning') {
        await sendMorningDigest(row.tenantId, config);
      } else {
        await sendOverdueReminder(row.tenantId, config);
      }
    } catch (err) {
      console.error(`[LINE Cron] Failed for tenant ${row.tenantId}:`, err);
    }
  }
}

export async function sendLineTestNotification(tenantId: string) {
  const settings = await sql`
    SELECT value FROM settings WHERE key = 'line_notify' AND tenant_id = ${tenantId}
  `;
  if (!settings.length) throw new Error('ยังไม่ได้ตั้งค่า LINE Notify');

  const config = settings[0].value as LineNotifyConfig;
  if (!config.enabled) throw new Error('กรุณาเปิดใช้งาน LINE Notify ก่อน');

  const recipients = resolveLineRecipients(config);
  if (!recipients.length) throw new Error('กรุณาระบุ LINE User ID อย่างน้อย 1 รายการ');

  const flex = {
    type: 'flex',
    altText: '✅ ทดสอบการแจ้งเตือน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        contents: [
          { type: 'text', text: '✅ ทดสอบการแจ้งเตือน', weight: 'bold', color: '#ffffff', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: 'เชื่อมต่อ LINE สำเร็จ', size: 'sm', weight: 'bold', color: '#333333' },
          {
            type: 'text',
            text: `ส่งถึง ${recipients.length} รายการ · ${getBangkokDateStr()}`,
            size: 'xs',
            color: '#8c8c8c',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ระบบพร้อมรับแจ้งเตือนแล้ว',
            size: 'xxs',
            color: '#aaaaaa',
            margin: 'md',
            align: 'center',
          },
        ],
      },
    },
  };

  await Promise.all(recipients.map((to) => pushLineFlex(to, flex)));
}
