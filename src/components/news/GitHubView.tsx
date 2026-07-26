import React, { useState, useEffect, useCallback } from "react";
import { GitFork, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { openExternal } from "../../utils/openExternal";
import { callAI, getEffectiveApiKey } from "../../utils/aiEngine";
import type { CustomizationConfig } from "../../types";
import type { GitHubRepo } from "./types";
import { NewsItemActions } from "./NewsItemActions";
import type { NewsActions } from "./newsActions";

interface GitHubViewProps {
  config: CustomizationConfig;
  actions: NewsActions;
}

export const GitHubView: React.FC<GitHubViewProps> = ({ config, actions }) => {
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubPeriod, setGithubPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");

  const [repoAiAnalyses, setRepoAiAnalyses] = useState<Record<number, string>>({});
  const [repoAiLoading, setRepoAiLoading] = useState<number | null>(null);

  const fetchGitHubTrending = useCallback(async (period: "daily" | "weekly" | "monthly") => {
    const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
    const date = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    setGithubLoading(true);
    setGithubError(null);
    try {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=created:>${date}&sort=stars&order=desc&per_page=25`,
        { headers: { Accept: "application/vnd.github.v3+json" } }
      );
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const json = await res.json();
      setGithubRepos(json.items || []);
    } catch (e: any) {
      setGithubError(e.message || "加载失败");
    } finally {
      setGithubLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGitHubTrending(githubPeriod);
  }, [githubPeriod, fetchGitHubTrending]);

  const analyzeRepo = useCallback(async (repo: GitHubRepo) => {
    if (!getEffectiveApiKey(config)) {
      setRepoAiAnalyses((prev) => ({ ...prev, [repo.id]: "【演示模式】请在设置中配置 AI API 密钥以启用智能分析。" }));
      return;
    }
    setRepoAiLoading(repo.id);
    try {
      const sysPrompt = "你是一位资深程序员。请用中文简要说明以下 GitHub 仓库的主要功能、用途和技术栈，控制在 60 字以内。";
      const usrPrompt = `仓库: ${repo.full_name}\n描述: ${repo.description || "无描述"}`;
      const result = await callAI(config, sysPrompt, usrPrompt);
      setRepoAiAnalyses((prev) => ({ ...prev, [repo.id]: result }));
    } catch {
      setRepoAiAnalyses((prev) => ({ ...prev, [repo.id]: "分析失败" }));
    } finally {
      setRepoAiLoading(null);
    }
  }, [config]);

  return (
    <div className="flex-grow flex flex-col animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-slate-300" />
          <span className="text-[13px] font-bold text-[#2D323A]">GitHub 趋势</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-white border border-[#EFEBE4] rounded-lg p-0.5 gap-0.5">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setGithubPeriod(p)}
                className={"px-2 py-1 rounded text-[9px] font-bold transition-all cursor-pointer " + (githubPeriod === p ? "bg-[#2D323A] text-white" : "text-slate-400 hover:text-slate-600")}
              >
                {p === "daily" ? "日榜" : p === "weekly" ? "周榜" : "月榜"}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchGitHubTrending(githubPeriod)}
            disabled={githubLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-600 bg-white/70 hover:bg-white border border-[#EFEBE4] transition-all cursor-pointer"
          >
            <RefreshCw className={"w-3 h-3 " + (githubLoading ? "animate-spin" : "")} />
            刷新
          </button>
        </div>
      </div>

      {githubLoading && githubRepos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-300">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-[10px] font-medium">加载中...</span>
        </div>
      ) : githubError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-300">
          <p className="text-[11px] text-slate-400">{githubError}</p>
          <button onClick={() => fetchGitHubTrending(githubPeriod)} className="text-[10px] text-[#4D7C5D] font-bold hover:underline cursor-pointer">重试</button>
        </div>
      ) : githubRepos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-300">
          <span className="text-[11px] font-medium">暂无数据</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {githubRepos.map((repo) => (
            <div
              key={repo.id}
              className="group px-3 py-3 rounded-xl hover:bg-white/60 border border-transparent hover:border-[#EFEBE4] transition-all"
            >
              <div className="flex items-start gap-3">
                <img
                  src={repo.owner.avatar_url}
                  alt=""
                  className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 cursor-pointer"
                  onClick={() => openExternal(repo.html_url)}
                />
                <div className="min-w-0 flex-grow cursor-pointer" onClick={() => openExternal(repo.html_url)}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#2D323A] group-hover:text-[#A34E36] transition-colors truncate">
                      {repo.full_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">⭐ {repo.stargazers_count.toLocaleString()}</span>
                  </div>
                  {repo.description && (
                    <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2 mt-1">{repo.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {repo.language && (
                      <span className="text-[9px] text-slate-400 font-medium">{repo.language}</span>
                    )}
                    <span className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <GitFork className="w-2.5 h-2.5" />
                      {repo.forks_count.toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); analyzeRepo(repo); }}
                  disabled={repoAiLoading === repo.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#DEEAE2] border border-[#DEEAE2] transition-all flex-shrink-0 mt-0.5 cursor-pointer"
                >
                  <Sparkles className={"w-2.5 h-2.5 " + (repoAiLoading === repo.id ? "animate-spin" : "")} />
                  {repoAiLoading === repo.id ? "分析中" : "AI 分析"}
                </button>
                <ExternalLink className="w-3 h-3 text-slate-200 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1 cursor-pointer" onClick={() => openExternal(repo.html_url)} />
               </div>
               <NewsItemActions
                 className="mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                 newsRef={{ title: repo.full_name, url: repo.html_url, description: repo.description || undefined, source: "GitHub" }}
                 actions={actions}
               />
              {repoAiAnalyses[repo.id] && (
                <div className="mt-2 ml-9 bg-[#F0F5F1] border border-[#DEEAE2] rounded-lg px-3 py-2 flex items-start gap-2">
                  <Sparkles className="w-3 h-3 text-[#4D7C5D]/50 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-600 leading-relaxed">{repoAiAnalyses[repo.id]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
