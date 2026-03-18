# Vibe Platform - Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   API Server    │────▶│   PostgreSQL    │
│   (Vite/React)  │     │   (FastAPI)     │     │   (pgvector)    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Redis Queue   │◀────│   RQ Worker     │
                        │                 │     │   (Scoring)     │
                        └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │   Scheduler     │──────────────┘
                        │   (Cleanup)     │
                        └─────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API | 8000 | FastAPI backend |
| Worker | - | RQ worker for async scoring jobs |
| Scheduler | - | Periodic cleanup and alerts |
| PostgreSQL | 5432 | Primary database with pgvector |
| Redis | 6379 | Job queue and caching |
| Frontend | 3000/5173 | React SPA |

---

## Environment Matrix

### Required Variables (All Environments)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/vibe` |
| `REDIS_URL` | Redis connection string | `redis://host:6379/0` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `vibe-platform-prod` |
| `SECRET_KEY` | App secret for signing | `<random-64-char-string>` |

### LLM Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key (primary) | - |
| `OPENAI_API_KEY` | OpenAI API key (fallback) | - |
| `LLM_PRIMARY_PROVIDER` | Primary LLM provider | `groq` |
| `LLM_FALLBACK_ENABLED` | Enable fallback to secondary | `true` |
| `LLM_MAX_RETRIES` | Max retry attempts | `3` |

### Storage Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_TYPE` | Storage backend (`local` or `gcs`) | `local` |
| `LOCAL_STORAGE_PATH` | Local file storage path | `./uploads` |
| `GCS_BUCKET_NAME` | GCS bucket name | - |
| `GCS_CREDENTIALS_PATH` | Path to GCS service account JSON | - |

### External Services

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_PAT` | GitHub personal access token | - |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key | - |
| `BREVO_SENDER_EMAIL` | Email sender address | `noreply@vibe.dev` |
| `SLACK_WEBHOOK_URL` | Slack webhook for alerts | - |

### API Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `development` |
| `API_HOST` | API bind host | `0.0.0.0` |
| `API_PORT` | API bind port | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-sep) | `http://localhost:3000` |
| `FRONTEND_URL` | Frontend URL for email links | `http://localhost:5173` |

### Budget & Rate Limits

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_DAILY_BUDGET_DEFAULT` | Daily LLM budget (USD) | `10.00` |
| `LLM_MONTHLY_BUDGET_DEFAULT` | Monthly LLM budget (USD) | `100.00` |
| `LLM_BUDGET_WARN_THRESHOLD` | Warning threshold (0-1) | `0.8` |
| `RATE_LIMIT_SUBMISSIONS` | Submission rate limit | `5/hour` |

### Monitoring & SLO

| Variable | Description | Default |
|----------|-------------|---------|
| `ALERT_QUEUE_DEPTH_THRESHOLD` | Queue depth alert threshold | `100` |
| `ALERT_LLM_FAILURE_RATE_THRESHOLD` | LLM failure rate threshold | `0.10` |
| `SLO_API_P95_MS` | API latency SLO (p95 ms) | `400` |
| `SLO_JOB_P95_SECONDS` | Job latency SLO (p95 sec) | `180` |

---

## Environment-Specific Configuration

### Development

```bash
# .env.development
ENVIRONMENT=development
DATABASE_URL=postgresql://vibe:vibe_dev_password@localhost:5432/vibe
REDIS_URL=redis://localhost:6379/0
FIREBASE_PROJECT_ID=vibe-dev
SECRET_KEY=dev-secret-key-not-for-production
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./uploads
```

### Staging

```bash
# .env.staging
ENVIRONMENT=staging
DATABASE_URL=postgresql://vibe:${DB_PASSWORD}@staging-db.internal:5432/vibe
REDIS_URL=redis://staging-redis.internal:6379/0
FIREBASE_PROJECT_ID=vibe-staging
SECRET_KEY=${STAGING_SECRET_KEY}
CORS_ORIGINS=https://staging.vibe.dev
FRONTEND_URL=https://staging.vibe.dev
STORAGE_TYPE=gcs
GCS_BUCKET_NAME=vibe-staging-uploads
```

### Production

```bash
# .env.production
ENVIRONMENT=production
DATABASE_URL=postgresql://vibe:${DB_PASSWORD}@prod-db.internal:5432/vibe
REDIS_URL=redis://prod-redis.internal:6379/0
FIREBASE_PROJECT_ID=vibe-prod
SECRET_KEY=${PROD_SECRET_KEY}
CORS_ORIGINS=https://vibe.dev,https://www.vibe.dev
FRONTEND_URL=https://vibe.dev
STORAGE_TYPE=gcs
GCS_BUCKET_NAME=vibe-prod-uploads
LLM_MONTHLY_BUDGET_DEFAULT=500.00
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK}
```

---

## Deployment Procedures

### Docker Compose (Development/Staging)

```bash
# Start infrastructure only
docker compose up -d postgres redis

# Run migrations
cd backend && alembic upgrade head

# Start full stack
docker compose --profile full up -d

