export const TZ = "Europe/Amsterdam";

const DATE_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const HOUR_LABEL_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function localDateKey(utcMs, tz = TZ) {
  return DATE_KEY_FORMAT.format(new Date(utcMs));
}

export function hourLabel(utcMs, tz = TZ) {
  return HOUR_LABEL_FORMAT.format(new Date(utcMs));
}

function offsetMinutes(utcMs, tz) {
  const parts = {};
  for (const part of OFFSET_FORMAT.formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcMs) / 60000;
}

export function zonedTimeToUtcMs(wall, tz = TZ) {
  const guess = Date.parse(`${wall}Z`);
  const first = offsetMinutes(guess, tz);
  let result = guess - first * 60000;
  const second = offsetMinutes(result, tz);
  if (second !== first) {
    result = guess - second * 60000;
  }
  return result;
}

export function apiDateRange(fromMs, tillMs) {
  return {
    fromDate: new Date(fromMs).toISOString(),
    tillDate: new Date(tillMs).toISOString().replace(/000Z$/, "999Z"),
  };
}

export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function groupByDay(entries, tz = TZ) {
  const days = new Map();
  for (const entry of entries) {
    const start = Date.parse(entry.readingDate);
    if (Number.isNaN(start) || typeof entry.price !== "number") continue;
    const key = localDateKey(start, tz);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push({ start, price: entry.price });
  }
  for (const list of days.values()) {
    list.sort((a, b) => a.start - b.start);
  }
  return days;
}

export function dayStats(prices) {
  if (prices.length === 0) return null;
  let min = prices[0];
  let max = prices[0];
  let total = 0;
  for (const point of prices) {
    if (point.price < min.price) min = point;
    if (point.price > max.price) max = point;
    total += point.price;
  }
  return { min, max, avg: total / prices.length };
}

export function cheapestBlock(prices, blockHours = 4) {
  if (prices.length < blockHours) return null;
  let best = null;
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i].price;
    if (i >= blockHours) {
      sum -= prices[i - blockHours].price;
    }
    if (i >= blockHours - 1) {
      const avg = sum / blockHours;
      if (best === null || avg < best.avg) {
        best = { startIndex: i - blockHours + 1, endIndex: i, avg };
      }
    }
  }
  return best;
}
