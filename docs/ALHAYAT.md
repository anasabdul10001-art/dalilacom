# Al-Hayat newspaper demo (alhayat.dalilacom.com)

A private demo of a newspaper website, shown to a client. It is hosted inside the DALILACOM service (`dalilacom-prod`), not on its own Render service.

## How it works
- `alhayat/` is a separate Express 5 app (its own `package.json`, SQLite file via `node:sqlite`, uploads). Source: repo `tournament-platform`, branch `claude/arabic-news-platform-xf19t3`, folder `news-platform/server`.
- `src/lib/alhayatHost.ts` is the first middleware in `src/server.ts`. A request goes to the demo when the Host is `alhayat.dalilacom.com` **or** the header `X-Alhayat-Host: 1` is present. Everything else is untouched. The demo is loaded lazily and any failure is caught (the answer is 503 for the demo only).
- Dependencies of the demo are installed by `scripts/install-alhayat.cjs` (run from the root `postinstall`; a failure only warns).
- Every answer carries `X-Robots-Tag: noindex`.

## DNS (Cloudflare, zone dalilacom.com)
Render's workspace allows only 2 custom domains (both used), so the subdomain is not added in Render. Instead:
1. DNS record: `alhayat` CNAME `dalilacom-prod.onrender.com`, proxied (orange cloud).
2. Origin Rule (hostname equals `alhayat.dalilacom.com`): Host header override = `dalilacom.com`, SNI override = `dalilacom.com`.
3. Transform Rule, modify request header (same hostname match): set `X-Alhayat-Host` = `1`.

## Data
The service is on a free plan with an ephemeral disk: the SQLite file and uploads reset on every deploy or restart, and the demo content is re-seeded (`SEED_DEMO=1`). Edits made in the demo admin panel are not kept. A persistent disk (paid) or Postgres would be needed for a real site.

## Environment (optional, on `dalilacom-prod`)
- `ALHAYAT_ADMIN_EMAIL`, `ALHAYAT_ADMIN_PASSWORD`: fixed admin sign-in for `/admin` (min 10 characters). Without them a random password is printed once in the server log at every start.
- `ALHAYAT_SITE_URL`: defaults to `https://alhayat.dalilacom.com`.

## Old service
Render service `alhayat-news` (standalone, suspended by the free limit) is no longer needed once this works; delete it after the owner confirms.
