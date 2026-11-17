/**
 * Server-side Authentication & Campus Authorization for VITor.
 *
 * Enforces:
 * - Token verification with checkRevoked=true.
 * - Email verification requirement.
 * - Optional / Enforced Firebase App Check verification.
 * - Trusted campus resolution based on student email domain and stored profile.
 * - Cross-campus validation against target faculty.
 * - Target faculty existence verification.
 * - Moderator / Admin privileges verification without trusting client fields.
 */

import { adminAuth, adminDb, adminAppCheck } from "../firebase/admin.js";
import {
  EMAIL_DOMAIN_TO_CAMPUS,
  DOMAIN_TO_AUTH_GROUP,
  AUTH_GROUP_TO_CAMPUSES,
  DUAL_CAMPUS_EMAIL_DOMAIN,
  DUAL_CAMPUS_SLUGS,
  isValidCampus,
} from "../campus.js";

export class AuthError extends Error {
  constructor(message, statusCode = 401, code = "UNAUTHORIZED") {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Extracts and verifies Firebase ID Token from Authorization header.
 * Enforces revocation check and email verification.
 */
export async function authenticateRequest(req) {
  const authHeader =
    (typeof req.headers?.get === "function"
      ? req.headers.get("authorization")
      : req.headers?.authorization) || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing or malformed Authorization header.", 401, "MISSING_TOKEN");
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AuthError("Bearer token is empty.", 401, "INVALID_TOKEN");
  }

  let decodedToken;
  try {
    // verifyIdToken(token, checkRevoked = true)
    decodedToken = await adminAuth.verifyIdToken(token, true);
  } catch (err) {
    if (err?.code === "auth/id-token-revoked") {
      throw new AuthError("Authentication token has been revoked. Please sign in again.", 401, "TOKEN_REVOKED");
    }
    if (err?.code === "auth/id-token-expired") {
      throw new AuthError("Authentication token has expired. Please sign in again.", 401, "TOKEN_EXPIRED");
    }
    throw new AuthError(`Authentication failed: ${err.message || "Invalid token"}`, 401, "INVALID_TOKEN");
  }

  if (!decodedToken.email_verified) {
    throw new AuthError("Student email must be verified before submitting reviews.", 403, "EMAIL_NOT_VERIFIED");
  }

  return decodedToken;
}

/**
 * Verifies Firebase App Check token.
 * Mandatory in production (`NODE_ENV === "production"`).
 * Local dev/testing can bypass ONLY when NODE_ENV !== "production".
 */
export async function verifyAppCheck(req) {
  const appCheckToken =
    (typeof req.headers?.get === "function"
      ? req.headers.get("x-firebase-appcheck")
      : req.headers?.["x-firebase-appcheck"]) || "";

  const isProduction = process.env.NODE_ENV === "production";

  // Production MUST ALWAYS enforce App Check.
  // Test bypass is strictly impossible when NODE_ENV === "production".
  const allowTestBypass =
    !isProduction &&
    (process.env.DISABLE_APP_CHECK_FOR_TESTS === "true" ||
      process.env.REQUIRE_APP_CHECK !== "true");

  if (allowTestBypass && !appCheckToken) {
    return null;
  }

  if (!appCheckToken) {
    throw new AuthError("Firebase App Check token is required.", 401, "APP_CHECK_MISSING");
  }

  try {
    const verified = await adminAppCheck.verifyToken(appCheckToken);
    return verified;
  } catch (err) {
    throw new AuthError(
      `Invalid Firebase App Check token: ${err?.message || "Verification failed"}`,
      401,
      "APP_CHECK_INVALID"
    );
  }
}

/**
 * Resolves the authorized campus group ('vit-ap', 'vit-b', or 'vit-vc') for an authenticated user.
 * Derived 100% from the verified student email domain.
 * Never trusts client-supplied parameters or editable user profile documents.
 */
export function getAuthorizedCampusGroup(decodedToken) {
  const email = (decodedToken?.email || "").toLowerCase().trim();
  const parts = email.split("@");
  if (parts.length !== 2) {
    throw new AuthError("Invalid email format in authenticated token.", 403, "INVALID_EMAIL");
  }

  const domain = parts[1];
  const authGroup = DOMAIN_TO_AUTH_GROUP[domain];

  if (!authGroup) {
    throw new AuthError(
      `Email domain '@${domain}' is not authorized to submit reviews.`,
      403,
      "UNAUTHORIZED_DOMAIN"
    );
  }

  return authGroup;
}

/**
 * Returns the list of campus slugs the user is authorized to review.
 * - vitapstudent.ac.in -> ['vit-ap']
 * - vitbhopal.ac.in -> ['vit-b']
 * - vitstudent.ac.in -> ['vit-v', 'vit-c'] (interchangeable dual-campus access)
 */
export function getAuthorizedCampuses(decodedToken) {
  const authGroup = getAuthorizedCampusGroup(decodedToken);
  return AUTH_GROUP_TO_CAMPUSES[authGroup] || [];
}

/**
 * Resolves the trusted campus authorization group for an authenticated user.
 * Maintained for backward compatibility.
 */
export async function resolveTrustedUserCampus(decodedToken) {
  return getAuthorizedCampusGroup(decodedToken);
}

/**
 * Authorizes a review action against a specific campus and faculty.
 * Checks:
 * - Campus slug is valid.
 * - Target faculty belongs to a campus authorized for this student's verified email domain.
 * - Target faculty exists in Firestore under this campus.
 */
export async function authorizeFacultyAccess({ decodedToken, campusSlug, facultyId }) {
  if (!isValidCampus(campusSlug)) {
    throw new AuthError(`Invalid campus slug '${campusSlug}'.`, 400, "INVALID_CAMPUS");
  }

  if (!facultyId || typeof facultyId !== "string" || !facultyId.trim()) {
    throw new AuthError("Faculty ID is required.", 400, "INVALID_FACULTY_ID");
  }

  const authorizedCampuses = getAuthorizedCampuses(decodedToken);
  const authGroup = getAuthorizedCampusGroup(decodedToken);

  if (!authorizedCampuses.includes(campusSlug)) {
    throw new AuthError(
      `Cross-campus review denied. Your student email is authorized for [${authorizedCampuses.join(", ")}], not '${campusSlug}'.`,
      403,
      "CROSS_CAMPUS_DENIED"
    );
  }

  // Verify faculty existence in target campus
  const facultyRef = adminDb.collection("campuses").doc(campusSlug).collection("faculties").doc(facultyId);
  const facultySnap = await facultyRef.get();
  if (!facultySnap.exists) {
    throw new AuthError(`Faculty '${facultyId}' does not exist in campus '${campusSlug}'.`, 404, "FACULTY_NOT_FOUND");
  }

  return { authGroup, authorizedCampuses, faculty: { id: facultySnap.id, ...facultySnap.data() } };
}

/**
 * Verifies if user has moderator or admin privileges.
 * Relies strictly on custom claims or server-side ADMIN_EMAILS environment variable.
 * Never trusts Firestore user profile documents for administrative privileges.
 */
export function isAuthorizedModerator(decodedToken) {
  if (decodedToken.admin === true || decodedToken.moderator === true) {
    return true;
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = (decodedToken.email || "").toLowerCase();
  return adminEmails.includes(userEmail);
}
