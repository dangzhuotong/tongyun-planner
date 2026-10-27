import { describe, it, expect } from "vitest";
import {
  safeFormatDate,
  stripHtml,
  sanitizeArticleHtml,
  parseRSSXML,
  isTeaserArticle,
  extractArticleFromHtml,
} from "./rssParser";

describe("rssParser unit tests", () => {
  describe("safeFormatDate", () => {
    it("handles valid RFC 822 date", () => {
      const formatted = safeFormatDate("Tue, 27 Oct 2026 15:27:57 +0800");
      expect(formatted).toMatch(/2026-10-27/);
    });

    it("handles ISO 8601 date", () => {
      const formatted = safeFormatDate("2026-10-27T03:02:20Z");
      expect(formatted).toMatch(/2026-10-27/);
    });

    it("handles completely invalid date string without throwing RangeError", () => {
      expect(() => safeFormatDate("not a real date string")).not.toThrow();
      const res = safeFormatDate("not a real date string");
      expect(res).toBe("not a real date ");
    });

    it("handles empty or null string gracefully", () => {
      expect(safeFormatDate("")).toBe("");
      expect(safeFormatDate(null)).toBe("");
      expect(safeFormatDate(undefined)).toBe("");
    });
  });

  describe("stripHtml", () => {
    it("strips tags and decodes entities", () => {
      const html = "<p>Hello &amp; <b>World</b>&nbsp;!</p>";
      expect(stripHtml(html)).toBe("Hello & World !");
    });

    it("handles CDATA blocks", () => {
      const html = "<![CDATA[<p>Content inside CDATA &quot;quotes&quot;</p>]]>";
      expect(stripHtml(html)).toBe('Content inside CDATA "quotes"');
    });
  });

  describe("sanitizeArticleHtml", () => {
    it("removes script, style, and iframe tags", () => {
      const dangerous = `<p>Safe text</p><script>alert(1)</script><iframe src="https://evil.com"></iframe><style>body{color:red}</style>`;
      const clean = sanitizeArticleHtml(dangerous);
      expect(clean).not.toContain("<script");
      expect(clean).not.toContain("<iframe");
      expect(clean).not.toContain("<style");
      expect(clean).toContain("<p>Safe text</p>");
    });

    it("removes inline on* handlers", () => {
      const dangerous = `<img src="pic.jpg" onerror="alert(1)" onload="evil()" />`;
      const clean = sanitizeArticleHtml(dangerous);
      expect(clean).not.toContain("onerror");
      expect(clean).not.toContain("onload");
    });

    it("adds target and rel attributes to links", () => {
      const html = `<a href="https://sspai.com">Link</a>`;
      const clean = sanitizeArticleHtml(html);
      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer"');
    });

    it("normalizes img tags, resolves data-src / data-original", () => {
      const html = `<p>Test</p><img data-original="https://cdn.example.com/real.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="demo">`;
      const clean = sanitizeArticleHtml(html);
      expect(clean).toContain('src="https://cdn.example.com/real.jpg"');
    });

    it("resolves relative image paths against baseUrl", () => {
      const html = `<p>Test</p><img src="/uploads/pic.png">`;
      const clean = sanitizeArticleHtml(html, "https://example.com/news/123");
      expect(clean).toContain('src="https://example.com/uploads/pic.png"');
    });
  });

  describe("parseRSSXML fallback when no DOMParser in Node environment", () => {
    it("returns empty array safely without throwing ReferenceError", () => {
      expect(() => parseRSSXML("<xml></xml>")).not.toThrow();
      expect(parseRSSXML("")).toEqual([]);
    });
  });

  describe("isTeaserArticle", () => {
    it("identifies short teasers like 少数派 summary", () => {
      const teaser = {
        title: "Apple Sports",
        content: "作为一个从小看CCTV-5体育频道下饭的「体育迷」...<a href='https://sspai.com'>查看全文</a>",
      };
      expect(isTeaserArticle(teaser)).toBe(true);
    });

    it("identifies empty articles as teasers", () => {
      expect(isTeaserArticle({ content: "", description: "" })).toBe(true);
    });

    it("identifies long articles with full content as not teasers", () => {
      const longText = "<p>" + "全长文章内容测试，详细阐述各种设计架构与使用心得。".repeat(20) + "</p>";
      expect(isTeaserArticle({ content: longText })).toBe(false);
    });
  });

  describe("extractArticleFromHtml", () => {
    it("extracts content from <article> tag", () => {
      const html = `<html><body><nav>Menu</nav><article><p>Hello full article body text here that is long enough to meet the threshold of useful article content for reader mode display.</p></article><footer>Footer</footer></body></html>`;
      const extracted = extractArticleFromHtml(html);
      expect(extracted).toContain("Hello full article body text");
      expect(extracted).not.toContain("<nav");
      expect(extracted).not.toContain("<footer");
    });
  });
});
