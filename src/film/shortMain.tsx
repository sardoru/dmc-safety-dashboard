import { Building2 } from 'lucide-react';
import FilmPage from './FilmPage';
import { FILM_DURATION } from './filmMeta';
import { FILM } from './shortFilmData';
import { mountFilmPage } from './mount';
import { formatTime } from './time';

// /in-30-seconds — the three films in one 30-second cut: report, respond, nearby alerts, the live map, join (light page).
mountFilmPage(
  <FilmPage
    film={FILM}
    kicker="In 30 seconds"
    title="The Safety Dashboard in 30 seconds"
    lede="See something downtown? Report it by voice, with the guided form, or with a quick alert. Officers respond, and you get updates. Nearby businesses get an alert, and everyone can follow the public live map."
    other={
      FILM_DURATION > 0
        ? { href: '/how-it-works', label: `The full tour: how the Safety Dashboard works · ${formatTime(FILM_DURATION)}` }
        : undefined
    }
    cta={{
      title: 'Downtown business?',
      body: 'Register with only your work email. No password. Have an access code? Join with your code at 901safety.com/join.',
      href: '/login',
      label: 'Register your business',
      icon: <Building2 className="h-5 w-5" />,
    }}
  />,
);
