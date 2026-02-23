# Group Copilot Deployment (Vercel + Hosted Postgres)

This project is a Next.js App Router app with Prisma and NextAuth.

## 1) Recommended production architecture

- **Hosting:** Vercel (web + API routes)
- **Database:** Hosted PostgreSQL (Neon, Supabase, Railway, Render, etc.)
- **Auth:** Google OAuth via NextAuth

> Production should use **Postgres**.  
> Local development can use a sqlite-compatible local Prisma setup if your team maintains that variant.
> Example sqlite local URL: `DATABASE_URL="file:./prisma/dev.db"` (requires sqlite provider in local schema).

---

## 2) Vercel deployment steps

1. Push code to GitHub/GitLab/Bitbucket.
2. In Vercel, click **New Project** and import the repo.
3. Set framework preset to **Next.js** (auto-detected).
4. Add environment variables in Vercel Project Settings:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GEMINI_API_KEY` (optional if using mock mode)
   - `MCP_SERVER_URL` (optional)
   - `MCP_AUTH_TOKEN` (optional)
   - `NEXT_PUBLIC_APP_NAME` (optional)
5. Deploy.

---

## 3) Google OAuth configuration (production)

In Google Cloud Console OAuth settings:

- Add authorized redirect URI:
  - `https://<your-production-domain>/api/auth/callback/google`
- Ensure JavaScript origin includes:
  - `https://<your-production-domain>`
- Set `NEXTAUTH_URL` to your production URL exactly (including `https://`).

---

## 4) Prisma migrations (safe production workflow)

Use deploy-time migration commands (not `migrate dev`):

```bash
npm run prisma:status
npm run prisma:deploy
npm run prisma:generate
```

You can also run the helper:

```bash
node scripts/deploy.mjs
```

This validates required environment variables and executes deploy-safe Prisma commands.

---

## 5) Recommended Postgres providers

- Neon
- Supabase
- Railway
- Render
- Managed Postgres on Fly.io/AWS/GCP/Azure

When possible, enable:

- Connection pooling
- Backups / point-in-time restore
- SSL-enforced connections

---

## 6) Common deployment pitfalls

1. **Using SQLite on Vercel**  
   Vercel filesystem is ephemeral. Use hosted Postgres in production.

2. **Missing `NEXTAUTH_URL`**  
   Login callback URLs break if this is unset or incorrect.

3. **Weak `NEXTAUTH_SECRET`**  
   Use a long random secret in production.

4. **Forgetting production migrations**  
   Run `prisma migrate deploy` before serving traffic.

5. **Missing OAuth production redirect URI**  
   Add the exact production callback URL in Google Cloud Console.
