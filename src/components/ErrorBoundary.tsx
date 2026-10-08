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
 * the entire app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
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
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-semibold text-ink">Something went wrong here</p>
          <p className="mt-1 break-words text-[13px] text-muted">{error.message}</p>
          <button
            onClick={this.reset}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
