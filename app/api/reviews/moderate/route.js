/**
 * Review Moderation API for VITor.
 * POST /api/reviews/moderate
 * Authorized only for verified moderators and administrators.
 */

import { authenticateRequest, verifyAppCheck, isAuthorizedModerator } from "../../../../lib/server/campus-auth.js";
import { ReviewsTransactionCoordinator } from "../../../../lib/server/reviews-transaction.js";
import { isValidCampus } from "../../../../lib/campus.js";

function extractIdempotencyKey(req) {
  return (
    req.headers.get("idempotency-key") ||
    req.headers.get("x-idempotency-key") ||
    null
  );
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

    const body = await req.json().catch(() => ({}));
    const { campusSlug, facultyId, targetUserId, action, reason } = body;

    if (!campusSlug || !isValidCampus(campusSlug)) {
      return Response.json({ error: "Valid campusSlug is required.", code: "INVALID_CAMPUS" }, { status: 400 });
    }
    if (!facultyId || !targetUserId || !action) {
      return Response.json(
        { error: "facultyId, targetUserId, and action are required.", code: "MISSING_PARAMETERS" },
        { status: 400 }
      );
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
    const statusCode = err.statusCode || 500;
    return Response.json(
      { error: err.message || "Failed to moderate review.", code: err.code || "INTERNAL_ERROR" },
      { status: statusCode }
    );
  }
}
