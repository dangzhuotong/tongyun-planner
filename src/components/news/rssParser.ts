import type { Article } from "./types";

const TAG_RE = /<[^>]*>/g;
const parser = new DOMParser();

export function parseRSSXML(xmlText: string): Article[] {
  try {
    const doc = parser.parseFromString(xmlText, "text/xml");

    const items = doc.querySelectorAll("item");
    if (items && items.length > 0) {
      return Array.from(items).slice(0, 20).map((item) => {
        const title = item.querySelector("title")?.textContent || "无题";
        const link = item.querySelector("link")?.textContent || "";
        const pubDateRaw = item.querySelector("pubDate")?.textContent || "";
        const author = item.querySelector("author")?.textContent || item.querySelector("creator")?.textContent || "";
        let description = item.querySelector("description")?.textContent || "";
        description = description.replace(TAG_RE, "").slice(0, 200) + (description.length > 200 ? "..." : "");
        const content = item.querySelector("encoded")?.textContent || item.querySelector("description")?.textContent || "";
        return {
          title,
          link,
          pubDate: pubDateRaw ? new Date(pubDateRaw).toLocaleDateString("zh-CN") : "",
          author,
          description,
          content: content.replace(TAG_RE, ""),
        };
      });
    }

    const entries = doc.querySelectorAll("entry");
    if (entries && entries.length > 0) {
      return Array.from(entries).slice(0, 20).map((entry) => {
        const title = entry.querySelector("title")?.textContent || "无题";
        const linkEl = entry.querySelector("link");
        const link = linkEl?.getAttribute("href") || linkEl?.textContent || "";
        const pubDateRaw = entry.querySelector("published")?.textContent || entry.querySelector("updated")?.textContent || "";
        const author = entry.querySelector("author name")?.textContent || "";
        const summary = entry.querySelector("summary")?.textContent || "";
        const content = entry.querySelector("content")?.textContent || summary;
        return {
          title,
          link,
          pubDate: pubDateRaw ? new Date(pubDateRaw).toLocaleDateString("zh-CN") : "",
          author,
          description: summary.replace(TAG_RE, "").slice(0, 200),
          content: content.replace(TAG_RE, ""),
        };
      });
    }
    return [];
  } catch (e) {
    console.error("RSS parsing error", e);
    return [];
  }
}
