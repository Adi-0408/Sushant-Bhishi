import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    try {
      sessionStorage.clear();
      // Keep primary credentials if possible, or clear session to allow clean reload
      localStorage.removeItem('sb_active_session');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center p-4 font-marathi">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-red-100 text-center space-y-5">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                काहीतरी तांत्रिक त्रुटी आली आहे
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                (A technical error occurred while loading this page)
              </p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl text-left font-mono break-all line-clamp-3">
                {this.state.error?.message || 'अज्ञात त्रुटी'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 min-h-[44px] px-4 py-3 bg-[#0B5C45] hover:bg-[#0F7A5C] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>पुन्हा लोड करा (Reload)</span>
              </button>

              <button
                onClick={this.handleResetAndReload}
                className="flex-1 min-h-[44px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>सुरूवातीला जा (Home)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
