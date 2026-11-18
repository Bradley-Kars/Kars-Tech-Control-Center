# KTS Static Deploy Baseline

Minimal, unbranded static starter used as a **deploy-path smoke test** — it proves the
"build here → ship to a static host" pipeline works end-to-end before a real client brief.

- Base design system: Vercel-style (Geist, shadow-as-border, near-achromatic palette).
- Content: generic template placeholders only — no client branding.
- Output: plain static files, no build step, no backend.

## Contents

| File | Purpose |
|---|---|
| `index.html` | The page (hero, pipeline, proof, deploy notes, footer) |
| `styles.css` | Design tokens + layout |
| `netlify.toml` | Netlify config (`publish = "."` + headers) |
| `_headers` | Cloudflare Pages headers (cache + security) |

## Deploy (one line each)

- **Netlify:** drag this folder onto `app.netlify.com/drop` (or `netlify deploy --prod --dir .`).
- **Cloudflare Pages:** `npx wrangler pages deploy . --project-name kts-static-baseline`.
- **Local preview:** `python3 -m http.server 8080 --directory .` then open `http://127.0.0.1:8080`.

Preview locally on the Omarchy box only — never serve production from this box.
When a live domain is chosen, `@net-diag` verifies DNS/routing before it is pointed at the host.

## Reuse

When a real brief arrives, replace copy/content inside this proven shell; keep the
host config and layout scaffolds.
