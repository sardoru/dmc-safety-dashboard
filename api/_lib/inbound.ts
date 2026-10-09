import { escapeHtml } from './emails.js';

/**
 * Replies to the dashboard's emails, relayed without showing the team's inbox.
 *
 * Everything the dashboard sends comes from EMAIL_FROM (safety@901safety.com),
 * a domain with no mailbox. Resend receives mail for it and calls
 * /api/inbound-email for each message:
 *
 *  - Someone replies to an email → it is forwarded to INBOUND_FORWARD_TO, from
 *    EMAIL_FROM, with its reply-to set to reply+<received email id>@<domain>.
 *  - The team answers that forward → the answer goes back to the original
 *    sender, again from EMAIL_FROM. The team's own address never appears.
 *
 * Only a sender listed in INBOUND_FORWARD_TO can use a reply+ address, and only
 * to answer the person who wrote that message. Mail from the sending domain
 * itself and automatic replies are dropped, so nothing loops.
 */

export interface InboundEvent {
  type: string;
  data?: { email_id?: string; from?: string; to?: string[]; cc?: string[] | null; subject?: string };
}

interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  subject: string;
  created_at: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  message_id: string;
}

interface AttachmentData {
  filename?: string;
  size: number;
  content_type: string;
  content_id?: string;
  download_url: string;
}

export type InboundOutcome =
  | { status: 'forwarded'; to: number }
  | { status: 'relayed' }
  | { status: 'ignored'; reason: string };

