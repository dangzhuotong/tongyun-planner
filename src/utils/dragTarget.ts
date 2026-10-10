/**
 * src/utils/dragTarget.ts
 *
 * 判断给定 DOM 节点（或测试用模拟节点）是否允许触发窗口拖拽。
 *
 * 规则：
 * 目标元素及其祖先节点中，只要命中以下非拖拽交互选择器之一，即禁止拖拽：
 * - button
 * - a
 * - input
 * - textarea
 * - select
 * - label
 * - [role="button"]
 * - [contenteditable] (排除 contenteditable="false")
 * - [data-no-drag]
 * - .cursor-pointer（项目里可点的 span/div 都带这个类）
 *
 * 卡片空白处、普通文本、div、非交互区域等均允许触发 startDragging()
 */

export const NON_DRAG_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [contenteditable]:not([contenteditable="false"]), [data-no-drag], .cursor-pointer';

export interface DragCandidateNode {
  nodeType?: number;
  parentElement?: DragCandidateNode | null;
  closest?(selector: string): unknown;
  tagName?: string;
  getAttribute?(attr: string): string | null;
}

export function shouldStartDrag(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const node = target as DragCandidateNode;

  // 若目标为文本节点 (nodeType === 3)，向上取父元素
  const element: DragCandidateNode =
    node.nodeType === 3 && node.parentElement ? node.parentElement : node;

  // 1. 标准 Element 或提供 closest 的模拟对象
  if (typeof element.closest === "function") {
    try {
      const match = element.closest(NON_DRAG_SELECTOR);
      return !match;
    } catch {
      // 若自定义 closest 或 selector 解析异常，安全降级至逐级遍历
    }
  }

  // 2. 逐级向上检索祖先（纯对象 mock 降级通道）
  let current: DragCandidateNode | null | undefined = element;
  while (current) {
    const tag = (current.tagName || "").toLowerCase();
    if (["button", "a", "input", "textarea", "select", "label"].includes(tag)) {
      return false;
    }

    if (typeof current.getAttribute === "function") {
      const role = current.getAttribute("role");
      if (role === "button") return false;

      const contentEditable = current.getAttribute("contenteditable");
      if (contentEditable !== null && contentEditable !== "false") return false;

      const noDrag = current.getAttribute("data-no-drag");
      if (noDrag !== null) return false;

      const cls = current.getAttribute("class") || "";
      if (cls.split(/\s+/).includes("cursor-pointer")) return false;
    }

    current = current.parentElement;
  }

  return true;
}
