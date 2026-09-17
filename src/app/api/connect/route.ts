import { createSubstackClient } from "@/lib/substack";
import { normalizeDomain } from "@/lib/substack/types";
import { jsonError } from "@/lib/api/errorMapping";
import { prisma } from "@/lib/db/prisma";
import { createSecretBox, loadEncryptionKey } from "@/lib/crypto/secretBox";
import { upsertPublication } from "@/lib/store/prismaStore";

/**
 * POST /api/connect — store a publication's owner session cookie, encrypted.
 *
 * Body: { domain: string, cookie: string } (the substack.sid value).
 * The cookie is validated against the live publication before anything is
 * persisted; on success it is stored AES-256-GCM encrypted, never plaintext.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { domain?: unknown; cookie?: unknown };
    if (typeof body.domain !== "string" || typeof body.cookie !== "string") {
      return Response.json(
        { error: { code: "invalid_input", message: "domain and cookie are required" } },
        { status: 400 },
      );
    }
    const domain = normalizeDomain(body.domain);
    const client = createSubstackClient({ domain });
    const session = await client.validateSession(body.cookie);

    const secretBox = createSecretBox(loadEncryptionKey(process.env.COOKIE_ENCRYPTION_KEY));
    const publication = await upsertPublication(
      { prisma, secretBox },
      { domain, session, cookie: body.cookie },
    );

    return Response.json(
      {
        publication: {
          id: publication.id,
          subdomain: publication.subdomain,
          displayName: publication.displayName,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
