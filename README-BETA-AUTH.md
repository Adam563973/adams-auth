# Beta invitation flow (quick reference)

The code generator runs in `supabase/functions/beta-workflow/index.ts`, not in browser JavaScript. The six-digit code is cryptographically generated, expires in 72 hours, is stored only as a peppered SHA-256 hash, is bound to one applicant account, is single-use, and is locked after eight wrong attempts. The owner email is enforced in both the Edge Function and database policies.

Required server-side secret:

```bash
supabase secrets set BETA_CODE_PEPPER="YOUR-LONG-RANDOM-SECRET-AT-LEAST-24-CHARS"
```

Deploy the function after applying the SQL migration:

```bash
supabase functions deploy beta-workflow
```

Do not commit the Supabase service-role key or the pepper. Do not add admin checks only in front-end JavaScript. The website intentionally displays a masked password/reset action rather than attempting to retrieve a user's password.
