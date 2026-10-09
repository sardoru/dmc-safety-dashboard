import type { Role } from './auth.js';
import { getAdmin } from './supabaseAdmin.js';

/** Who is on the voice line — shapes the interviewer's script. */
export type Persona = 'business' | 'officer';

export interface CallerContext {
  persona: Persona;
  businessName?: string;
  address?: string;
  displayName?: string;
}

/** Strip anything that could read as prompt structure from a DB-sourced value. */
export function safe(value: unknown, max = 90): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\r\n\t"`{}<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Who is calling — read from the database, never from the request body. */
export async function callerContext(userId: string, role: Role): Promise<CallerContext> {
  const persona: Persona = role === 'business' ? 'business' : 'officer';
  const ctx: CallerContext = { persona };
  try {
    const admin = getAdmin();
    const [{ data: profile }, { data: business }] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      persona === 'business'
        ? admin.from('businesses').select('name, address').eq('owner_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    ctx.displayName = safe(profile?.display_name, 60) || undefined;
    if (business) {
      ctx.businessName = safe((business as { name?: string }).name) || undefined;
      ctx.address = safe((business as { address?: string }).address, 120) || undefined;
    }
  } catch {
    /* context is a nicety — the interview works without it */
  }
  return ctx;
}
