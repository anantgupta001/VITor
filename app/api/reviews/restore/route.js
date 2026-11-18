/**
 * Review Restoration API for VITor.
 * POST /api/reviews/restore
 *
 * Lets an author undo their OWN deletion only. Reviews in a moderator-set status
 * (FLAGGED / HIDDEN / QUARANTINED) can never be restored through this endpoint.
 */

import { authenticateRequest, verifyAppCheck, authorizeFacultyAccess } from "../../../../lib/server/campus-auth.js";
import { ReviewsTransactionCoordinator } from "../../../../lib/server/reviews-transaction.js";
import { invalidateFacultyDirectory } from "../../../../lib/server/faculty-directory.js";
import { extractIdempotencyKey, handleApiError, readJsonObject } from "../../../../lib/server/http.js";

export async function POST(req) {
  try {
    const decodedToken = await authenticateRequest(req);
    await verifyAppCheck(req);

    const body = (await readJsonObject(req)) || {};
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

    invalidateFacultyDirectory(campusSlug);

    return Response.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
