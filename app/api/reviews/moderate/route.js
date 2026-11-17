/**
 * Review Moderation API for VITor.
 * POST /api/reviews/moderate
 * Authorized only for verified moderators and administrators.
 */

import { authenticateRequest, verifyAppCheck, isAuthorizedModerator } from "../../../../lib/server/campus-auth.js";
import { ReviewsTransactionCoordinator } from "../../../../lib/server/reviews-transaction.js";
import { isValidCampus } from "../../../../lib/campus.js";
import { isSafeDocumentId } from "../../../../lib/server/validation.js";
import { extractIdempotencyKey, handleApiError, readJsonObject } from "../../../../lib/server/http.js";

const MAX_REASON_LENGTH = 500;

function badRequest(error, code) {
  return Response.json({ error, code }, { status: 400 });
}

export async function POST(req) {
  try {
    const decodedToken = await authenticateRequest(req);
    await verifyAppCheck(req);

    if (!isAuthorizedModerator(decodedToken)) {
      return Response.json(
        { error: "Forbidden: Moderator or administrator privileges required.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = (await readJsonObject(req)) || {};
    const { campusSlug, facultyId, targetUserId, action, reason } = body;

    if (!campusSlug || !isValidCampus(campusSlug)) {
      return badRequest("Valid campusSlug is required.", "INVALID_CAMPUS");
    }
    if (!facultyId || !targetUserId || !action) {
      return badRequest("facultyId, targetUserId, and action are required.", "MISSING_PARAMETERS");
    }
    if (!isSafeDocumentId(facultyId) || !isSafeDocumentId(targetUserId)) {
      return badRequest("facultyId and targetUserId must be valid identifiers.", "INVALID_PARAMETERS");
    }
    if (typeof action !== "string") {
      return badRequest("action must be a string.", "INVALID_PARAMETERS");
    }
    if (reason !== undefined && reason !== null) {
      if (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH) {
        return badRequest(
          `reason must be a string of at most ${MAX_REASON_LENGTH} characters.`,
          "INVALID_PARAMETERS"
        );
      }
    }

    const idempotencyKey = extractIdempotencyKey(req);
    const result = await ReviewsTransactionCoordinator.moderateReview({
      campusSlug,
      facultyId,
      targetUserId,
      action,
      reason,
      idempotencyKey,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
