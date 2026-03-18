"""
Structured request logging middleware.

Logs all requests with request_id, org_id, user_id per SPRINT-PLAN.md.
"""

import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds structured logging to all requests.

    Adds to each log:
        - request_id: Unique identifier for the request
        - org_id: Organization ID from X-Organization-Id header
        - user_id: User ID (set after authentication)
        - method: HTTP method
        - path: Request path
        - status_code: Response status code
        - duration_ms: Request processing time in milliseconds
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]

        # Store request_id on request state for other parts of the app
        request.state.request_id = request_id

        # Extract org_id from header (if present)
        org_id = request.headers.get("X-Organization-Id", "-")

        # Track timing
        start_time = time.time()

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Get user_id from request state (set by auth dependency)
        user_id = getattr(request.state, "user_id", "-")

        # Build structured log data
        log_data = {
            "request_id": request_id,
            "org_id": org_id,
            "user_id": user_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        }

        # Log at appropriate level
        if response.status_code >= 500:
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms:.0f}ms)",
                extra=log_data,
            )
        elif response.status_code >= 400:
            logger.warning(
                f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms:.0f}ms)",
                extra=log_data,
            )
        else:
            logger.info(
                f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms:.0f}ms)",
                extra=log_data,
            )

        # Add request_id to response headers for debugging
        response.headers["X-Request-Id"] = request_id

        return response


def setup_structured_logging():
    """
    Configure structured JSON logging for the application.

    Call this during app startup.
    """
    import json
    import sys

    class JSONFormatter(logging.Formatter):
        """JSON log formatter for structured logs."""

        def format(self, record: logging.LogRecord) -> str:
            log_data = {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }

            # Add extra fields if present
            for key in [
                "request_id",
                "org_id",
                "user_id",
                "method",
                "path",
                "status_code",
                "duration_ms",
            ]:
                if hasattr(record, key):
                    log_data[key] = getattr(record, key)

            # Add exception info if present
            if record.exc_info:
                log_data["exception"] = self.formatException(record.exc_info)

            return json.dumps(log_data)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Create handler with JSON formatter
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    # Clear existing handlers and add new one
    root_logger.handlers = []
    root_logger.addHandler(handler)

    # Set specific log levels
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
