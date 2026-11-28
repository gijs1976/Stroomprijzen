import {
  TZ,
  addDays,
  apiDateRange,
  cheapestBlock,
  dayStats,
  groupByDay,
  hourLabel,
  localDateKey,
  niceScale,
  withSurcharge,
  zonedTimeToUtcMs,
} from "./prices.js?v=17";

const API_URL = "https://api.energyzero.nl/v1/energyprices";
const HOUR_MS = 3600000;
const CHART_HEIGHT = 240;
const VISIBLE_HOURS = 24;
const EBT_KEY = "stroomprijzen.energiebelasting.v3";
const OPSLAG_KEY = "stroomprijzen.opslag.v3";
const DEFAULT_EBT = 0.11085;
const DEFAULT_OPSLAG = 0.02;

const DATE_LABEL_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const DATE_SHORT_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const state = {
  days: new Map(),
  selected: null,
  blockHours: 4,
  ebt: DEFAULT_EBT,
  opslag: DEFAULT_OPSLAG,
};

let pendingScrollDay = null;
let pendingScrollBlock = false;

const el = {
  prevDay: document.getElementById("prev-day"),
  nextDay: document.getElementById("next-day"),
  dateText: document.getElementById("date-text"),
  dateChip: document.getElementById("date-chip"),
  slider: document.getElementById("block-slider"),
  blockValue: document.getElementById("block-value"),
  ebt: document.getElementById("energiebelasting"),
  opslag: document.getElementById("opslag"),
  nowPrice: document.getElementById("now-price"),
  error: document.getElementById("error"),
  summary: document.getElementById("summary"),
  chart: document.getElementById("chart"),
  empty: document.getElementById("empty"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh"),
};

function dayKeys() {
  return [...state.days.keys()].sort();
}

function adjustedPrices(dayKey) {
  return withSurcharge(state.days.get(dayKey) ?? [], state.ebt + state.opslag);
}

function formatEur(value) {
  return `€${value.toFixed(3).replace(".", ",")}`;
}

function formatClock(utcMs) {
  return hourLabel(utcMs, TZ);
}

function dayPrefix(dayKey) {
  const today = localDateKey(Date.now(), TZ);
  if (dayKey === state.selected) return "";
  if (dayKey === today) return "vandaag ";
  if (dayKey === addDays(today, 1)) return "morgen ";
  if (dayKey === addDays(today, -1)) return "gisteren ";
  return `${DATE_SHORT_FORMAT.format(new Date(`${dayKey}T12:00:00Z`))} `;
}

function isCurrentHour(point, dayKey) {
  const now = Date.now();
  return dayKey === localDateKey(now, TZ)
    && now >= point.start
    && now < point.start + HOUR_MS;
}

function findCheapestBlock() {
  const today = localDateKey(Date.now(), TZ);
  const now = Date.now();
  const series = [];
  for (const key of dayKeys()) {
    if (key < today) continue;
    for (const point of state.days.get(key)) {
      if (point.start + HOUR_MS > now) {
        series.push({
          start: point.start,
          price: point.price + state.ebt + state.opslag,
        });
      }
    }
  }
  series.sort((a, b) => a.start - b.start);
  return cheapestBlock(series, state.blockHours);
}

function renderDateNav() {
  const today = localDateKey(Date.now(), TZ);
  el.dateText.textContent = DATE_LABEL_FORMAT.format(new Date(`${state.selected}T12:00:00Z`));
  if (state.selected === today) {
    el.dateChip.textContent = "vandaag";
    el.dateChip.hidden = false;
  } else if (state.selected === addDays(today, 1)) {
    el.dateChip.textContent = "morgen";
    el.dateChip.hidden = false;
  } else if (state.selected === addDays(today, -1)) {
    el.dateChip.textContent = "gisteren";
    el.dateChip.hidden = false;
  } else {
    el.dateChip.hidden = true;
  }
  el.prevDay.disabled = !state.days.has(addDays(state.selected, -1));
  el.nextDay.disabled = !state.days.has(addDays(state.selected, 1));
}

function goToDay(delta) {
  const target = addDays(state.selected, delta);
  if (!state.days.has(target)) return;
  state.selected = target;
  pendingScrollDay = target;
  renderDateNav();
  render();
}

function renderSummary(prices) {
  const stats = dayStats(prices);
  const block = findCheapestBlock();
  el.summary.innerHTML = "";

  let blockValue = "–";
  if (block) {
    const blockStart = block.start;
    const blockEnd = blockStart + state.blockHours * HOUR_MS;
    blockValue = `${dayPrefix(localDateKey(blockStart, TZ))}`
      + `${formatClock(blockStart)} – ${formatClock(blockEnd)}`
      + ` · gem. ${formatEur(block.avg)}`;
  }

  const cards = [
    {
      label: `Goedkoopste ${state.blockHours}-uurs blok (vanaf nu)`,
      value: blockValue,
      highlight: true,
    },
    { label: "Gemiddeld", value: formatEur(stats.avg) },
    { label: "Laagste uur", value: `${formatEur(stats.min.price)} · ${formatClock(stats.min.start)}` },
    { label: "Hoogste uur", value: `${formatEur(stats.max.price)} · ${formatClock(stats.max.start)}` },
  ];

  for (const card of cards) {
    const div = document.createElement("div");
    div.className = "card" + (card.highlight ? " highlight" : "");
    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = card.label;
    const value = document.createElement("div");
    value.className = "card-value";
    value.textContent = card.value;
    div.append(label, value);
    el.summary.appendChild(div);
  }
}

function renderChart() {
  const prevScroller = el.chart.querySelector(".scroller");
  const prevScroll = prevScroller ? prevScroller.scrollLeft : null;

  el.chart.innerHTML = "";
  const keys = dayKeys();
  if (keys.length === 0) return;

  const block = findCheapestBlock();
  const blockStart = block ? block.start : null;
  const blockEnd = block ? blockStart + state.blockHours * HOUR_MS : null;

  let maxPrice = 0;
  let minPrice = Infinity;
  let totalSlots = 0;
  for (const key of keys) {
    for (const point of state.days.get(key)) {
      maxPrice = Math.max(maxPrice, point.price);
      minPrice = Math.min(minPrice, point.price);
      totalSlots += 1;
    }
  }
  const { yMax, step } = niceScale(maxPrice);
  const span = Math.max(maxPrice - minPrice, 0.0001);

  const yAxis = document.createElement("div");
  yAxis.className = "y-axis";
  const divisions = Math.round(yMax / step);
  for (let n = 1; n <= divisions; n++) {
    const value = Number((n * step).toFixed(2));
    const label = document.createElement("span");
    label.className = "gridline-label";
    label.style.bottom = `${(value / yMax) * CHART_HEIGHT}px`;
    label.textContent = `€${value.toFixed(2).replace(".", ",")}`;
    yAxis.appendChild(label);
  }

  const scroller = document.createElement("div");
  scroller.className = "scroller";
  const inner = document.createElement("div");
  inner.className = "chart-inner";
  inner.style.width = `${(totalSlots / VISIBLE_HOURS) * 100}%`;

  const bars = document.createElement("div");
  bars.className = "bars";
  for (let n = 1; n <= divisions; n++) {
    const value = Number((n * step).toFixed(2));
    const line = document.createElement("div");
    line.className = "gridline";
    line.style.bottom = `${(value / yMax) * 100}%`;
    bars.appendChild(line);
  }

  const hours = document.createElement("div");
  hours.className = "hours";

  const days = document.createElement("div");
  days.className = "days";

  const dayStartSlots = new Map();
  const dayBoundarySlots = [];
  let slotIndex = 0;
  for (const key of keys) {
    dayStartSlots.set(key, slotIndex);
    if (slotIndex > 0) dayBoundarySlots.push({ key, slot: slotIndex });
    for (const point of state.days.get(key)) {
      const adjusted = point.price + state.ebt + state.opslag;
      const ratio = (point.price - minPrice) / span;
      const bar = document.createElement("div");
      bar.className = "bar";
      if (blockStart !== null && point.start >= blockStart && point.start < blockEnd) {
        bar.classList.add("in-block");
      }
      if (isCurrentHour(point, key)) bar.classList.add("now");
      bar.style.setProperty("--height", `${Math.min(100, Math.max(0, (adjusted / yMax) * 100))}%`);
      bar.style.setProperty("--hue", `${120 - ratio * 120}`);

      const fill = document.createElement("div");
      fill.className = "bar-fill";
      const tooltip = `${formatClock(point.start)} – ${formatClock(point.start + HOUR_MS)}\n${formatEur(adjusted)}/kWh`;
      bar.title = tooltip;
      bar.setAttribute("aria-label", tooltip);
      bar.appendChild(fill);
      bars.appendChild(bar);

      const hour = document.createElement("div");
      hour.className = "hour-label";
      if ((point.start / 60000) % 60 === 0) {
        hour.textContent = formatClock(point.start).slice(0, 2);
      }
      hours.appendChild(hour);

      const daySlot = document.createElement("div");
      daySlot.className = "day-slot";
      if (slotIndex === dayStartSlots.get(key)) {
        daySlot.classList.add("day-label");
        daySlot.textContent = `${key.slice(8, 10)}/${key.slice(5, 7)}`;
      }
      days.appendChild(daySlot);
      slotIndex += 1;
    }
  }

  inner.append(days, bars, hours);
  scroller.appendChild(inner);

  const body = document.createElement("div");
  body.className = "chart-body";
  body.appendChild(scroller);
  el.chart.append(yAxis, body);

  const slotWidth = scroller.scrollWidth / totalSlots;

  for (const { key, slot } of dayBoundarySlots) {
    const firstBar = bars.children[divisions + slot];
    if (!firstBar) continue;
    const line = document.createElement("div");
    line.className = "day-line";
    line.style.left = `${firstBar.offsetLeft - 1}px`;
    bars.appendChild(line);
  }

  const syncSelectedDay = () => {
    const firstSlot = Math.round(scroller.scrollLeft / slotWidth);
    let current = keys[0];
    for (const key of keys) {
      if (dayStartSlots.get(key) <= firstSlot) current = key;
    }
    if (current !== state.selected) {
      state.selected = current;
      renderDateNav();
      renderSummary(adjustedPrices(current));
    }
  };

  let scrollTimer = null;
  scroller.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncSelectedDay, 150);
  });

  let drag = null;
  scroller.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    drag = { x: event.clientX, scroll: scroller.scrollLeft };
    scroller.setPointerCapture(event.pointerId);
    scroller.classList.add("dragging");
  });
  scroller.addEventListener("pointermove", (event) => {
    if (!drag) return;
    scroller.scrollLeft = drag.scroll - (event.clientX - drag.x);
  });
  const endDrag = () => {
    drag = null;
    scroller.classList.remove("dragging");
  };
  scroller.addEventListener("pointerup", endDrag);
  scroller.addEventListener("pointercancel", endDrag);

  const targetDay = pendingScrollDay;
  pendingScrollDay = null;
  if (pendingScrollBlock && blockStart !== null) {
    pendingScrollBlock = false;
    const firstBlockBar = bars.querySelector(".in-block");
    if (firstBlockBar) {
      const center = firstBlockBar.offsetLeft + firstBlockBar.offsetWidth / 2;
      scroller.scrollLeft = center - scroller.clientWidth / 2;
      return;
    }
  }
  pendingScrollBlock = false;
  if (state.days.has(targetDay)) {
    scroller.scrollLeft = dayStartSlots.get(targetDay) * slotWidth;
  } else if (prevScroll !== null) {
    scroller.scrollLeft = prevScroll;
  }
}

