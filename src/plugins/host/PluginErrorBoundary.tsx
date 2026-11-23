import React from "react";
import { errorMessage } from "./boundaryState";

interface PluginErrorBoundaryProps {
  pluginName: string;
  onFail: (message: string) => void;
  children: React.ReactNode;
}

interface PluginErrorBoundaryState {
  message: string | null;
}

/** 只接住这一块插件视图。拦不住死循环，也拦不住插件直接 import 存储模块。 */
export class PluginErrorBoundary extends React.Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): PluginErrorBoundaryState {
    return { message: errorMessage(error) };
  }

  componentDidCatch(error: unknown): void {
    this.props.onFail(errorMessage(error));
  }

  render() {
    if (this.state.message) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          <p className="font-bold">{this.props.pluginName} 无法显示</p>
          <p className="mt-1">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
