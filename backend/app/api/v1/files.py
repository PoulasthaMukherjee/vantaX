"""
File serving endpoint.

Provides secure access to uploaded files (resumes, certificates) per SPRINT-PLAN.md.
Supports both local file serving and redirect to GCS signed URLs.
"""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_org, get_current_user, get_db
from app.core.config import settings
from app.models.candidate_profile import CandidateProfile
from app.models.event import Event, EventRegistration
from app.models.organization_user import OrganizationUser
from app.services.resume import get_resume_url, get_storage_backend

router = APIRouter()


@router.get("/files/{file_path:path}")
async def get_file(
    file_path: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org=Depends(get_current_org),
):
    """
    Serve files securely.

    Handles resume files with path format: resumes/{user_id}/{filename}
    Handles certificate files with path format: certificates/{event_id}/{user_id}.pdf

    For local storage: Serves the file directly.
    For GCS storage: Redirects to a signed URL.

    Access rules:
        - User can access their own files
        - Admins/owners/reviewers can access any file in their org

    Args:
        file_path: Relative path to the file (e.g., resumes/user_id/filename.pdf)

    Returns:
        FileResponse (local) or RedirectResponse (GCS)
    """
    # Parse file path to determine type and ownership
    path_parts = file_path.split("/")

    if len(path_parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
        )

    file_type = path_parts[0]

    target_user_id: UUID
    download_filename: str
    content_type = "application/octet-stream"

    if file_type == "resumes":
        if len(path_parts) < 3:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        # Extract user_id from path
        try:
            target_user_id = UUID(path_parts[1])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        filename = path_parts[2]

        # Check authorization
        is_own_file = current_user.id == target_user_id

        if not is_own_file:
            # Check if user is admin/owner/reviewer
            membership = (
                db.query(OrganizationUser)
                .filter(
                    OrganizationUser.organization_id == org.id,
                    OrganizationUser.user_id == current_user.id,
                )
                .first()
            )

            if not membership or membership.role not in ("admin", "owner", "reviewer"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "ACCESS_DENIED",
                        "message": "You can only access your own files",
                    },
                )

        # Verify the profile exists and the file_path matches stored path
        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.organization_id == org.id,
                CandidateProfile.user_id == target_user_id,
            )
            .first()
        )

        if not profile or not profile.resume_file_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        # Verify requested path matches the stored path (security check)
        if file_path != profile.resume_file_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        # Determine content type from filename
        if filename.lower().endswith(".pdf"):
            content_type = "application/pdf"
        elif filename.lower().endswith(".docx"):
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        # Use stored original filename for download if available
        download_filename = profile.resume_filename or filename or "resume"

        if settings.storage_type == "gcs":
            signed_url = get_resume_url(file_path, profile.resume_filename)
            if not signed_url:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={
                        "code": "FILE_NOT_FOUND",
                        "message": "File not found in storage",
                    },
                )
            return RedirectResponse(url=signed_url, status_code=status.HTTP_302_FOUND)

    elif file_type == "certificates":
        # certificates/{event_id}/{user_id}.pdf
        if len(path_parts) != 3:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        try:
            event_id = UUID(path_parts[1])
            target_user_id = UUID(path_parts[2].split(".", 1)[0])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        # Check authorization
        is_own_file = current_user.id == target_user_id
        if not is_own_file:
            membership = (
                db.query(OrganizationUser)
                .filter(
                    OrganizationUser.organization_id == org.id,
                    OrganizationUser.user_id == current_user.id,
                )
                .first()
            )
            if not membership or membership.role not in ("admin", "owner", "reviewer"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "ACCESS_DENIED",
                        "message": "You can only access your own files",
                    },
                )

        # Verify registration + org scope + issued certificate
        registration = (
            db.query(EventRegistration)
            .join(Event, Event.id == EventRegistration.event_id)
            .filter(
                EventRegistration.event_id == event_id,
                EventRegistration.user_id == target_user_id,
                Event.organization_id == org.id,
            )
            .first()
        )

        if (
            not registration
            or not registration.certificate_issued
            or not registration.certificate_url
            or registration.certificate_url != file_path
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
            )

        content_type = "application/pdf"
        event = registration.event
        download_filename = (
            f"{event.slug}-certificate.pdf"
            if event and getattr(event, "slug", None)
            else "certificate.pdf"
        )

        if settings.storage_type == "gcs":
            storage = get_storage_backend()
            signed_url = storage.get_url(file_path, filename=download_filename)
            if not signed_url:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={
                        "code": "FILE_NOT_FOUND",
                        "message": "File not found in storage",
                    },
                )
            return RedirectResponse(url=signed_url, status_code=status.HTTP_302_FOUND)

    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
        )

    # For local storage: serve file directly
    abs_file_path = Path(settings.local_storage_path) / file_path

    if not abs_file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FILE_NOT_FOUND", "message": "File not found on disk"},
        )

    # Security: Ensure path is within storage directory (prevent path traversal)
    try:
        abs_file_path = abs_file_path.resolve()
        storage_dir = Path(settings.local_storage_path).resolve()
        if not str(abs_file_path).startswith(str(storage_dir)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCESS_DENIED", "message": "Invalid file path"},
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FILE_NOT_FOUND", "message": "File not found"},
        )

    return FileResponse(
        path=str(abs_file_path),
        filename=download_filename,
        media_type=content_type,
    )