function renderEmpty(dayKey) {
  el.summary.innerHTML = "";
  el.chart.innerHTML = "";
  el.slider.disabled = true;
  el.empty.hidden = false;
  el.empty.textContent = dayKey === localDateKey(Date.now(), TZ)
    ? "Er zijn nog geen prijzen voor vandaag bekend."
    : "Voor deze datum zijn (nog) geen prijzen beschikbaar.";
}

function renderNowPrice() {
  const today = localDateKey(Date.now(), TZ);
  const raw = state.days.get(today) ?? [];
  const now = Date.now();
  const point = raw.find((p) => now >= p.start && now < p.start + HOUR_MS);
  if (!point) {
    el.nowPrice.hidden = true;
    return;
  }
  const price = point.price + state.ebt + state.opslag;
  el.nowPrice.innerHTML = "";
  const label = document.createElement("span");
  label.className = "now-price-label";
  label.textContent = `Actuele prijs (${formatClock(point.start)} – ${formatClock(point.start + HOUR_MS)})`;
  const value = document.createElement("span");
  value.className = "now-price-value";
  value.textContent = `${formatEur(price)}/kWh`;
  el.nowPrice.append(label, value);
  el.nowPrice.hidden = false;
}

function render() {
  const raw = state.days.get(state.selected) ?? [];
  const prices = withSurcharge(raw, state.ebt + state.opslag);
  el.empty.hidden = true;
  el.slider.disabled = raw.length === 0;
  renderNowPrice();
  if (raw.length === 0) {
    renderEmpty(state.selected);
    return;
  }
  renderSummary(prices);
  renderChart();
}

