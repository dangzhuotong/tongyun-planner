const WEEKDAYS: Record<string, number> = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };

export interface ParsedDate {
  dueDate: string;
  dueTime?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTime(text: string): string | null {
  const m = text.match(/(\d{1,2})[：:点.](\d{1,2})[分]?/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m2 = text.match(/(\d{1,2})[：:点]/);
  if (m2) {
    const h = parseInt(m2[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  const m3 = text.match(/点半/);
  if (m3) {
    const hMatch = text.match(/(\d{1,2})点半/);
    if (hMatch) {
      const h = parseInt(hMatch[1]);
      if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:30`;
    }
  }
  const period = text.match(/(早上|清晨|早晨|凌晨)/) ? '06' :
    text.match(/(上午|早[上晨])/) ? '08' :
    text.match(/(中午|正午)/) ? '12' :
    text.match(/(下午|午后)/) ? '14' :
    text.match(/(晚上|傍晚|晚间|夜里|夜晚)/) ? '19' : null;
  if (period) {
    const hMatch = text.match(/(\d{1,2})[：:点]/);
    if (hMatch) {
      const h = parseInt(hMatch[1]);
      if (period === '06' || period === '08') return `${String(h).padStart(2, '0')}:00`;
      if (period === '14' || period === '19') return `${String(Math.min(h + 12, 23)).padStart(2, '0')}:00`;
    }
    return `${period}:00`;
  }
  return null;
}

export function parseNaturalDate(text: string): ParsedDate | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let targetDate: Date | null = null;
  let cleaned = text.trim();

  // 明天/后天/大后天
  const dayOffsetMatch = cleaned.match(/(大后天|后天|明天|大后天)/);
  if (dayOffsetMatch) {
    const offset = dayOffsetMatch[0] === '大后天' ? 3 : dayOffsetMatch[0] === '后天' ? 2 : 1;
    targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + offset);
    cleaned = cleaned.replace(dayOffsetMatch[0], '');
  }

  // 下个 X / 下周X
  const nextWeekMatch = cleaned.match(/下(?:个)?(?:周|星期)([一二三四五六天日日])/);
  if (nextWeekMatch && !targetDate) {
    const targetDay = WEEKDAYS[nextWeekMatch[1]];
    if (targetDay !== undefined) {
      targetDate = new Date(today);
      const currentDay = targetDate.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate.setDate(targetDate.getDate() + diff + 7);
    }
    cleaned = cleaned.replace(nextWeekMatch[0], '');
  }

  // 这个 X / 本周X
  const thisWeekMatch = cleaned.match(/(?:这个|本周)(?:周|星期)([一二三四五六天日日])/);
  if (thisWeekMatch && !targetDate) {
    const targetDay = WEEKDAYS[thisWeekMatch[1]];
    if (targetDay !== undefined) {
      targetDate = new Date(today);
      const currentDay = targetDate.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate.setDate(targetDate.getDate() + diff);
    }
    cleaned = cleaned.replace(thisWeekMatch[0], '');
  }

  // 下个月 / 下月
  if (cleaned.match(/下个?月/) && !targetDate) {
    targetDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    cleaned = cleaned.replace(/下个?月/, '');
  }

  // 这个月 / 本月
  if (cleaned.match(/(这个月|本月)/) && !targetDate) {
    targetDate = new Date(today);
    cleaned = cleaned.replace(/(这个月|本月)/, '');
  }

  // 周末
  if (cleaned.match(/周末/) && !targetDate) {
    targetDate = new Date(today);
    const currentDay = targetDate.getDay();
    targetDate.setDate(targetDate.getDate() + (6 - currentDay));
    cleaned = cleaned.replace(/周末/, '');
  }

  // N 天/周/月后
  const afterMatch = cleaned.match(/(\d+)\s*(天|周|个?月)\s*[后]/);
  if (afterMatch && !targetDate) {
    const num = parseInt(afterMatch[1]);
    const unit = afterMatch[2];
    targetDate = new Date(today);
    if (unit === '天') targetDate.setDate(targetDate.getDate() + num);
    else if (unit === '周') targetDate.setDate(targetDate.getDate() + num * 7);
    else targetDate.setMonth(targetDate.getMonth() + num);
    cleaned = cleaned.replace(afterMatch[0], '');
  }

  // 今天/今日 (default)
  if (!targetDate) {
    targetDate = new Date(today);
  }

  const dueDate = formatDate(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  // Parse time from the remaining text
  const timeStr = parseTime(cleaned);

  return { dueDate, dueTime: timeStr || undefined };
}

export function formatNaturalPreview(parsed: ParsedDate): string {
  const today = todayStr();
  const parts: string[] = [];
  if (parsed.dueDate === today) parts.push('今天');
  else {
    const d = new Date(parsed.dueDate);
    const diff = Math.round((d.getTime() - new Date(today).getTime()) / 86400000);
    if (diff === 1) parts.push('明天');
    else if (diff === 2) parts.push('后天');
    else if (diff === -1) parts.push('昨天');
    else parts.push(parsed.dueDate);
  }
  if (parsed.dueTime) parts.push(parsed.dueTime);
  return parts.join(' ');
}
