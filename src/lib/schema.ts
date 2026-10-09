import { supabase } from './supabase';

/**
 * Which parts of the 0002 migration this Supabase project has. The app keeps
 * working on the original schema (legacy columns only) and lights up the
 * richer features — priorities, structured descriptions, timeline, BOLO
 * board, photos — as soon as the migration is applied. Likewise for 0007:
 * member businesses read other members' reports from `community_reports` once
 * it exists, and from `reports` (as before) until then.
 */
export interface SchemaCaps {
  checked: boolean;
  /** reports has priority / subjects / vehicles / visibility / … */
  v2: boolean;
  /** report_updates table (incident timeline) */
  updates: boolean;
  /** bolos table */
  bolos: boolean;
  /** community_reports table (migration 0007): other members' reports without their private fields */
  community: boolean;
}

export const FULL_CAPS: SchemaCaps = { checked: true, v2: true, updates: true, bolos: true, community: true };
export const UNCHECKED_CAPS: SchemaCaps = { checked: false, v2: false, updates: false, bolos: false, community: false };

function missing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42703 undefined column · 42P01 undefined table · PGRST204/205 not in schema cache
  return (
    ['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST200'].includes(error.code ?? '') ||
    /does not exist|schema cache|could not find/i.test(error.message ?? '')
  );
}

export async function detectSchema(): Promise<SchemaCaps> {
  const [v2, updates, bolos, community] = await Promise.all([
    supabase.from('reports').select('priority, visibility').limit(1),
    supabase.from('report_updates').select('id').limit(1),
    supabase.from('bolos').select('id').limit(1),
    supabase.from('community_reports').select('id').limit(1),
  ]);
  return {
    checked: true,
    v2: !missing(v2.error),
    updates: !missing(updates.error),
    bolos: !missing(bolos.error),
    community: !missing(community.error),
  };
}

/** Migration 0007 is in place now (a read that succeeded — a network hiccup is not a yes). */
export async function hasCommunityReports(): Promise<boolean> {
  const { error } = await supabase.from('community_reports').select('id').limit(1);
  return !error;
}

/**
 * True when a write failed because the database is still on the old schema.
 * A check violation (23514) is NOT one: on the old schema the new columns are
 * missing, which fails first, so a 23514 means a bad value on the new schema.
 */
export function isSchemaError(error: { code?: string; message?: string } | null): boolean {
  return missing(error);
}
