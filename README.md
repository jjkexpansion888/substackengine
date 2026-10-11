# Substack Engine

Substack Engine combines public audience research with collaboration and editorial planning tools, built with Next.js. Enter a Substack subdomain, publication URL, custom domain, or profile URL (`substack.com/@handle`) to use all three features without logging in or installing an extension. Profile URLs and `@handles` resolve to the profile's primary publication. Subscriber CSV import is optional.

## Capabilities

- **Radar:** discover public participants, rank readers by available audience signals, filter evidence, recover missing counts, and export results.
- **Subscriber CSV import:** preview and deduplicate an exported roster, match explicit public accounts, fetch their public subscriber counts, and rank them. Email addresses stay off the server.
- **Collaboration Finder:** rank potential partners, diversify recommendations, learn from ratings, and track outreach and manually verified outcomes.
- **Content Opportunities:** compare your writing with outside Substacks, identify supported editorial hypotheses, and read topic-specific research briefs linked to your archive.

Every opened publication includes Radar, Collaboration Finder, and Content Opportunities in the navigation. Radar is the initial view; the other tools load only when selected, without requiring owner access.

Export your subscriber list from Substack, then choose **Import subscribers** in Radar. No extension, OAuth, password, or cookie is required. Importing a file does not establish publication ownership.

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

## Subscriber CSV Import

Export your list from your publication's Subscribers dashboard, then choose **Import subscribers**, select the CSV, review the counts, and choose **Import and rank**. Files can contain up to 10,000 rows and 5 MB. Quoted fields, multiline values, BOMs, and common delimiter formats use Papa Parse. Legacy sanitized JSON exports remain readable.

Account matching uses explicit `user_id` / `substack_user_id`, `handle` / `user_handle`, or `profile_url` / `user_profile_url` / `substack_profile_url` columns. Profile URLs must point to `https://substack.com/@handle` or `https://substack.com/profile/<numeric-id>`. IDs stay strings, including large IDs. Duplicate IDs, handles, or email rows are reconciled locally; conflicting identities reject the file rather than attaching the wrong audience. Subscriber-count columns in CSV are not trusted.

**An email-only Substack export cannot reliably reveal public account identities.** Rows without names or explicit identities remain unresolved. Named rows can be matched automatically to likely public accounts; these guesses are labeled separately from explicit identities. Emails are discarded before transmission and persistence and never used for guessing. Counts are checked against the selected public account, which does not verify that the subscriber is that person. Known subscriber counts rank highest, then bestseller badges, then unknown audiences. Unknown is not zero; follower counts are not substituted. Public counts may be rounded, unpublished, or temporarily unavailable.

Sanitized imports are retained per publication in browser storage. The local app also saves radar snapshots and recovered counts in ignored `.local-data/radar/<domain>.json` files. Remove imported list removes the saved roster. Existing saved owner snapshots remain readable for compatibility, but browser sync and its extension have been removed. The public-count cache stores only public identifiers and audience signals in server memory; restarting the server clears it.

**Automatic account matching** searches all remaining imported names in resumable runs, with five names per request. Normalized exact-name matches (including accents, punctuation and reordered name tokens) are assigned without confirmation. Ties prefer accounts with a publication, not the largest audience; duplicate assignments are skipped. Name search does not fetch audience counts or profile pages. Count enrichment pauses during name matching and resumes afterward, so restricted count lookups do not block identity discovery. Cached exact-name candidates are applied first, and matches enter the ranking after each batch. Guesses retain their similarity score in saved rosters and are labeled "Inferred match" in the table and CSV export; the score is not an identity probability. Names are sent to Substack for search; emails are never sent. Counts are checked against the chosen public account, not assumed from its name. Rate limits or access checks on the search endpoint stop the run; resuming retries unavailable or unattempted names. Profiles absent from public search remain unresolved.

Rate-limited name searches automatically resume after a cooldown, backing off after repeated failures. Three consecutive retries without progress pause the run. Access restrictions are not automatically retried. Matching continues while the subscriber view stays open; stopping or leaving the view preserves completed matches and search results.

When search itself provides a positive public subscriber count on a valid profile ID/handle, the server caches it for that account without an extra profile request. Follower counts, nested publication counts and private fields are ignored. These public account counts do not verify the inferred subscriber identity.

The public profile-search JSON response has a bounded 16 MB allowance for Substack's large search payloads. Other public responses retain the 5 MB limit; DNS checks, HTTPS requirements, deadlines and candidate-field sanitization remain in place.

CSV imports and confirmed matches update the roster without rescanning every discussion. All three features remain available after an import. Substack's public web endpoints are unofficial and may change or restrict access. Rate limits pause lookups and partial results remain explicit.

## Collaboration Finder

Collaboration Finder and Content Opportunities are available for ordinary public searches and CSV imports, as well as legacy saved snapshots. Every search and restored publication starts on Radar; research tools are mounted only when explicitly selected, not loaded invisibly alongside the results.

