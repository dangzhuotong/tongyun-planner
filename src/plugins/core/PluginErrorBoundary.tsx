import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  pluginName: string;
  pluginId?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PluginErrorBoundary] Error in plugin "${this.props.pluginName}":`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[280px] p-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
            插件「{this.props.pluginName}」运行异常
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4 font-mono break-all bg-slate-100 dark:bg-[#1E2026] p-2.5 rounded-lg border border-slate-200 dark:border-[#2D3039]">
            {this.state.error?.message || "未知错误"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleRetry}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重试渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
