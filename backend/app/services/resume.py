"""
Resume upload service.

Handles file validation, storage, and retrieval for candidate resumes.
Supports both local filesystem and Google Cloud Storage backends.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import BinaryIO
from uuid import UUID

import aiofiles

from app.core.config import settings

# Allowed MIME types for resumes
ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

# Maximum file size (20MB)
MAX_FILE_SIZE = 20 * 1024 * 1024

# Signed URL expiration time
SIGNED_URL_EXPIRATION_MINUTES = 15


@dataclass
class UploadResult:
    """Result of a file upload operation."""

    success: bool
    error: str | None = None
    file_path: str | None = None
    filename: str | None = None


# =============================================================================
# Storage Backend Abstraction
# =============================================================================


class StorageBackend(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    async def save(self, file_path: str, content: bytes, content_type: str) -> bool:
        """Save content to storage."""
        pass

    @abstractmethod
    async def delete(self, file_path: str) -> bool:
        """Delete a file from storage."""
        pass

    @abstractmethod
    def get_url(self, file_path: str, filename: str | None = None) -> str | None:
        """Get a URL to access the file."""
        pass

    @abstractmethod
    def exists(self, file_path: str) -> bool:
        """Check if a file exists."""
        pass

    @abstractmethod
    async def read(self, file_path: str) -> bytes | None:
        """Read file content from storage."""
        pass

    @abstractmethod
    def list_prefix(self, prefix: str) -> list[str]:
        """List all file paths with the given prefix."""
        pass

    @abstractmethod
    async def delete_prefix(self, prefix: str) -> bool:
        """Delete all files with the given prefix."""
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend."""

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def save(self, file_path: str, content: bytes, content_type: str) -> bool:
        """Save content to local filesystem."""
        try:
            full_path = self.base_path / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)

            async with aiofiles.open(full_path, "wb") as f:
                await f.write(content)
            return True
        except Exception:
            return False

    async def delete(self, file_path: str) -> bool:
        """Delete a file from local filesystem."""
        try:
            full_path = self.base_path / file_path
            if full_path.exists():
                full_path.unlink()
                return True
            return False
        except Exception:
            return False

    def get_url(self, file_path: str, filename: str | None = None) -> str | None:
        """Get API URL for local file access."""
        full_path = self.base_path / file_path
        if full_path.exists():
            return f"/api/v1/files/{file_path}"
        return None

    def exists(self, file_path: str) -> bool:
        """Check if file exists locally."""
        return (self.base_path / file_path).exists()

    async def read(self, file_path: str) -> bytes | None:
        """Read file content from local filesystem."""
        try:
            full_path = self.base_path / file_path
            if not full_path.exists():
                return None
            async with aiofiles.open(full_path, "rb") as f:
                return await f.read()
        except Exception:
            return None

    def list_prefix(self, prefix: str) -> list[str]:
        """List all file paths with the given prefix."""
        try:
            prefix_path = self.base_path / prefix
            if not prefix_path.exists():
                return []

            files = []
            for path in prefix_path.rglob("*"):
                if path.is_file():
                    # Return relative path from base
                    files.append(str(path.relative_to(self.base_path)))
            return files
        except Exception:
            return []

    async def delete_prefix(self, prefix: str) -> bool:
        """Delete all files with the given prefix."""
        import shutil

        try:
            prefix_path = self.base_path / prefix
            if prefix_path.exists():
                shutil.rmtree(prefix_path)
            return True
        except Exception:
            return False


class GCSStorageBackend(StorageBackend):
    """Google Cloud Storage backend with signed URL support."""

    def __init__(self, bucket_name: str, credentials_path: str | None = None):
        from google.cloud import storage

        if credentials_path:
            self.client = storage.Client.from_service_account_json(credentials_path)
        else:
            # Uses default credentials (GOOGLE_APPLICATION_CREDENTIALS or metadata server)
            self.client = storage.Client()

        self.bucket_name = bucket_name
        self.bucket = self.client.bucket(bucket_name)

    async def save(self, file_path: str, content: bytes, content_type: str) -> bool:
        """Upload content to GCS."""
        try:
            blob = self.bucket.blob(file_path)
            blob.upload_from_string(content, content_type=content_type)
            return True
        except Exception:
            return False

    async def delete(self, file_path: str) -> bool:
        """Delete a file from GCS."""
        try:
            blob = self.bucket.blob(file_path)
            if blob.exists():
                blob.delete()
                return True
            return False
        except Exception:
            return False

    def get_url(self, file_path: str, filename: str | None = None) -> str | None:
        """
        Generate a signed URL for temporary access to the file.

        The signed URL expires after SIGNED_URL_EXPIRATION_MINUTES.
        """
        try:
            blob = self.bucket.blob(file_path)
            if not blob.exists():
                return None

            # Generate signed URL with expiration
            expiration = timedelta(minutes=SIGNED_URL_EXPIRATION_MINUTES)

            # Set content disposition for download filename
            response_disposition = None
            if filename:
                # Sanitize filename for Content-Disposition header
                safe_filename = filename.replace('"', '\\"')
                response_disposition = f'attachment; filename="{safe_filename}"'

            url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="GET",
                response_disposition=response_disposition,
            )
            return url
        except Exception:
            return None

    def exists(self, file_path: str) -> bool:
        """Check if file exists in GCS."""
        try:
            blob = self.bucket.blob(file_path)
            return blob.exists()
        except Exception:
            return False

    async def read(self, file_path: str) -> bytes | None:
        """Read file content from GCS."""
        try:
            blob = self.bucket.blob(file_path)
            if not blob.exists():
                return None
            return blob.download_as_bytes()
        except Exception:
            return None

    def list_prefix(self, prefix: str) -> list[str]:
        """List all file paths with the given prefix."""
        try:
            blobs = self.client.list_blobs(self.bucket_name, prefix=prefix)
            return [blob.name for blob in blobs]
        except Exception:
            return []

    async def delete_prefix(self, prefix: str) -> bool:
        """Delete all files with the given prefix."""
        try:
            blobs = list(self.client.list_blobs(self.bucket_name, prefix=prefix))
            for blob in blobs:
                blob.delete()
            return True
        except Exception:
            return False


