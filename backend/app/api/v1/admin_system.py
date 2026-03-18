"""
Admin system endpoints.

Provides maintenance mode toggle and budget status per SPRINT-PLAN.md.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_org, get_current_user, get_db, require_role
from app.models.logs import AdminAuditLog
from app.models.system_config import SystemConfig
from app.services.budget import check_budget

router = APIRouter()


class MaintenanceModeRequest(BaseModel):
    """Request to toggle maintenance mode."""

    enabled: bool
    reason: str | None = None


class MaintenanceModeResponse(BaseModel):
    """Response for maintenance mode status."""

    enabled: bool
    updated_by: str | None
    updated_at: str | None


@router.get("/system/maintenance")
async def get_maintenance_status(
    db: Session = Depends(get_db),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get current maintenance mode status.

    Requires admin or owner role.
    """
    config = (
        db.query(SystemConfig).filter(SystemConfig.key == "maintenance_mode").first()
    )

    enabled = False
    updated_by = None
    updated_at = None

    if config:
        enabled = (
            config.value
            if isinstance(config.value, bool)
            else str(config.value).lower() == "true"
        )
        updated_by = str(config.updated_by) if config.updated_by else None
        updated_at = config.updated_at.isoformat() if config.updated_at else None

    return {
        "success": True,
        "data": {
            "enabled": enabled,
            "updated_by": updated_by,
            "updated_at": updated_at,
        },
    }


@router.put("/system/maintenance")
async def toggle_maintenance_mode(
    request: MaintenanceModeRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    org=Depends(get_current_org),
    _membership=Depends(require_role("owner")),  # Only owners can toggle maintenance
):
    """
    Toggle maintenance mode on/off.

    Requires owner role. When enabled, blocks new submissions.
    All changes are logged to admin_audit_log.
    """
    from uuid import UUID as UUIDType

    # Get current value for audit log
    old_value = SystemConfig.is_maintenance_mode(db)

    # Update maintenance mode
    SystemConfig.set_value(
        db=db,
        key="maintenance_mode",
        value=request.enabled,
        updated_by=user.id,
    )

    # Log to admin audit (using org context)
    # Use a fixed UUID for system-level targets
    system_target_id = UUIDType("00000000-0000-0000-0000-000000000000")

    audit_log = AdminAuditLog(
        organization_id=org.id,
        admin_id=user.id,
        action="maintenance_mode_toggle",
        target_type="system_config",
        target_id=system_target_id,
        old_value={"enabled": old_value},
        new_value={"enabled": request.enabled},
        reason=request.reason,
    )
    db.add(audit_log)
    db.commit()

    return {
        "success": True,
        "data": {
            "enabled": request.enabled,
            "message": f"Maintenance mode {'enabled' if request.enabled else 'disabled'}",
        },
    }


@router.get("/system/budget")
async def get_budget_status(
    db: Session = Depends(get_db),
    org=Depends(get_current_org),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get current organization's LLM budget status.

    Requires admin or owner role.

    Returns:
        - current_spend_cents: Current month's LLM spend
        - budget_cents: Monthly budget limit (null = unlimited)
        - usage_percent: Percentage of budget used
        - warning: Warning message if approaching limit
        - thresholds: Alert and hard stop thresholds
    """
    status = check_budget(db, org.id)

    return {
        "success": True,
        "data": {
            "organization_id": str(org.id),
            "current_spend_cents": status.current_spend_cents,
            "current_spend_usd": status.current_spend_cents / 100,
            "budget_cents": status.budget_cents,
            "budget_usd": status.budget_cents / 100 if status.budget_cents else None,
            "usage_percent": status.usage_percent,
            "is_allowed": status.allowed,
            "warning": status.warning,
            "thresholds": {
                "warn_percent": 80,
                "hard_stop_percent": 100,
            },
        },
    }
