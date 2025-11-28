import { Component, type ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidMount(): void {
    // Handle global errors (including worker errors)
    window.addEventListener('error', this.handleWindowError);
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleWindowError = (event: ErrorEvent): void => {
    // Only catch errors that aren't already handled
    if (event.error) {
      logger.error('Window error:', event.error);
      // Don't show error boundary for recoverable errors
      // Uncomment the next line to catch all global errors
      // this.setState({ hasError: true, error: event.error });
    }
  };

  private handlePromiseRejection = (event: PromiseRejectionEvent): void => {
    logger.error('Unhandled promise rejection:', event.reason);
    // Don't show error boundary for promise rejections by default
    // These are usually recoverable (e.g., failed network requests)
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-6">
              The video editor encountered an unexpected error. Please reload the page to try again.
            </p>
            {this.state.error && (
              <pre className="bg-gray-800 p-4 rounded text-left text-sm text-red-400 overflow-auto mb-6">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
