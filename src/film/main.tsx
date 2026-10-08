import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../index.css';
import ErrorBoundary from '../components/ErrorBoundary';
import FilmPage from './FilmPage';

// The film page is its own small entry (how-it-works.html) so link previews
// get real video meta tags without running the app.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <FilmPage />
    </ErrorBoundary>
  </StrictMode>,
);
