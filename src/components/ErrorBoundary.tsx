import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rendered instead of the children when they throw. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional label to identify which boundary fired in logs. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in a subtree so a single failing component
 * (e.g. the Leaflet map) shows a localized fallback instead of white-screening
 * the entire app. React has no built-in equivalent — without a boundary an
 * uncaught error unmounts the whole tree.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the real message + component stack (otherwise React 19 routes
    // uncaught errors to window.onerror where console tooling can miss them).
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`,
      error?.message,
      error?.stack,
      info?.componentStack,
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return this.props.fallback?.(error, this.reset) ?? <DefaultFallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="font-semibold text-navy-600 dark:text-gold-400">Something went wrong here</p>
        <p className="mt-1 fluid-text-sm text-neutral-500 break-words">{error.message}</p>
        <button
          onClick={reset}
          className="mt-3 px-4 py-2 rounded-xl bg-navy-600 text-white fluid-text-sm hover:bg-navy-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
