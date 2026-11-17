import test from "node:test";
import assert from "node:assert/strict";
import {
  getAllCampuses,
  getAllSlugs,
  getCampusBySlug,
  isValidCampus,
  getDualCampusOptions,
  getCampusSlugFromEmail,
  isDualCampusEmail,
  getAuthGroupForEmail,
  getAuthorizedCampusesForEmail,
  isCampusAuthorizedForEmail,
} from "../lib/campus.js";

test("getAllCampuses - returns all 4 configured campuses", () => {
  const campuses = getAllCampuses();
  assert.equal(Array.isArray(campuses), true);
  assert.equal(campuses.length, 4);

  const slugs = campuses.map((c) => c.slug);
  assert.deepEqual(slugs, ["vit-ap", "vit-v", "vit-c", "vit-b"]);

  for (const campus of campuses) {
    assert.equal(typeof campus.slug, "string");
    assert.equal(typeof campus.label, "string");
    assert.equal(typeof campus.shortLabel, "string");
  }
});

test("getAllSlugs - returns all campus slug strings", () => {
  const slugs = getAllSlugs();
  assert.deepEqual(slugs, ["vit-ap", "vit-v", "vit-c", "vit-b"]);
});

test("getCampusBySlug - handles valid, invalid, and null inputs", () => {
  // Valid slugs
  const ap = getCampusBySlug("vit-ap");
  assert.equal(ap?.slug, "vit-ap");
  assert.equal(ap?.label, "AP Campus");

  const vellore = getCampusBySlug("vit-v");
  assert.equal(vellore?.slug, "vit-v");

  const chennai = getCampusBySlug("vit-c");
  assert.equal(chennai?.slug, "vit-c");

  const bhopal = getCampusBySlug("vit-b");
  assert.equal(bhopal?.slug, "vit-b");

  // Invalid slugs
  assert.equal(getCampusBySlug("vit-unknown"), null);
  assert.equal(getCampusBySlug("vit"), null);
  assert.equal(getCampusBySlug(""), null);

  // Null, undefined, and non-string inputs
  assert.equal(getCampusBySlug(null), null);
  assert.equal(getCampusBySlug(undefined), null);
  assert.equal(getCampusBySlug(123), null);
});

test("isValidCampus - validates campus slug membership", () => {
  // Valid
  assert.equal(isValidCampus("vit-ap"), true);
  assert.equal(isValidCampus("vit-v"), true);
  assert.equal(isValidCampus("vit-c"), true);
  assert.equal(isValidCampus("vit-b"), true);

  // Invalid
  assert.equal(isValidCampus("vit-xyz"), false);
  assert.equal(isValidCampus("vitap"), false);
  assert.equal(isValidCampus(""), false);
  assert.equal(isValidCampus(null), false);
  assert.equal(isValidCampus(undefined), false);
  assert.equal(isValidCampus(42), false);
});

test("getDualCampusOptions - returns Vellore and Chennai slugs", () => {
  const options = getDualCampusOptions();
  assert.deepEqual(options, ["vit-v", "vit-c"]);
});

test("getCampusSlugFromEmail - handles uppercase, malformed, and non-string inputs", () => {
  // Standard lowercase
  assert.equal(getCampusSlugFromEmail("student@vitapstudent.ac.in"), "vit-ap");
  assert.equal(getCampusSlugFromEmail("student@vitbhopal.ac.in"), "vit-b");
  assert.equal(getCampusSlugFromEmail("student@vitstudent.ac.in"), null); // Dual campus maps to null

  // Uppercase and mixed case
  assert.equal(getCampusSlugFromEmail("STUDENT@VITAPSTUDENT.AC.IN"), "vit-ap");
  assert.equal(getCampusSlugFromEmail("User.Name@VitBhopal.ac.in"), "vit-b");
  assert.equal(getCampusSlugFromEmail("STUDENT@VITSTUDENT.AC.IN"), null);

  // Unallowed domains
  assert.equal(getCampusSlugFromEmail("user@gmail.com"), null);
  assert.equal(getCampusSlugFromEmail("user@vit.ac.in"), null);

  // Malformed emails
  assert.equal(getCampusSlugFromEmail("not-an-email"), null);
  assert.equal(getCampusSlugFromEmail(""), null);

  // Non-string inputs
  assert.equal(getCampusSlugFromEmail(null), null);
  assert.equal(getCampusSlugFromEmail(undefined), null);
  assert.equal(getCampusSlugFromEmail(12345), null);
  assert.equal(getCampusSlugFromEmail({}), null);
});