function renderUpdated() {
  el.updated.textContent = `Laatst vernieuwd om ${new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date())}`;
}

async function load() {
  el.error.hidden = true;
  el.refresh.disabled = true;
  try {
    const today = localDateKey(Date.now(), TZ);
    const from = new Date(zonedTimeToUtcMs(`${addDays(today, -1)}T00:00:00`, TZ));
    const till = new Date(zonedTimeToUtcMs(`${addDays(today, 2)}T00:00:00`, TZ) - 1);
    const { fromDate, tillDate } = apiDateRange(from.getTime(), till.getTime());
    const params = new URLSearchParams({
      fromDate,
      tillDate,
      interval: "4",
      usageType: "1",
      inclBtw: "true",
    });
    const response = await fetch(`${API_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`EnergyZero API antwoordde met status ${response.status}`);
    }
    const data = await response.json();
    state.days = groupByDay(data.Prices ?? [], TZ);
    state.selected = state.selected ?? today;
    if (!state.days.has(today) && state.days.size > 0) {
      state.selected = dayKeys().at(-1);
    }
    pendingScrollDay = state.selected;
    renderDateNav();
    render();
    renderUpdated();
  } catch (error) {
    el.error.textContent = `Ophalen van stroomprijzen mislukt: ${error.message}`;
    el.error.hidden = false;
  } finally {
    el.refresh.disabled = false;
  }
}

el.prevDay.addEventListener("click", () => goToDay(-1));
el.nextDay.addEventListener("click", () => goToDay(1));

el.slider.addEventListener("input", () => {
  state.blockHours = Number(el.slider.value);
  el.blockValue.textContent = `${state.blockHours} uur`;
  pendingScrollBlock = true;
  render();
});

el.ebt.addEventListener("input", () => {
  state.ebt = Number(el.ebt.value);
  if (!Number.isFinite(state.ebt)) state.ebt = 0;
  try {
    localStorage.setItem(EBT_KEY, String(state.ebt));
  } catch {}
  render();
});

el.opslag.addEventListener("input", () => {
  state.opslag = Number(el.opslag.value) || 0;
  try {
    localStorage.setItem(OPSLAG_KEY, String(state.opslag));
  } catch {}
  render();
});

el.refresh.addEventListener("click", load);

function readNumber(key, fallback) {
  try {
    if (localStorage.getItem(key) !== null) {
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored)) return stored;
    }
  } catch {}
  return fallback;
}

state.ebt = readNumber(EBT_KEY, DEFAULT_EBT);
state.opslag = readNumber(OPSLAG_KEY, DEFAULT_OPSLAG);
el.ebt.value = state.ebt.toFixed(5);
el.opslag.value = state.opslag.toFixed(2);

setInterval(renderNowPrice, 60000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

load();
