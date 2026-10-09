/**
 * Writes the invitation emails — each role, each way in, new and existing
 * accounts — to a folder as HTML and plain text, plus an index.html linking
 * them, so copy and layout changes can be checked in a browser without
 * sending anything.
 *
 *   npx tsx scripts/email-previews.ts [out-dir]     (default: /tmp/dmc-invite-emails/html)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { invitationEmail, type InvitationOptions } from '../api/_lib/invitations.ts';

const out = resolve(process.argv[2] ?? '/tmp/dmc-invite-emails/html');
mkdirSync(out, { recursive: true });

const SITE = 'https://www.901safety.com';
const invite = `${SITE}/auth/callback?token_hash=preview-new-account&type=invite`;
const signIn = `${SITE}/auth/callback?token_hash=preview-existing-account&type=magiclink`;
const admin = 'Sgt. R. Delgado';

type Preview = Omit<InvitationOptions, 'url'>;
const previews: Record<string, Preview> = {
  'admin-business-new': { role: 'business', source: 'admin', account: 'new', email: 'nia@gayosogrocer.com', inviterName: admin },
  'admin-business-existing': { role: 'business', source: 'admin', account: 'existing', email: 'owner@riverbluffcoffee.com', inviterName: admin },
  'admin-officer-new': { role: 'officer', source: 'admin', account: 'new', email: 'k.morris@downtownsafety.org', inviterName: admin },
  'admin-officer-raised': { role: 'officer', source: 'admin', account: 'raised', email: 'a.nguyen@downtownsafety.org', inviterName: admin },
  'admin-officer-existing': { role: 'officer', source: 'admin', account: 'existing', email: 'k.morris@downtownsafety.org', inviterName: null },
  'admin-admin-new': { role: 'admin', source: 'admin', account: 'new', email: 'director@downtownmemphis.com', inviterName: admin },
  'admin-admin-raised': { role: 'admin', source: 'admin', account: 'raised', email: 'officer.hayes@downtownsafety.org', inviterName: admin },
  'code-business-new': { role: 'business', source: 'code', account: 'new', email: 'manager@southmainbooks.com', code: 'K7QM-2XRT' },
  'code-business-existing': { role: 'business', source: 'code', account: 'existing', email: 'owner@riverbluffcoffee.com', code: 'K7QM-2XRT' },
  'code-officer-new': { role: 'officer', source: 'code', account: 'new', email: 'j.price@downtownsafety.org', code: 'DT-TEAM-1' },
  'code-officer-raised': { role: 'officer', source: 'code', account: 'raised', email: 'owner@riverbluffcoffee.com', code: 'DT-TEAM-1' },
  'request-business-new': { role: 'business', source: 'request', account: 'new', email: 'nia@gayosogrocer.com', inviterName: admin },
  'request-business-existing': { role: 'business', source: 'request', account: 'existing', email: 'owner@riverbluffcoffee.com', inviterName: null },
  'request-officer-new': { role: 'officer', source: 'request', account: 'new', email: 'j.price@downtownsafety.org', inviterName: admin },
  'request-officer-raised': { role: 'officer', source: 'request', account: 'raised', email: 'owner@riverbluffcoffee.com', inviterName: admin },
};

const rows: string[] = [];
for (const [name, p] of Object.entries(previews)) {
  const email = invitationEmail({ ...p, url: p.account === 'new' ? invite : signIn, site: SITE });
  writeFileSync(join(out, `${name}.html`), email.html);
  writeFileSync(join(out, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
  rows.push(`<li><a href="${name}.html">${name}</a> · <a href="${name}.txt">text</a> — ${email.subject.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`);
  console.log(`${name.padEnd(28)} ${String(Buffer.byteLength(email.html)).padStart(6)} B  ${email.subject}`);
}
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Invitation email previews</title><body style="font:15px/1.6 system-ui;margin:32px"><h1>Invitation email previews</h1><ul>${rows.join('')}</ul></body>`,
);
console.log(`\n→ ${join(out, 'index.html')}`);
