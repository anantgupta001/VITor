/**
 * Campus and domain constants for VIT campuses.
 */

export const CAMPUSES = [
  { slug: "vit-ap", label: "AP Campus", shortLabel: "AP" },
  { slug: "vit-v", label: "Vellore Campus", shortLabel: "Vellore" },
  { slug: "vit-c", label: "Chennai Campus", shortLabel: "Chennai" },
  { slug: "vit-b", label: "Bhopal Campus", shortLabel: "Bhopal" },
];

export const CAMPUS_SLUGS = CAMPUSES.map((c) => c.slug);

/**
 * Mapping of official student email domains to campus slugs.
 * vitstudent.ac.in is shared by Vellore and Chennai, so it maps to null (requires user profile selection).
 */
export const EMAIL_DOMAIN_TO_CAMPUS = {
  "vitapstudent.ac.in": "vit-ap",
  "vitstudent.ac.in": null,
  "vitbhopal.ac.in": "vit-b",
};

/** All allowed student email domains for authentication */
export const ALLOWED_EMAIL_DOMAINS = Object.keys(EMAIL_DOMAIN_TO_CAMPUS);

export const DUAL_CAMPUS_EMAIL_DOMAIN = "vitstudent.ac.in";

export const DUAL_CAMPUS_SLUGS = ["vit-v", "vit-c"];

export const COLLEGE_ID_REQUIRED_MESSAGE =
  "Login with your college ID (VIT student email only).";
