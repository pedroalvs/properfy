import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-page-x text-center">
          <i className="mdi mdi-alert-octagon text-[64px] text-error" aria-hidden="true" />
          <h1 className="mt-4 text-page-title-mobile text-secondary">Something went wrong</h1>
          <p className="mt-2 text-sm text-text-secondary">
            An unexpected error occurred. Please try reloading the app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 min-h-touch rounded bg-real-estate px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
