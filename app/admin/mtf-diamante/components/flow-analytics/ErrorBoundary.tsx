'use client';

/**
 * ErrorBoundary Component
 * 
 * Catches and displays errors gracefully in analytics components.
 * 
 * Validates Requirement 20.9: Error boundaries for stability
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// =============================================================================
// ERROR BOUNDARY CLASS
// =============================================================================

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <CardTitle className="text-base text-red-900 dark:text-red-100">
                  {this.props.fallbackTitle || 'Erro ao carregar componente'}
                </CardTitle>
                <CardDescription className="text-red-700 dark:text-red-300">
                  {this.props.fallbackMessage || 'Ocorreu um erro inesperado'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {this.state.error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
                  <p className="text-xs font-mono text-red-800 dark:text-red-200">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReset}
                className="w-full"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// FUNCTIONAL ERROR BOUNDARY WRAPPER
// =============================================================================

/**
 * Functional wrapper for ErrorBoundary
 * Use this in functional components
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallbackTitle?: string,
  fallbackMessage?: string
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallbackTitle={fallbackTitle} fallbackMessage={fallbackMessage}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
