/**
 * 文本搜索工具，支持中英文分词匹配。
 * 对 CJK 文本使用 Intl.Segmenter 分词后逐词匹配，
 * 对非 CJK 文本使用 toLowerCase 全文包含匹配。
 */

let _segmenter: any = null;

function getSegmenter(): any {
  if (typeof Intl === "undefined") return null;
  const seg = (Intl as any).Segmenter;
  if (!seg) return null;
  if (!_segmenter) {
    try {
      _segmenter = new seg("zh-CN", { granularity: "word" });
    } catch {
      return null;
    }
  }
  return _segmenter;
}

/** 将文本拆分为词元列表 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const segmenter = getSegmenter();
  if (!segmenter) return text.toLowerCase().split(/\s+/).filter(Boolean);
  const segments: { segment: string; isWordLike: boolean }[] = Array.from(segmenter.segment(text));
  return segments.filter((s) => s.isWordLike).map((s) => s.segment.toLowerCase());
}

/** 判断文本是否匹配所有搜索关键词 */
export function matchesSearch(text: string, query: string): boolean {
  if (!query.trim()) return false;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const tokens = tokenize(text);
  const queryWords = lowerQuery.split(/\s+/).filter(Boolean);

  return queryWords.every((qw) => {
    if (lowerText.includes(qw)) return true;
    return tokens.some((t) => t.includes(qw));
  });
}

/** 返回文本中匹配查询串的区间列表 [[start, end], ...] */
export function findMatchRanges(text: string, query: string): Array<[number, number]> {
  if (!query.trim()) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const ranges: Array<[number, number]> = [];

  let idx = 0;
  while (idx < lowerText.length) {
    const pos = lowerText.indexOf(lowerQuery, idx);
    if (pos === -1) break;
    ranges.push([pos, pos + lowerQuery.length]);
    idx = pos + 1;
  }

  if (ranges.length === 0) {
    const words = lowerQuery.split(/\s+/).filter(Boolean);
    for (const w of words) {
      let i = 0;
      while (i < lowerText.length) {
        const pos = lowerText.indexOf(w, i);
        if (pos === -1) break;
        ranges.push([pos, pos + w.length]);
        i = pos + 1;
      }
    }
  }

  // 合并重叠区间
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push(r);
    }
  }
  return merged;
}
