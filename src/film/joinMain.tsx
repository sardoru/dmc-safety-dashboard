import { Building2 } from 'lucide-react';
import FilmPage from './FilmPage';
import { FILM_DURATION } from './filmMeta';
import { FILM } from './joinFilmData';
import { mountFilmPage } from './mount';
import { formatTime } from './time';

// /how-to-join — for Downtown businesses and stakeholders: register, join with an access code, take part (light page).
mountFilmPage(
  <FilmPage
    film={FILM}
    kicker="How to join"
    title="How to join and take part"
    lede="Register your business with only an email, or join with an access code. Then set up your storefront, get the alerts near you, report what you see, and help with the Lookout board."
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
