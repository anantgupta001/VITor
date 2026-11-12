import test from "node:test";
import assert from "node:assert/strict";
import {
  filterFaculties,
  getSearchSuggestions,
  paginate,
} from "../lib/utils/faculty-search.js";

const sampleFaculties = [
  { id: "1", name: "Dr. Ramesh Kumar", department: "Computer Science" },
  { id: "2", name: "Dr. Priya Sharma", department: "Electronics Engineering" },
  { id: "3", name: "Prof. Suresh Patel", department: "Mechanical Engineering" },
  { id: "4", name: "Dr. Ananya Reddy", department: "Computer Science" },
  { id: "5", name: "Prof. Vikram Singh", department: "Mathematics" },
];

test("filterFaculties - returns all when query is empty", () => {
  const result = filterFaculties(sampleFaculties, "");
  assert.equal(result.length, 5);

  const whitespaceResult = filterFaculties(sampleFaculties, "   ");
  assert.equal(whitespaceResult.length, 5);
});

test("filterFaculties - filters by name case-insensitively", () => {
  const result = filterFaculties(sampleFaculties, "ramesh");
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Dr. Ramesh Kumar");
});

test("filterFaculties - filters by department case-insensitively", () => {
  const result = filterFaculties(sampleFaculties, "computer");
  assert.equal(result.length, 2);
});

test("getSearchSuggestions - returns unique matching suggestions up to limit", () => {
  const suggestions = getSearchSuggestions(sampleFaculties, "comp", 8);
  assert.ok(suggestions.includes("Computer Science"));

  const limited = getSearchSuggestions(sampleFaculties, "dr", 1);
  assert.equal(limited.length, 1);
});

test("paginate - calculates pagination correctly", () => {
  const page1 = paginate(sampleFaculties, 1, 2);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.currentItems.length, 2);
  assert.equal(page1.currentItems[0].id, "1");
  assert.equal(page1.currentItems[1].id, "2");

  const page3 = paginate(sampleFaculties, 3, 2);
  assert.equal(page3.currentItems.length, 1);
  assert.equal(page3.currentItems[0].id, "5");

  // Clamped page
  const clamped = paginate(sampleFaculties, 99, 2);
  assert.equal(clamped.currentPage, 3);
});
