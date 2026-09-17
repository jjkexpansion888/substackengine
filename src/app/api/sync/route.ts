import { createSubstackClient } from "@/lib/substack";
import { jsonError } from "@/lib/api/errorMapping";
import { prisma } from "@/lib/db/prisma";
import { createSecretBox, loadEncryptionKey } from "@/lib/crypto/secretBox";
import {
  createPrismaStore,
  findPublicationById,
  markCookieInvalid,
} from "@/lib/store/prismaStore";
import { SessionExpiredError } from "@/lib/substack/errors";
import { runSync } from "@/lib/sync/syncPipeline";

/**
 * POST /api/sync — run one subscriber sync for a connected publication.
 *
 * Body: { publicationId: string }. The stored cookie is decrypted, used for
 * the run, and flagged invalid if Substack rejects the session. Re-running is
 * idempotent: subscribers upsert, snapshots append under a new as-of time.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { publicationId?: unknown };
    if (typeof body.publicationId !== "string") {
      return Response.json(
        { error: { code: "invalid_input", message: "publicationId is required" } },
        { status: 400 },
      );
    }

    const secretBox = createSecretBox(loadEncryptionKey(process.env.COOKIE_ENCRYPTION_KEY));
    const storeDeps = { prisma, secretBox };
    const publication = await findPublicationById(storeDeps, body.publicationId);
    if (!publication) {
      return Response.json(
        { error: { code: "not_found", message: "Unknown publication. Connect it first." } },
        { status: 404 },
      );
    }

    const cookie = secretBox.decrypt(publication.cookieCiphertext);
    try {
      const result = await runSync(
        {
          createClient: (onRequest) =>
            createSubstackClient({ domain: publication.subdomain, onRequest }),
          store: createPrismaStore(storeDeps),
        },
        { publicationId: publication.id, cookie },
      );
      return Response.json({ sync: result }, { status: 200 });
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        await markCookieInvalid(storeDeps, publication.id);
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
