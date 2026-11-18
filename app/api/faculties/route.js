/**
 * Public Faculty Directory API for VITor.
 * GET /api/faculties?campusSlug=<slug>
 *
 * Returns the faculty list for one campus (public data, same content that the
 * Firestore rules already expose). Served from a short server-side TTL cache; see
 * lib/server/faculty-directory.js. No authentication, no user-specific data.
 */

import { isValidCampus } from "../../../lib/campus.js";
import { ValidationError } from "../../../lib/server/validation.js";
import { getCachedFaculties, FACULTY_DIRECTORY_TTL_MS } from "../../../lib/server/faculty-directory.js";
import { handleApiError } from "../../../lib/server/http.js";

// Always evaluate per request; caching is handled explicitly (module cache + headers).
export const dynamic = "force-dynamic";

const TTL_SECONDS = Math.round(FACULTY_DIRECTORY_TTL_MS / 1000);

export async function GET(req) {
  try {
    const campusSlug = new URL(req.url).searchParams.get("campusSlug");
    if (!isValidCampus(campusSlug)) {
      throw new ValidationError("Valid 'campusSlug' is required.");
    }

    const faculties = await getCachedFaculties(campusSlug);
    return Response.json(
      { faculties },
      {
        headers: {
          // Public, identical for every visitor. Browsers always revalidate; shared
          // caches (CDN) may reuse it for the same TTL as the server cache.
          "Cache-Control": `public, max-age=0, s-maxage=${TTL_SECONDS}`,
        },
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
