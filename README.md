# Substack Engine

Substack Engine combines public audience research with owner-only collaboration and editorial planning tools, built with Next.js. Enter a Substack subdomain, publication URL, custom domain, or profile URL (`substack.com/@handle`) to discover people in recent public discussions and their public audience signals. Profile URLs and `@handles` resolve to the profile's primary publication.

## Capabilities

- **Radar:** discover public participants, rank readers by available audience signals, filter evidence, recover missing counts, and export results.
- **Owner connection:** sync a sanitized subscriber roster from your signed-in Chrome session without copying cookies or email addresses.
- **Collaboration Finder:** rank potential partners, diversify recommendations, learn from ratings, and track outreach and manually verified outcomes.
- **Content Opportunities:** compare your writing with outside Substacks, identify supported editorial hypotheses, and read topic-specific research briefs linked to your archive.

Public searches open Radar only. Collaboration Finder and Content Opportunities become available after an owner-session sync and load only when selected.

## Getting Started

The public radar does not require a cookie, encryption key, or database. Installing dependencies also generates the Prisma client for the optional legacy routes. Run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000/connect](http://localhost:3000/connect). Enter your publication's domain.

## Public Coverage

Each scan paginates through up to 50 recent archive posts, samples up to 50 top-level comments per post and visible replies, and checks up to 100 public profiles initially. Archive IDs are deduplicated and partial pages are retained when an upstream request fails. It also attempts the creator's public subscriber list, capped at 1,000 profiles. People are deduplicated by ID or handle. Authors and readers are labeled separately. Subscription evidence distinguishes public-list entries from historical comment metadata.

The Subscribers view ranks identified readers by their public subscriber count, then bestseller badge when counts are missing, then unknown audience. Counts can be rounded and are not follower counts. Unknown is never treated as zero. Authors and unconfirmed public participants are excluded from this ranking. Opening a saved publication automatically continues unfinished audience lookups in batches of 20 and saves recovered counts. Failed profiles do not monopolize the first batch. Rate limits and repeated browser checks pause the queue; Retry counts resumes it. Manual lookups also support batches of 50. Search and evidence filters preserve the original ranks; CSV export includes the evidence and rank signal.

The reported subscriber total is shown separately from the number of profiles available to rank. It comes from the creator profile and can span multiple publications. A domain-only comment scan is explicitly labeled partial, not a complete list.

For your own publication, use the [Chrome connector](chrome-extension/README.md) on your signed-in Subscribers dashboard and click **Sync to local app**. It reads the owner list in pages of 50 with Chrome's session, without copying cookie values, and opens the local app automatically. No export file or manual import is required. Only IDs, names, and explicit public handles are sent; emails are discarded in Chrome. Rows without public handles remain in the roster with unknown audience sizes. Identities are never guessed from names or emails. The connector requests optional localhost access; it does not require the ChatGPT Chrome extension.

For someone else's publication, the connector can export loaded rows from the public Subscribers page. The public list is creator-scoped, can span multiple publications, and excludes private subscriptions. No blanket host or cookie-reading permission is required.

Private subscriber lists require the owner's signed-in browser session and cannot be inferred from a domain. Direct sync uses a random one-use handoff held in localhost server memory for at most five minutes. The local app automatically saves the sanitized roster, radar results and recovered counts in `.local-data/radar/<domain>.json`, with owner-only file permissions and atomic writes. Reopening the publication restores the saved snapshot without another extension sync or network scan. Refresh updates public activity; a new Chrome sync is needed only to update the owner roster. Cookies and email fields are excluded. These private local files are ignored by Git. Remove imported list also removes its saved snapshot. Direct sync is for the single-process local server on port 3000. Explicit public imports are retained in local browser storage by domain and can be removed in the app. The connection form starts empty and does not remember previous domains.

Substack's public web endpoints are unofficial and may change or restrict access. Partial scans report unavailable discussions or profiles rather than fabricating results.

Connector 0.4.2 resumes public profile lookups from a localhost memory cache, checkpoints every 25 profiles, and allows up to fifteen minutes rather than stopping after four. The cache holds only public IDs, handles, subscriber counts and bestseller flags, never owner membership or rosters. Open local views pick up recovered counts every 15 seconds, and refresh reuses those counts. Restarting the server clears the cache. After updating the connector, reload it in Chrome's extension manager before starting another sync.

## Collaboration Finder

Collaboration finder and Content opportunities are available only for publications connected through an owner-session subscriber sync. Ordinary public searches and public-list imports show Radar only. Every search and restored publication starts on Radar; owner tools are mounted only when explicitly selected, not loaded invisibly alongside the results.

The Collaboration finder uses the owner's selected publication. It discovers writers among up to 18 active community profiles, scans up to six additional publication domains, and explores up to six profiles found in partner discussions. Requests use the radar's HTTPS/DNS protections, a 90-request budget, bounded concurrency, and a 65-second scheduling deadline. Rate limiting stops additional requests; partial results include warnings.

Matching runs locally without API keys. It fits TF-IDF vectors to publication descriptions, recent titles/subtitles, and optional reader interests. On corpora with 5-100 documents and sufficient vocabulary it uses `ml-matrix` SVD for latent semantic analysis, blended with lexical cosine similarity; larger corpora use lexical cosine to bound browser work. Topic fit, observed relationship activity, audience scale, recency, public reach, and shared public participants contribute to goal-specific scores. Missing counts remain unknown. Maximum marginal relevance diversifies the top 50 results. A regularized ridge regression preference model activates after at least six ratings including both positive and negative examples, with its contribution capped at 20% of the score.

Scores are relative fit indicators, not calibrated success probabilities. This is a corpus-trained statistical model, not a pretrained neural embedding model. Shared participants come from samples of public discussions and must not be interpreted as full subscriber overlap. Evidence confidence describes coverage, not predictive accuracy. Collaboration ideas and outreach drafts are grounded templates; outcome attribution requires manual verification in publication analytics.

The finder includes guest posts, interviews, joint live sessions, editorial recommendations, saved partners, pipeline stages, follow-up dates, editable drafts, campaign URLs, and manually reported subscribers/clicks/hours. Preferences, drafts, scan results, and pipeline records persist per publication in this browser's local storage. They stay available while switching features. CSV exports reflect the current view; JSON exports can be restored to the matching publication, with existing pipeline records taking precedence. Messages are never sent automatically. Known writer publication metadata is reused from Radar to reduce upstream lookups.

## Content Opportunities

Content Opportunities looks for connections between your existing writing and sampled articles from other Substacks. It reads up to 48 archive entries from your publication, attempts public article text for ten of those entries, and explores up to 16 related or supplied source publications with eight recent entries each. It attempts public text for up to 18 relevant outside articles. Editorial focus, up to six additional source domains, and optional reader questions let you steer the research.

Discovery uses local TF-IDF and up to 16 latent semantic topics to compare alignment with your archive, estimated coverage gaps, and outside source support. It includes editorial hypotheses across AI agents/security, macro/capital allocation, quantitative markets, biotechnology, and culture/institutions, plus named-entity case-study angles when supported by source metadata. Public reader questions can also become opportunities. Rankings are relative research signals, not verified forecasts, audience-growth promises, or proof of originality.

Each cross-Substack angle has its own distinct contribution and four-step research strategy: for example, investment model risk calls for a leakage audit and holdout test, while human taste calls for a curation comparison and investigation of willingness to pay. Plans identify evidence to seek, counterexamples that could weaken the thesis, a starting source, and a connection to your earlier writing. These are topic-specific editorial playbooks, not free-form AI generation or claims that cited writers endorse the proposed connection.

The editorial brief is read-only: a headline and hypothesis, visual alignment/newness/priority indicators, topic dimensions, a numbered research plan, outside citations, and links to your own posts. Copy and save actions remain available. The separate editorial calendar supports publication dates, status tracking, removal with undo, and CSV export of saved briefs. Research inputs, scan results, and calendar entries persist in this browser per publication; they are not synced across browsers or ports.

Research uses a 64-request budget, bounded concurrency, and a 75-second scheduling deadline. Unavailable public text falls back to title/subtitle metadata, and rate limits produce partial results with warnings. The scan is not exhaustive, estimated newness is relative to the sampled archive, and paywalled or authenticated article text is not accessed.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

An alternate local Next.js build directory can be selected with `SUBSTACK_DIST_DIR` when running multiple development instances from this checkout:

```bash
SUBSTACK_DIST_DIR=.next-preview npm run dev -- --port 3001
```

Owner direct sync targets port 3000; an alternate preview port does not share browser-local research or planning data.

## Legacy Owner Data

The earlier database-backed subscriber routes remain for existing records. They require Postgres and `COOKIE_ENCRYPTION_KEY`; the main public flow does not use them. To set up that legacy storage:

```bash
cp .env.example .env
openssl rand -hex 32
```

Paste the generated key into `.env`, configure a development Postgres database, then run:

```bash
npx prisma migrate dev
```

For a disposable development database, `npm run db:push` is also available. `npm run db:generate` regenerates the Prisma client. If a legacy route reports `PrismaClientInitializationError`, check the terminal log and verify that `DATABASE_URL` is configured and reachable; restart the server after changing it.

The UI uses system fonts and does not download fonts at build time.

## Deployment Limits

The owner connector and saved roster flow are designed for a trusted, single-user local instance. One-use handoffs and public-count caches live in process memory, saved rosters use local disk, and planning records use browser storage. Do not expose the local owner endpoints as a shared public service without authentication, authorization, and a suitable persistent storage design. A serverless deployment is not a drop-in replacement for these local workflows.
