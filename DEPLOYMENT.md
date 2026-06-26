# Deploying Splitit

Splitit is a TanStack Start app with a Lovable Cloud (Supabase) backend.
This guide covers pushing the code to **GitHub** and hosting on **Vercel**.

---

## 1. Push the code to GitHub

You can do this from the Lovable editor:

1. In Lovable, open the **+** menu (bottom-left of chat) → **GitHub** → **Connect project**.
2. Authorize the Lovable GitHub App.
3. Pick the GitHub account/org where the repo should live.
4. Click **Create Repository** — Lovable creates a fresh repo and pushes the
   current code. From that point on, Lovable ↔ GitHub stays in two-way sync.

Or, if you already downloaded the code, push it the normal way:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/splitit.git
git push -u origin main
```

---

## 2. Deploy to Vercel

### a. Import the repo

1. Go to <https://vercel.com/new> and import the GitHub repo.
2. **Framework Preset:** leave as **Other** (the bundled `vercel.json`
   already wires everything up).
3. **Build Command, Output Directory, Install Command:** leave as the
   defaults — they come from `vercel.json`.

### b. Set environment variables

In **Project → Settings → Environment Variables**, add these for
**Production**, **Preview**, and **Development**:

| Name                          | Where to find it                                              |
| ----------------------------- | ------------------------------------------------------------- |
| `VITE_SUPABASE_URL`           | Lovable → Cloud → Backend → API → Project URL                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Lovable → Cloud → Backend → API → `publishable` key         |
| `VITE_SUPABASE_PROJECT_ID`    | The project ref (same one used in the URL)                    |
| `SUPABASE_URL`                | Same as `VITE_SUPABASE_URL` (server runtime)                  |
| `SUPABASE_PUBLISHABLE_KEY`    | Same as `VITE_SUPABASE_PUBLISHABLE_KEY` (server runtime)      |
| `SUPABASE_SERVICE_ROLE_KEY`   | Lovable → Cloud → Backend → API → `service_role` key (server) |
| `LOVABLE_API_KEY`             | Lovable → Cloud → AI Gateway → API key (server)               |

> The `VITE_*` keys are inlined at build time for the browser.
> The non-prefixed copies are read by server functions at runtime.

### c. Build settings (already set in `vercel.json`)

```json
{
  "buildCommand": "NITRO_PRESET=vercel vite build",
  "outputDirectory": ".vercel/output",
  "installCommand": "npm install"
}
```

`NITRO_PRESET=vercel` tells the underlying Nitro server bundler (used by
TanStack Start) to emit a Vercel-compatible build under `.vercel/output`.
Vercel picks that up automatically and runs every server function as a
serverless edge function.

### d. Deploy

Click **Deploy**. After the first build succeeds:

- The app is live at `https://<project>.vercel.app`.
- Every push to `main` deploys to production.
- Every PR gets its own preview URL.

---

## 3. Post-deploy checks

- Open `/auth`, create an account, and confirm the dashboard loads.
- Create a group, scan a receipt, and open a share link — the AI receipt
  parser, item claims, and mock checkout should all work.
- Confirm Supabase RLS by trying to read another user's group from the
  console — it should fail.

---

## 4. Custom domain

In **Vercel → Project → Settings → Domains**, add your domain and follow
Vercel's DNS instructions. No code changes required.

---

## 5. Updating Supabase auth redirect URLs

Once you have a production URL, add it to the Supabase auth allow-list so
email/OAuth flows redirect correctly:

- Lovable → Cloud → Backend → **Authentication** → **URL Configuration**
  - **Site URL:** `https://<your-domain>`
  - **Redirect URLs:** `https://<your-domain>/**`

That's it — your app is in production.
