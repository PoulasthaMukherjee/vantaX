"""
Worker tasks module.

Exports all worker tasks for registration.
"""

from app.worker.tasks.cleanup import cleanup_old_jobs, cleanup_stuck_submissions
from app.worker.tasks.score_submission import score_submission

__all__ = [
    "score_submission",
    "cleanup_stuck_submissions",
    "cleanup_old_jobs",
]
