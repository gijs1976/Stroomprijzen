import test from "node:test";
import assert from "node:assert/strict";

import {
  TZ,
  addDays,
  apiDateRange,
  cheapestBlock,
  dayStats,
  groupByDay,
  hourLabel,
  localDateKey,
  zonedTimeToUtcMs,
} from "../js/prices.js";

test("addDays schuift over maand- en jaargrenzen", () => {
  assert.equal(addDays("2026-11-27", 1), "2026-11-28");
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("localDateKey geeft de datum in Europe/Amsterdam", () => {
  assert.equal(localDateKey(Date.parse("2026-11-27T00:30:00Z"), TZ), "2026-11-27");
  assert.equal(localDateKey(Date.parse("2026-11-27T22:30:00Z"), TZ), "2026-11-27");
  assert.equal(localDateKey(Date.parse("2026-11-27T23:30:00Z"), TZ), "2026-11-28");
  assert.equal(localDateKey(Date.parse("2026-06-15T22:30:00Z"), TZ), "2026-06-16");
});

test("hourLabel gebruikt een 24-uurs klok in Amsterdam", () => {
  assert.equal(hourLabel(Date.parse("2026-11-27T00:30:00Z"), TZ), "01:30");
  assert.equal(hourLabel(Date.parse("2026-11-27T09:30:00Z"), TZ), "10:30");
});

test("zonedTimeToUtcMs rekent lokale middernacht om naar UTC", () => {
  assert.equal(
    zonedTimeToUtcMs("2026-11-27T00:00:00", TZ),
    Date.parse("2026-11-26T23:00:00Z"),
  );
  assert.equal(
    zonedTimeToUtcMs("2026-06-15T00:00:00", TZ),
    Date.parse("2026-06-14T22:00:00Z"),
  );
});

test("groupByDay verdeelt 48 uurprijzen over twee dagen", () => {
  const entries = [];
  for (let h = 0; h < 48; h++) {
    entries.push({
      readingDate: new Date(Date.parse("2026-11-26T23:00:00Z") + h * 3600000).toISOString(),
      price: 0.2 + (h % 24) / 100,
    });
  }
  const days = groupByDay(entries, TZ);
  assert.deepEqual([...days.keys()], ["2026-11-27", "2026-11-28"]);
  assert.equal(days.get("2026-11-27").length, 24);
  assert.equal(days.get("2026-11-27")[0].price, 0.2);
});

test("apiDateRange bouwt geldige ISO-tijdstempels", () => {
  const from = Date.parse("2026-11-26T23:00:00Z");
  const till = Date.parse("2026-11-28T22:59:59.999Z");
  const range = apiDateRange(from, till);
  assert.equal(range.fromDate, "2026-11-26T23:00:00.000Z");
  assert.equal(range.tillDate, "2026-11-28T22:59:59.999Z");
  assert.match(range.fromDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(range.tillDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("dayStats berekent minimum, maximum en gemiddelde", () => {
  const prices = [
    { start: 0, price: 0.3 },
    { start: 3600000, price: 0.1 },
    { start: 7200000, price: 0.4 },
    { start: 10800000, price: 0.2 },
  ];
  const stats = dayStats(prices);
  assert.equal(stats.min.price, 0.1);
  assert.equal(stats.max.price, 0.4);
  assert.equal(stats.avg, 0.25);
  assert.equal(dayStats([]), null);
});

test("cheapestBlock vindt het goedkoopste aaneengesloten 4-uurs blok", () => {
  const prices = [0.4, 0.3, 0.1, 0.1, 0.5, 0.1, 0.9, 0.1].map((price, i) => ({
    start: i * 3600000,
    price,
  }));
  const block = cheapestBlock(prices, 4);
  assert.equal(block.startIndex, 2);
  assert.equal(block.endIndex, 5);
  assert.ok(Math.abs(block.avg - 0.2) < 1e-9);
});

test("cheapestBlock geeft bij gelijkestand het eerste blok", () => {
  const prices = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2].map((price, i) => ({
    start: i * 3600000,
    price,
  }));
  const block = cheapestBlock(prices, 4);
  assert.equal(block.startIndex, 0);
});

test("cheapestBlock geeft null bij te weinig uren", () => {
  assert.equal(cheapestBlock([{ start: 0, price: 0.2 }], 4), null);
});
