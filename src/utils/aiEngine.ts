import type { CustomizationConfig, Task } from "../types";
import { DEFAULT_AI_CLASSIFY_PROMPT } from "../constants";
import { getLocalDateString } from "./date";

/**
 * 辅助清洗 AI 返回的 JSON 字符串，防止 Markdown 代码块标记（```json）导致 JSON.parse 报错。
 */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * 通用 AI 接口发起函数，自适应适配 OpenAI/DeepSeek 格式与 Anthropic Claude 原生格式
 */
export async function callAI(
  config: CustomizationConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const provider = config.aiProvider || "openai";

  // OpenCode / Ollama 可不用 API Key
  const apiKey = config.aiApiKey;
  const noKeyProviders = ["opencode", "ollama"];
  if (!apiKey && !noKeyProviders.includes(provider)) {
    throw new Error("API_KEY_MISSING");
  }

  const temperature = config.aiTemperature ?? 0.3;
  const maxTokens = config.aiMaxTokens ?? 1024;

  if (provider === "anthropic") {
    // Anthropic Claude 原生 API
    const endpoint = config.aiEndpoint || "https://api.anthropic.com/v1/messages";
    const model = config.aiModel || "claude-3-5-sonnet-20241022";

    const anthropicHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (apiKey) {
      anthropicHeaders["x-api-key"] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API 错误 (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || "";
  } else {
    // OpenAI / DeepSeek / OpenCode / 兼容格式 API
    const endpoint = config.aiEndpoint || "https://api.openai.com/v1";
    const model = config.aiModel || "gpt-4o";
    const url = endpoint.endsWith("/") ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI 兼容 API 错误 (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }
}

/** 测试 AI 接口连通性（发送极简探针请求） */
export async function testAIConnection(config: CustomizationConfig): Promise<string> {
  const result = await callAI(config, "你是一个测试助手。", "请只回复：连接成功");
  return result.trim();
}

/**
 * 1. AI 智能划分子视图分类 (Eisenhower Category Selection)
 */
export async function classifyCategory(
  config: CustomizationConfig,
  title: string,
  desc: string
): Promise<Task["category"] | null> {
  const systemPrompt = DEFAULT_AI_CLASSIFY_PROMPT;
  const userPrompt = `任务标题: ${title}\n描述: ${desc || "无"}`;

  try {
    const result = await callAI(config, systemPrompt, userPrompt);
    // 清洗结果：转小写，去除引号、括号、多余标点
    const cleaned = result.trim().toLowerCase().replace(/[`'"'[\]\.#*]/g, "");

    // 映射中文分类到英文标识符
    const chineseMapping: Record<string, Task["category"]> = {
      "重要且紧急": "urgent-important",
      "重要紧急": "urgent-important",
      "重要不紧急": "important-not-urgent",
      "紧急不重要": "urgent-not-important",
      "不重要不紧急": "not-urgent-not-important",
      "不重要且不紧急": "not-urgent-not-important",
    };

    for (const [zh, en] of Object.entries(chineseMapping)) {
      if (cleaned.includes(zh)) {
        return en;
      }
    }

    // 解决包含关系冲突并匹配（先检查最长匹配项，避免 urgent-not-important 被 incorrectly 包含）
    const matched = [
      "not-urgent-not-important",
      "important-not-urgent",
      "urgent-not-important",
      "urgent-important",
    ].find((c) => cleaned === c || cleaned.includes(c));

    return (matched as Task["category"]) || null;
  } catch (e) {
    console.error("AI 自动分类失败:", e);
    return null;
  }
}

/**
 * 2. AI 智能一键拆解子任务 (Checklist Decompose)
 */
export async function decomposeTask(
  config: CustomizationConfig,
  title: string,
  desc: string
): Promise<string> {
  const systemPrompt =
    "你是一个高效日程管理专家。你的任务是将用户输入的大任务进行结构化拆解，分成 3 到 5 步可立即执行的子任务。请输出标准的 Markdown 复选框格式（例如：\n- [ ] 步骤一\n- [ ] 步骤二\n）。只返回 Markdown 复选框列表内容本身，不要返回任何开头引言、多余解释、行号或结束总结。";
  const userPrompt = `需要拆解的任务标题: ${title}\n细节描述: ${desc || "无"}`;

  return await callAI(config, systemPrompt, userPrompt);
}

/**
 * 3. AI 智能优化润色标题 (Title Polish)
 */
export async function polishTitle(
  config: CustomizationConfig,
  title: string
): Promise<string> {
  const systemPrompt =
    "你是一个排版和日常管理助手。请对以下待办任务标题进行精简和美化润色，使其看起来更简练、有条理且专业。请控制在 15 个字以内。你可以适当在标题最前端加上 1 个对应的 Emoji 表情（如 📝，💻，🏃）。直接返回润色后的标题文本，不要包含任何双引号、前缀（如“润色后：”）或多余解释。若觉得原标题已经极好，请直接返回原标题。";
  const userPrompt = `原标题: ${title}`;

  return await callAI(config, systemPrompt, userPrompt);
}

/**
 * 4. AI 便签智能整理排版 (Format Note Text)
 */
export async function formatNoteText(
  config: CustomizationConfig,
  noteText: string
): Promise<string> {
  const systemPrompt =
    "你是一个手账随身记排版专家。请对用户随手记下的凌乱便签草稿进行整理、分点和排版美化，使其结构清晰、易于查阅。你可以根据上下文加入合适的 Emoji，但必须 100% 保持原意与所有事实细节。只返回整理后的便签内容本身，不要返回任何引言、解释或多余的行。";
  const userPrompt = `原便签内容:\n${noteText}`;

  return await callAI(config, systemPrompt, userPrompt);
}

/**
 * 5. AI 便签脑暴续写 (Brainstorm & Expand Note)
 */
export async function brainstormNote(
  config: CustomizationConfig,
  noteText: string
): Promise<string> {
  const systemPrompt =
    "你是一个创意与规划助手。请阅读以下便签记事的内容，并针对其主题，发散出 3 点具体的扩展灵感、补充细节或后续行动建议。请使用 Markdown 的短分点符号（- ）进行排版，字数控制在简短的范围内（每点不超过 20 字）。只返回追加续写的想法内容本身，不要任何多余废话。";
  const userPrompt = `当前便签正文:\n${noteText}`;

  return await callAI(config, systemPrompt, userPrompt);
}

/**
 * 6. AI 夸夸模式 — 根据完成的任务生成祝贺语
 */
export async function generatePraise(
  config: CustomizationConfig,
  locale: string
): Promise<string> {
  const lang = locale === "zh-CN" ? "简体中文" : "English";
  const systemPrompt = `你是一个温暖、有趣的鼓励大师。请用 ${lang} 生成一句简短的任务完成祝贺/夸赞语。
要求：
- 必须通用，不要提及任何具体任务名称
- 不超过 20 个字，可以适当使用 1-2 个 emoji
- 热情、有感染力，不要过于模板化
- 只返回祝贺文本本身，不要任何前缀后缀或引号`;

  const userPrompt = `请给我一句通用的完成祝贺语！`;
  try {
    return await callAI(config, systemPrompt, userPrompt);
  } catch {
    return "";
  }
}

/**
 * 6b. 批量生成夸夸词 — 一次调用生成多条（用于扩充词库）
 */
export async function generatePraiseBatch(
  config: CustomizationConfig,
  locale: string,
  count: number = 5
): Promise<string[]> {
  const lang = locale === "zh-CN" ? "简体中文" : "English";
  const systemPrompt = `你是一个温暖、有趣的鼓励大师。请用 ${lang} 生成 ${count} 条通用的任务完成祝贺/夸赞语。
要求：
- 必须通用，绝对不要提及任何具体任务名称或内容
- 每条不超过 20 个字，可以适当使用 1-2 个 emoji
- 风格热情、有感染力，不要过于模板化
- 每条占一行，不要带序号或前缀后缀
- 只返回纯文本，每行一条`;

  const userPrompt = `请生成 ${count} 条通用夸赞语。`;
  try {
    const result = await callAI(config, systemPrompt, userPrompt);
    const lines = result.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    return lines.slice(0, count);
  } catch {
    return [];
  }
}

export interface GenerateProseOptions {
  /** 上一篇摘要，用于同日重生成时避开撞题 */
  avoidSnippet?: string;
  /** 可选的今日生活线索（如任务标题），轻量点染即可 */
  contextHints?: string[];
}

/**
 * 6c. AI 生成散文 — 短篇随笔，贴合今日，避免题材套路
 */
export async function generateProse(
  config: CustomizationConfig,
  locale: string,
  options: GenerateProseOptions = {}
): Promise<string> {
  const now = new Date();
  const dateStr = locale === "zh-CN"
    ? `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
    : now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const systemPrompt = `你是一位文风平实的散文作家，写短篇随笔。

要求：
1. 白话为主，自然顺畅；可偶有一点书卷气，但不要堆砌文言、生僻字或套路修辞。
2. 语气温和、诚恳，不鸡汤、不矫情。
3. 全文 200–350 字。不要刻意写季节、节气、喝茶、读书等固定题材。
4. 从今天某个具体、琐碎的生活细节切入，略作延展后收束即可。

输出格式：第一行标题（2–8 字），空一行后写正文。只返回标题和正文。`;

  const parts = [`今天是 ${dateStr}。请写一篇短篇随笔。`];
  const hints = (options.contextHints || []).map((h) => h.trim()).filter(Boolean).slice(0, 3);
  if (hints.length > 0) {
    parts.push(`可参考这些今日线索（不必全用，点到即可）：${hints.join("；")}。`);
  }
  if (options.avoidSnippet?.trim()) {
    parts.push(`请换一个完全不同的切入点，不要与下面这篇相似：\n${options.avoidSnippet.trim().slice(0, 120)}`);
  }

  try {
    return await callAI(config, systemPrompt, parts.join("\n"));
  } catch {
    return "";
  }
}

/**
 * 6e. AI 「朝花夕拾」回眸散文 —— 把用户收藏/读过的旧条目，织成一篇温柔的温故小文。
 */
export async function generateRecollection(
  config: CustomizationConfig,
  locale: string,
  items: { title: string; source?: string; date?: string }[]
): Promise<string> {
  if (items.length === 0) return "";
  const now = new Date();
  const dateStr =
    locale === "zh-CN"
      ? `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
      : now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const listText = items
    .map((it, i) => {
      const when = it.date ? `（收藏于${it.date}）` : "";
      const src = it.source ? `「${it.source}」` : "";
      return `${i + 1}. ${src}${it.title}${when}`;
    })
    .join("\n");

  const systemPrompt = `你是一位文笔温润的散文家，偏爱"朝花夕拾"的语调——于平实的日常里拾起细碎的欢喜与怅惘。
请围绕下面用户"曾经收藏或读过"的信息清单，写一篇温柔的回眸散文，把其中几则自然地织进文字，像傍晚翻看旧物，点到具体的那一朵"朝花"。

要求：
1. 角色：你是沉静的散文家，语调平实自然，用通达从容的白话。可带一点书卷气，但不堆砌辞藻、不宏大叙事。
2. 细节：落笔于微小、具体的日常；用平实的句式，悄悄把清单里的某几条收藏当作"小确幸 / 旧时光 / 未读的好奇"轻轻提起，让人会心。
3. 态度：温和舒缓，透着"完工后的松弛"。欢迎读者停留，也接纳放下。
4. 长度：正文 400-700 字，结合当前日期 ${dateStr}。

结构：
- 起：从一个细微的当下切入（窗边的光、一杯凉掉的茶、一条很久没点开过的链接）。
- 展：由这细节展开，自然地想起清单里收藏过的某篇文章、某个念头。
- 尾：收束到自己的心境。

格式：第一行为标题（4-12 字，像一句随手记下的话），空一行后写正文。只返回散文本身，不要任何额外说明。`;

  const userPrompt = `今天是 ${dateStr}。这是用户此前收藏或读过的一些内容：\n${listText}\n\n请以"朝花夕拾"的笔调，写一篇把这些旧物轻轻拾起的回眸散文。`;

  try {
    return await callAI(config, systemPrompt, userPrompt);
  } catch {
    return "";
  }
}

/**
 * 6d. AI 每日建议 —— 基于今日任务智能推荐与优先级
 */
export interface DailySuggestionContext {
  pomodoroCount?: number;     // 今日番茄次数
  pomodoroMinutes?: number;   // 今日专注分钟
  unfinishedCount?: number;   // 今日未完成任务数
}

export async function generateDailySuggestion(
  config: CustomizationConfig,
  todayTasks: { title: string; category: Task["category"]; dueTime?: string; description?: string }[],
  locale: string,
  ctx?: DailySuggestionContext
): Promise<string> {
  const lang = locale === "zh-CN" ? "简体中文" : "English";
  const taskList = todayTasks.map((t, i) =>
    `${i + 1}. [${t.category}] ${t.title}${t.dueTime ? ` (截止: ${t.dueTime})` : ""}${t.description ? ` — ${t.description.slice(0, 30)}` : ""}`
  ).join("\n");

  const extras: string[] = [];
  if (ctx?.unfinishedCount != null) extras.push(`今日未完成待办数: ${ctx.unfinishedCount}`);
  if (ctx?.pomodoroCount != null) {
    extras.push(`今日番茄: ${ctx.pomodoroCount} 次` + (ctx.pomodoroMinutes != null ? `（约 ${ctx.pomodoroMinutes} 分钟）` : ""));
  }

  const systemPrompt = `你是一个温和高效的日程顾问。请用 ${lang} 给用户写一段简短的今日建议（80-140 字）。
要求：
- 根据以下今日待办与上下文，推荐先做什么、后做什么，给出理由
- 若有番茄信息，可轻描淡写地融入建议，不要逐条复述
- 语气温暖、鼓励，像朋友一样自然
- 不要列点，用流畅的段落表达
- 如果列表为空，则说"今天没有待办，好好休息或规划明天吧"
- 只返回建议文本本身，不要任何额外说明`;

  const userPrompt = `今日待办列表:\n${taskList || "（空）"}` +
    (extras.length ? `\n\n补充上下文:\n${extras.join("\n")}` : "");

  return await callAI(config, systemPrompt, userPrompt);
}

/**
 * 7. AI 智能从便签提取日程待办 (Extract Tasks from Note)
 */
export interface ExtractedTask {
  title: string;
  description: string;
  notes: string;
  dueDate: string;
  dueTime?: string;
  category: Task["category"];
}

export async function extractTasksFromNote(
  config: CustomizationConfig,
  noteText: string
): Promise<ExtractedTask[]> {
  const today = getLocalDateString();
  const systemPrompt = `你是一个专业的日程和任务规划专家。你的任务是分析用户输入的文案（如客服工单、备忘或大段规划），提取并分离成结构化的待办任务。
请严格以标准的 JSON 数组格式返回结果。数组中的每个对象代表一个提取出的任务，且必须正好包含以下六个字段：
1. "title": (string) 简短易读的任务标题。如果是工单或系统日志，请浓缩提炼出核心矛盾和人员（例如：“【TD登陆未授权】Adrian Cheng 微信登陆故障”）。控制在 18 个字以内。
2. "description": (string) 任务具体背景及故障表现描述（例如：“学生和家长在国外，两个微信都试了无法登陆，没有开未成年人模式”）。
3. "notes": (string) 详细的元数据、日志编号或硬件/UID数据（例如：“学生：Adrian Cheng\nUID：oXBpRwJV46AAu68DxqQ2xhXjWSU4\n工单：20260627-01”）。请使用换行符分隔。
4. "dueDate": (string) 截止日期，格式为 YYYY-MM-DD。若输入提及“明天/周末/下周三”等相对日期，请根据今天的时间（今天是 ${today}）进行精确推算；若完全没有提到日期，默认使用今天（${today}）。
5. "dueTime": (string) 截止时间，24小时制 HH:mm 格式。如果输入提到"下午3点"/"15:00"/"下班前"（17:00或18:00）等具体时间，请解析为对应时间；如果没有提到时间，请留空 ""。
6. "category": (string) 四象限分类，必须且只能是以下四个值之一：[urgent-important | important-not-urgent | urgent-not-important | not-urgent-not-important]。例如，如果是系统故障或紧急故障，应判定为 "urgent-important"。

重要规则：只返回标准的 JSON 数组格式，不要包含 Markdown 代码块包裹，也不要有任何开头引言、多余文字或注释。如果没有发现明确待办事项，请直接返回空数组 []。`;
  const userPrompt = `用户输入的原始文案:\n${noteText}`;

  const rawResult = await callAI(config, systemPrompt, userPrompt);
  const cleaned = cleanJsonResponse(rawResult);

  if (!cleaned || cleaned === "[]") {
    return [];
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => {
        let cat = (item.category || "").trim().toLowerCase();

        // 映射中文分类到英文标识符
        const chineseMapping: Record<string, Task["category"]> = {
          "重要且紧急": "urgent-important",
          "重要紧急": "urgent-important",
          "重要不紧急": "important-not-urgent",
          "紧急不重要": "urgent-not-important",
          "不重要不紧急": "not-urgent-not-important",
          "不重要且不紧急": "not-urgent-not-important",
        };

        for (const [zh, en] of Object.entries(chineseMapping)) {
          if (cat.includes(zh)) {
            cat = en;
            break;
          }
        }

        // 解决包含关系冲突并格式化
        const matched = [
          "not-urgent-not-important",
          "important-not-urgent",
          "urgent-not-important",
          "urgent-important",
        ].find((c) => cat === c || cat.includes(c));

        return {
          title: item.title || "无题待办",
          description: item.description || "",
          notes: item.notes || "",
          dueDate: item.dueDate || today,
          dueTime: item.dueTime || undefined,
          category: (matched as Task["category"]) || "urgent-important",
        };
      });
    }
    return [];
  } catch (e) {
    console.error("AI 提取任务 JSON 解析失败. 原始返回:", rawResult, "清洗后:", cleaned, e);
    throw new Error("JSON_PARSE_FAILED");
  }
}

export async function generateReport(
  config: CustomizationConfig,
  type: "daily" | "weekly",
  data: { completedTasks: number; pomodoroCount: number; pomodoroMinutes: number; taskCategories: Record<string, number> }
): Promise<string> {
  const dateRange = type === "daily" ? "今天" : "过去一周";
  const systemPrompt = `你是一个效率助手。请根据以下数据生成一份简洁温暖的${type === "daily" ? "日" : "周"}报总结。`;
  const userPrompt = `请为以下数据生成一份${dateRange}的效率报告（100字以内，Markdown格式）：\n完成待办: ${data.completedTasks}项\n番茄专注: ${data.pomodoroCount}次 (${data.pomodoroMinutes}分钟)\n任务分类: ${JSON.stringify(data.taskCategories)}`;

  return await callAI(config, systemPrompt, userPrompt);
}

/** 从兼容 OpenAI 的 API 端点获取可用模型列表 */
export async function fetchAvailableModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const url = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((m: any) => m.id).sort();
  }
  if (data.models && Array.isArray(data.models)) {
    return data.models.map((m: any) => m.name || m.model || m.id).sort();
  }
  return [];
}
