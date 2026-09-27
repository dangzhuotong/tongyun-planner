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
  const isPM = /(下午|午后|晚上|傍晚|晚间|夜里|夜晚)/.test(text);
  const isAM = /(早上|清晨|早晨|凌晨|上午|早[上晨])/.test(text);

  const defaultPeriod = /(早上|清晨|早晨|凌晨)/.test(text) ? '06' :
    /(上午|早[上晨])/.test(text) ? '08' :
    /(中午|正午)/.test(text) ? '12' :
    /(下午|午后)/.test(text) ? '14' :
    /(晚上|傍晚|晚间|夜里|夜晚)/.test(text) ? '19' : null;

  // 1. 匹配几点几分：如 3:20、3点20分
  const m = text.match(/(\d{1,2})[：:点.](\d{1,2})[分]?/);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  // 2. 匹配几点半：如 3点半
  const m3 = text.match(/(\d{1,2})点半/);
  if (m3) {
    let h = parseInt(m3[1]);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:30`;
  }

  // 3. 匹配整点：如 3点、3:
  const m2 = text.match(/(\d{1,2})[：:点]/);
  if (m2) {
    let h = parseInt(m2[1]);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }

  // 4. 仅有时间段（无具体钟点）
  if (defaultPeriod) {
    return `${defaultPeriod}:00`;
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
