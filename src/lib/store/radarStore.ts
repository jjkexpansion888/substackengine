import type { PrismaClient } from "@prisma/client";
import type { SubscriberRow } from "../rank/rankSubscribers";

export type RadarStoreDeps = {
  prisma: PrismaClient;
};

/**
 * Load every subscriber of a publication with its latest snapshot's rank
 * inputs (the inputs themselves live on SubscriberSnapshot, so any past rank
 * is reproducible). Latest-per-subscriber reduces in memory: v1 lists are
 * hundreds of rows; revisit with a groupwise-minimum query if they grow.
 *
 * Returns null when the publication does not exist (routes map that to 404);
 * an existing publication with zero subscribers is an empty list, not null.
 */
export async function loadSubscriberRows(
  deps: RadarStoreDeps,
  publicationId: string,
): Promise<SubscriberRow[] | null> {
  const publication = await deps.prisma.publication.findUnique({
    where: { id: publicationId },
    select: { id: true },
  });
  if (!publication) return null;

  const subscribers = await deps.prisma.subscriber.findMany({
    where: { publicationId },
    orderBy: { id: "asc" },
    include: {
      // Newest first so the head of the list is each subscriber's latest snapshot.
      snapshots: { orderBy: { capturedAt: "desc" } },
    },
  });

  return subscribers.map((subscriber) => {
    const latest = subscriber.snapshots[0] ?? null;
    return {
      id: subscriber.id,
      displayName: subscriber.displayName,
      handle: subscriber.handle,
      subscribedAt: subscriber.subscribedAt,
      capturedAt: latest?.capturedAt ?? null,
      subscriberCount: latest?.subscriberCount ?? null,
      bestsellerStatus: latest?.bestsellerStatus ?? null,
      activityRating: latest?.activityRating ?? null,
    };
  });
}
