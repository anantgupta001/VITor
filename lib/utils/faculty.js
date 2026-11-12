/**
 * Faculty-related helper utilities.
 */

/**
 * Return the faculty's photo URL or a deterministic avatar fallback.
 */
export function getFacultyPhoto(faculty) {
  const photo = faculty?.photo?.trim();
  if (photo) return photo;
  const name = faculty?.name?.trim() || "?";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=256&background=94a3b8&color=fff`;
}
