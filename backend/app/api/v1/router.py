"""
API v1 router - aggregates all v1 endpoints.
"""

import redis
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings

# Create main v1 router
router = APIRouter(prefix="/api/v1")


# =============================================================================
# Health Check Endpoints
# =============================================================================


@router.get("/health", tags=["health"])
async def health_check():
    """
    Basic health check endpoint.
    Returns 200 if the API is running.
    """
    return {
        "status": "ok",
        "environment": settings.environment,
    }


@router.get("/health/ready", tags=["health"])
async def readiness_check():
    """
    Readiness check - verifies all dependencies are available.
    Use for Kubernetes readiness probes.
    """
    from app.core.database import engine

    errors = []

    # Check database
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        errors.append(f"Database: {str(e)}")

    # Check Redis
    try:
        r = redis.from_url(settings.redis_url)
        r.ping()
    except Exception as e:
        errors.append(f"Redis: {str(e)}")

    if errors:
        return {
            "status": "unhealthy",
            "errors": errors,
        }

    return {
        "status": "ready",
        "database": "connected",
        "redis": "connected",
    }


# =============================================================================
# Import and include sub-routers
# =============================================================================

from app.api.v1 import (
    admin_invites,
    admin_jobs,
    admin_system,
    assessments,
    auth,
    events,
    files,
    leaderboard,
    metrics,
    organizations,
    profiles,
    prometheus,
    submissions,
    talent,
)

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(
    organizations.router, prefix="/organizations", tags=["organizations"]
)
router.include_router(
    admin_invites.router, prefix="/admin-invites", tags=["admin-invites"]
)
router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
router.include_router(assessments.router, prefix="/assessments", tags=["assessments"])
router.include_router(submissions.router, prefix="/submissions", tags=["submissions"])
router.include_router(leaderboard.router, tags=["leaderboard"])
router.include_router(metrics.router, tags=["metrics"])
router.include_router(admin_system.router, prefix="/admin", tags=["admin"])
router.include_router(admin_jobs.router, prefix="/admin", tags=["admin-jobs"])
router.include_router(files.router, tags=["files"])
router.include_router(prometheus.router, tags=["monitoring"])
router.include_router(events.router, prefix="/events", tags=["events"])
router.include_router(talent.router, prefix="/talent", tags=["talent"])
