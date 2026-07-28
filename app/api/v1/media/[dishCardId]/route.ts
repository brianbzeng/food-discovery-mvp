import { getPublishedMedia } from "../../../../../db/media-store";
import { logOperationalError } from "../../../../lib/observability";

type RouteContext = {
  params: Promise<{ dishCardId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const dishCardId = (await context.params).dishCardId?.trim().slice(0, 100);
  if (!dishCardId) {
    return Response.json({ error: { code: "invalid-media" } }, { status: 400 });
  }

  try {
    const media = await getPublishedMedia(dishCardId);
    if (!media) {
      return Response.json(
        { error: { code: "media-not-found" } },
        { status: 404 },
      );
    }

    const headers = new Headers({
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    media.object.writeHttpMetadata(headers);
    if (media.object.httpEtag) headers.set("etag", media.object.httpEtag);
    if (media.attributionText) {
      headers.set("x-media-attribution", media.attributionText.slice(0, 300));
    }

    return new Response(media.object.body, { headers });
  } catch (error) {
    logOperationalError(
      request,
      {
        route: "/api/v1/media/:dishCardId",
        operation: "read_media",
        status: 503,
        code: "media-unavailable",
      },
      error,
    );
    return Response.json(
      { error: { code: "media-unavailable" } },
      { status: 503 },
    );
  }
}