# View logs
docker compose logs -f api worker
```

### Kubernetes (Production)

#### Prerequisites
- Kubernetes cluster (GKE, EKS, or similar)
- kubectl configured
- Helm (optional, for charts)
- Secrets configured in cluster

#### Deployment Steps

1. **Apply secrets**
```bash
kubectl create secret generic vibe-secrets \
  --from-literal=database-url="${DATABASE_URL}" \
  --from-literal=redis-url="${REDIS_URL}" \
  --from-literal=secret-key="${SECRET_KEY}" \
  --from-literal=groq-api-key="${GROQ_API_KEY}" \
  --from-literal=firebase-project-id="${FIREBASE_PROJECT_ID}"
```

2. **Deploy database migrations (Job)**
```bash
kubectl apply -f k8s/migrations-job.yaml
kubectl wait --for=condition=complete job/vibe-migrations --timeout=120s
```

3. **Deploy API**
```bash
kubectl apply -f k8s/api-deployment.yaml
kubectl rollout status deployment/vibe-api
```

4. **Deploy Worker**
```bash
kubectl apply -f k8s/worker-deployment.yaml
kubectl rollout status deployment/vibe-worker
```

5. **Deploy Scheduler**
```bash
kubectl apply -f k8s/scheduler-deployment.yaml
```

6. **Verify health**
```bash
kubectl get pods -l app=vibe
kubectl logs -l app=vibe-api --tail=50
```

---

## Rollback Procedures

### Docker Compose

```bash
# Quick rollback to previous image
docker compose pull  # Get previous tagged images
docker compose up -d --force-recreate api worker

# Or rollback to specific version
docker compose up -d api:v1.2.3 worker:v1.2.3
```

### Kubernetes

```bash
# View rollout history
kubectl rollout history deployment/vibe-api

# Rollback to previous revision
kubectl rollout undo deployment/vibe-api

# Rollback to specific revision
kubectl rollout undo deployment/vibe-api --to-revision=3

# Verify rollback
kubectl rollout status deployment/vibe-api
```

### Database Rollback

```bash
# View migration history
cd backend && alembic history

# Downgrade one revision
alembic downgrade -1

# Downgrade to specific revision
alembic downgrade abc123def456

# CAUTION: Data-destructive migrations may not be reversible
```

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/v1/health` | Liveness probe | `{"status": "ok"}` |
| `GET /api/v1/health/ready` | Readiness probe | `{"status": "ready", "database": "connected", "redis": "connected"}` |

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /api/v1/health/ready
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

## Scaling

### Horizontal Scaling

| Component | Scaling Strategy | Notes |
|-----------|------------------|-------|
| API | HPA on CPU/requests | Stateless, scale freely |
| Worker | Manual or queue-based | Scale based on queue depth |
| Scheduler | Single instance | Leader election if HA needed |
| PostgreSQL | Vertical + read replicas | Use connection pooling |
| Redis | Sentinel/Cluster | For HA |

### Worker Scaling

```bash
# Scale workers based on queue depth
kubectl scale deployment/vibe-worker --replicas=5

# Or use HPA
kubectl autoscale deployment/vibe-worker \
  --min=2 --max=10 \
  --cpu-percent=70
```

---

## Monitoring Checklist

### Pre-deployment
- [ ] All required env vars configured
- [ ] Secrets rotated from staging
- [ ] Database backup verified
- [ ] Rollback plan documented

### Post-deployment
- [ ] Health endpoints returning 200
- [ ] No error spikes in logs
- [ ] Queue depth stable
- [ ] API latency within SLO
- [ ] LLM calls succeeding

### Alerts to Configure
- Queue depth > 100 jobs
- API p95 latency > 400ms
- Job p95 latency > 180s
- LLM failure rate > 10%
- Budget usage > 80%

---

## Troubleshooting

### API Not Starting
```bash
# Check logs
docker compose logs api
kubectl logs -l app=vibe-api

# Common issues:
# - DATABASE_URL incorrect or DB unreachable
# - Missing required env vars
# - Port already in use
```

### Worker Not Processing Jobs
```bash
# Check worker logs
docker compose logs worker
kubectl logs -l app=vibe-worker

# Check Redis connection
redis-cli -u $REDIS_URL ping

# Check queue status
rq info --url $REDIS_URL
```

### Stuck Jobs
```bash
# Run cleanup manually
python -c "from app.worker.cleanup import cleanup_stuck_submissions; print(cleanup_stuck_submissions())"

# Or via scheduler
python -m app.worker.scheduler
```

### Database Connection Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check connection pool
# If using pgbouncer, verify pool settings
```

---

## Security Checklist

- [ ] `SECRET_KEY` is unique per environment (64+ random chars)
- [ ] Database credentials rotated regularly
- [ ] API keys stored in secrets manager
- [ ] CORS origins restricted to known domains
- [ ] Firebase service account has minimal permissions
- [ ] GCS bucket has appropriate IAM policies
- [ ] Network policies restrict inter-service traffic
- [ ] TLS termination at load balancer
- [ ] Rate limiting enabled
