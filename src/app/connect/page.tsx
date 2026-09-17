import { prisma } from "@/lib/db/prisma";
import { findLatestPublication } from "@/lib/store/prismaStore";
import { ConnectForm } from "./ConnectForm";
import { ConnectInstructions } from "./ConnectInstructions";

/**
 * The connect page — the spec's first-visit state. Server component: the
 * publication lookup is the only data access; the form itself is a client
 * island. Dynamic because it reads the DB on every request.
 */
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const latest = await findLatestPublication({ prisma });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Connect your Substack publication</h1>
      <ConnectInstructions />
      {latest !== null && (
        <p data-testid="connected-publication" className="mt-4 text-sm">
          Connected: {latest.displayName} ({latest.subdomain}) —{" "}
          <a href={`/pub/${latest.id}/radar`} className="underline underline-offset-2">
            Open the radar
          </a>
        </p>
      )}
      <ConnectForm />
    </main>
  );
}
