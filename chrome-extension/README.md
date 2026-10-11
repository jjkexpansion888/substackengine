# Substack Engine Chrome Connector

This Manifest V3 connector uses your signed-in Chrome session on the active publication. You never need to find, paste, or send a cookie ID. It uses `activeTab` and `scripting`, plus optional access to `http://localhost:3000/*` for direct sync and `https://substack.com/*` for public profile lookups. There is no `cookies` permission or blanket website access. The ChatGPT Chrome extension is not required.

## Install

1. Unzip `substack-radar-helper.zip`.
2. Open `chrome://extensions` in Chrome and enable Developer mode.
3. Click **Load unpacked** and select the extracted `chrome-extension` folder containing `manifest.json`.
4. If updating an older connector, replace the extracted files and click the extension's reload button. The persistent-tab public-audience lookup version is 0.4.1.

## Your Own Publication

1. Sign in normally in Chrome, then open `https://your-publication.substack.com/publish/subscribers`.
2. Start the local app on `http://localhost:3000`.
3. Click the extension and **Sync to local app**. Allow localhost and Substack profile access when Chrome prompts. A dedicated sync tab reads pages of 50 and checks public profiles; this can take several minutes. Keep that tab open, but you can switch to other tabs while it runs.
4. The connector automatically opens the matching publication in the local app with your owner roster. No export or import is needed.

Chrome automatically attaches the active publication's session to same-origin requests. The extension never reads a cookie value. Owner access is still required: a rejected session, rate limit, or browser verification stops the sync rather than bypassing Substack's checks.

The connector drops email addresses in Chrome and sends only Substack user IDs, names, public handles, and public audience snapshots. It resolves missing handles through numeric-ID public profile pages, verifies the returned profile ID, and reads only that profile's subscriber count, never follower counts or recommendations. Public lookups omit credentials and stop on access checks or rate limits. It never guesses a handle from a name or email. Unresolved profiles remain unknown, not zero. The localhost server holds the sanitized roster in memory behind a random one-use link for at most five minutes. After claiming it, the app automatically saves the sanitized roster and scan results to `.local-data/radar/<domain>.json` on your machine. These files have owner-only permissions and are ignored by Git. Reopening the publication restores the snapshot without using the extension again; a new sync is needed only for roster changes. Remove imported list removes its saved snapshot. Restarting the server invalidates pending sync links but not saved scans. Direct sync supports the local single-process server on port 3000.

Roster collection is capped at 10,000 rows and two minutes. Public profile collection is sequential, spaced by 300 ms, and capped at fifteen additional minutes; a timeout retains partial results. Version 0.4.2 checkpoints public counts to localhost every 25 profiles and resumes from unexpired cached profiles on subsequent syncs. Public counts are shared with open local-app views every 15 seconds and reused during refresh. Known cache entries expire after one hour, while unpublished-count results expire after five minutes. Restarting the server clears this memory cache; opening a saved scan restores its known counts. The packet records the rows read and reported total; the app warns when it is incomplete or some rows lacked usable user IDs. Profile totals can span multiple publications, while the owner endpoint is publication-scoped.

## Someone Else's Publication

Open `https://substack.com/@handle/subscribers`, select Subscribers, and scroll to load rows. Click **Export loaded subscribers**, then import the JSON into the matching publication. This exports only loaded public rows (maximum 1,000), not private subscriptions. Public imports are saved locally by domain and can be removed in the app.

## Ranking And Verification

The app ranks subscribers by their own public audience counts, then bestseller badges, then unknown audiences. Counts may be rounded. Initial scans look up at most 100 profiles; **Look up next 50** continues enrichment. No audience data is fabricated for private or missing profiles.

The public DOM collector and direct owner sync were verified in signed-in Chrome. On October 11, 2026, the persistent-tab sync and subsequent lookups showed 403 ranked profiles, 277 public audience counts, and 126 unknown audiences against 639 reported subscribers. Descending order and unknowns-last were verified in the live table. Some owner rows lacked usable IDs, and the bounded scan leaves unresolved profiles; this is not a complete audience ranking. Owner pagination, credential usage, sanitization, failures, and 638-row handling are also covered by automated mocked-endpoint tests. Direct transfer, one-use links, expiry, origin checks, module reloads, tab switching, masked placeholder zeros, and popup failures are tested. Substack's unofficial endpoints can change.
