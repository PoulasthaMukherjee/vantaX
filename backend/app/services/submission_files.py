"""
Submission file upload service.

Handles file validation, ZIP extraction, and storage for submission uploads.
Uses the same storage backend (local/GCS) as resume uploads.
"""

import io
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from uuid import UUID

from app.services.resume import get_storage_backend
from app.worker.tasks.file_filter import ALLOWED_EXTENSIONS, IGNORED_DIRS

# Limits aligned with file_filter.py architecture decisions
MAX_FILE_SIZE = 200 * 1024  # 200KB per file
MAX_FILE_COUNT = 40  # Max 40 files per submission
MAX_TOTAL_SIZE = 2 * 1024 * 1024  # 2MB total
MAX_ZIP_SIZE = 10 * 1024 * 1024  # 10MB for ZIP archives (before extraction)


@dataclass
class UploadResult:
    """Result of a file upload operation."""

    success: bool
    error: str | None = None
    files_path: str | None = None
    file_count: int = 0
    file_list: list[str] | None = None


def _validate_file_path(path: str) -> bool:
    """
    Check if file path is safe and allowed.

    Rejects paths that:
    - Contain ignored directories (node_modules, .git, etc.)
    - Start with a dot (hidden files/directories)
    - Attempt path traversal
    """
    # Normalize and check for path traversal
    normalized = os.path.normpath(path)
    if normalized.startswith("..") or normalized.startswith("/"):
        return False

    parts = Path(path).parts
    for part in parts:
        # Reject ignored directories
        if part in IGNORED_DIRS:
            return False
        # Reject hidden files/directories (except current dir)
        if part.startswith(".") and part not in (".", ".."):
            return False

    return True


def _validate_extension(filename: str) -> bool:
    """Check if file extension is allowed."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _get_submission_path(submission_id: UUID) -> str:
    """Get the storage path prefix for a submission's files."""
    return f"submissions/{submission_id}"


async def save_submission_zip(
    submission_id: UUID,
    zip_file: BinaryIO,
    file_size: int,
) -> UploadResult:
    """
    Save and extract a ZIP archive for submission.

    Args:
        submission_id: UUID of the submission
        zip_file: File-like object containing ZIP data
        file_size: Size of the ZIP file in bytes

    Returns:
        UploadResult with storage path and file count
    """
    if file_size > MAX_ZIP_SIZE:
        return UploadResult(
            success=False,
            error=f"ZIP file too large. Maximum: {MAX_ZIP_SIZE // (1024 * 1024)}MB",
        )

    storage = get_storage_backend()
    base_path = _get_submission_path(submission_id)

    try:
        zip_content = zip_file.read()

        with zipfile.ZipFile(io.BytesIO(zip_content), "r") as zf:
            # Check for zip bomb (total extracted size)
            total_extracted_size = sum(info.file_size for info in zf.infolist())
            if total_extracted_size > MAX_TOTAL_SIZE:
                return UploadResult(
                    success=False,
                    error=f"Extracted files too large. Maximum: {MAX_TOTAL_SIZE // (1024 * 1024)}MB",
                )

            # Extract and filter files
            extracted_files: list[str] = []
            total_size = 0

            for info in zf.infolist():
                # Skip directories
                if info.is_dir():
                    continue

                # Limit file count
                if len(extracted_files) >= MAX_FILE_COUNT:
                    break

                # Strip common root directory if all files share one
                # e.g., "repo-main/src/file.py" -> "src/file.py"
                filename = info.filename
                parts = Path(filename).parts
                if len(parts) > 1:
                    # Check if first part looks like a repo root
                    first_part = parts[0]
                    if first_part.endswith("-main") or first_part.endswith("-master"):
                        filename = str(Path(*parts[1:]))

                # Validate path
                if not _validate_file_path(filename):
                    continue

                # Validate extension
                if not _validate_extension(filename):
                    continue

                # Validate individual file size
                if info.file_size > MAX_FILE_SIZE:
                    continue

                # Skip empty files
                if info.file_size == 0:
                    continue

                # Check total size limit
                if total_size + info.file_size > MAX_TOTAL_SIZE:
                    break

                # Extract and save
                content = zf.read(info.filename)
                file_path = f"{base_path}/{filename}"

                saved = await storage.save(file_path, content, "text/plain")
                if saved:
                    extracted_files.append(filename)
                    total_size += info.file_size

            if not extracted_files:
                return UploadResult(
                    success=False,
                    error="No valid code files found in ZIP. "
                    f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
                )

            return UploadResult(
                success=True,
                files_path=base_path,
                file_count=len(extracted_files),
                file_list=extracted_files,
            )

    except zipfile.BadZipFile:
        return UploadResult(success=False, error="Invalid ZIP file")
    except Exception as e:
        return UploadResult(success=False, error=f"Failed to process ZIP: {str(e)}")


async def save_submission_files(
    submission_id: UUID,
    files: list[tuple[str, bytes]],
) -> UploadResult:
    """
    Save multiple individual files for submission.

    Args:
        submission_id: UUID of the submission
        files: List of (filename, content) tuples

    Returns:
        UploadResult with storage path and file count
    """
    if len(files) > MAX_FILE_COUNT:
        return UploadResult(
            success=False,
            error=f"Too many files. Maximum: {MAX_FILE_COUNT}",
        )

    total_size = sum(len(content) for _, content in files)
    if total_size > MAX_TOTAL_SIZE:
        return UploadResult(
            success=False,
            error=f"Total file size too large. Maximum: {MAX_TOTAL_SIZE // (1024 * 1024)}MB",
        )

    storage = get_storage_backend()
    base_path = _get_submission_path(submission_id)
    saved_files: list[str] = []

    try:
        for filename, content in files:
            # Validate path
            if not _validate_file_path(filename):
                continue

            # Validate extension
            if not _validate_extension(filename):
                continue

            # Validate size
            if len(content) > MAX_FILE_SIZE:
                continue

            # Skip empty files
            if len(content) == 0:
                continue

            file_path = f"{base_path}/{filename}"
            saved = await storage.save(file_path, content, "text/plain")
            if saved:
                saved_files.append(filename)

        if not saved_files:
            return UploadResult(
                success=False,
                error="No valid code files provided. "
                f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        return UploadResult(
            success=True,
            files_path=base_path,
            file_count=len(saved_files),
            file_list=saved_files,
        )

    except Exception as e:
        return UploadResult(success=False, error=f"Failed to save files: {str(e)}")


async def delete_submission_files(submission_id: UUID) -> bool:
    """
    Delete all files for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        True if deleted successfully, False otherwise
    """
    storage = get_storage_backend()
    base_path = _get_submission_path(submission_id)
    return await storage.delete_prefix(base_path)


def get_submission_files_path(submission_id: UUID) -> str:
    """Get the storage path prefix for a submission's files."""
    return _get_submission_path(submission_id)
