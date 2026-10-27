export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  category: "tech" | "reading" | "daily" | "custom";
}

export interface Article {
  title: string;
  link: string;
  pubDate: string;
  author?: string;
  description: string;
  content: string;
  coverImage?: string;
  feedId?: string;
  feedName?: string;
}

export interface BookmarkedArticle extends Article {
  bookmarkedAt: number;
}

export interface ReadHistoryEntry {
  title: string;
  link: string;
  feedName?: string;
  readAt: number;
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  owner: { avatar_url: string; login: string };
}

export interface TrendingItem {
  title: string;
  hot_value?: string | number;
  hot?: string | number;
  index?: number;
  rank?: number;
  url: string;
  update_time?: string;
}

export interface PlatformDef {
  key: string;
  label: string;
  color: string;
}

export const PLATFORMS: PlatformDef[] = [
  { key: "weibo", label: "微博", color: "bg-rose-50 text-rose-600 border-rose-100" },
  { key: "zhihu", label: "知乎", color: "bg-blue-50 text-blue-600 border-blue-100" },
  { key: "bilibili", label: "B站", color: "bg-sky-50 text-sky-600 border-sky-100" },
  { key: "douyin", label: "抖音", color: "bg-slate-50 text-slate-600 border-slate-100" },
  { key: "toutiao", label: "头条", color: "bg-red-50 text-red-600 border-red-100" },
  { key: "baidu", label: "百度", color: "bg-indigo-50 text-indigo-600 border-indigo-100" },

  { key: "hupu", label: "虎扑", color: "bg-amber-50 text-amber-700 border-amber-100" },
  { key: "v2ex", label: "V2EX", color: "bg-cyan-50 text-cyan-600 border-cyan-100" },
  { key: "juejin", label: "掘金", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  { key: "csdn", label: "CSDN", color: "bg-orange-50 text-orange-600 border-orange-100" },
  { key: "xiaohongshu", label: "小红书", color: "bg-pink-50 text-pink-600 border-pink-100" },
  {
    key: "producthunt",
    label: "Product Hunt",
    color: "bg-purple-50 text-purple-600 border-purple-100",
  },
];

export const DEFAULT_FEEDS: RSSFeed[] = [
  { id: "sspai", name: "少数派 · 极客利器", url: "https://sspai.com/feed", category: "tech" },
  { id: "ifanr", name: "爱范儿 · 创新产品", url: "https://www.ifanr.com/feed", category: "tech" },
  { id: "solidot", name: "Solidot · 奇客资讯", url: "https://www.solidot.org/index.rss", category: "tech" },
  {
    id: "ruanyifeng",
    name: "阮一峰的网络日志",
    url: "https://www.ruanyifeng.com/blog/atom.xml",
    category: "tech",
  },
  { id: "v2ex", name: "V2EX · 讨论热榜", url: "https://www.v2ex.com/index.xml", category: "daily" },
  { id: "hn", name: "Hacker News · 全球前沿", url: "https://hnrss.org/frontpage", category: "tech" },
];

export const FEED_CATEGORY_LABELS: Record<RSSFeed["category"], string> = {
  tech: "科技",
  reading: "阅读",
  daily: "日常",
  custom: "自定义",
};

export const FEED_CATEGORY_COLORS: Record<RSSFeed["category"], string> = {
  tech: "bg-blue-50 text-blue-600 border-blue-100",
  reading: "bg-amber-50 text-amber-700 border-amber-100",
  daily: "bg-emerald-50 text-emerald-600 border-emerald-100",
  custom: "bg-purple-50 text-purple-600 border-purple-100",
};