The Collaboration finder is a single-publication workspace. It automatically uses the connected publication's name, URL, writing and current subscriber coverage for matching and outreach, without a setup form. Balanced matching and shortlist diversity are enabled automatically. Old backups restore partner records and scans, not stale publication identity or matching settings. A TF-IDF/latent semantic model selects up to ten outside publications from an existing topic-source library based on your writing, independently of your subscriber roster. Discovery also samples up to 36 community profiles and 16 profiles from other publications' public discussions. Find more collaborators retains earlier results and skips reloading their archives. Requests use the radar's HTTPS/DNS protections, a 160-request budget, bounded concurrency, and a 65-second scheduling deadline. Rate limiting stops additional requests; partial results include warnings. This is bounded public-network research, not a search of every Substack or a neural embedding model.

Matching runs locally without API keys. It fits TF-IDF vectors to publication descriptions and recent titles/subtitles. On corpora with 5-250 documents and sufficient vocabulary it uses `ml-matrix` SVD for latent semantic analysis, blended with lexical cosine similarity; larger corpora use lexical cosine to bound browser work. Topic fit, observed relationship activity, audience scale, recency, public reach, and shared public participants contribute to balanced scores. Missing counts remain unknown. Maximum marginal relevance diversifies the top 50 results. A regularized ridge regression preference model activates after at least six ratings including both positive and negative examples, with its contribution capped at 20% of the score.

Scores are relative fit indicators, not calibrated success probabilities. This is a corpus-trained statistical model, not a pretrained neural embedding model. Shared participants come from samples of public discussions and must not be interpreted as full subscriber overlap. Evidence confidence describes coverage, not predictive accuracy. Collaboration ideas and outreach drafts are grounded templates; outcome attribution requires manual verification in publication analytics.

The finder includes guest posts, interviews, joint live sessions, editorial recommendations, saved partners, pipeline stages, follow-up dates, editable drafts, campaign URLs, and manually reported subscribers/clicks/hours. Preferences, drafts, scan results, and pipeline records persist per publication in this browser's local storage. They stay available while switching features. CSV exports reflect the current view; JSON exports can be restored to the matching publication, with existing pipeline records taking precedence. Messages are never sent automatically. Known writer publication metadata is reused from Radar to reduce upstream lookups.

## Content Opportunities

Content Opportunities looks for connections between your existing writing and sampled articles from across Substack, independently of subscriber accounts. It reads up to 48 archive entries from your publication and attempts public article text for ten. Semantic topic matching selects outside source publications, then public recommendation pages from your publication and up to three related writers expand the pool to at most 24 publications, with eight recent entries each (up to 192 outside articles). Recommendations are interleaved across writers for breadth; the existing alignment and novelty model filters the resulting ideas against your writing. It attempts public text for up to 24 relevant outside articles. Editorial focus, up to six additional source domains, and optional reader questions let you steer the research. Subscriber identities are not sent to the content-research endpoint.

Discovery uses local TF-IDF and up to 16 latent semantic topics to compare alignment with your archive, estimated coverage gaps, and outside source support. It includes editorial hypotheses across AI agents/security, macro/capital allocation, quantitative markets, biotechnology, and culture/institutions, plus named-entity case-study angles when supported by source metadata. Public reader questions can also become opportunities. Rankings are relative research signals, not verified forecasts, audience-growth promises, or proof of originality.

Each cross-Substack angle has its own distinct contribution and four-step research strategy: for example, investment model risk calls for a leakage audit and holdout test, while human taste calls for a curation comparison and investigation of willingness to pay. Plans identify evidence to seek, counterexamples that could weaken the thesis, a starting source, and a connection to your earlier writing. These are topic-specific editorial playbooks, not free-form AI generation or claims that cited writers endorse the proposed connection.

The editorial brief is read-only: a headline and hypothesis, visual alignment/newness/priority indicators, topic dimensions, a numbered research plan, outside citations, and links to your own posts. Copy and save actions remain available. The separate editorial calendar supports publication dates, status tracking, removal with undo, and CSV export of saved briefs. Research inputs, scan results, and calendar entries persist in this browser per publication; they are not synced across browsers or ports.

Research uses a 96-request budget, bounded concurrency, and a 75-second scheduling deadline. Public recommendation HTML is parsed with parse5; only explicit recommendation links are followed through the existing HTTPS and DNS protections. Unavailable recommendation pages fall back to topic sources. Unavailable public text falls back to title/subtitle metadata, and rate limits produce partial results with warnings. The scan is not exhaustive, estimated newness is relative to the sampled archive, and paywalled or authenticated article text is not accessed.

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

CSV import works on the active local port. Browser-local research and planning data is not shared between ports.

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

CSV imports and saved rosters are designed for a trusted, single-user local instance. Public-count caches live in process memory, saved rosters use local disk, and planning records use browser storage. Do not expose roster endpoints as a shared public service without authentication, authorization, and a suitable persistent storage design. A serverless deployment is not a drop-in replacement for these local workflows.