test("isDualCampusEmail - validates dual campus email addresses", () => {
  // Valid dual campus
  assert.equal(isDualCampusEmail("student@vitstudent.ac.in"), true);
  assert.equal(isDualCampusEmail("STUDENT@VITSTUDENT.AC.IN"), true);
  assert.equal(isDualCampusEmail("user.2023@VitStudent.ac.in"), true);

  // Single campus
  assert.equal(isDualCampusEmail("student@vitapstudent.ac.in"), false);
  assert.equal(isDualCampusEmail("student@vitbhopal.ac.in"), false);

  // Non-college email
  assert.equal(isDualCampusEmail("student@gmail.com"), false);

  // Malformed and non-string inputs
  assert.equal(isDualCampusEmail("not-an-email"), false);
  assert.equal(isDualCampusEmail(""), false);
  assert.equal(isDualCampusEmail(null), false);
  assert.equal(isDualCampusEmail(undefined), false);
  assert.equal(isDualCampusEmail(999), false);
});

test("Campus Helpers - getAuthGroupForEmail & getAuthorizedCampusesForEmail", () => {
  // vitapstudent.ac.in
  assert.equal(getAuthGroupForEmail("student@vitapstudent.ac.in"), "vit-ap");
  assert.deepEqual(getAuthorizedCampusesForEmail("student@vitapstudent.ac.in"), ["vit-ap"]);

  // vitbhopal.ac.in
  assert.equal(getAuthGroupForEmail("student@vitbhopal.ac.in"), "vit-b");
  assert.deepEqual(getAuthorizedCampusesForEmail("student@vitbhopal.ac.in"), ["vit-b"]);

  // vitstudent.ac.in -> vit-vc (dual campus)
  assert.equal(getAuthGroupForEmail("student@vitstudent.ac.in"), "vit-vc");
  assert.deepEqual(getAuthorizedCampusesForEmail("student@vitstudent.ac.in"), ["vit-v", "vit-c"]);

  // Unknown / invalid
  assert.equal(getAuthGroupForEmail("user@gmail.com"), null);
  assert.deepEqual(getAuthorizedCampusesForEmail("user@gmail.com"), []);
  assert.equal(getAuthGroupForEmail("not-an-email"), null);
  assert.equal(getAuthGroupForEmail(null), null);
});

test("Campus Helpers - isCampusAuthorizedForEmail", () => {
  // vitstudent.ac.in has interchangeable access to BOTH vit-v and vit-c
  assert.equal(isCampusAuthorizedForEmail("student@vitstudent.ac.in", "vit-v"), true);
  assert.equal(isCampusAuthorizedForEmail("student@vitstudent.ac.in", "vit-c"), true);
  assert.equal(isCampusAuthorizedForEmail("student@vitstudent.ac.in", "vit-ap"), false);
  assert.equal(isCampusAuthorizedForEmail("student@vitstudent.ac.in", "vit-b"), false);

  // vitapstudent.ac.in only authorized for vit-ap
  assert.equal(isCampusAuthorizedForEmail("student@vitapstudent.ac.in", "vit-ap"), true);
  assert.equal(isCampusAuthorizedForEmail("student@vitapstudent.ac.in", "vit-v"), false);
  assert.equal(isCampusAuthorizedForEmail("student@vitapstudent.ac.in", "vit-c"), false);

  // vitbhopal.ac.in only authorized for vit-b
  assert.equal(isCampusAuthorizedForEmail("student@vitbhopal.ac.in", "vit-b"), true);
  assert.equal(isCampusAuthorizedForEmail("student@vitbhopal.ac.in", "vit-ap"), false);

  // Edge cases
  assert.equal(isCampusAuthorizedForEmail("user@gmail.com", "vit-ap"), false);
  assert.equal(isCampusAuthorizedForEmail(null, "vit-ap"), false);
  assert.equal(isCampusAuthorizedForEmail("student@vitapstudent.ac.in", null), false);
});
