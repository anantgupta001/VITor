import test from "node:test";
import assert from "node:assert/strict";
import { formatCompactNumber, formatCount } from "../lib/utils/formatters.js";

// ============================================================================
// formatCompactNumber() tests
// ============================================================================

test("formatCompactNumber - handles zero, null, and undefined", () => {
  assert.equal(formatCompactNumber(0), "0");
  assert.equal(formatCompactNumber(null), "0");
  assert.equal(formatCompactNumber(undefined), "0");
});

test("formatCompactNumber - handles negative values", () => {
  assert.equal(formatCompactNumber(-5), "-5");
  assert.equal(formatCompactNumber(-999), "-999");
  assert.equal(formatCompactNumber(-1500), "-1500");
});

test("formatCompactNumber - handles values below 1000", () => {
  assert.equal(formatCompactNumber(1), "1");
  assert.equal(formatCompactNumber(42), "42");
  assert.equal(formatCompactNumber(500), "500");
  assert.equal(formatCompactNumber(999), "999");
});

test("formatCompactNumber - handles exactly 1000 and boundary values", () => {
  assert.equal(formatCompactNumber(1000), "1k");
  assert.equal(formatCompactNumber(1049), "1k"); // (1049/1000).toFixed(1) = 1.0 -> 1k
  assert.equal(formatCompactNumber(1099), "1.1k");
  assert.equal(formatCompactNumber(1200), "1.2k");
  assert.equal(formatCompactNumber(1500), "1.5k");
  assert.equal(formatCompactNumber(1999), "2k"); // (1999/1000).toFixed(1) = 2.0 -> 2k
  assert.equal(formatCompactNumber(10000), "10k");
  assert.equal(formatCompactNumber(999999), "1000k");
});

test("formatCompactNumber - handles millions", () => {
  assert.equal(formatCompactNumber(1000000), "1M");
  assert.equal(formatCompactNumber(1200000), "1.2M");
  assert.equal(formatCompactNumber(1500000), "1.5M");
  assert.equal(formatCompactNumber(2000000), "2M");
});

test("formatCompactNumber - handles decimal numbers below 1000", () => {
  assert.equal(formatCompactNumber(3.5), "3.5");
  assert.equal(formatCompactNumber(0.8), "0.8");
});

// ============================================================================
// formatCount() tests
// ============================================================================

test("formatCount - handles non-number inputs (returns unchanged)", () => {
  assert.equal(formatCount(null), null);
  assert.equal(formatCount(undefined), undefined);
  assert.equal(formatCount("100"), "100");
});

test("formatCount - handles zero and negative values", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(-10), "-10");
  assert.equal(formatCount(-1500), "-1500");
});

test("formatCount - handles values below 1000", () => {
  assert.equal(formatCount(1), "1");
  assert.equal(formatCount(42), "42");
  assert.equal(formatCount(500), "500");
  assert.equal(formatCount(999), "999");
});

test("formatCount - handles exactly 1000 and boundary values", () => {
  // Note: formatCount uses .toFixed(1) without stripping trailing .0
  assert.equal(formatCount(1000), "1.0k");
  assert.equal(formatCount(1049), "1.0k");
  assert.equal(formatCount(1200), "1.2k");
  assert.equal(formatCount(1500), "1.5k");
});

test("formatCount - handles millions with thousand-formatting", () => {
  assert.equal(formatCount(1000000), "1000.0k");
});

test("formatCount - handles decimal values below 1000", () => {
  assert.equal(formatCount(4.5), "4.5");
  assert.equal(formatCount(0.5), "0.5");
});
