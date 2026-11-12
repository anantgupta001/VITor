/**
 * Static campus configuration and domain resolution helpers.
 * Consolidated single source of truth for all campus-related metadata.
 */

import {
  CAMPUSES,
  CAMPUS_SLUGS,
  EMAIL_DOMAIN_TO_CAMPUS,
  DUAL_CAMPUS_EMAIL_DOMAIN,
  DUAL_CAMPUS_SLUGS,
  ALLOWED_EMAIL_DOMAINS,
  COLLEGE_ID_REQUIRED_MESSAGE,
} from "./constants/campus.constants.js";

export {
  CAMPUSES,
  CAMPUS_SLUGS,
  EMAIL_DOMAIN_TO_CAMPUS,
  DUAL_CAMPUS_EMAIL_DOMAIN,
  DUAL_CAMPUS_SLUGS,
  ALLOWED_EMAIL_DOMAINS,
  COLLEGE_ID_REQUIRED_MESSAGE,
};

export function getAllCampuses() {
  return CAMPUSES;
}

export function getAllSlugs() {
  return CAMPUS_SLUGS;
}

export function getCampusBySlug(slug) {
  if (!slug) return null;
  return CAMPUSES.find((c) => c.slug === slug) ?? null;
}

export function isValidCampus(slug) {
  if (!slug) return false;
  return CAMPUS_SLUGS.includes(slug);
}

export function getCampusSlugFromEmail(email) {
  if (!email || typeof email !== "string") return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const domain = (parts[1] || "").toLowerCase();
  const slug = EMAIL_DOMAIN_TO_CAMPUS[domain];
  return slug === undefined ? null : slug;
}

export function isDualCampusEmail(email) {
  if (!email || typeof email !== "string") return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  return (parts[1] || "").toLowerCase() === DUAL_CAMPUS_EMAIL_DOMAIN;
}

export function getDualCampusOptions() {
  return DUAL_CAMPUS_SLUGS;
}
