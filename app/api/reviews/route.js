/**
 * Trusted Review Mutations API for VITor.
 * Endpoints:
 * - POST: Submit or update a review.
 * - PUT: Edit an existing review.
 * - DELETE: Delete (soft-delete) an existing review.
 */

import { authenticateRequest, verifyAppCheck, authorizeFacultyAccess } from "../../../lib/server/campus-auth.js";
import { validateReviewSubmissionPayload } from "../../../lib/server/validation.js";
import { ReviewsTransactionCoordinator } from "../../../lib/server/reviews-transaction.js";

function extractIdempotencyKey(req) {
  return (
    req.headers.get("idempotency-key") ||
    req.headers.get("x-idempotency-key") ||
    null
  );
}

function handleError(err) {
  const statusCode = err.statusCode || (err.name === "ValidationError" ? 400 : 500);
  const responsePayload = {
    error: err.message || "An unexpected error occurred.",
    code: err.code || "INTERNAL_SERVER_ERROR",
  };

  if (err.currentVersion !== undefined) {
    responsePayload.currentVersion = err.currentVersion;
  }

  const headers = {};
  if (err.retryAfterSeconds) {
    headers["Retry-After"] = String(err.retryAfterSeconds);
    responsePayload.retryAfter = err.retryAfterSeconds;
  }

  return Response.json(responsePayload, { status: statusCode, headers });
}

export async function POST(req) {
  try {
    // 1. Authenticate ID token
    const decodedToken = await authenticateRequest(req);

    // 2. Verify App Check
    await verifyAppCheck(req);

    // 3. Parse and validate body
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { campusSlug, facultyId, ratings, comment, expectedVersion } =
      validateReviewSubmissionPayload(body);

    // 4. Authorize campus and verify faculty existence
    await authorizeFacultyAccess({ decodedToken, campusSlug, facultyId });

    // 5. Execute atomic transaction
    const idempotencyKey = extractIdempotencyKey(req);
    const result = await ReviewsTransactionCoordinator.submitOrUpdateReview({
      campusSlug,
      facultyId,
      userId: decodedToken.uid,
      ratings,
      comment,
      expectedVersion,
      idempotencyKey,
    });

    const statusCode = result.statusCode || (result.isNew ? 201 : 200);
    return Response.json(result, { status: statusCode });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req) {
  // Editing a review uses the same transactional pipeline with optimistic concurrency
  return POST(req);
}

export async function DELETE(req) {
  try {
    const decodedToken = await authenticateRequest(req);
    await verifyAppCheck(req);

    let campusSlug, facultyId;

    try {
      const body = await req.json();
      campusSlug = body.campusSlug;
      facultyId = body.facultyId;
    } catch {
      const url = new URL(req.url);
      campusSlug = url.searchParams.get("campusSlug");
      facultyId = url.searchParams.get("facultyId");
    }

    if (!campusSlug || !facultyId) {
      return Response.json(
        { error: "campusSlug and facultyId are required.", code: "MISSING_PARAMETERS" },
        { status: 400 }
      );
    }

    await authorizeFacultyAccess({ decodedToken, campusSlug, facultyId });

    const idempotencyKey = extractIdempotencyKey(req);
    const result = await ReviewsTransactionCoordinator.deleteReview({
      campusSlug,
      facultyId,
      userId: decodedToken.uid,
      idempotencyKey,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    return handleError(err);
  }
}
