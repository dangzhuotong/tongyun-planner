import type { Article } from "./types";

const TAG_RE = /<[^>]*>/g;

/**
 * 实体字符解码
 */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * 清除所有 HTML 标签并保留纯净摘要文本
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const cleaned = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(TAG_RE, " ");
  return decodeEntities(cleaned).replace(/\s+/g, " ").trim();
}

/**
 * 安全日期格式化：彻底杜绝 RangeError: Invalid time value 拖垮整个订阅源的问题
 */
export function safeFormatDate(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "";
  const s = raw.trim();
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch {
    // 降级为正则提取
  }

  // 尝试正则抽取 YYYY-MM-DD
  const match = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 实在解析不出，截取前 16 位字符避免显示过长
  return s.slice(0, 16);
}

/**
 * 命名空间兼容的内容提取器：支持 content:encoded, dc:creator 等带前缀的标签
 */
function extractTagContent(parent: Element, candidates: string[]): string {
  for (const name of candidates) {
    const colonIdx = name.indexOf(":");
    const localName = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;

    // 1. 尝试 getElementsByTagNameNS 通配命名空间
    if (parent.getElementsByTagNameNS) {
      try {
        const nsNodes = parent.getElementsByTagNameNS("*", localName);
        if (nsNodes && nsNodes.length > 0 && nsNodes[0].textContent) {
          const val = nsNodes[0].textContent.trim();
          if (val) return val;
        }
      } catch {
        // ignore
      }
    }

    // 2. 尝试标准 getElementsByTagName
    try {
      const nodes = parent.getElementsByTagName(name);
      if (nodes && nodes.length > 0 && nodes[0].textContent) {
        const val = nodes[0].textContent.trim();
        if (val) return val;
      }
    } catch {
      // ignore
    }

    // 3. 尝试 querySelector（处理转义冒号）
    try {
      const escaped = name.replace(":", "\\:");
      const el = parent.querySelector(escaped);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch {
      // ignore
    }
  }
  return "";
}

/**
 * 提取文章封面头图
 */
function extractCoverImage(item: Element, htmlContent: string): string | undefined {
  // 1. media:content 或 media:thumbnail
  const mediaUrl =
    item.querySelector("media\\:content")?.getAttribute("url") ||
    item.querySelector("media\\:thumbnail")?.getAttribute("url");
  if (mediaUrl) return mediaUrl;

  // 2. enclosure type=image
  const enclosure = item.querySelector("enclosure[type^='image']");
  if (enclosure?.getAttribute("url")) return enclosure.getAttribute("url")!;

  // 3. 从 HTML 内容中正则寻找第一个 <img>
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    const url = imgMatch[1];
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
  }

  return undefined;
}

/**
 * 轻量安全 HTML 清洗，保留段落、换行、链接、图片、引用与加粗，剔除脚本与事件注入
 * 增强支持：懒加载属性修复 (data-src / data-original)、跨域防盗链 (referrerpolicy="no-referrer") 与相对路径补全
 */
