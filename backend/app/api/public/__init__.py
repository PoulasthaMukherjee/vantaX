"""
Public API endpoints (no authentication required).
"""

from fastapi import APIRouter

from app.api.public import profiles

router = APIRouter()

router.include_router(profiles.router, prefix="/profiles", tags=["Public Profiles"])
