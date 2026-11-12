/**
 * Number and string formatting utilities.
 */

/**
 * Format count for compact display (e.g. 1.2k, 1.5M).
 * Handles null, 0, or raw counts gracefully.
 */
export function formatCompactNumber(num) {
  if (!num || num === 0) return "0";
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return num.toString();
}

/**
 * Format count for faculty detail (matches legacy formatCount behavior)
 */
export function formatCount(num) {
  if (typeof num !== "number") return num;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}
