import { Resend } from 'resend';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#111A33';
const GOLD = '#C5A55A';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const BG = '#f4f4f1';
const CARD = '#ffffff';
const BORDER = '#e5e5e0';

export interface BrandedEmail {
  subject: string;
  html: string;
  text: string;
}

interface AuthEmailOpts {
  heading: string;
  preview: string;
  intro: string;
  buttonLabel: string;
  url: string;
  /** Small print under the button. */
  footnote?: string;
  subject: string;
}

/**
 * A polished, email-client-safe (table + inline-CSS) branded message in the
 * navy/gold identity. Used for sign-in, passkey-setup and account emails;
 * invitations have their own role-specific layout (invitations.ts).
 */
export function brandedAuthEmail(opts: AuthEmailOpts): BrandedEmail {
  const { heading, preview, intro, buttonLabel, url, footnote, subject } = opts;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

        <!-- Brand header -->
        <tr>
          <td style="background:${NAVY};border-radius:16px 16px 0 0;padding:26px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">
                  <div style="width:40px;height:40px;background:${NAVY_DARK};border:1px solid rgba(197,165,90,0.5);border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🛡️</div>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.2px;">Core Downtown Memphis</div>
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${GOLD};font-size:11px;font-weight:600;letter-spacing:0.32em;">SAFETY DASHBOARD</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Gold divider -->
        <tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="background:${CARD};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};padding:34px 28px 10px;">
            <h1 style="margin:0 0 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};font-size:22px;font-weight:700;">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 24px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#4b5563;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="${escapeAttr(url)}" target="_blank"
                     style="display:inline-block;background:${NAVY};color:#ffffff;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;box-shadow:0 2px 6px rgba(27,42,74,0.25);">${escapeHtml(buttonLabel)}</a>
                </td>
              </tr>
            </table>

            ${footnote ? `<p style="margin:22px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};font-size:13px;line-height:1.6;text-align:center;">${escapeHtml(footnote)}</p>` : ''}
          </td>
        </tr>

        <!-- Fallback link -->
        <tr>
          <td style="background:${CARD};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};padding:18px 28px 28px;">
            <p style="margin:18px 0 6px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};font-size:12px;">If the button doesn’t work, copy and paste this link:</p>
            <p style="margin:0;font-family:'Courier New',monospace;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeAttr(url)}" target="_blank" style="color:${NAVY};">${escapeHtml(url)}</a></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:22px 28px;">
            <p style="margin:0 0 6px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};font-size:12px;line-height:1.6;">🔒 For your security, this link expires in 60 minutes and can be used once. If you didn’t request it, you can safely ignore this email — no action will be taken.</p>
            <p style="margin:10px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9ca3af;font-size:11px;">Core Downtown Memphis Safety Dashboard · Memphis, TN</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = `${heading}

${intro}

${buttonLabel}: ${url}

${footnote ? footnote + '\n\n' : ''}For your security, this link expires in 60 minutes and can be used once. If you didn’t request it, ignore this email.

Core Downtown Memphis Safety Dashboard`;

  return { subject, html, text };
}

let resend: Resend | null = null;
function getResend(): Resend {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  resend = new Resend(key);
  return resend;
}

export interface SendOptions {
  /** Sent as Resend's Idempotency-Key: the same key within 24 hours is delivered once. */
  idempotencyKey?: string;
}

/** A refused send: the service's message, plus its error name and HTTP status when it gave them. */
export interface EmailError extends Error {
  code?: string;
  status?: number | null;
}

export async function sendEmail(to: string, email: BrandedEmail, opts?: SendOptions): Promise<void> {
  const from = process.env.EMAIL_FROM || 'Core Downtown Memphis Safety <onboarding@resend.dev>';
  // The sending domain has no inbox: replies go to a monitored address when one is set.
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  const { error } = await getResend().emails.send(
    {
      from,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { replyTo } : {}),
    },
    opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
  if (error) {
    if (typeof error === 'string') throw new Error(error);
    const err: EmailError = new Error(error.message || 'Email send failed');
    err.code = error.name;
    err.status = error.statusCode;
    throw err;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
