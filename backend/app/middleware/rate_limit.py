"""
Rate limiting middleware using Redis.

Implements per-user and per-endpoint rate limits based on settings.
"""

import hashlib
import time
from typing import Callable, Optional

import redis
from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import settings


def _parse_rate_limit(limit_str: str) -> tuple[int, int]:
    """
    Parse rate limit string like "100/minute" or "5/hour".

    Returns:
        Tuple of (max_requests, window_seconds)
    """
    parts = limit_str.split("/")
    if len(parts) != 2:
        raise ValueError(f"Invalid rate limit format: {limit_str}")

    count = int(parts[0])
    period = parts[1].lower()

    period_seconds = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    if period not in period_seconds:
        raise ValueError(f"Unknown period: {period}")

    return count, period_seconds[period]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Redis-backed rate limiting middleware.

    Uses sliding window algorithm for accurate rate limiting.
    """

    def __init__(self, app, redis_url: str | None = None):
        super().__init__(app)
        self.redis_url = redis_url or settings.redis_url
        self._redis: Optional[redis.Redis] = None

    @property
    def redis_client(self) -> redis.Redis:
        """Lazy Redis connection."""
        if self._redis is None:
            self._redis = redis.from_url(self.redis_url)
        return self._redis

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check rate limits before processing request."""
        # Skip rate limiting for health checks
        if request.url.path in ("/api/v1/health", "/api/v1/health/ready"):
            return await call_next(request)

        # Get user identifier (IP for unauthenticated, user_id for authenticated)
        user_id = self._get_user_identifier(request)

        # Determine which rate limit to apply
        limit_key, max_requests, window_seconds = self._get_rate_limit(request)

        # Build Redis key
        redis_key = f"rate_limit:{limit_key}:{user_id}"

        # Check and update rate limit
        is_allowed, remaining, reset_at = self._check_rate_limit(
            redis_key, max_requests, window_seconds
        )

        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Try again in {reset_at - int(time.time())} seconds.",
                },
                headers={
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                    "Retry-After": str(reset_at - int(time.time())),
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)

        return response

    def _get_user_identifier(self, request: Request) -> str:
        """Get unique identifier for the user."""
        # Try to get user ID from request state (set by auth dependency)
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP address
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"

        return f"ip:{ip}"

    def _get_rate_limit(self, request: Request) -> tuple[str, int, int]:
        """
        Determine rate limit based on endpoint.

        Returns:
            Tuple of (limit_key, max_requests, window_seconds)
        """
        path = request.url.path
        method = request.method

        # Submission-specific limit (stricter)
        if path.startswith("/api/v1/submissions") and method == "POST":
            max_req, window = _parse_rate_limit(settings.rate_limit_submissions)
            return "submissions", max_req, window

        # Auth endpoints
        if path.startswith("/api/v1/auth"):
            max_req, window = _parse_rate_limit(settings.rate_limit_auth)
            return "auth", max_req, window

        # Default API limit
        max_req, window = _parse_rate_limit(settings.rate_limit_api_default)
        return "api", max_req, window

    def _check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int, int]:
        """
        Check and update rate limit using sliding window.

        Returns:
            Tuple of (is_allowed, remaining, reset_timestamp)
        """
        now = int(time.time())
        window_start = now - window_seconds

        try:
            pipe = self.redis_client.pipeline()

            # Remove old entries outside the window
            pipe.zremrangebyscore(key, 0, window_start)

            # Count current requests in window
            pipe.zcard(key)

            # Add current request
            pipe.zadd(key, {f"{now}:{hash(time.time_ns())}": now})

            # Set expiry on the key
            pipe.expire(key, window_seconds + 1)

            results = pipe.execute()
            current_count = results[1]

            # Calculate remaining and reset time
            remaining = max(0, max_requests - current_count - 1)
            reset_at = now + window_seconds

            is_allowed = current_count < max_requests

            return is_allowed, remaining, reset_at

        except redis.RedisError:
            # If Redis fails, allow the request (fail open)
            return True, max_requests, now + window_seconds


# Rate limit dependency for specific endpoints
class RateLimiter:
    """
    Rate limiter for use as a FastAPI dependency.

    Usage:
        @router.post("/submit")
        async def submit(
            _rate_limit: None = Depends(RateLimiter("5/hour"))
        ):
            ...
    """

    def __init__(self, limit: str, key_prefix: str = "endpoint"):
        self.max_requests, self.window_seconds = _parse_rate_limit(limit)
        self.key_prefix = key_prefix
        self._redis: Optional[redis.Redis] = None

    @property
    def redis_client(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.from_url(settings.redis_url)
        return self._redis

    async def __call__(self, request: Request) -> None:
        """Check rate limit."""
        # Get user identifier
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            identifier = f"user:{user_id}"
        else:
            forwarded = request.headers.get("X-Forwarded-For")
            ip = (
                forwarded.split(",")[0].strip()
                if forwarded
                else (request.client.host if request.client else "unknown")
            )
            identifier = f"ip:{ip}"

        key = f"rate_limit:{self.key_prefix}:{identifier}"

        now = int(time.time())
        window_start = now - self.window_seconds

        try:
            pipe = self.redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {f"{now}:{hash(time.time_ns())}": now})
            pipe.expire(key, self.window_seconds + 1)
            results = pipe.execute()

            current_count = results[1]

            if current_count >= self.max_requests:
                reset_at = now + self.window_seconds
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Rate limit exceeded. Try again in {reset_at - now} seconds.",
                    },
                )
        except redis.RedisError:
            # Fail open if Redis is down
            pass
