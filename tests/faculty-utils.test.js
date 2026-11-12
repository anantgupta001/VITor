import test from "node:test";
import assert from "node:assert/strict";
import { getScoreColorClass } from "../lib/utils/styling.js";
import { getFacultyPhoto } from "../lib/utils/faculty.js";

// ============================================================================
// getScoreColorClass() tests
// ============================================================================

test("getScoreColorClass - returns green classes for score >= 4.0", () => {
  assert.equal(getScoreColorClass(4.0), "text-green-700 dark:text-green-400");
  assert.equal(getScoreColorClass(4.5), "text-green-700 dark:text-green-400");
  assert.equal(getScoreColorClass(5.0), "text-green-700 dark:text-green-400");
});

test("getScoreColorClass - returns amber classes for score between 2.5 and 3.99", () => {
  assert.equal(getScoreColorClass(2.5), "text-amber-600 dark:text-amber-400");
  assert.equal(getScoreColorClass(3.0), "text-amber-600 dark:text-amber-400");
  assert.equal(getScoreColorClass(3.99), "text-amber-600 dark:text-amber-400");
});

test("getScoreColorClass - returns red classes for score below 2.5", () => {
  assert.equal(getScoreColorClass(2.49), "text-red-600 dark:text-red-400");
  assert.equal(getScoreColorClass(1.0), "text-red-600 dark:text-red-400");
  assert.equal(getScoreColorClass(0), "text-red-600 dark:text-red-400");
  assert.equal(getScoreColorClass(-1), "text-red-600 dark:text-red-400");
});

test("getScoreColorClass - returns gray fallback for null and non-number values", () => {
  assert.equal(getScoreColorClass(null), "text-gray-600 dark:text-gray-400");
  assert.equal(getScoreColorClass(undefined), "text-gray-600 dark:text-gray-400");
  assert.equal(getScoreColorClass("4.5"), "text-gray-600 dark:text-gray-400");
  assert.equal(getScoreColorClass({}), "text-gray-600 dark:text-gray-400");
});

// ============================================================================
// getFacultyPhoto() tests
// ============================================================================

test("getFacultyPhoto - returns custom photo URL if provided", () => {
  const custom = "https://example.com/photos/prof1.jpg";
  assert.equal(getFacultyPhoto({ photo: custom, name: "Dr. Smith" }), custom);

  // Trims leading/trailing whitespace
  assert.equal(getFacultyPhoto({ photo: "  https://example.com/p.jpg  ", name: "Dr. Smith" }), "https://example.com/p.jpg");
});

test("getFacultyPhoto - generates fallback avatar when photo is missing or empty", () => {
  const expectedSmith =
    "https://ui-avatars.com/api/?name=Dr.%20Smith&size=256&background=94a3b8&color=fff";

  // Missing photo property
  assert.equal(getFacultyPhoto({ name: "Dr. Smith" }), expectedSmith);

  // Empty string photo
  assert.equal(getFacultyPhoto({ photo: "", name: "Dr. Smith" }), expectedSmith);

  // Whitespace-only photo
  assert.equal(getFacultyPhoto({ photo: "   ", name: "Dr. Smith" }), expectedSmith);
});

test("getFacultyPhoto - falls back to '?' when faculty name is missing", () => {
  const expectedDefault =
    "https://ui-avatars.com/api/?name=%3F&size=256&background=94a3b8&color=fff";

  assert.equal(getFacultyPhoto({}), expectedDefault);
  assert.equal(getFacultyPhoto({ name: "" }), expectedDefault);
  assert.equal(getFacultyPhoto(null), expectedDefault);
  assert.equal(getFacultyPhoto(undefined), expectedDefault);
});

test("getFacultyPhoto - regression: whitespace-only faculty names fall back to '?'", () => {
  const expectedDefault =
    "https://ui-avatars.com/api/?name=%3F&size=256&background=94a3b8&color=fff";

  assert.equal(getFacultyPhoto({ name: "   " }), expectedDefault);
  assert.equal(getFacultyPhoto({ name: "\t \n " }), expectedDefault);
});

test("getFacultyPhoto - correctly URI encodes special characters in faculty name", () => {
  const specialFaculty = { name: "Dr. A. B. C. & Sons" };
  const expectedEncoded =
    "https://ui-avatars.com/api/?name=Dr.%20A.%20B.%20C.%20%26%20Sons&size=256&background=94a3b8&color=fff";

  assert.equal(getFacultyPhoto(specialFaculty), expectedEncoded);

  const unicodeFaculty = { name: "Prof. José Müller" };
  const expectedUnicode =
    "https://ui-avatars.com/api/?name=Prof.%20Jos%C3%A9%20M%C3%BCller&size=256&background=94a3b8&color=fff";

  assert.equal(getFacultyPhoto(unicodeFaculty), expectedUnicode);
});
