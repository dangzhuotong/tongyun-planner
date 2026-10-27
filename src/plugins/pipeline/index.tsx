import { Bot } from "lucide-react";
import type { TongyunPlugin, PluginContext, PluginViewProps } from "../core/types";
import { PluginErrorBoundary } from "../core/PluginErrorBoundary";
import { AgentPanel } from "../../components/agents/AgentPanel";
import { fetchCompanyRoster } from "../../utils/pipeline/pipelineGateway";

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const pipelinePlugin: TongyunPlugin = {
  manifest: {
    id: "pipeline",
    name: "团队派工中枢 (Pipeline)",
    description: "连接 TiDB 派工调度库，实时展示团队工人机（mac、ibz、GEM、Cursor 等）心跳与任务分配流转。",
    version: "1.0.0",
    category: "workflow",
    icon: <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    defaultEnabled: true,
  },

  activate(_context: PluginContext) {
    // 激活时主动拉取一次公司名册
    void fetchCompanyRoster({ force: true });

    // 每 2 分钟自适应轮询一次心跳
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        void fetchCompanyRoster({ force: true });
      }, 120_000);
    }
  },

  deactivate() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  workbenchView: {
    id: "agent",
    label: "Agent",
    render: (props: PluginViewProps) => (
      <PluginErrorBoundary pluginName="团队派工中枢 (Pipeline)">
        <AgentPanel
          tasks={props.tasks}
          onAddTask={props.onAddTask}
          onEditTask={props.onEditTask || (() => {})}
          onTaskClick={props.onTaskClick || (() => {})}
          onOpenSettings={props.onOpenSettings || (() => {})}
        />
      </PluginErrorBoundary>
    ),
  },
};
