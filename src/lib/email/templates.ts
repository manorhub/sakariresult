// src/lib/email/templates.ts
// Reusable, Mobile-Friendly Transactional Email Templates

export interface EmailTemplateData {
  siteName?: string;
  siteUrl?: string;
  recipientName?: string;
}

const DEFAULT_BRAND = {
  siteName: 'Sarkari Info',
  siteUrl: 'https://sarkariinfo.in',
};

function baseLayout(content: string, brand = DEFAULT_BRAND): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand.siteName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .container { max-width: 580px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background-color: #0c2340; padding: 24px 30px; text-align: center; }
    .brand { color: #ffffff; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-decoration: none; }
    .brand-accent { color: #ff9933; }
    .body { padding: 30px; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; background-color: #0c2340; color: #ffffff !important; padding: 12px 24px; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 8px; margin: 18px 0; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .footer { background-color: #f8fafc; padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .tag { display: inline-block; background-color: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="${brand.siteUrl}" class="brand">SARKARI<span class="brand-accent">INFO</span></a>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated notification from ${brand.siteName}. We deliver only verified government notices and exam alerts.</p>
      <p><a href="${brand.siteUrl}/account/settings/notifications" style="color: #64748b;">Manage Notification Preferences</a> &bull; <a href="${brand.siteUrl}/privacy-policy" style="color: #64748b;">Privacy Policy</a></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Email Verification Template
 */
export function buildVerificationEmail(data: { name: string; verifyUrl: string }): { subject: string; html: string; text: string } {
  const subject = 'Verify your email address — Sarkari Info';
  const html = baseLayout(`
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Welcome to Sarkari Info, ${escapeHtml(data.name)}!</h2>
    <p>Please verify your email address to enable customized job alerts, saved opportunities, and deadline reminders.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.verifyUrl}" class="btn">Verify Email Address</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">This verification link will expire in 24 hours. If you did not create an account on Sarkari Info, you can safely ignore this email.</p>
    <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">Or copy and paste this URL into your browser:<br/>${data.verifyUrl}</p>
  `);
  const text = `Welcome to Sarkari Info, ${data.name}!\n\nPlease verify your email address by visiting this link:\n${data.verifyUrl}\n\nThis link expires in 24 hours.`;
  return { subject, html, text };
}

/**
 * 2. Password Reset Template
 */
export function buildPasswordResetEmail(data: { name: string; resetUrl: string }): { subject: string; html: string; text: string } {
  const subject = 'Reset your password — Sarkari Info';
  const html = baseLayout(`
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Password Reset Request</h2>
    <p>Hello ${escapeHtml(data.name)},</p>
    <p>We received a request to reset your password for your Sarkari Info account. Click the button below to choose a new password:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.resetUrl}" class="btn">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">This link is valid for 1 hour and can only be used once. If you did not request a password reset, no further action is required.</p>
  `);
  const text = `Hello ${data.name},\n\nWe received a request to reset your password. Use the link below to set a new password:\n${data.resetUrl}\n\nThis link expires in 1 hour.`;
  return { subject, html, text };
}

/**
 * 3. New Job Alert Template
 */
export function buildJobAlertEmail(data: {
  title: string;
  organization: string;
  vacancies?: string;
  qualification?: string;
  lastDate?: string;
  jobUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Job Alert: ${data.organization} - ${data.title}`;
  const html = baseLayout(`
    <span class="tag">New Government Job</span>
    <h2 style="margin-top: 4px; color: #0f172a; font-size: 18px;">${escapeHtml(data.title)}</h2>
    <div class="card">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr><td style="color: #64748b; padding: 4px 0;">Organization:</td><td style="font-weight: 700; text-align: right;">${escapeHtml(data.organization)}</td></tr>
        ${data.vacancies ? `<tr><td style="color: #64748b; padding: 4px 0;">Total Posts:</td><td style="font-weight: 700; text-align: right;">${escapeHtml(data.vacancies)}</td></tr>` : ''}
        ${data.qualification ? `<tr><td style="color: #64748b; padding: 4px 0;">Eligibility:</td><td style="font-weight: 700; text-align: right;">${escapeHtml(data.qualification)}</td></tr>` : ''}
        ${data.lastDate ? `<tr><td style="color: #64748b; padding: 4px 0;">Last Date:</td><td style="font-weight: 700; color: #b91c1c; text-align: right;">${escapeHtml(data.lastDate)}</td></tr>` : ''}
      </table>
    </div>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${data.jobUrl}" class="btn">View Details & Apply Online</a>
    </div>
  `);
  const text = `New Job Alert: ${data.organization}\n${data.title}\n\nVacancies: ${data.vacancies || 'N/A'}\nLast Date: ${data.lastDate || 'N/A'}\n\nView details: ${data.jobUrl}`;
  return { subject, html, text };
}

/**
 * 4. Result / Admit Card / Answer Key Alert Template
 */
export function buildContentAlertEmail(data: {
  type: 'result' | 'admit_card' | 'answer_key';
  title: string;
  organization: string;
  actionUrl: string;
}): { subject: string; html: string; text: string } {
  const typeLabels = {
    result: { tag: 'Exam Result Declared', action: 'Check Result & Merit List' },
    admit_card: { tag: 'Admit Card Released', action: 'Download Hall Ticket' },
    answer_key: { tag: 'Answer Key Released', action: 'Download Solution & Challenge Key' },
  };

  const config = typeLabels[data.type] || typeLabels.result;
  const subject = `${config.tag}: ${data.title}`;

  const html = baseLayout(`
    <span class="tag">${config.tag}</span>
    <h2 style="margin-top: 4px; color: #0f172a; font-size: 18px;">${escapeHtml(data.title)}</h2>
    <p style="color: #475569;">Official notice and portal links have been published by <strong>${escapeHtml(data.organization)}</strong>.</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.actionUrl}" class="btn">${config.action}</a>
    </div>
  `);

  const text = `${config.tag}: ${data.title}\nOrganization: ${data.organization}\n\nAccess link: ${data.actionUrl}`;
  return { subject, html, text };
}

/**
 * 5. Deadline Reminder Template
 */
export function buildDeadlineReminderEmail(data: {
  title: string;
  organization: string;
  daysRemaining: number;
  lastDate: string;
  jobUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Reminder: ${data.daysRemaining} Day${data.daysRemaining === 1 ? '' : 's'} Left to Apply — ${data.title}`;
  const html = baseLayout(`
    <span class="tag" style="background-color: #fee2e2; color: #991b1b;">Application Deadline Approaching</span>
    <h2 style="margin-top: 4px; color: #0f172a; font-size: 18px;">${escapeHtml(data.title)}</h2>
    <div class="card" style="border-left: 4px solid #ef4444;">
      <p style="margin: 0; font-size: 14px;"><strong>Closing Date:</strong> <span style="color: #b91c1c; font-weight: 700;">${escapeHtml(data.lastDate)}</span> (${data.daysRemaining} days left)</p>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b;">Complete your online application before portal server congestion occurs.</p>
    </div>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${data.jobUrl}" class="btn">Apply Now</a>
    </div>
  `);

  const text = `Application Closing Soon: ${data.title}\nDays Remaining: ${data.daysRemaining}\nLast Date: ${data.lastDate}\n\nApply now: ${data.jobUrl}`;
  return { subject, html, text };
}

/**
 * 6. Digest Email Template (Daily / Weekly)
 */
export function buildDigestEmail(data: {
  digestType: 'Daily' | 'Weekly';
  items: { title: string; type: string; url: string }[];
  siteUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Your ${data.digestType} Govt Jobs & Results Digest — Sarkari Info`;
  const itemsHtml = data.items
    .map(
      item => `<li style="margin-bottom: 12px;">
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #e2e8f0; padding: 2px 6px; border-radius: 3px; color: #334155;">${item.type.replace('_', ' ')}</span>
        <a href="${item.url}" style="font-weight: 700; color: #0c2340; text-decoration: none; margin-left: 6px;">${escapeHtml(item.title)}</a>
      </li>`
    )
    .join('');

  const html = baseLayout(`
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">${data.digestType} Government Exam Digest</h2>
    <p>Here are the verified notifications and results published recently in your followed categories:</p>
    <ul style="padding-left: 20px; font-size: 14px;">
      ${itemsHtml}
    </ul>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.siteUrl}/account/saved" class="btn">View All in Dashboard</a>
    </div>
  `);

  const text = `${data.digestType} Digest:\n` + data.items.map(i => `- [${i.type}] ${i.title}: ${i.url}`).join('\n');
  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
