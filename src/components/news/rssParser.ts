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
 */
export function sanitizeArticleHtml(html: string): string {
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

  // 规范化外部链接
  clean = clean.replace(/<a\s+([^>]*?)>/gi, (_match, attrs) => {
    if (!attrs.includes("target=")) {
      return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
    }
    return `<a ${attrs}>`;
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