# =============================================================================
# Storage Backend Factory
# =============================================================================


_storage_backend: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    """
    Get the configured storage backend.

    Uses settings.storage_type to determine which backend to use:
    - 'local': Local filesystem storage
    - 'gcs': Google Cloud Storage

    Returns:
        Configured StorageBackend instance
    """
    global _storage_backend

    if _storage_backend is not None:
        return _storage_backend

    if settings.storage_type == "gcs":
        if not settings.gcs_bucket_name:
            raise ValueError("GCS_BUCKET_NAME required when storage_type=gcs")
        _storage_backend = GCSStorageBackend(
            bucket_name=settings.gcs_bucket_name,
            credentials_path=settings.gcs_credentials_path,
        )
    else:
        _storage_backend = LocalStorageBackend(settings.local_storage_path)

    return _storage_backend


def reset_storage_backend():
    """Reset storage backend (for testing)."""
    global _storage_backend
    _storage_backend = None


# =============================================================================
# Resume Operations
# =============================================================================


def _generate_file_path(user_id: UUID, original_filename: str, extension: str) -> str:
    """
    Generate a unique file path for a resume.

    Path format: resumes/{user_id}/{timestamp}_{filename}{extension}
    """
    # Sanitize filename
    safe_filename = "".join(c for c in original_filename if c.isalnum() or c in "._-")
    if not safe_filename:
        safe_filename = "resume"

    # Remove extension from original if present
    safe_filename = (
        safe_filename.rsplit(".", 1)[0] if "." in safe_filename else safe_filename
    )

    # Generate unique filename with timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    final_filename = f"{timestamp}_{safe_filename}{extension}"

    # Return relative path for storage
    return f"resumes/{user_id}/{final_filename}"


def validate_mime_type(content_type: str | None) -> tuple[bool, str | None]:
    """
    Validate file MIME type.

    Returns (is_valid, extension or error message)
    """
    if not content_type:
        return False, "Content-Type header required"

    if content_type not in ALLOWED_MIME_TYPES:
        allowed = ", ".join(ALLOWED_MIME_TYPES.keys())
        return False, f"Invalid file type. Allowed: {allowed}"

    return True, ALLOWED_MIME_TYPES[content_type]


def validate_file_size(size: int) -> tuple[bool, str | None]:
    """
    Validate file size.

    Returns (is_valid, error message if invalid)
    """
    if size > MAX_FILE_SIZE:
        return (
            False,
            f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )
    return True, None


async def save_resume(
    user_id: UUID,
    file: BinaryIO,
    filename: str,
    content_type: str,
    file_size: int,
) -> UploadResult:
    """
    Save a resume file.

    Uses the configured storage backend (local or GCS).

    Args:
        user_id: User ID for the resume owner
        file: File-like object with the resume content
        filename: Original filename
        content_type: MIME type of the file
        file_size: Size of the file in bytes

    Returns:
        UploadResult with file path on success
    """
    # Validate MIME type
    is_valid, ext_or_error = validate_mime_type(content_type)
    if not is_valid:
        return UploadResult(success=False, error=ext_or_error)

    extension = ext_or_error or ".pdf"  # Default fallback, validated above

    # Validate file size
    is_valid, error = validate_file_size(file_size)
    if not is_valid:
        return UploadResult(success=False, error=error)

    # Generate file path
    file_path = _generate_file_path(user_id, filename, extension)

    try:
        # Read content from file object
        content = file.read()

        # Additional size check on actual content
        if len(content) > MAX_FILE_SIZE:
            return UploadResult(
                success=False, error="File content exceeds maximum size"
            )

        # Save using storage backend
        storage = get_storage_backend()
        success = await storage.save(file_path, content, content_type)

        if not success:
            return UploadResult(success=False, error="Failed to save file to storage")

        return UploadResult(
            success=True,
            file_path=file_path,
            filename=filename,
        )

    except Exception as e:
        return UploadResult(success=False, error=f"Failed to save file: {str(e)}")


async def delete_resume(file_path: str) -> bool:
    """
    Delete a resume file.

    Args:
        file_path: Relative path to the resume file

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        storage = get_storage_backend()
        return await storage.delete(file_path)
    except Exception:
        return False


def get_resume_url(file_path: str, filename: str | None = None) -> str | None:
    """
    Get a URL to access a resume.

    For local storage: Returns an API path served by the app.
    For GCS storage: Returns a signed URL with temporary access.

    Args:
        file_path: Relative path to the resume file
        filename: Optional original filename for Content-Disposition

    Returns:
        URL or None if file doesn't exist
    """
    storage = get_storage_backend()
    return storage.get_url(file_path, filename)


def resume_exists(file_path: str) -> bool:
    """
    Check if a resume file exists.

    Args:
        file_path: Relative path to the resume file

    Returns:
        True if file exists, False otherwise
    """
    storage = get_storage_backend()
    return storage.exists(file_path)
