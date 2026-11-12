import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../services/auth/auth.service.js";
import { getCampusSlugFromEmail, isDualCampusEmail } from "../lib/campus.js";

test("AuthService.extractDomain - extracts lowercased domain", () => {
  assert.equal(AuthService.extractDomain("STUDENT@VITAPSTUDENT.AC.IN"), "vitapstudent.ac.in");
  assert.equal(AuthService.extractDomain("invalid-email"), "");
  assert.equal(AuthService.extractDomain(null), "");
});

test("AuthService.isAllowedDomain - validates official college email domains", () => {
  assert.equal(AuthService.isAllowedDomain("user@vitapstudent.ac.in"), true);
  assert.equal(AuthService.isAllowedDomain("user@vitstudent.ac.in"), true);
  assert.equal(AuthService.isAllowedDomain("user@vitbhopal.ac.in"), true);

  assert.equal(AuthService.isAllowedDomain("user@gmail.com"), false);
  assert.equal(AuthService.isAllowedDomain("user@outlook.com"), false);
  assert.equal(AuthService.isAllowedDomain("user@othercollege.ac.in"), false);
});

test("Campus helpers - maps email domain to campus", () => {
  assert.equal(getCampusSlugFromEmail("student@vitapstudent.ac.in"), "vit-ap");
  assert.equal(getCampusSlugFromEmail("student@vitbhopal.ac.in"), "vit-b");
  assert.equal(getCampusSlugFromEmail("student@vitstudent.ac.in"), null); // Dual campus
  assert.equal(getCampusSlugFromEmail("student@gmail.com"), null);

  assert.equal(isDualCampusEmail("student@vitstudent.ac.in"), true);
  assert.equal(isDualCampusEmail("student@vitapstudent.ac.in"), false);
});
