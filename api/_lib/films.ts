/**
 * The three how-to films, as linked from emails. One list, so a re-cut film
 * only needs its length and chapter starts updated here (the API harness
 * checks them against the film pages' generated data).
 *
 * Chapter links are `?t=<seconds>`: the film page starts there.
 */

/** The public site the films live on. */
export const FILM_SITE = 'https://www.901safety.com';

/**
 * "How to join and take part" is still being produced; it goes live with its
 * own release. Update its running time here once it's cut.
 */
export const HOW_TO_JOIN_LENGTH = 'about 3 min';

export interface FilmChapter {
  title: string;
  /** Whole seconds from the start of the film. */
  start: number;
}

export interface Film {
  title: string;
  url: string;
  /** Running time as shown next to the title ("5:53"). */
  length: string;
  /** One line on what the film covers. */
  summary: string;
  /** A still from the film. Emails show it small, so it goes through the image resizer. */
  poster?: { src: string; alt: string };
  chapters: Record<string, FilmChapter>;
}

/** The same image, resized by Vercel's image optimizer (widths from vercel.json → images.sizes). */
function thumb(path: string, width = 384): string {
  return `${FILM_SITE}/_vercel/image?url=${encodeURIComponent(path)}&w=${width}&q=75`;
}

export const FILMS = {
  howItWorks: {
    title: 'How the Safety Dashboard works',
    url: `${FILM_SITE}/how-it-works`,
    length: '5:53',
    summary:
      'The full tour: signing in, the business home page, three ways to report, the Ops Center, spoken alerts, the Lookout board and Insights.',
    poster: {
      src: thumb('/video/poster.jpg'),
      alt: 'Watch “How the Safety Dashboard works”',
    },
    chapters: {
      intro: { title: 'A self-regulated safety dashboard', start: 0 },
      signIn: { title: 'Sign in without a password', start: 32 },
      businessHome: { title: 'The business home page', start: 55 },
      reportByVoice: { title: 'Report by voice', start: 77 },
      guidedForm: { title: 'The guided form', start: 101 },
      quickAlert: { title: 'Quick alert, review and send', start: 129 },
      opsCenter: { title: 'The Ops Center', start: 161 },
      districtMap: { title: 'The district map', start: 186 },
      triage: { title: 'Triage a report', start: 208 },
      spokenAlerts: { title: 'Spoken alerts and shift briefings', start: 235 },
      lookout: { title: 'The Lookout board', start: 263 },
      insights: { title: 'Insights', start: 287 },
      team: { title: 'Manage the team', start: 305 },
      oneDay: { title: 'One day downtown', start: 324 },
    },
  },
  howToReport: {
    title: 'How to report an incident',
    url: `${FILM_SITE}/how-to-report`,
    length: '3:08',
    summary:
      'Report by voice, with the guided form or with a quick alert, then follow the status — and how officers respond.',
    poster: {
      src: thumb('/video/how-to-report/poster.jpg'),
      alt: 'Watch “How to report an incident”',
    },
    chapters: {
      before: { title: 'Before you report', start: 0 },
      reportByVoice: { title: 'Report by voice', start: 21 },
      guidedForm: { title: 'The guided form', start: 60 },
      quickAlert: { title: 'Quick alert', start: 93 },
      followStatus: { title: 'Review, send, and follow the status', start: 106 },
      officersRespond: { title: 'Officers: respond to a report', start: 135 },
      scanToReport: { title: 'Scan to report', start: 174 },
    },
  },
  howToJoin: {
    title: 'How to join and take part',
    url: `${FILM_SITE}/how-to-join`,
    length: HOW_TO_JOIN_LENGTH,
    summary:
      'Join with your email or an access code, set up your storefront, and take part: nearby alerts, the Lookout board and the public live map.',
    chapters: {},
  },
} satisfies Record<string, Film>;

export type FilmId = keyof typeof FILMS;

/** A link that opens the film at a chapter. */
export function chapterUrl(film: Film, chapter: FilmChapter): string {
  return chapter.start > 0 ? `${film.url}?t=${chapter.start}` : film.url;
}

/** 161 → "2:41" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
