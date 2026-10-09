import { Building2 } from 'lucide-react';
import FilmPage from './FilmPage';
import { FILM } from './filmData';
import { REPORT_FILM_DURATION } from './filmMeta';
import { mountFilmPage } from './mount';
import { formatTime } from './time';

// /how-it-works — the full tour of the dashboard and the Operations Center.
mountFilmPage(
  <FilmPage
    film={FILM}
    kicker="How it works"
    title="How the Safety Dashboard works"
    lede="A self-regulated safety dashboard for Downtown Memphis: how a business reports what it sees, how the Downtown public-safety team responds, and how the whole block stays in the loop."
    other={
      REPORT_FILM_DURATION > 0
        ? { href: '/how-to-report', label: `The short version: how to report an incident · ${formatTime(REPORT_FILM_DURATION)}` }
        : undefined
    }
    cta={{
      title: 'Downtown business? Join the network.',
      body: 'Sign up with just your email — no passwords — and set up your storefront in a minute.',
      href: '/login',
      label: 'Register your business',
      icon: <Building2 className="h-5 w-5" />,
    }}
  />,
);
