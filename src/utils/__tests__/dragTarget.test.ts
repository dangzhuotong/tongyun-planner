import { describe, it, expect } from "vitest";
import { shouldStartDrag, type DragCandidateNode } from "../dragTarget";

/**
 * 构造模拟 DOM 树节点工具函数，支持 closest 行为与 parentElement 向上回溯
 */
function createMockNode({
  tagName = "div",
  attributes = {},
  parent = null,
  nodeType = 1,
}: {
  tagName?: string;
  attributes?: Record<string, string>;
  parent?: DragCandidateNode | null;
  nodeType?: number;
}): DragCandidateNode {
  const node: DragCandidateNode = {
    nodeType,
    tagName: tagName.toUpperCase(),
    parentElement: parent,
    getAttribute(attr: string) {
      return attributes[attr] ?? null;
    },
  };

  node.closest = (selector: string): DragCandidateNode | null => {
    const rawSelectors = selector.split(",").map((s) => s.trim().toLowerCase());
    let cur: DragCandidateNode | null | undefined = node;
    while (cur) {
      const curTag = (cur.tagName || "").toLowerCase();
      for (const sel of rawSelectors) {
        if (sel === curTag) {
          return cur;
        }
        if (sel.includes('[role="button"]') && cur.getAttribute?.("role") === "button") {
          return cur;
        }
        if (
          sel.includes("[contenteditable") &&
          cur.getAttribute?.("contenteditable") !== null &&
          cur.getAttribute?.("contenteditable") !== "false"
        ) {
          return cur;
        }
        if (sel.includes("[data-no-drag]") && cur.getAttribute?.("data-no-drag") !== null) {
          return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  };

  return node;
}

describe("shouldStartDrag", () => {
  describe("边界输入保护", () => {
    it("传入 null / undefined / 非对象时返回 false", () => {
      expect(shouldStartDrag(null)).toBe(false);
      expect(shouldStartDrag(undefined)).toBe(false);
      expect(shouldStartDrag(123)).toBe(false);
      expect(shouldStartDrag("button")).toBe(false);
      expect(shouldStartDrag(true)).toBe(false);
    });
  });

  describe("可拖动区域（允许 startDragging）", () => {
    it("普通 div（如卡片空白背景、窗口容器）允许拖动", () => {
      const div = createMockNode({ tagName: "div" });
      expect(shouldStartDrag(div)).toBe(true);
    });

    it("普通 span / p / h1 文本容器允许拖动", () => {
      const span = createMockNode({ tagName: "span" });
      const p = createMockNode({ tagName: "p" });
      const h1 = createMockNode({ tagName: "h1" });
      expect(shouldStartDrag(span)).toBe(true);
      expect(shouldStartDrag(p)).toBe(true);
      expect(shouldStartDrag(h1)).toBe(true);
    });

    it("文本节点（nodeType === 3）如果在普通容器中允许拖动", () => {
      const parent = createMockNode({ tagName: "div" });
      const textNode = createMockNode({ nodeType: 3, parent });
      expect(shouldStartDrag(textNode)).toBe(true);
    });

    it("显式 contenteditable='false' 的节点允许拖动", () => {
      const nonEditable = createMockNode({
        tagName: "div",
        attributes: { contenteditable: "false" },
      });
      expect(shouldStartDrag(nonEditable)).toBe(true);
    });
  });

  describe("禁止拖拽交互目标（交互优先，阻止 startDragging）", () => {
    it("button 元素禁止拖动", () => {
      const btn = createMockNode({ tagName: "button" });
      expect(shouldStartDrag(btn)).toBe(false);
    });

    it("button 内部的子节点（如 svg 图标、span 标签、文本）禁止拖动", () => {
      const btn = createMockNode({ tagName: "button" });
      const svg = createMockNode({ tagName: "svg", parent: btn });
      const path = createMockNode({ tagName: "path", parent: svg });
      expect(shouldStartDrag(svg)).toBe(false);
      expect(shouldStartDrag(path)).toBe(false);

      const textNode = createMockNode({ nodeType: 3, parent: btn });
      expect(shouldStartDrag(textNode)).toBe(false);
    });

    it("a 超链接标签禁止拖动", () => {
      const a = createMockNode({ tagName: "a" });
      const span = createMockNode({ tagName: "span", parent: a });
      expect(shouldStartDrag(a)).toBe(false);
      expect(shouldStartDrag(span)).toBe(false);
    });

    it("input / textarea / select 输入控件禁止拖动", () => {
      expect(shouldStartDrag(createMockNode({ tagName: "input" }))).toBe(false);
      expect(shouldStartDrag(createMockNode({ tagName: "textarea" }))).toBe(false);
      expect(shouldStartDrag(createMockNode({ tagName: "select" }))).toBe(false);
    });

    it("label 标签禁止拖动", () => {
      const label = createMockNode({ tagName: "label" });
      const text = createMockNode({ tagName: "span", parent: label });
      expect(shouldStartDrag(label)).toBe(false);
      expect(shouldStartDrag(text)).toBe(false);
    });

    it("[role=button] 角色元素及其子节点禁止拖动", () => {
      const roleBtn = createMockNode({
        tagName: "div",
        attributes: { role: "button" },
      });
      const child = createMockNode({ tagName: "span", parent: roleBtn });
      expect(shouldStartDrag(roleBtn)).toBe(false);
      expect(shouldStartDrag(child)).toBe(false);
    });

    it("[contenteditable] 可编辑区域及其子节点禁止拖动", () => {
      const editable1 = createMockNode({
        tagName: "div",
        attributes: { contenteditable: "" },
      });
      const editable2 = createMockNode({
        tagName: "div",
        attributes: { contenteditable: "true" },
      });
      const child = createMockNode({ tagName: "p", parent: editable2 });
      expect(shouldStartDrag(editable1)).toBe(false);
      expect(shouldStartDrag(editable2)).toBe(false);
      expect(shouldStartDrag(child)).toBe(false);
    });

    it("[data-no-drag] 自定义防拖拽标记及其子节点禁止拖动", () => {
      const noDrag = createMockNode({
        tagName: "div",
        attributes: { "data-no-drag": "true" },
      });
      const child = createMockNode({ tagName: "div", parent: noDrag });
      expect(shouldStartDrag(noDrag)).toBe(false);
      expect(shouldStartDrag(child)).toBe(false);
    });
  });

  describe("无 closest 方法时的降级回溯", () => {
    it("降级通道通过 parentElement 逐级向上检测标签与属性", () => {
      const parentBtn: DragCandidateNode = {
        tagName: "BUTTON",
        parentElement: null,
      };
      const childSpan: DragCandidateNode = {
        tagName: "SPAN",
        parentElement: parentBtn,
      };
      // 没有 closest 函数
      expect(shouldStartDrag(childSpan)).toBe(false);

      const normalParent: DragCandidateNode = {
        tagName: "DIV",
        parentElement: null,
      };
      const normalChild: DragCandidateNode = {
        tagName: "SPAN",
        parentElement: normalParent,
      };
      expect(shouldStartDrag(normalChild)).toBe(true);
    });
  });
});

describe("shouldStartDrag - cursor-pointer clickable", () => {
  it("可点的 span（带 cursor-pointer）及其子节点不触发拖动", () => {
    const span: DragCandidateNode = {
      nodeType: 1,
      tagName: "SPAN",
      parentElement: null,
      getAttribute: (a: string) => (a === "class" ? "text-2xl cursor-pointer hover:text-x" : null),
    };
    const child: DragCandidateNode = { nodeType: 1, tagName: "I", parentElement: span, getAttribute: () => null };
    expect(shouldStartDrag(span)).toBe(false);
    expect(shouldStartDrag(child)).toBe(false);
  });

  it("类名只是包含 pointer 字样的普通 div 仍可拖", () => {
    const div: DragCandidateNode = {
      nodeType: 1,
      tagName: "DIV",
      parentElement: null,
      getAttribute: (a: string) => (a === "class" ? "cursor-pointer-ish p-2" : null),
    };
    expect(shouldStartDrag(div)).toBe(true);
  });
});
