// Keeps a stray render error from blanking the whole page. Shows a quiet
// fallback with a reload, instead of an empty document.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong rendering the simulator.</h2>
          <p>{this.state.error.message}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
