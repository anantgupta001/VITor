/**
 * Faculty-related helpers (e.g. default avatar when photo is missing).
 */
export function getFacultyPhoto(faculty) {
  const photo = faculty?.photo?.trim();
  if (photo) return photo;
  const name = (faculty?.name || "?").trim();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=94a3b8&color=fff`;
}

/**
 * Traffic-light colour for a 1–5 score. Returns Tailwind text colour classes.
 * Green: ≥4, Yellow: 2.5 to <4, Red: <2.5
 * (Keep these class names here so Tailwind includes them when scanning lib/)
 */
export function getScoreColorClass(score) {
  if (score == null || typeof score !== "number") return "text-gray-600 dark:text-gray-400";
  if (score >= 4) return "text-green-700 dark:text-green-400";
  if (score >= 2.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
