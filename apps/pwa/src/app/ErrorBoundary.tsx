import { Component, type ErrorInfo, type ReactNode } from 'react';
import { OctagonAlert } from 'lucide-react';

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
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-page-x text-center">
          <OctagonAlert size={64} className="text-destructive" aria-hidden="true" />
          <h1 className="mt-4 text-page-title-mobile text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error occurred. Please try reloading the app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 min-h-touch rounded bg-primary px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
