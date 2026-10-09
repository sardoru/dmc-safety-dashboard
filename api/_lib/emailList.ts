/**
 * A pasted list of email addresses — one per line, the way people copy them from a meeting's sign-in
 * sheet, a spreadsheet or an email's To: line:
 *
 *   dana@riverbluff.com
 *   Dana Whitfield <dana@riverbluff.com>
 *   "Whitfield, Dana" <dana@riverbluff.com>
 *   Riverbluff Coffee <TAB> Dana Whitfield <TAB> dana@riverbluff.com    (spreadsheet columns)
 *   dana@riverbluff.com, luis@ortegas.com;                              (stray commas and semicolons)
 *
 * Addresses are trimmed and lower-cased, and repeats are dropped (the first keeps its place). A line
 * with something on it but no usable address — or an address that can't be right — comes back in
 * `invalid` with its line number.
 *
 * Pure, with no imports: the server (/api/admin/invite-queue) and Admin → Team share it, so the count
 * an administrator confirms is the count the server queues.
 */

export interface ListEntry {
  /** Lower-cased. */
  email: string;
  /** The name written next to the address, if any ("Dana Whitfield", "Riverbluff Coffee · Dana"). */
  name: string | null;
  /** 1-based line of its first appearance. */
  line: number;
}

export interface InvalidLine {
  line: number;
  /** What was on the line (or the part of it that isn't an address), trimmed to 120 characters. */
  text: string;
}

export interface ParsedList {
  /** Unique addresses, in the order they first appear. */
  entries: ListEntry[];
  /** Repeats dropped from the paste. */
  duplicates: number;
  invalid: InvalidLine[];
}

/** One paste holds at most this many addresses… */
export const MAX_LIST_ENTRIES = 500;
/** …and this much text. */
export const MAX_LIST_CHARS = 100_000;

const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
/** Something shaped like an address; quotes, brackets, separators and `mailto:` end it. */
const TOKEN_RE = /[^\s<>"(),;:|[\]]+@[^\s<>"(),;:|[\]]+/g;
const ANGLE_RE = /<\s*(?:mailto:)?([^<>\s]*)\s*>/i;

/** A deliverable-looking address (lower-case ASCII; internationalized domains in their xn-- form). */
export function isListEmail(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  return local.length <= 64 && LOCAL_RE.test(local) && DOMAIN_RE.test(email.slice(at + 1));
}

/** Strip what surrounds an address in prose: quotes, stars, a full stop at the end of a sentence. */
function cleanToken(token: string): string {
  return token
    .replace(/^mailto:/i, '')
    .replace(/^['`*.]+/, '')
    .replace(/['`*.!?]+$/, '')
    .toLowerCase();
}

/** Spreadsheet columns become "A · B"; quotes, brackets and stray punctuation go. Never an address. */
function cleanName(text: string): string | null {
  const name = text
    .replace(/mailto:/gi, ' ')
    .split('\t')
    .map((part) =>
      part
        .replace(/[<>"`]/g, ' ')
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,;:|·'-]+|[\s,;:|·'-]+$/g, ''),
    )
    .filter(Boolean)
    .join(' · ')
    .slice(0, 120)
    .trim();
  return name && !name.includes('@') ? name : null;
}

/** Split a line at commas and semicolons that aren't inside "quotes" or <brackets>. */
function segments(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let angled = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '<' && !quoted) angled = true;
    else if (ch === '>' && !quoted) angled = false;
    if ((ch === ',' || ch === ';') && !quoted && !angled) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const shorten = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120);

type Piece = { kind: 'entry'; email: string; name: string | null } | { kind: 'bad'; text: string };

/** One segment: an address with an optional name, several addresses, or nothing that's an address. */
function readSegment(text: string): Piece[] | null {
  const angle = text.match(ANGLE_RE);
  if (angle) {
    const email = cleanToken(angle[1]);
    if (!isListEmail(email)) return [{ kind: 'bad', text: shorten(text) }];
    return [{ kind: 'entry', email, name: cleanName(text.replace(angle[0], ' ')) }];
  }
  const tokens = text.match(TOKEN_RE) ?? [];
  if (!tokens.length) return text.includes('@') ? [{ kind: 'bad', text: shorten(text) }] : null;
  let rest = text;
  for (const t of tokens) rest = rest.replace(t, '\t');
  const name = cleanName(rest);
  return tokens.map((t) => {
    const email = cleanToken(t);
    return isListEmail(email) ? { kind: 'entry', email, name } : { kind: 'bad', text: shorten(t) };
  });
}

export function parseEmailList(input: string): ParsedList {
  const entries: ListEntry[] = [];
  const seen = new Map<string, ListEntry>();
  const invalid: InvalidLine[] = [];
  let duplicates = 0;

  const add = (email: string, name: string | null, line: number) => {
    const first = seen.get(email);
    if (first) {
      duplicates++;
      if (!first.name && name) first.name = name;
      return;
    }
    const entry = { email, name, line };
    seen.set(email, entry);
    entries.push(entry);
  };

  input.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1;
    if (/^[\s,;]*$/.test(raw)) return;
    const found: { email: string; name: string | null }[] = [];
    let bad = false;
    // Text without an address is the start of a name ("Whitfield, Dana <dana@…>", "Dana Whitfield, dana@…").
    let pendingName = '';
    for (const seg of segments(raw)) {
      if (!seg.trim()) continue;
      const pieces = readSegment(pendingName ? `${pendingName}, ${seg}` : seg);
      if (!pieces) {
        pendingName = pendingName ? `${pendingName}, ${seg.trim()}` : seg.trim();
        continue;
      }
      pendingName = '';
      for (const p of pieces) {
        if (p.kind === 'bad') {
          invalid.push({ line, text: p.text });
          bad = true;
        } else {
          found.push({ email: p.email, name: p.name });
        }
      }
    }
    // A name after the address ("dana@…, Dana Whitfield") belongs to it.
    if (pendingName && found.length) {
      const last = found[found.length - 1];
      last.name = last.name ?? cleanName(pendingName);
    }
    if (!found.length && !bad) invalid.push({ line, text: shorten(raw) });
    for (const f of found) add(f.email, f.name, line);
  });

  return { entries, duplicates, invalid };
}
