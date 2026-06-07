# NeuroHR AI — Deployment Guide

This guide covers getting NeuroHR AI running in production without surprises. If you've only run it locally, read the [main README](./README.md) first — then come back here for Docker, cloud, and ops.

---

## What you're deploying

Three services plus MongoDB:

| Service | Port | Role |
|---------|------|------|
| **frontend** | 3000 | Next.js UI |
| **backend-express** | 8000 | API, auth, orchestration |
| **ml-service** | 8001 | Groq pipelines, parsing, scoring |

Mail and Calendar use **Google OAuth** (not SMTP passwords). Plan for token files or a secrets manager in production.

---

## Option 1 — Docker Compose (recommended for demos)

```bash
cp .env.example .env
# Edit: MONGODB_URL, JWT_SECRET, GROQ_API_KEY, ORG_NAME, APP_URL

docker-compose up -d --build

curl http://localhost:8000/health
curl http://localhost:8001/health
```

**Before mail works in containers**, mount OAuth token files or run auth scripts once and persist:

- `backend-express/credentials.json` + `token.json` (HR)
- `backend-express/credentials-1.json` + `agent-token.json` (Agent)

---

## Option 2 — Cloud (AWS / GCP / Azure)

```
                    ┌─────────────┐
                    │   CDN / LB  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌──────▼──────┐   ┌─────▼─────┐
   │ Frontend  │    │  Express    │   │ ML Service│
   │ Vercel /  │    │ ECS / Cloud │   │ ECS /     │
   │ Docker    │    │ Run         │   │ Cloud Run │
   └───────────┘    └──────┬──────┘   └─────┬─────┘
                           │                 │
                    ┌──────▼─────────────────▼──────┐
                    │ MongoDB Atlas · Redis (opt.)  │
                    └───────────────────────────────┘
```

### Frontend (e.g. Vercel)

```bash
cd frontend
# In dashboard: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ML_URL, NEXT_PUBLIC_ORG_NAME
vercel deploy --prod
```

### Backend (Docker)

```bash
cd backend-express
docker build -t neurohr-api .
docker push <registry>/neurohr-api:latest
```

**Environment variables:**

```
MONGODB_URL=mongodb+srv://...
JWT_SECRET=<strong-64-char-secret>
ML_SERVICE_URL=http://ml-service:8001
GROQ_API_KEY=gsk-...
ORG_NAME=YourOrg
APP_URL=https://app.yourdomain.com
HR_EMAIL=hr@yourdomain.com
SMTP_USER=hr@yourdomain.com
AGENT_SMTP_USER=agent@yourdomain.com
KNOWLEDGEBASE_PATH=/app/knowledgebase
REDIS_URL=redis://...
UPLOAD_DIR=/app/uploads
```

### ML service

```bash
cd ml-service
docker build -t neurohr-ml .
docker push <registry>/neurohr-ml:latest
```

Needs:

- `GROQ_API_KEY` (required for production AI)
- `MODEL_DIR` volume for `.pkl` models
- Tesseract in the image for OCR (included in Dockerfile)
- Optional GPU for heavier CV workloads

---

## Option 3 — Kubernetes (sketch)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: neurohr-api
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: api
          image: neurohr-api:latest
          ports:
            - containerPort: 8000
          envFrom:
            - secretRef:
                name: neurohr-secrets
```

Store `GROQ_API_KEY`, `JWT_SECRET`, and Mongo URI in a secrets manager — not plain ConfigMaps.

---

## Database

MongoDB Atlas is the default. Collections and indexes are created on first API startup.

```javascript
// mongosh — create app user
use neurohr_ai
db.createUser({
  user: "neurohr",
  pwd: "secure_password",
  roles: [{ role: "readWrite", db: "neurohr_ai" }]
})
```

Seed demo data only in non-production:

```bash
cd backend-express && npm run seed
```

Set `AUTO_SEED=false` in production.

---

## SSL / HTTPS

Put Nginx or Traefik in front of the API:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Set `APP_URL` to your public frontend URL so emails and Meet links resolve correctly.

---

## Google OAuth in production

1. Create OAuth clients in Google Cloud Console (Desktop or Web, matching your auth scripts).  
2. Download JSON credentials for HR and Agent accounts.  
3. Run auth once (or use a secure CI step) to obtain refresh tokens.  
4. Mount tokens as secrets — `token.json`, `agent-token.json`.  
5. HR token must include **Gmail** and **Calendar** scopes (`npm run auth:calendar`).  
6. Agent token must include **Gmail** (`npm run auth:agent`).  
7. Verify: `npm run verify:mail`

---

## Monitoring

| Endpoint | Expected |
|----------|----------|
| `GET /health` (Express) | `{"status":"healthy"}` or similar |
| `GET /health` (ML) | `{"status":"healthy"}` |

Suggested stack: CloudWatch or Datadog for logs, Sentry for errors, UptimeRobot for pings.

---

## Scaling notes

| Component | Approach |
|-----------|----------|
| Frontend | CDN + static hosting |
| Express | Horizontal replicas behind LB |
| ML service | Scale separately; Groq is external — watch rate limits |
| MongoDB | Atlas tier + replica set for analytics |
| Redis | Optional cache for JD analysis |

ML service pre-trains the ranking model on startup. Bulk resume uploads benefit from async queues at very high volume.

---

## Backup

```bash
mongodump --uri="$MONGODB_URL" --out=backup_$(date +%Y%m%d)
aws s3 sync /app/models s3://your-bucket/models/
aws s3 sync /app/uploads s3://your-bucket/uploads/
```

---

## Security checklist

- [ ] Strong unique `JWT_SECRET`
- [ ] Change all demo passwords (or disable seed)
- [ ] HTTPS everywhere; `APP_URL` matches production
- [ ] CORS restricted to your domains
- [ ] File upload size limits (`MAX_UPLOAD_SIZE_MB`)
- [ ] Secrets in a vault — not committed `.env`
- [ ] OAuth tokens rotated if compromised
- [ ] Rate limiting on `/auth/login`
- [ ] Regular dependency audits

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| API can't reach MongoDB | Check URI, network, Atlas IP allowlist |
| ML timeouts on bulk upload | Increase timeout in `mlClient.js` |
| OCR fails | Tesseract in ML container |
| Frontend API errors | `NEXT_PUBLIC_API_URL` must be public API URL |
| Emails not sending | OAuth tokens expired — re-run auth scripts |
| Groq 503 / token limit | Check `GROQ_REQUEST_TOKEN_BUDGET`; payslip/leave use templates locally |
| Models not persisting | Mount `MODEL_DIR` volume |

---

## Post-deploy smoke test

```bash
# Login
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@neurohr.com","password":"<changed>"}'

# Health
curl https://api.yourdomain.com/health
curl https://ml.yourdomain.com/health
```

For the full hiring path, follow [docs/HIRING_FLOW.md](./docs/HIRING_FLOW.md) against your staging environment.
