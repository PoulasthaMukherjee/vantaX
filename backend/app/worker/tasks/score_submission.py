"""
Main scoring task for submissions.

Handles the full pipeline: clone → filter → score → save.
"""

import logging
import shutil
import tempfile
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.core.database import SessionLocal
from app.models.ai_score import AIScore
from app.models.assessment import Assessment
from app.models.enums import SubmissionStatus
from app.models.submission import Submission
from app.services.activity import log_submission_scored
from app.services.points import award_submission_points

logger = logging.getLogger(__name__)

# Clone timeout in seconds (per architecture decisions)
CLONE_TIMEOUT_SECONDS = 60


def _convert_score_100_to_10(score: int) -> int:
    """
    Convert a 0-100 score to 1-10 scale for database storage.

    Database constraints require scores BETWEEN 1 AND 10.
    LLM returns 0-100, so we convert:
    - 0-9 -> 1
    - 10-19 -> 2
    - ...
    - 90-100 -> 10
    """
    if score < 0:
        return 1
    if score >= 100:
        return 10
    # Convert: score 0 -> 1, score 10 -> 2, etc.
    # Ensure minimum of 1
    return max(1, min(10, (score // 10) + 1))


def score_submission(submission_id: str, organization_id: str) -> dict:
    """
    Main worker task: score a submission.

    Pipeline:
    1. Update status to CLONING
    2. Clone repository (with timeout)
    3. Filter code files
    4. Update status to SCORING
    5. Build prompt and call LLM
    6. Parse and validate scores
    7. Save AI scores and update submission
    8. Award points

    Args:
        submission_id: UUID of the submission
        organization_id: UUID of the organization

    Returns:
        Dict with result status and score
    """
    db = SessionLocal()
    temp_dir = None

    try:
        # Fetch submission
        submission = (
            db.query(Submission)
            .filter(
                Submission.id == UUID(submission_id),
                Submission.organization_id == UUID(organization_id),
            )
            .first()
        )

        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        # Fetch assessment for rubric weights
        assessment = (
            db.query(Assessment)
            .filter(
                Assessment.id == submission.assessment_id,
            )
            .first()
        )

        if not assessment:
            raise ValueError(f"Assessment {submission.assessment_id} not found")

        # 0. Check LLM budget before processing
        from app.services.budget import check_budget

        budget_status = check_budget(db, UUID(organization_id))
        if not budget_status.allowed:
            submission.status = SubmissionStatus.SCORE_FAILED
            submission.error_message = f"LLM budget exceeded: {budget_status.warning}"
            db.commit()
            logger.warning(
                f"Budget exceeded for org {organization_id}: {budget_status.warning}"
            )
            return {"status": "budget_exceeded", "error": budget_status.warning}

        if budget_status.warning:
            logger.warning(
                f"Budget warning for org {organization_id}: {budget_status.warning}"
            )

        # 1. Prepare code files based on submission type
        submission.job_started_at = datetime.utcnow()

        if submission.submission_type == "file_upload":
            # File upload: copy from storage to temp directory
            submission.status = SubmissionStatus.SCORING
            db.commit()

            temp_dir = tempfile.mkdtemp()
            prepare_result = _prepare_uploaded_files(
                submission.uploaded_files_path, temp_dir
            )

            if not prepare_result["success"]:
                submission.status = SubmissionStatus.CLONE_FAILED
                submission.error_message = prepare_result["error"]
                db.commit()
                return {"status": "clone_failed", "error": prepare_result["error"]}

        else:
            # GitHub: clone repository
            submission.status = SubmissionStatus.CLONING
            submission.clone_started_at = datetime.utcnow()
            db.commit()

            temp_dir = tempfile.mkdtemp()
            clone_result = _clone_repo(submission.github_repo_url, temp_dir)

            if not clone_result["success"]:
                submission.status = SubmissionStatus.CLONE_FAILED
                submission.error_message = clone_result["error"]
                db.commit()
                return {"status": "clone_failed", "error": clone_result["error"]}

            submission.commit_sha = clone_result.get("commit_sha")
            submission.clone_completed_at = datetime.utcnow()
            db.commit()

        # 2. Filter code files (with optional custom patterns from assessment)
        from app.worker.tasks.file_filter import filter_code_files

        files = filter_code_files(
            temp_dir,
            custom_patterns=assessment.file_patterns,
        )

        if not files:
            submission.status = SubmissionStatus.CLONE_FAILED
            submission.error_message = "No supported code files found"
            db.commit()
            return {"status": "clone_failed", "error": "No code files"}

        submission.analyzed_files = [f["path"] for f in files]

        # 3. Update status: SCORING
        submission.status = SubmissionStatus.SCORING
        db.commit()

        # 5. Build prompt and call LLM (with JSON retry per SPRINT-PLAN.md)
        from app.worker.tasks.scoring import (
            build_scoring_prompt,
            call_llm_with_json_retry,
        )

        prompt = build_scoring_prompt(
            assessment=assessment,
            files=files,
            explanation=submission.explanation_text,
        )

        llm_response, scores = call_llm_with_json_retry(
            prompt=prompt,
            organization_id=str(organization_id),
            submission_id=str(submission_id),
            db=db,
        )

        # 6. Handle parse failure with notifications
        if not scores:
            submission.status = SubmissionStatus.SCORE_FAILED
            submission.error_message = "Failed to parse LLM scores after retry"
            db.commit()

            # Send failure notifications (per SPRINT-PLAN.md)
            _send_score_failure_notifications(
                db=db,
                submission=submission,
                assessment=assessment,
                error="JSON parsing failed after retry",
            )

            return {"status": "score_failed", "error": "Parse failed"}

        # 7. Save AI scores (convert 0-100 to 1-10 scale for database)
        ai_score = AIScore(
            organization_id=UUID(organization_id),
            submission_id=submission.id,
            code_correctness=_convert_score_100_to_10(scores["correctness"]),
            code_quality=_convert_score_100_to_10(scores["quality"]),
            code_readability=_convert_score_100_to_10(scores["readability"]),
            code_robustness=_convert_score_100_to_10(scores["robustness"]),
            reasoning_clarity=_convert_score_100_to_10(scores["clarity"]),
            reasoning_depth=_convert_score_100_to_10(scores["depth"]),
            reasoning_structure=_convert_score_100_to_10(scores["structure"]),
            overall_comment=scores.get("comment", ""),
            raw_response=llm_response,
        )
        db.add(ai_score)

        # Calculate weighted final score
        final_score = _calculate_weighted_score(scores, assessment)

        # Update submission
        submission.final_score = Decimal(str(final_score))
        submission.status = SubmissionStatus.EVALUATED
        submission.evaluated_at = datetime.utcnow()
        submission.job_completed_at = datetime.utcnow()
        db.commit()

        # 8. Award points
        # Check if first submission
        submission_count = (
            db.query(Submission)
            .filter(
                Submission.organization_id == UUID(organization_id),
                Submission.candidate_id == submission.candidate_id,
                Submission.status == SubmissionStatus.EVALUATED,
            )
            .count()
        )

        is_first = submission_count == 1

        points = award_submission_points(
            db=db,
            user_id=submission.candidate_id,
            organization_id=UUID(organization_id),
            score=final_score,
            is_first_submission=is_first,
        )

        if points > 0:
            submission.points_awarded = points
            db.commit()

        # Log activity
        log_submission_scored(
            db=db,
            organization_id=UUID(organization_id),
            user_id=submission.candidate_id,
            submission_id=submission.id,
            score=final_score,
        )

        # 9. Send score ready email notification
        from app.core.config import settings
        from app.models.user import User
        from app.services.email import send_score_ready_email_sync

        candidate = db.query(User).filter(User.id == submission.candidate_id).first()
        if candidate:
            submission_url = f"{settings.frontend_url}/submissions/{submission.id}"
            send_score_ready_email_sync(
                to_email=candidate.email,
                to_name=candidate.name,
                assessment_title=assessment.title,
                score=final_score,
                submission_url=submission_url,
            )

        logger.info(f"Scored submission {submission_id}: {final_score}")

        return {
            "status": "success",
            "score": final_score,
            "points_awarded": points,
        }

    except Exception as e:
        logger.exception(f"Error scoring submission {submission_id}: {e}")

        # Update submission status if submission was successfully fetched
        if submission is not None:
            try:
                submission.status = SubmissionStatus.SCORE_FAILED
                submission.error_message = str(e)
                submission.retry_count += 1
                db.commit()
            except Exception:
                pass

        raise

    finally:
        # Cleanup
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        db.close()


def _clone_repo(url: str, target_dir: str) -> dict:
    """
    Clone a repository with timeout.

    Args:
        url: GitHub repository URL
        target_dir: Directory to clone into

    Returns:
        Dict with success status, commit_sha, or error
    """
    import subprocess

    try:
        # Shallow clone with depth 1 (only latest commit)
        result = subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "--single-branch",
                url,
                target_dir,
            ],
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT_SECONDS,
        )

        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr or "Clone failed",
            }

        # Get commit SHA
        sha_result = subprocess.run(
            ["git", "-C", target_dir, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        commit_sha = sha_result.stdout.strip() if sha_result.returncode == 0 else None

        return {
            "success": True,
            "commit_sha": commit_sha,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Clone timed out after {CLONE_TIMEOUT_SECONDS} seconds",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def _prepare_uploaded_files(storage_path: str | None, target_dir: str) -> dict:
    """
    Copy uploaded files from storage to temp directory for processing.

    Works with both local storage and GCS backends.

    Args:
        storage_path: Storage path prefix (e.g., "submissions/{id}")
        target_dir: Directory to copy files into

    Returns:
        Dict with success status or error
    """
    import asyncio
    import os

    if not storage_path:
        return {"success": False, "error": "No uploaded files path"}

    try:
        from app.services.resume import get_storage_backend

        storage = get_storage_backend()

        # List files with the storage path prefix
        file_paths = storage.list_prefix(storage_path)

        if not file_paths:
            return {"success": False, "error": "No files found in storage"}

        # Download each file to target directory
        async def download_files():
            for file_path in file_paths:
                # Get relative path within submission directory
                relative_path = file_path[len(storage_path) :].lstrip("/")
                if not relative_path:
                    continue

                # Read file content from storage
                content = await storage.read(file_path)
                if content is None:
                    continue

                # Write to target directory
                target_file = os.path.join(target_dir, relative_path)
                os.makedirs(os.path.dirname(target_file), exist_ok=True)

                with open(target_file, "wb") as f:
                    f.write(content)

        # Run async download in sync context
        asyncio.run(download_files())

        return {"success": True}

    except Exception as e:
        return {"success": False, "error": str(e)}


def _calculate_weighted_score(scores: dict, assessment: Assessment) -> float:
    """
    Calculate weighted final score from rubric scores.

    Args:
        scores: Dict with individual scores (0-100)
        assessment: Assessment with rubric weights

    Returns:
        Final weighted score (0-100)
    """
    weights = assessment.weights_dict

    weighted_sum = (
        scores["correctness"] * weights["correctness"]
        + scores["quality"] * weights["quality"]
        + scores["readability"] * weights["readability"]
        + scores["robustness"] * weights["robustness"]
        + scores["clarity"] * weights["clarity"]
        + scores["depth"] * weights["depth"]
        + scores["structure"] * weights["structure"]
    )

    # Weights sum to 100, so divide by 100
    return weighted_sum / 100


def _send_score_failure_notifications(
    db,
    submission: Submission,
    assessment: Assessment,
    error: str,
) -> None:
    """
    Send notifications when scoring fails.

    Per SPRINT-PLAN.md: notify candidate + admin alert on failures.

    Args:
        db: Database session
        submission: The failed submission
        assessment: The assessment
        error: Error message
    """
    from app.core.config import settings
    from app.models.user import User
    from app.services.alerts import send_scoring_failed_admin_alert
    from app.services.email import send_score_failed_email_sync

    # Get candidate info
    candidate = db.query(User).filter(User.id == submission.candidate_id).first()
    candidate_email = candidate.email if candidate else None
    candidate_name = candidate.name if candidate else None

    # 1. Send candidate notification
    if candidate_email:
        submission_url = f"{settings.frontend_url}/submissions/{submission.id}"
        try:
            send_score_failed_email_sync(
                to_email=candidate_email,
                to_name=candidate_name,
                assessment_title=assessment.title,
                submission_url=submission_url,
                error_reason=error,
            )
            logger.info(f"Sent score-failed email to {candidate_email}")
        except Exception as e:
            logger.error(f"Failed to send score-failed email: {e}")

    # 2. Send admin alert
    try:
        send_scoring_failed_admin_alert(
            submission_id=str(submission.id),
            assessment_title=assessment.title,
            error=error,
            candidate_email=candidate_email,
        )
    except Exception as e:
        logger.error(f"Failed to send admin alert: {e}")