const API = 'https://api.resend.com';
/** Resend accepts up to 40 MB per email; stay well under it. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** "Name <a@b.c>" → "a@b.c" (lower-cased). */
export function addressOf(value: string | undefined | null): string {
  const s = String(value ?? '').trim();
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

function domainOf(address: string): string {
  return address.split('@')[1] ?? '';
}

function forwardTargets(): string[] {
  return (process.env.INBOUND_FORWARD_TO ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
}

async function resend(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${init.method ?? 'GET'} ${path.split('?')[0]} → ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : {};
}

const getEmail = (id: string) => resend(`/emails/receiving/${encodeURIComponent(id)}`) as Promise<ReceivedEmail>;

async function attachmentsOf(id: string): Promise<{ attachments: object[]; skipped: number }> {
  const list = (await resend(`/emails/receiving/${encodeURIComponent(id)}/attachments`)) as { data?: AttachmentData[] };
  const attachments: object[] = [];
  let total = 0;
  let skipped = 0;
  for (const a of list.data ?? []) {
    if (total + a.size > MAX_ATTACHMENT_BYTES) {
      skipped += 1;
      continue;
    }
    const file = await fetch(a.download_url);
    if (!file.ok) {
      skipped += 1;
      continue;
    }
    total += a.size;
    attachments.push({
      filename: a.filename || 'attachment',
      content: Buffer.from(await file.arrayBuffer()).toString('base64'),
      content_type: a.content_type,
      ...(a.content_id ? { content_id: a.content_id } : {}),
    });
  }
  return { attachments, skipped };
}

/** Automatic replies (out of office, bounces) must not be forwarded or relayed. */
function isAutomatic(email: ReceivedEmail): boolean {
  const h = Object.fromEntries(Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true;
  if (h['x-autoreply'] || h['x-autorespond']) return true;
  return /^(bulk|junk|auto_reply|list)$/.test(h['precedence'] ?? '');
}

const cleanSubject = (s: string) => (s || '(no subject)').replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim() || '(no subject)';

export async function handleInbound(evt: InboundEvent): Promise<InboundOutcome> {
  if (evt.type !== 'email.received') return { status: 'ignored', reason: `event ${evt.type}` };
  const emailId = evt.data?.email_id;
  if (!emailId) return { status: 'ignored', reason: 'no email id' };
  const targets = forwardTargets();
  if (!targets.length) return { status: 'ignored', reason: 'INBOUND_FORWARD_TO is not set' };

  const ourFrom = process.env.EMAIL_FROM || '';
  const ourAddress = addressOf(ourFrom);
  const ourDomain = domainOf(ourAddress);
  if (!ourDomain) return { status: 'ignored', reason: 'EMAIL_FROM is not set' };

  const sender = addressOf(evt.data?.from);
  if (!sender || domainOf(sender) === ourDomain) return { status: 'ignored', reason: 'from the sending domain' };
  const recipients = [...(evt.data?.to ?? []), ...(evt.data?.cc ?? [])].map(addressOf);
  const relay = recipients
    .map((r) => r.match(new RegExp(`^reply\\+([0-9a-f-]{8,64})@${ourDomain.replace(/\./g, '\\.')}$`)))
    .find(Boolean);

  const email = await getEmail(emailId);
  if (isAutomatic(email)) return { status: 'ignored', reason: 'automatic reply' };

  // ---- the team answers a forwarded message → back to the original sender, as EMAIL_FROM
  if (targets.includes(sender)) {
    if (!relay) return { status: 'ignored', reason: 'team mail without a thread' };
    const original = await getEmail(relay[1]);
    const to = addressOf(original.from);
    if (!to || domainOf(to) === ourDomain || targets.includes(to)) return { status: 'ignored', reason: 'no outside sender to answer' };
    const { attachments } = await attachmentsOf(emailId);
    // Mail apps quote the forward they answer, and some (Outlook) quote its "To:" line — the team's own
    // address. Swap every team address for the sending address before it leaves.
    const mask = (s: string) => targets.reduce((acc, t) => acc.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ourAddress), s);
    await resend('/emails', {
      method: 'POST',
      body: JSON.stringify({
        from: ourFrom,
        to: [to],
        subject: `Re: ${cleanSubject(original.subject)}`,
        ...(email.text ? { text: mask(email.text) } : {}),
        ...(email.html ? { html: mask(email.html) } : {}),
        ...(attachments.length ? { attachments } : {}),
        ...(original.message_id ? { headers: { 'In-Reply-To': original.message_id, References: original.message_id } } : {}),
      }),
    });
    return { status: 'relayed' };
  }

  // ---- someone writes to the dashboard → forward to the team, with a reply+ address to answer through
  const { attachments, skipped } = await attachmentsOf(emailId);
  const when = new Date(email.created_at || Date.now()).toUTCString();
  const head = [
    `From: ${email.from}`,
    `To: ${(email.to ?? []).join(', ')}`,
    `Date: ${when}`,
    `Subject: ${email.subject || '(no subject)'}`,
  ];
  const note = `Reply to this message to answer ${sender}. Your answer goes out from ${ourAddress}; your own address stays hidden.`;
  const skippedNote = skipped ? `${skipped} attachment${skipped === 1 ? '' : 's'} too large to forward — open the message in Resend.` : '';
  const text = [note, skippedNote, '', ...head, '', email.text ?? '(no text)'].filter((l, i) => l || i > 1).join('\n');
  const html = `<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328"><p style="margin:0 0 8px;padding:10px 12px;border-radius:8px;background:#f4f3ee">${escapeHtml(note)}${skippedNote ? `<br>${escapeHtml(skippedNote)}` : ''}</p><p style="margin:0 0 12px;color:#5f6368;font-size:13px">${head.map(escapeHtml).join('<br>')}</p></div><hr style="border:0;border-top:1px solid #d9d6cc;margin:12px 0">${email.html ?? `<pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">${escapeHtml(email.text ?? '(no text)')}</pre>`}`;
  await resend('/emails', {
    method: 'POST',
    body: JSON.stringify({
      from: ourFrom,
      to: targets,
      reply_to: `reply+${emailId}@${ourDomain}`,
      subject: `Reply: ${cleanSubject(email.subject)}`,
      text,
      html,
      ...(attachments.length ? { attachments } : {}),
    }),
  });
  return { status: 'forwarded', to: targets.length };
}
