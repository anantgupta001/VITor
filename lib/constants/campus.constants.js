/**
 * Campus and domain constants for VIT campuses.
 *
 * Final Approved Policy:
 * - vitapstudent.ac.in -> vit-ap
 * - vitbhopal.ac.in -> vit-b
 * - vitstudent.ac.in -> vit-vc (interchangeable access to BOTH vit-v and vit-c)
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
 * vitstudent.ac.in is shared by Vellore and Chennai (maps to null for single slug).
 */
export const EMAIL_DOMAIN_TO_CAMPUS = {
  "vitapstudent.ac.in": "vit-ap",
  "vitstudent.ac.in": null,
  "vitbhopal.ac.in": "vit-b",
};

/**
 * Canonical domain-to-authorization-group mapping.
 */
export const DOMAIN_TO_AUTH_GROUP = {
  "vitapstudent.ac.in": "vit-ap",
  "vitbhopal.ac.in": "vit-b",
  "vitstudent.ac.in": "vit-vc",
};

/**
 * Authorization group to allowed campus slugs.
 */
export const AUTH_GROUP_TO_CAMPUSES = {
  "vit-ap": ["vit-ap"],
  "vit-b": ["vit-b"],
  "vit-vc": ["vit-v", "vit-c"],
};

/** All allowed student email domains for authentication */
export const ALLOWED_EMAIL_DOMAINS = Object.keys(DOMAIN_TO_AUTH_GROUP);

export const DUAL_CAMPUS_EMAIL_DOMAIN = "vitstudent.ac.in";

export const DUAL_CAMPUS_SLUGS = ["vit-v", "vit-c"];

export const COLLEGE_ID_REQUIRED_MESSAGE =
  "Please use your VIT college email ID to sign in.";
