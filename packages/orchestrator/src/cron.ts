/**
 * Browser-safe cron helpers shared by automation scheduling and UI validation.
 */

export interface ParsedCronExpression {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

export function parseCronExpression(expression: string): ParsedCronExpression | null {
  if (!isValidCronExpression(expression)) {
    return null;
  }

  const parts = expression.trim().split(/\s+/);
  return {
    minute: expandCronField(parts[0], 0, 59),
    hour: expandCronField(parts[1], 0, 23),
    dayOfMonth: expandCronField(parts[2], 1, 31),
    month: expandCronField(parts[3], 1, 12),
    dayOfWeek: expandCronField(parts[4], 0, 7),
  };
}

function expandCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  }

  const values: number[] = [];

  if (field.includes(',')) {
    for (const part of field.split(',')) {
      values.push(...expandCronField(part, min, max));
    }
    return values;
  }

  if (field.includes('-') && !field.includes('/')) {
    const [start, end] = field.split('-').map(Number);
    for (let i = start; i <= end; i++) {
      values.push(i);
    }
    return values;
  }

  if (field.includes('/')) {
    const [range, stepStr] = field.split('/');
    const step = parseInt(stepStr);
    let start = min;
    let end = max;

    if (range !== '*') {
      if (range.includes('-')) {
        [start, end] = range.split('-').map(Number);
      } else {
        start = parseInt(range);
      }
    }

    for (let i = start; i <= end; i += step) {
      values.push(i);
    }
    return values;
  }

  return [parseInt(field)];
}

export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (!isValidCronField(minute, 0, 59)) return false;
  if (!isValidCronField(hour, 0, 23)) return false;
  if (!isValidCronField(dayOfMonth, 1, 31)) return false;
  if (!isValidCronField(month, 1, 12)) return false;
  if (!isValidCronField(dayOfWeek, 0, 7)) return false;

  return true;
}

function isValidCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;

  if (field.includes('/')) {
    const [range, step] = field.split('/');
    if (!/^\d+$/.test(step)) return false;
    if (range === '*') return true;
    return isValidCronField(range, min, max);
  }

  if (field.includes('-') && !field.includes(',')) {
    const [start, end] = field.split('-').map(Number);
    if (isNaN(start) || isNaN(end)) return false;
    return start >= min && end <= max && start <= end;
  }

  if (field.includes(',')) {
    return field.split(',').every((value) => isValidCronField(value.trim(), min, max));
  }

  const num = Number(field);
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

export function describeCronExpression(expression: string): string | null {
  if (!isValidCronExpression(expression)) {
    return null;
  }

  const parts = expression.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  const descriptions: string[] = [];

  if (minute === '*' && hour === '*') {
    descriptions.push('Every minute');
  } else if (minute === '0' && hour === '*') {
    descriptions.push('Every hour at minute 0');
  } else if (minute === '0' && hour === '0') {
    descriptions.push('Every day at midnight');
  } else if (minute !== '*' && hour !== '*') {
    if (hour.includes('-')) {
      descriptions.push(`At minute ${minute} from ${hour.split('-')[0]} to ${hour.split('-')[1]}`);
    } else {
      descriptions.push(`At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
    }
  } else if (hour === '*') {
    descriptions.push(`At minute ${minute} of every hour`);
  }

  if (dayOfMonth === '*' && dayOfWeek === '*') {
    descriptions.push('Every day');
  } else if (dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dayOfWeek.includes(',')) {
      const dayNames = dayOfWeek.split(',').map((day) => days[parseInt(day) % 7]);
      descriptions.push(`On ${dayNames.join(', ')}`);
    } else if (dayOfWeek.includes('-')) {
      const [start, end] = dayOfWeek.split('-').map(Number);
      descriptions.push(`On ${days[start]} through ${days[end]}`);
    } else {
      descriptions.push(`On ${days[parseInt(dayOfWeek) % 7]}`);
    }
  } else if (dayOfMonth !== '*') {
    descriptions.push(`On day ${dayOfMonth} of the month`);
  }

  return descriptions.join(' ') || 'Custom schedule';
}

export function getNextRunTime(expression: string, from: Date = new Date()): Date | null {
  if (!isValidCronExpression(expression)) {
    return null;
  }

  const current = new Date(from);
  current.setSeconds(0, 0);

  for (let i = 0; i < 525600; i++) {
    current.setMinutes(current.getMinutes() + 1);
    if (matchesCron(current, expression)) {
      return current;
    }
  }

  return null;
}

function matchesCron(date: Date, expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return (
    matchesField(date.getMinutes(), minute) &&
    matchesField(date.getHours(), hour) &&
    matchesField(date.getDate(), dayOfMonth) &&
    matchesField(date.getMonth() + 1, month) &&
    matchesField(date.getDay(), dayOfWeek)
  );
}

function matchesField(value: number, field: string): boolean {
  if (field === '*') return true;

  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = parseInt(step);
    if (range === '*') {
      return value % stepNum === 0;
    }
    const [start, end] = range.split('-').map(Number);
    return value >= start && value <= end && (value - start) % stepNum === 0;
  }

  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }

  if (field.includes(',')) {
    return field.split(',').some((fieldValue) => parseInt(fieldValue) === value);
  }

  return parseInt(field) === value;
}