export function sanitizeArticleHtml(html: string, baseUrl?: string): string {
  if (!html || !html.trim()) return "";
  let clean = html.trim();

  // 若内容为纯文本（不包含 HTML 常见标签），将连续换行转换为 <p> 段落
  if (!/<[a-z][\s\S]*>/i.test(clean)) {
    return clean
      .split(/\n{2,}/)
      .map((p) => `<p>${decodeEntities(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");
  }

  // 移除 script, style, iframe, form, button, svg 等不安全标签
  clean = clean
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

  // 规范化并修复图片标签：兼容懒加载 (data-src, data-original)、跨域防盗链 (referrerpolicy) 与相对路径
  clean = clean.replace(/<img\s+([^>]*?)>/gi, (_match, attrs) => {
    const getAttr = (name: string) => {
      const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
      return m ? m[1] : null;
    };

    let src = getAttr("src");
    const dataSrc =
      getAttr("data-src") ||
      getAttr("data-original") ||
      getAttr("data-actualsrc") ||
      getAttr("_src");

    // 若 src 为空、或者只是占位 1x1 透明 gif，则优先使用真实数据源
    if (
      (!src ||
        src.startsWith("data:image/gif") ||
        src.startsWith("data:image/svg") ||
        src.trim().length === 0) &&
      dataSrc
    ) {
      src = dataSrc;
    }

    if (!src) {
      return "";
    }

    // 相对路径解析为绝对 URL
    if (
      baseUrl &&
      !src.startsWith("http://") &&
      !src.startsWith("https://") &&
      !src.startsWith("data:")
    ) {
      try {
        src = new URL(src, baseUrl).href;
      } catch {
        // ignore
      }
    }

    const restAttrs = attrs
      .replace(/\s*\bsrc=["'][^"']*["']/gi, "")
      .replace(/\s*\breferrerpolicy=["'][^"']*["']/gi, "")
      .replace(/\s*\bloading=["'][^"']*["']/gi, "")
      .trim();

    return `<img src="${src}"${restAttrs ? " " + restAttrs : ""}>`;
  });

  // 规范化外部链接
  clean = clean.replace(/<a\s+([^>]*?)>/gi, (_match, attrs) => {
    let resolvedAttrs = attrs;
    if (baseUrl) {
      const hrefMatch = attrs.match(/\bhref=["']([^"']*)["']/i);
      if (
        hrefMatch &&
        hrefMatch[1] &&
        !hrefMatch[1].startsWith("http://") &&
        !hrefMatch[1].startsWith("https://") &&
        !hrefMatch[1].startsWith("#") &&
        !hrefMatch[1].startsWith("mailto:")
      ) {
        try {
          const abs = new URL(hrefMatch[1], baseUrl).href;
          resolvedAttrs = resolvedAttrs.replace(
            /\bhref=["'][^"']*["']/i,
            `href="${abs}"`,
          );
        } catch {
          // ignore
        }
      }
    }
    if (!resolvedAttrs.includes("target=")) {
      return `<a ${resolvedAttrs} target="_blank" rel="noopener noreferrer">`;
    }
    return `<a ${resolvedAttrs}>`;
  });

  return clean;
}

/**
 * 核心解析函数：支持 RSS 2.0、Atom 1.0、双层 XML/HTML 容错、命名空间深度抽取与头图识别
 */
export function parseRSSXML(xmlText: string): Article[] {
  if (!xmlText || !xmlText.trim()) return [];

  // 清理 UTF-8 BOM 与异常控制字符
  const sanitizedXml = xmlText.replace(/^\uFEFF/, "").trim();

  const getParser = () => (typeof DOMParser !== "undefined" ? new DOMParser() : null);
  const parser = getParser();
  if (!parser) return [];

  try {
    // 第一层：尝试严格 text/xml 解析
    let doc: Document = parser.parseFromString(sanitizedXml, "text/xml");
    const hasParserError = doc.querySelector("parsererror") !== null;

    // 第二层：若遇到语法错误或找不到节点，宽容降级为 text/html（HTML 解析器对未转义 &、CDATA 等极具容错性）
    const hasItems = doc.querySelectorAll("item, entry").length > 0;
    if (hasParserError || !hasItems) {
      doc = parser.parseFromString(sanitizedXml, "text/html");
    }

    // 1. 尝试 RSS 2.0 <item>
    const items = doc.querySelectorAll("item");
    if (items && items.length > 0) {
      return Array.from(items)
        .slice(0, 50)
        .map((item) => {
          const title = extractTagContent(item, ["title"]) || "无题";

          // 提取链接（优先 link 文本，其次 guid，其次 link[href]）
          let link = extractTagContent(item, ["link"]);
          if (!link) {
            const linkEl = item.querySelector("link");
            link = linkEl?.getAttribute("href") || "";
          }
          if (!link) {
            const guid = item.querySelector("guid");
            if (guid?.textContent?.startsWith("http")) {
              link = guid.textContent.trim();
            }
          }

          const pubDateRaw = extractTagContent(item, ["pubDate", "dc:date", "date"]);
          const author = extractTagContent(item, [
            "author",
            "dc:creator",
            "creator",
            "managingEditor",
          ]);

          // 正文提取：优先 content:encoded，其次 description
          const rawContent =
            extractTagContent(item, ["content:encoded", "encoded", "body", "description"]) || "";

          const rawDesc = extractTagContent(item, ["description", "summary"]) || rawContent;
          const cleanDesc = stripHtml(rawDesc);
          const description = cleanDesc.slice(0, 220) + (cleanDesc.length > 220 ? "..." : "");

          const coverImage = extractCoverImage(item, rawContent);

          return {
            title: decodeEntities(stripHtml(title)),
            link: link.trim(),
            pubDate: safeFormatDate(pubDateRaw),
            author: decodeEntities(stripHtml(author)),
            description,
            content: rawContent,
            coverImage,
          };
        });
    }

    // 2. 尝试 Atom 1.0 <entry>
    const entries = doc.querySelectorAll("entry");
    if (entries && entries.length > 0) {
      return Array.from(entries)
        .slice(0, 50)
        .map((entry) => {
          const title = extractTagContent(entry, ["title"]) || "无题";

          // Atom 链接优先取 rel="alternate"
          let link = "";
          const alternateLink = entry.querySelector("link[rel='alternate']");
          if (alternateLink) {
            link = alternateLink.getAttribute("href") || alternateLink.textContent || "";
          }
          if (!link) {
            const firstLink = entry.querySelector("link");
            link = firstLink?.getAttribute("href") || firstLink?.textContent || "";
          }

          const pubDateRaw = extractTagContent(entry, ["published", "updated", "date"]);
          const author = extractTagContent(entry, ["author name", "name", "author"]);

          const rawContent =
            extractTagContent(entry, ["content", "summary", "description"]) || "";
          const rawSummary = extractTagContent(entry, ["summary", "content"]) || rawContent;
          const cleanDesc = stripHtml(rawSummary);
          const description = cleanDesc.slice(0, 220) + (cleanDesc.length > 220 ? "..." : "");

          const coverImage = extractCoverImage(entry, rawContent);

          return {
            title: decodeEntities(stripHtml(title)),
            link: link.trim(),
            pubDate: safeFormatDate(pubDateRaw),
            author: decodeEntities(stripHtml(author)),
            description,
            content: rawContent,
            coverImage,
          };
        });
    }

    return [];
  } catch (e) {
    console.error("RSS parsing error", e);
    return [];
  }
}

/**
 * 判断文章是否仅为导读/简报（未提供完整正文）
 * 典型特征：字数少于 320 字，或包含「查看全文」「阅读全文」且字数较短
 */
export function isTeaserArticle(article: { content?: string; description?: string }): boolean {
  const content = (article.content || "").trim();
  const desc = (article.description || "").trim();
  const plain = stripHtml(content || desc);

  if (!plain) return true;
  if (plain.length < 320) return true;
  if (
    /(?:查看全文|阅读全文|继续阅读|Read\s+more|read\s+full)/i.test(plain) &&
    plain.length < 800
  ) {
    return true;
  }
  return false;
}

/**
 * 从网页 HTML 中提取核心正文并清洗格式
 */
export function extractArticleFromHtml(html: string, baseUrl?: string): string {
  if (!html || !html.trim()) return "";

  // 1. DOMParser 解析（优先在浏览器环境与 Tauri WebView 中使用）
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // 移除噪音元素（脚本、样式、导航、页眉页脚、弹窗、分享按钮等）
      const noiseSelectors = [
        "script",
        "style",
        "noscript",
        "svg",
        "iframe",
        "header",
        "footer",
        "nav",
        "aside",
        "form",
        ".header",
        ".footer",
        ".nav",
        ".menu",
        ".sidebar",
        ".comment",
        ".comments",
        ".share",
        ".sharing",
        ".recommend",
        ".related",
        ".ad",
        ".ads",
        ".advertisement",
        ".social-share",
        ".article__header__actions",
        ".article__actions",
      ];
      noiseSelectors.forEach((sel) => {
        doc.querySelectorAll(sel).forEach((el) => el.remove());
      });

      // 修复懒加载图片属性并转为绝对路径
      doc.querySelectorAll("img").forEach((img) => {
        const lazySrc =
          img.getAttribute("data-src") ||
          img.getAttribute("data-original") ||
          img.getAttribute("data-actualsrc");
        if (lazySrc) {
          img.setAttribute("src", lazySrc);
        }
        const src = img.getAttribute("src");
        if (src && baseUrl) {
          try {
            img.setAttribute("src", new URL(src, baseUrl).href);
          } catch {
            // ignore invalid URL
          }
        }
      });

      // 修复链接中的相对路径
      if (baseUrl) {
        doc.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href");
          if (
            href &&
            !href.startsWith("http://") &&
            !href.startsWith("https://") &&
            !href.startsWith("#") &&
            !href.startsWith("mailto:")
          ) {
            try {
              a.setAttribute("href", new URL(href, baseUrl).href);
            } catch {
              // ignore
            }
          }
        });
      }

      // 优先候选选择器
      const candidates = [
        ".article__main__content",
        ".wangEditor-txt",
        "article",
        "[itemprop='articleBody']",
        ".article__content",
        ".article-content",
        ".post-content",
        ".entry-content",
        ".rich_media_content",
        ".markdown-body",
        "main",
        "#content",
        ".content",
      ];

      for (const sel of candidates) {
        const el = doc.querySelector(sel);
        if (el) {
          const text = (el.textContent || "").trim();
          if (text.length >= 80) {
            return sanitizeArticleHtml(el.innerHTML, baseUrl);
          }
        }
      }

      // 兜底方案：寻找包含最多段落 <p> 的父容器
      const paragraphs = Array.from(doc.querySelectorAll("p"));
      if (paragraphs.length >= 2) {
        const parentCounts = new Map<HTMLElement, number>();
        paragraphs.forEach((p) => {
          if (p.parentElement) {
            parentCounts.set(p.parentElement, (parentCounts.get(p.parentElement) || 0) + 1);
          }
        });
        let bestParent: HTMLElement | null = null;
        let maxCount = 0;
        parentCounts.forEach((count, el) => {
          if (count > maxCount) {
            maxCount = count;
            bestParent = el;
          }
        });
        if (bestParent && ((bestParent as HTMLElement).textContent || "").trim().length >= 80) {
          return sanitizeArticleHtml((bestParent as HTMLElement).innerHTML, baseUrl);
        }
      }
    } catch {
      // 降级为正则解析
    }
  }

  // 2. 正则降级解析（用于纯 Node / Vitest 测试环境）
  let clean = html.replace(
    /<(script|style|svg|noscript|iframe|header|footer|nav|aside|form)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
  clean = clean.replace(/\s+on\w+=["'][^"']*["']/gi, "");

  const articleMatch = clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch && stripHtml(articleMatch[1]).length >= 80) {
    return sanitizeArticleHtml(articleMatch[1], baseUrl);
  }

  const mainMatch = clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && stripHtml(mainMatch[1]).length >= 80) {
    return sanitizeArticleHtml(mainMatch[1], baseUrl);
  }

  const classMatch = clean.match(
    /<div[^>]+class=["'][^"']*(?:article-content|post-content|entry-content|content-article|rich_media_content|markdown-body|article__main__content|wangEditor-txt)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (classMatch && stripHtml(classMatch[1]).length >= 80) {
    return sanitizeArticleHtml(classMatch[1], baseUrl);
  }

  return "";
}

/**
 * 获取指定 URL 的原始 HTML（支持 Tauri 本地原生 GET 绕过 CORS，并支持浏览器降级）
 */
export async function fetchUrlContent(url: string): Promise<string> {
  // 1. 优先尝试 Tauri 原生 fetch_rss，自带桌面 Chrome User-Agent 且彻底绕过 CORS
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<string>("fetch_rss", { url });
    if (res && res.trim().length > 0) {
      return res;
    }
  } catch {
    // 降级到本地 dev proxy 或网络 fetch
  }

  // 2. 本地 Vite 开发服务器代理（如果在浏览器/egolite中调试，通过 Vite dev proxy 绕过 CORS）
  try {
    const devProxyResp = await fetch(`/api/proxy-fetch?url=${encodeURIComponent(url)}`);
    if (devProxyResp.ok) {
      const text = await devProxyResp.text();
      if (text && text.trim().length > 0) {
        return text;
      }
    }
  } catch {
    // 降级
  }

  // 3. 直接浏览器 fetch
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (resp.ok) {
      return await resp.text();
    }
  } catch {
    // 降级到公开代理
  }

  // 4. 公开 CORS 代理降级
  try {
    const proxyResp = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    );
    if (proxyResp.ok) {
      return await proxyResp.text();
    }
  } catch {
    // ignore
  }

  throw new Error("无法获取原网页内容");
}

/**
 * 智能抓取并提取网页长文正文
 */
export async function fetchFullArticle(url: string): Promise<string> {
  const html = await fetchUrlContent(url);
  const extracted = extractArticleFromHtml(html, url);
  if (!extracted || stripHtml(extracted).length < 150) {
    throw new Error("未能在原网页中提取到长文正文");
  }
  return extracted;
}
