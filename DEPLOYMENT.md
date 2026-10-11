# Self-Hosting Substack Engine

The code is MIT licensed. Fork or clone the repository to deploy your own independent instance. No subscriber data, credentials, private research, or Baekho Research roster is included in the repository or deployment upload.

## Railway

### Shared Publication Research

For a service anyone can use, set `DEPLOYMENT_MODE=shared` and `APP_ORIGIN` to the public HTTPS origin. No shared password is required. Visitors open their own publication URL and have access to Radar, Collaboration Finder and Content Opportunities. This is publication research, not Substack authentication or proof of publication ownership.

In shared mode, radar snapshots and CSV imports stay in each visitor's browser, alongside their collaboration pipeline and editorial calendar. Server saved-roster and legacy database routes are blocked, including direct API access. Two visitors researching the same domain do not share imports. Browser storage is device/browser specific and clearing it removes that visitor's saved work. Public account lookups still send selected names or identifiers to Substack; subscriber membership is not persisted on the shared server. Do not open someone else's CSV on a shared device.

Shared mode does not need a persistent disk, so it also suits ephemeral hosting. Do not configure private-mode variables or upload a local data directory when creating a shared service. Public research consumes hosting and upstream quotas; configure provider spending limits before offering it broadly. There are no registered user accounts, cross-device sync or verified Substack login in this mode.

### Private Single-Owner Hosting

1. Create a Railway project and deploy your fork as a GitHub service. Set the build command to `npm run build`, the start command to `npm run start -- --hostname 0.0.0.0`, the health-check path to `/api/health`, and replicas to one. Use Node.js 22. These settings work without Railway's deprecated `railway.toml` format; infrastructure-as-code users can manage the same settings with [Railway's current configuration tooling](https://docs.railway.com/infrastructure-as-code).
2. Attach a persistent volume mounted at `/data`. Set `SUBSTACK_DATA_DIR=/data`. See [Railway volumes](https://docs.railway.com/volumes/reference).
3. Generate a Railway HTTPS domain, then set `APP_ORIGIN` to exactly that origin, for example `https://your-service.up.railway.app` (no path).
4. Set `DEPLOYMENT_MODE=private`, `APP_USERNAME` to your chosen ASCII username and `APP_PASSWORD` to a long random secret. Generate one locally with `openssl rand -hex 32`. Never put it in Git or a chat message. Store it in Railway service variables and your password manager.
5. Deploy. `/api/health` is public and returns only a status. The application, research APIs and saved rosters require HTTP Basic authentication over HTTPS. Railway automatically enforces private mode; missing or weak configuration returns 503 rather than exposing the app.
6. Open the HTTPS domain, enter your instance credentials, then connect your publication and import your own CSV. The hosted workspace starts empty; local browser data is not automatically transferred.

Use one replica with a volume. Server snapshots live in `/data/radar`; collaboration pipelines and editorial calendars live in that browser's local storage. Configure volume backups in Railway. Research depends on Substack's public endpoints, which may rate-limit or block requests from cloud hosts.

This is a private single-owner application, not a multi-tenant service. Do not share credentials with unrelated users: everyone with those credentials can access the instance's saved roster. Other writers should deploy their own instance. Review Railway usage and billing before provisioning paid resources.

## Other Hosts

Use Node.js 22, `npm ci`, `npm run build`, then `npm run start -- --hostname 0.0.0.0`. Set the same private variables and mount persistent storage at `SUBSTACK_DATA_DIR`. Forward the public Host and HTTPS protocol from your trusted reverse proxy. Do not publicly expose the backend around that proxy.

The public workflow requires neither Postgres nor a Substack cookie. Legacy database routes need their separate database/encryption configuration, and remain protected by the same authentication gate.

## Local Development

Leave private hosting variables unset. `npm install` and `npm run dev` retain localhost-only access for roster storage and matching. `.railwayignore` excludes local snapshots, credentials, generated builds and dependencies from CLI uploads.
