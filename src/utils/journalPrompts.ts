export interface JournalPrompt {
  id: string;
  category: "gratitude" | "reflection" | "discovery" | "healing";
  question: string;
  hint: string;
}

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  {
    id: "p1",
    category: "gratitude",
    question: "今天哪一个微小的瞬间，让你嘴角微微上扬了？",
    hint: "也许是一杯刚冲好的热茶、路上偶遇的一只橘猫，或者耳机里突然切到的一首老歌。",
  },
  {
    id: "p2",
    category: "reflection",
    question: "今天做过的最小的一件有意义的事是什么？",
    hint: "不一定要宏大。哪怕只是耐心地给植物浇了水，或者把桌面收拾整齐。",
  },
  {
    id: "p3",
    category: "healing",
    question: "如果用一种天气或季节来形容今天的心情，会是什么？",
    hint: "是微雨初歇的凉爽，还是午后斑驳树影下的宁静？",
  },
  {
    id: "p4",
    category: "discovery",
    question: "今天有发现生活里什么平时没注意到的可爱细节吗？",
    hint: "比如傍晚天边泛起的一抹橘粉色晚霞，或者楼下小店新换的风铃。",
  },
  {
    id: "p5",
    category: "gratitude",
    question: "今天想对哪一个帮助过你的人（或是对自己）说一声谢谢？",
    hint: "感谢那个在疲惫时依然没有放弃、认真生活到此刻的自己。",
  },
  {
    id: "p6",
    category: "reflection",
    question: "今天有没有哪一刻，让你感觉完全沉浸在心流之中？",
    hint: "专注敲代码、沉浸阅读、或是认真做一顿饭的忘我时光。",
  },
  {
    id: "p7",
    category: "healing",
    question: "今晚放下手帐后，你最期待的放松时刻是什么？",
    hint: "洗个热水澡、读两页闲书、听一段白噪音，或是睡个踏实的好觉。",
  },
  {
    id: "p8",
    category: "discovery",
    question: "今天学到的或领悟到的最小的一点新认知是什么？",
    hint: "一个技术小技巧、一种看待分歧的新角度，或者一句话的共鸣。",
  },
];

/** 根据日期字符串返回当日推荐问题（保证当天稳定一致） */
export function getDailyJournalPrompt(dateStr: string = new Date().toISOString().slice(0, 10), offset: number = 0): JournalPrompt {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash + offset) % JOURNAL_PROMPTS.length;
  return JOURNAL_PROMPTS[index];
}

/** 将走心提问格式化为写入日记的引用文本 */
export function formatPromptForJournal(prompt: JournalPrompt): string {
  return `> 💡 **今日灵感微问**：${prompt.question}\n\n`;
}
