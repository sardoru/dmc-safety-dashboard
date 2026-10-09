import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../index.css';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Each film page is its own small entry (how-it-works.html, how-to-report.html)
 * so link previews get real video meta tags without running the app, and each
 * page bundles only its own film's transcript.
 */
export function mountFilmPage(page: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>{page}</ErrorBoundary>
    </StrictMode>,
  );
}
