/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary for the Alert Manager application.
 * Catches unhandled React rendering errors and shows a recovery UI
 * instead of a blank screen.
 */
export class AlertManagerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console -- in production this could be sent to an error tracking service
    console.error('[AlertManager] Unhandled React error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Uses plain HTML intentionally - OUI components could cause infinite re-renders if OUI itself is the error source
      const rawMessage = this.state.error?.message || this.state.error?.toString() || null;
      const truncatedMessage = rawMessage
        ? rawMessage.slice(0, 200) + (rawMessage.length > 200 ? '...' : '')
        : null;
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: 'inherit', marginTop: 8 }}>
            The Alert Manager encountered an unexpected error.
          </p>
          {truncatedMessage && (
            <pre
              style={{
                textAlign: 'left',
                background: 'rgba(0,0,0,0.05)',
                padding: 16,
                borderRadius: 4,
                marginTop: 16,
                overflow: 'auto',
                maxHeight: 200,
                fontSize: 12,
              }}
            >
              {truncatedMessage}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
