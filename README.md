# TraceyTech

The cockpit at traceytech.app. `app/` holds the page (shell, style, 3D environment, logic). `glass/` holds the React Three Fiber glass layer. The Cloudflare Worker `traceytech-cockpit` serves the built page behind its own Supabase password and authenticator login.

- `npm run build` builds `dist/app.html` and the glass bundle.
- Live app today is the one in `app/` (version eae9f9c1 on 26 Nov 2026). The glass layer is a work in progress and is not yet wired in.
- Real data in the page: the shift rota for Sussex RIT section D (Section Shifts). Everything marked Sample is placeholder data and sends or logs nothing.
