/**
 * Pure faculty search utilities for filtering, auto-complete suggestions, and pagination.
 * Synchronous in-memory operations with no side-effects or external dependencies.
 */

/**
 * Filter faculty list by search query (matches name and department).
 */
export function filterFaculties(faculties = [], query = "") {
  const trimmed = (query || "").trim().toLowerCase();
  if (!trimmed) return faculties;

  return faculties.filter((f) => {
    const name = (f?.name || "").toLowerCase();
    const department = (f?.department || "").toLowerCase();
    return `${name} ${department}`.includes(trimmed);
  });
}

/**
 * Generate unique suggestions (faculty name or department) for search auto-complete.
 */
export function getSearchSuggestions(faculties = [], query = "", limit = 8) {
  const trimmed = (query || "").trim().toLowerCase();
  if (!trimmed) return [];

  const matches = new Set();

  for (const f of faculties) {
    const name = (f?.name || "").trim();
    const dept = (f?.department || "").trim();

    if (name && name.toLowerCase().includes(trimmed)) {
      matches.add(name);
    }
    if (dept && dept.toLowerCase().includes(trimmed)) {
      matches.add(dept);
    }

    if (matches.size >= limit * 2) break; // early exit optimization
  }

  return Array.from(matches).slice(0, limit);
}

/**
 * Calculate pagination slices and total page count.
 */
export function paginate(items = [], page = 1, itemsPerPage = 8) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const currentItems = items.slice(startIndex, startIndex + itemsPerPage);

  return {
    currentItems,
    totalItems,
    totalPages,
    currentPage: safePage,
    startIndex,
  };
}
