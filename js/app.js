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
  zonedTimeToUtcMs,
} from "./prices.js?v=3";

const API_URL = "https://api.energyzero.nl/v1/energyprices";
const HOUR_MS = 3600000;

const state = { days: new Map(), selected: null, blockHours: 4 };

const el = {
  tabs: document.getElementById("day-tabs"),
  slider: document.getElementById("block-slider"),
  blockValue: document.getElementById("block-value"),
  error: document.getElementById("error"),
  summary: document.getElementById("summary"),
  chart: document.getElementById("chart"),
  empty: document.getElementById("empty"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh"),
};

function formatEur(value) {
  return `€${value.toFixed(3).replace(".", ",")}`;
}

function formatClock(utcMs) {
  return hourLabel(utcMs, TZ);
}

function blockLabel(block, prices) {
  const start = prices[block.startIndex].start;
  const end = prices[block.endIndex].start + HOUR_MS;
  return `${formatClock(start)} – ${formatClock(end)}`;
}

function isCurrentHour(point, dayKey) {
  return dayKey === localDateKey(Date.now(), TZ)
    && Date.now() >= point.start
    && Date.now() < point.start + HOUR_MS;
}

function renderTabs() {
  const today = localDateKey(Date.now(), TZ);
  const tomorrow = addDays(today, 1);
  el.tabs.innerHTML = "";
  for (const [key, label] of [[today, "Vandaag"], [tomorrow, "Morgen"]]) {
    const button = document.createElement("button");
    button.className = "tab" + (key === state.selected ? " active" : "");
    button.textContent = label;
    button.disabled = !state.days.has(key);
    button.addEventListener("click", () => {
      state.selected = key;
      renderTabs();
      render();
    });
    el.tabs.appendChild(button);
  }
}

function renderSummary(prices) {
  const stats = dayStats(prices);
  const block = cheapestBlock(prices, state.blockHours);
  el.summary.innerHTML = "";

  const cards = [
    { label: "Gemiddeld", value: formatEur(stats.avg) },
    { label: "Laagste uur", value: `${formatEur(stats.min.price)} · ${formatClock(stats.min.start)}` },
    { label: "Hoogste uur", value: `${formatEur(stats.max.price)} · ${formatClock(stats.max.start)}` },
    {
      label: `Goedkoopste ${state.blockHours}-uurs blok`,
      value: block ? `${blockLabel(block, prices)} · gem. ${formatEur(block.avg)}` : "–",
      highlight: true,
    },
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

function renderChart(prices) {
  el.chart.innerHTML = "";
  const stats = dayStats(prices);
  const block = cheapestBlock(prices, state.blockHours);
  const span = Math.max(stats.max.price - stats.min.price, 0.0001);
  const { yMax, step } = niceScale(stats.max.price);

  const bars = document.createElement("div");
  bars.className = "bars";

  const divisions = Math.round(yMax / step);
  for (let n = 1; n <= divisions; n++) {
    const value = Number((n * step).toFixed(2));
    const position = `${(value / yMax) * 100}%`;
    const line = document.createElement("div");
    line.className = "gridline";
    line.style.bottom = position;
    const label = document.createElement("span");
    label.className = "gridline-label";
    label.style.bottom = position;
    label.textContent = `€${value.toFixed(2).replace(".", ",")}`;
    bars.append(line, label);
  }

  const hours = document.createElement("div");
  hours.className = "hours";

  for (let i = 0; i < prices.length; i++) {
    const point = prices[i];
    const ratio = (point.price - stats.min.price) / span;
    const bar = document.createElement("div");
    bar.className = "bar";
    if (block && i >= block.startIndex && i <= block.endIndex) bar.classList.add("in-block");
    if (isCurrentHour(point, state.selected)) bar.classList.add("now");
    bar.style.setProperty("--height", `${Math.min(100, Math.max(0, (point.price / yMax) * 100))}%`);
    bar.style.setProperty("--hue", `${120 - ratio * 120}`);

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    const tooltip = `${formatClock(point.start)} – ${formatClock(point.start + HOUR_MS)}\n${formatEur(point.price)}/kWh`;
    bar.title = tooltip;
    bar.setAttribute("aria-label", tooltip);
    bar.appendChild(fill);
    bars.appendChild(bar);

    const hour = document.createElement("div");
    hour.className = "hour-label";
    hour.textContent = formatClock(point.start).slice(0, 2);
    hours.appendChild(hour);
  }

  el.chart.append(bars, hours);
}

function renderEmpty(dayKey) {
  el.summary.innerHTML = "";
  el.chart.innerHTML = "";
  el.slider.disabled = true;
  el.empty.hidden = false;
  el.empty.textContent = dayKey === localDateKey(Date.now(), TZ)
    ? "Er zijn nog geen prijzen voor vandaag bekend."
    : "De prijzen voor morgen zijn nog niet gepubliceerd. EnergyZero publiceert deze meestal in de namiddag.";
}

function render() {
  const prices = state.days.get(state.selected) ?? [];
  el.empty.hidden = true;
  el.slider.disabled = prices.length === 0;
  if (prices.length === 0) {
    renderEmpty(state.selected);
    return;
  }
  renderSummary(prices);
  renderChart(prices);
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
    const from = new Date(zonedTimeToUtcMs(`${today}T00:00:00`, TZ));
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
      state.selected = [...state.days.keys()][0];
    }
    renderTabs();
    render();
    renderUpdated();
  } catch (error) {
    el.error.textContent = `Ophalen van stroomprijzen mislukt: ${error.message}`;
    el.error.hidden = false;
  } finally {
    el.refresh.disabled = false;
  }
}

el.slider.addEventListener("input", () => {
  state.blockHours = Number(el.slider.value);
  el.blockValue.textContent = `${state.blockHours} uur`;
  render();
});

el.refresh.addEventListener("click", load);
load();
