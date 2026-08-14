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
      AND (l.status IS NULL OR LOWER(l.status) NOT IN ('completed', 'closed', 'deleted', 'cancelled'))
      AND l.due_date = ${today}
    ORDER BY l.due_date ASC
    LIMIT ${limit}
  `;
}

export async function fetchOverdueLoans(tenantId: string, limit = DIGEST_LIMIT) {
  const today = getBangkokDateStr();
  const loans = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
      AND (l.status IS NULL OR LOWER(l.status) NOT IN ('completed', 'closed', 'deleted', 'cancelled', 'refinanced'))
  `;

  const overdueList: any[] = [];

  for (const l of loans) {
    const isIndefinite = l.isIndefinite || l.is_indefinite;
    const notes = l.notes || '';
    const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
    const isZeroDebt = notes.includes('ยอดติด') || notes.includes('ยอดติดค้างชำระ') || (interestRate === 0 && (l.installmentsCount === 1 || !l.paymentType));

    if (isIndefinite || isZeroDebt) continue;

    const [p] = await sql`SELECT COUNT(*)::int as count FROM payments WHERE loan_id = ${l.id} AND tenant_id = ${tenantId}`;
    const paidCount = Number(p?.count || 0);

    const startDateStr = l.startDate ? l.startDate.toISOString().substring(0, 10) : (l.start_date ? String(l.start_date).substring(0, 10) : null);
    if (!startDateStr) continue;

    const startParts = startDateStr.split('-').map(Number);
    const [y, m, d] = startParts;
    const paymentType = l.paymentType || l.payment_type || 'daily';

    const nextDate = new Date(y, m - 1, d);
    if (paymentType === 'daily') {
      nextDate.setDate(nextDate.getDate() + paidCount);
    } else if (paymentType === 'weekly') {
      nextDate.setDate(nextDate.getDate() + paidCount * 7);
    } else if (paymentType === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + paidCount);
    }

    const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    if (nextDueDateStr < today) {
      overdueList.push({
        loanNumber: l.loanNumber || l.loan_number,
        customerName: l.customerName || l.customer_name,
        dueDate: nextDueDateStr,
        installmentAmount: l.installmentAmount || l.installment_amount
      });
    }
  }

  return overdueList.slice(0, limit);
}

export async function countOverdueLoans(tenantId: string) {
  const overdueList = await fetchOverdueLoans(tenantId, 1000);
  return overdueList.length;
}

export async function fetchPendingCollectionToday(tenantId: string, limit = DIGEST_LIMIT) {
  const today = getBangkokDateStr();

  // Pull all active loans, then compute next due date to filter correctly
  const loans = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
      AND (l.status IS NULL OR LOWER(l.status) NOT IN ('completed', 'closed', 'deleted', 'cancelled', 'refinanced', 'forfeited'))
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.loan_id = l.id AND p.payment_date = ${today} AND p.tenant_id = ${tenantId}
      )
    ORDER BY l.created_at ASC
  `;

  const pendingList: any[] = [];

  for (const l of loans) {
    // Skip indefinite / ยอดติดค้างชำระเดิม / zero-interest single-payment / pawn loans
    const isIndefinite = l.isIndefinite || l.is_indefinite || l.isPawn || l.is_pawn;
    const notes = l.notes || '';
    const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
    const installmentsCount = Number(l.installmentsCount ?? l.installments_count ?? 0);
    const paymentType = l.paymentType || l.payment_type;
    const isZeroDebt =
      notes.includes('ยอดติด') ||
      notes.includes('ยอดติดค้างชำระ') ||
      (interestRate === 0 && (installmentsCount === 1 || !paymentType));

    if (isIndefinite || isZeroDebt) continue;

    // Skip principal-interest-at-end (จำนำ) loans — due on a specific date, handled separately
    if (l.isPrincipalInterestAtEnd || l.is_principal_interest_at_end) continue;

    // Compute next due date dynamically
    const startDateRaw = l.startDate ?? l.start_date;
    if (!startDateRaw) continue;

    const startDateStr = startDateRaw instanceof Date
      ? startDateRaw.toISOString().substring(0, 10)
      : String(startDateRaw).substring(0, 10);

    const startParts = startDateStr.split('-').map(Number);
    if (startParts.length !== 3 || startParts.some(isNaN)) continue;

    const [y, m, d] = startParts;
    const [p] = await sql`SELECT COUNT(*)::int as count FROM payments WHERE loan_id = ${l.id} AND tenant_id = ${tenantId}`;
    const paidCount = Number(p?.count || 0);

    const nextDate = new Date(y, m - 1, d);
    if (paymentType === 'daily') {
      nextDate.setDate(nextDate.getDate() + paidCount);
    } else if (paymentType === 'weekly') {
      nextDate.setDate(nextDate.getDate() + paidCount * 7);
    } else if (paymentType === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + paidCount);
    }

    const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    // Final due date cap
    const finalDueDateRaw = l.dueDate ?? l.due_date;
    const finalDueDateStr = finalDueDateRaw
      ? (finalDueDateRaw instanceof Date ? finalDueDateRaw.toISOString().substring(0, 10) : String(finalDueDateRaw).substring(0, 10))
      : null;

    const effectiveDue = finalDueDateStr && nextDueDateStr > finalDueDateStr ? finalDueDateStr : nextDueDateStr;

    // Only include if next due is today or already overdue (past due not yet collected)
    if (effectiveDue <= today) {
      pendingList.push({
        loanNumber: l.loanNumber || l.loan_number,
        customerName: l.customerName || l.customer_name,
        installmentAmount: l.installmentAmount ?? l.installment_amount,
        nextDueDate: effectiveDue,
      });
    }

    if (pendingList.length >= limit) break;
  }

  return pendingList;
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

  const channelAccessToken = config.channelAccessToken?.trim() || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) throw new Error('กรุณาระบุ LINE Channel Access Token ในหน้าการตั้งค่า');

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

  const results = await Promise.all(
    recipients.map(async (to) => {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({ to, messages: [flex] }),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('LINE Channel Access Token หมดอายุหรือไม่อนุญาต (LINE API 401 Unauthorized) กรุณากด Issue Token ใหม่ใน LINE Developers Console');
        }
        if (response.status === 400 && errJson?.message?.includes('user')) {
          throw new Error(`LINE User ID (${to}) ไม่ถูกต้อง หรือผู้ใช้ยังไม่ได้กดเพิ่มเพื่อนกับ LINE Bot`);
        }
        throw new Error(`LINE API เกิดข้อผิดพลาด (${response.status}): ${errJson?.message || 'ส่งข้อความไม่สำเร็จ'}`);
      }
      return true;
    })
  );

  return results;
}
