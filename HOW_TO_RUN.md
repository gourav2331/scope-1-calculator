# How to Run — Sustally Scope 1 Calculator

A step‑by‑step guide to run this project yourself from VS Code on your Mac.
No external database or cloud service is needed — it uses a local SQLite file.

---

## 1. Prerequisites (one time)

| Tool | Version | Check command | Notes |
|---|---|---|---|
| Node.js | 20 or newer | `node -v` | You already have v25 — fine. |
| npm | 9 or newer | `npm -v` | Comes with Node. |

That's it. SQLite is file‑based and bundled — nothing to install or start.

If you ever need Node, install it from <https://nodejs.org> (LTS) or via `nvm`.

---

## 2. Open the project in VS Code

1. Open **VS Code**.
2. **File → Open Folder…** and choose:
   `/Users/sourav/Desktop/scope 1 calculator`
3. Open the integrated terminal: **Terminal → New Terminal**
   (or press `` Ctrl + ` ``). All commands below run in this terminal.

Recommended VS Code extensions (optional, click "Install" if prompted):
- **ESLint**
- **Prettier**

---

## 3. One‑time setup

In the VS Code terminal:

```bash
npm install
```

This installs all dependencies (a few minutes the first time).

### Environment file

The project needs a `.env` file. One already exists in the folder. If it is
ever missing, recreate it:

```bash
cp .env.example .env
```

Then open `.env` and make sure it looks like this (the secret can be any long
random string):

```
DATABASE_URI=file:./sustally-scope1.db
PAYLOAD_SECRET=replace-with-a-long-random-string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

To generate a strong secret, run this and paste the output as `PAYLOAD_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Run the app (the main command)

```bash
npm run dev
```

Wait for `✓ Ready`, then open in your browser:

- **Calculator:** <http://localhost:3000>
- **Admin (Payload):** <http://localhost:3000/admin>

The first time you open `/admin`, it asks you to **create an admin user**
(email + password). Use any email/password — it is stored locally.

**To stop the server:** click in the terminal and press `Ctrl + C`.

> If port 3000 is busy, Next.js automatically uses 3001 — read the terminal,
> it prints the exact URL.

---

## 5. Seed the factor library (optional)

This copies the built‑in emission factors into the admin UI so you can view
their sources. The calculator works without it, but it's nice to have.

Run it **once**, with the dev server stopped or in a second terminal:

```bash
npm run seed
```

---

## 6. Using the calculator

1. **Sector** → Cement (already selected) → Continue
2. **Organisation** → enter company name → Continue
3. **Facility & methods** → facility name, reporting year, pick methods → Continue
4. **Activity data** — four Scope 1 tabs:
   - **Process** — e.g. Clinker produced = `1000000`
   - **Stationary combustion** — add kiln / non‑kiln fuels
   - **Mobile combustion** — owned vehicles/equipment
   - **Fugitive** — refrigerant / SF₆ leakage
   - Leave a field **blank** = missing/unknown; type **0** only for a real zero.
5. **Calculate Scope 1** → results page → **Download** PDF / Excel / JSON,
   or **Save draft to database**.

---

## 7. Other useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development (hot reload). |
| `npm run build` | Production build (checks the whole project compiles). |
| `npm run start` | Run the production build (do `npm run build` first). |
| `npm test` | Run the calculation engine test suite (must stay green). |
| `npm run test:watch` | Re‑run tests automatically while editing. |
| `npm run seed` | Load the factor library into the admin. |
| `npm run lint` | Check code style. |

You can also run any of these from VS Code: open `package.json`, and click
the small **▷ Run** link that appears above each entry in the `"scripts"`
section.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: npm` | Install Node.js from <https://nodejs.org>, reopen VS Code. |
| Port 3000 already in use | Use the URL Next prints (e.g. 3001), or stop the other process. |
| Page won't load / weird state | Stop (`Ctrl+C`), run `npm run dev` again. |
| Want a clean database | Stop the server, delete the file `sustally-scope1.db`, then `npm run dev` (a fresh DB is created) and `npm run seed` again. You'll create a new admin user. |
| Changed `.env` | Stop and restart `npm run dev` so it reloads. |
| Tests failing after edits | Run `npm test` to see which calculation broke — the engine is the source of truth, fix the code, not the test. |

---

## 9. What is where (quick map)

| Path | What it is |
|---|---|
| `src/lib/engine/` | The calculation engine (the audited core). |
| `src/lib/engine/__tests__/` | The test suite proving the math. |
| `src/components/scope1-wizard.tsx` | The calculator UI (the 5‑step wizard). |
| `src/app/api/v1/` | The calculate / validate / export / factors APIs. |
| `src/collections/` | Payload admin data models. |
| `src/seed/index.ts` | Seeds the factor library. |
| `sustally-scope1.db` | Your local SQLite database (safe to delete to reset). |

---

Need to host this online later? The same `npm run build` + `npm run start`
runs anywhere Node runs; just set the three `.env` variables on the host.
