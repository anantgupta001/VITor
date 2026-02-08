/**
 * VIT campus slugs and display labels.
 * Firestore: campuses/{slug}/faculties, campuses/{slug}/faculties/{id}/reviews
 */
export const CAMPUSES = [
  { slug: "vit-ap", label: "AP Campus", shortLabel: "AP" },
  { slug: "vit-v", label: "Vellore Campus", shortLabel: "Vellore" },
  { slug: "vit-c", label: "Chennai Campus", shortLabel: "Chennai" },
  { slug: "vit-b", label: "Bhopal Campus", shortLabel: "Bhopal" },
];

export const CAMPUS_SLUGS = CAMPUSES.map((c) => c.slug);

export function getCampusBySlug(slug) {
  return CAMPUSES.find((c) => c.slug === slug) ?? null;
}

export function isValidCampus(slug) {
  return CAMPUS_SLUGS.includes(slug);
}

/**
 * Map student email domain to campus slug. Used to restrict reviews to own campus.
 * vitstudent.ac.in is used by both Vellore and Chennai → returns null; user must pick in profile.
 */
const EMAIL_DOMAIN_TO_CAMPUS = {
  "vitapstudent.ac.in": "vit-ap",
  "vitstudent.ac.in": null, // Vellore & Chennai share this; campus comes from user profile
  "vitbhopal.ac.in": "vit-b",
};

/** Domains that don't map to a single campus; user must select campus (stored in Firestore). */
export const DUAL_CAMPUS_EMAIL_DOMAIN = "vitstudent.ac.in";

/** Campus options for dual-campus domain (Vellore / Chennai). */
export const DUAL_CAMPUS_SLUGS = ["vit-v", "vit-c"];

export function getCampusSlugFromEmail(email) {
  if (!email || typeof email !== "string") return null;
  const domain = (email.split("@")[1] || "").toLowerCase();
  const slug = EMAIL_DOMAIN_TO_CAMPUS[domain];
  return slug === undefined ? null : slug;
}

export function isDualCampusEmail(email) {
  if (!email || typeof email !== "string") return false;
  return (email.split("@")[1] || "").toLowerCase() === DUAL_CAMPUS_EMAIL_DOMAIN;
}
