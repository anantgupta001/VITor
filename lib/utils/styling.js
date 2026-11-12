/**
 * Visual and styling helpers for faculty score cards and details.
 */

/**
 * Traffic-light colour for a 1–5 score. Returns Tailwind text colour classes.
 * Green: ≥4, Yellow: 2.5 to <4, Red: <2.5
 * Note: Keep full Tailwind class strings here so purge/scanner identifies them.
 */
export function getScoreColorClass(score) {
  if (score == null || typeof score !== "number") {
    return "text-gray-600 dark:text-gray-400";
  }
  if (score >= 4) return "text-green-700 dark:text-green-400";
  if (score >= 2.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
