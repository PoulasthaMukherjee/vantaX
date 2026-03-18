"""
Vibe Platform - FastAPI Application Entry Point
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.public import router as public_router
from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.core.security import init_firebase

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Runs on startup and shutdown.
    """
    # Startup
    logger.info(f"Starting Vibe Platform API ({settings.environment})")

    # Initialize Firebase
    try:
        init_firebase()
        logger.info("Firebase initialized")
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        # Don't fail startup - Firebase might not be configured in dev

    yield

    # Shutdown
    logger.info("Shutting down Vibe Platform API")


# Create FastAPI application
app = FastAPI(
    title="Vibe Platform API",
    description="AI-powered developer assessment and talent graph platform",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)


# =============================================================================
# Middleware Configuration
# =============================================================================

# Request logging (structured)
from app.middleware.request_logging import RequestLoggingMiddleware

app.add_middleware(RequestLoggingMiddleware)

# Rate limiting (Redis-backed)
from app.middleware.rate_limit import RateLimitMiddleware

app.add_middleware(RateLimitMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Organization-Id",
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)


# =============================================================================
# Exception Handlers
# =============================================================================


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors.
    Prevents stack traces from leaking in production.
    """
    logger.exception(f"Unhandled exception: {exc}")

    if settings.is_production:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred",
                },
            },
        )
    else:
        # In development, include error details
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "type": type(exc).__name__,
                },
            },
        )


# =============================================================================
# Include Routers
# =============================================================================

app.include_router(api_v1_router)
app.include_router(public_router, prefix="/api/public")


# =============================================================================
# Root Endpoint
# =============================================================================


@app.get("/", tags=["root"])
async def root():
    """Root endpoint - API information."""
    return {
        "name": "Vibe Platform API",
        "version": "1.0.0",
        "docs": "/docs" if not settings.is_production else None,
    }
