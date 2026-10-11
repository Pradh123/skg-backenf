# Render deployment

Live backend: https://skg-backenf.onrender.com
API base URL: https://skg-backenf.onrender.com/api/v1
Health check: https://skg-backenf.onrender.com/health

Build command: `npm ci`. Start command: `npm start`. Health check path: `/health`.

Set `NODE_ENV=production`, `NODE_VERSION=22`, `TRUST_PROXY=true`, Atlas `MONGODB_URI`, `ADMIN_EMAIL`, a unique strong `ADMIN_PASSWORD`, and the three `CLOUDINARY_*` credentials in Render Environment.

Set `CORS_ORIGINS` to the exact admin and public website origins, comma-separated, without paths or trailing slashes. Keep localhost origins if local frontend access is needed. The backend URL does not need to be added to CORS as a frontend origin.

The deployed admin origin must be included in Render Environment:

```env
CORS_ORIGINS=https://cms-of-skg.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
```

Preserve any other existing frontend origins. Save and redeploy the backend after changing this value. An explicit Render `CORS_ORIGINS` value overrides the code fallback; changing local `.env` does not update Render.

Frontend hosting environment:

```env
VITE_API_URL=https://skg-backenf.onrender.com/api/v1
NEXT_PUBLIC_API_URL=https://skg-backenf.onrender.com/api/v1
SKG_API_URL=https://skg-backenf.onrender.com/api/v1
```

Use `VITE_API_URL` for skg-admin; use `NEXT_PUBLIC_API_URL` and `SKG_API_URL` for skg1. Rebuild and redeploy both frontends after updating hosting variables. Local ignored env files are not uploaded by Git.
