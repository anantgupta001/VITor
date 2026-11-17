/**
 * Review Restoration API for VITor.
 * POST /api/reviews/restore
 */

import { authenticateRequest, verifyAppCheck, authorizeFacultyAccess } from "../../../../lib/server/campus-auth.js";
import { ReviewsTransactionCoordinator } from "../../../../lib/server/reviews-transaction.js";

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

    const body = await req.json().catch(() => ({}));
    const { campusSlug, facultyId } = body;

    if (!campusSlug || !facultyId) {
      return Response.json(
        { error: "campusSlug and facultyId are required.", code: "MISSING_PARAMETERS" },
        { status: 400 }
      );
    }

    await authorizeFacultyAccess({ decodedToken, campusSlug, facultyId });

    const idempotencyKey = extractIdempotencyKey(req);
    const result = await ReviewsTransactionCoordinator.restoreReview({
      campusSlug,
      facultyId,
      userId: decodedToken.uid,
      idempotencyKey,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return Response.json(
      { error: err.message || "Failed to restore review.", code: err.code || "INTERNAL_ERROR" },
      { status: statusCode }
    );
  }
}
