import { SquarePen } from 'lucide-react';
import FilmPage from './FilmPage';
import { FILM_DURATION } from './filmMeta';
import { mountFilmPage } from './mount';
import { FILM } from './reportFilmData';
import { formatTime } from './time';

// /how-to-report — the short how-to: report an incident, follow it, and how officers respond (light page).
mountFilmPage(
  <FilmPage
    film={FILM}
    kicker="How to report"
    title="How to report an incident"
    lede="Report what you see — by voice, with the guided form, or with a quick alert — then follow its status. Officers: see how to respond to a report in the Operations Center."
    other={
      FILM_DURATION > 0
        ? { href: '/how-it-works', label: `The full tour: how the Safety Dashboard works · ${formatTime(FILM_DURATION)}` }
        : undefined
    }
    cta={{
      title: 'Seen something downtown?',
      body: 'Members report it in a minute — by voice, with the guided form, or with a quick alert. In danger? Call 911 first.',
      href: '/report',
      label: 'Make a report',
      icon: <SquarePen className="h-5 w-5" />,
    }}
  />,
);
