# Clearspan Install Calculator (UGS)

An iPad-friendly web app for pricing Clearspan installation and assembly, with an
Admin area for rates and the company logo. It uses the same logic as
`UGS_Clearspan_Install_Costing_v0.1.xlsx`. The tests in `tests/` check that the
app gives the same totals as the spreadsheet.

**The rates are placeholders.** Every rate except the IRD km rate and GST is an
illustrative number so the maths runs. The app shows "DRAFT RATES" until each one
is marked CONFIRMED in Admin.

## What's in the folder

| Path | What it is |
|---|---|
| `public/` | The app (HTML, CSS, JS, icons, offline support) |
| `netlify/functions/rates.mjs` | Saves and serves the shared rates + logo (Netlify Blobs) |
| `netlify.toml` | Tells Netlify where the app and function are |
| `package.json` | Pulls in `@netlify/blobs` for the function |
| `tests/engine.test.cjs` | `npm test` – checks totals against the spreadsheet |

## Deploy to Netlify

Shared rates need the Netlify Function, and functions are deployed from Git or the
Netlify CLI. A drag-and-drop deploy of `public/` still runs the calculator, but
rates and logo are then saved only on each device.

### Option A – from GitHub (recommended)
1. Put this folder in a new GitHub repository.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
   Leave the build command blank; `netlify.toml` sets the publish folder to `public`.
3. Deploy, then go to **Site configuration → Environment variables** and add:
   - `ADMIN_PASSWORD` – long and unique. Required to save rates.
   - `STAFF_PIN` – optional. If set, the calculator asks for it before loading rates.
4. **Deploys → Trigger deploy** so the function picks up the variables.

### Option B – Netlify CLI
```
npm install
npx netlify-cli login
npx netlify-cli init            # or: link to an existing site
npx netlify-cli env:set ADMIN_PASSWORD "your-long-password" --secret
npx netlify-cli deploy --prod
```

## First run
1. Open the site, tap **Admin**, sign in with `ADMIN_PASSWORD`.
2. **Branding & logo**: upload the logo (PNG with transparency or SVG is best), set the contact line.
3. Work through each tab, replace placeholders, set Status to CONFIRMED.
4. Tap **Save rates**. Every iPad gets the new rates next time it opens the app.
5. Tap **Export backup** now and then to keep a copy of the rates file.

## Put it on the iPad
Open the site in Safari → Share → **Add to Home Screen**. It opens full-screen,
and keeps working offline with the last rates it downloaded (saving needs a
connection).

## Security notes
- The admin password is checked on the server; it is never in the page code.
- Anyone with the link can open the calculator and see the price breakdown unless
  `STAFF_PIN` is set. A PIN is light protection, not a login system.
- There's no lock-out after wrong passwords, so use a long admin password.

## Not built yet
- Distance is typed in. Working it out from the site address needs a maps API key.
- Quotes aren't saved or sent anywhere; the customer summary is printed or saved
  as PDF from the iPad's print dialog.
