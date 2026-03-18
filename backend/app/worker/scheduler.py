"""
Periodic task scheduler.

Runs cleanup and monitoring tasks on a schedule.
Per SPRINT-PLAN.md: scheduled stuck-job cleanup.
"""

import logging
import time
from datetime import datetime
from threading import Event, Thread

import redis

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.alerts import (
    check_llm_failure_rate_alert,
    check_queue_depth_alert,
    send_stuck_jobs_alert,
)
from app.worker.tasks.cleanup import cleanup_stuck_submissions

logger = logging.getLogger(__name__)

# Schedule intervals (in seconds)
CLEANUP_INTERVAL = 300  # 5 minutes
ALERT_CHECK_INTERVAL = 60  # 1 minute


class PeriodicScheduler:
    """
    Simple periodic task scheduler.

    Runs tasks at fixed intervals in background threads.
    """

    def __init__(self):
        self._stop_event = Event()
        self._threads: list[Thread] = []

    def start(self):
        """Start all scheduled tasks."""
        logger.info("Starting periodic scheduler")

        # Cleanup task thread
        cleanup_thread = Thread(
            target=self._run_cleanup_loop,
            name="cleanup-scheduler",
            daemon=True,
        )
        cleanup_thread.start()
        self._threads.append(cleanup_thread)

        # Alert check thread
        alert_thread = Thread(
            target=self._run_alert_loop,
            name="alert-scheduler",
            daemon=True,
        )
        alert_thread.start()
        self._threads.append(alert_thread)

        logger.info(f"Scheduler started with {len(self._threads)} task threads")

    def stop(self):
        """Stop all scheduled tasks."""
        logger.info("Stopping periodic scheduler")
        self._stop_event.set()

        for thread in self._threads:
            thread.join(timeout=5.0)

        logger.info("Scheduler stopped")

    def _run_cleanup_loop(self):
        """Run cleanup task periodically."""
        logger.info(f"Cleanup task loop started (interval: {CLEANUP_INTERVAL}s)")

        while not self._stop_event.is_set():
            try:
                result = cleanup_stuck_submissions()

                # cleanup.py returns: stuck_cloning, stuck_scoring, requeued, failed
                stuck_count = result.get("stuck_cloning", 0) + result.get(
                    "stuck_scoring", 0
                )
                failed_count = result.get("failed", 0)

                if stuck_count > 0:
                    logger.warning(
                        f"Cleanup found {stuck_count} stuck jobs "
                        f"({result.get('requeued', 0)} requeued, {failed_count} failed)"
                    )
                    # Send alert
                    send_stuck_jobs_alert(stuck_count, failed_count)

            except Exception as e:
                logger.exception(f"Cleanup task error: {e}")

            # Wait for next interval (or until stop event)
            self._stop_event.wait(CLEANUP_INTERVAL)

    def _run_alert_loop(self):
        """Run alert checks periodically."""
        logger.info(f"Alert check loop started (interval: {ALERT_CHECK_INTERVAL}s)")

        while not self._stop_event.is_set():
            try:
                # Check queue depth
                queue_depth = self._get_queue_depth()
                check_queue_depth_alert(queue_depth)

                # Check LLM failure rate
                with SessionLocal() as db:
                    check_llm_failure_rate_alert(db)

            except Exception as e:
                logger.exception(f"Alert check error: {e}")

            # Wait for next interval
            self._stop_event.wait(ALERT_CHECK_INTERVAL)

    def _get_queue_depth(self) -> int:
        """Get current queue depth from Redis."""
        try:
            r = redis.from_url(settings.redis_url)
            return r.llen("rq:queue:scoring") or 0
        except Exception as e:
            logger.warning(f"Failed to get queue depth from Redis: {e}")
            return 0


# Global scheduler instance
_scheduler: PeriodicScheduler | None = None


def start_scheduler():
    """Start the global scheduler."""
    global _scheduler
    if _scheduler is None:
        _scheduler = PeriodicScheduler()
        _scheduler.start()


def stop_scheduler():
    """Stop the global scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.stop()
        _scheduler = None


def run_scheduler_standalone():
    """
    Run scheduler as standalone process.

    Use: python -m app.worker.scheduler
    """
    import signal

    logger.info("Starting scheduler in standalone mode")

    scheduler = PeriodicScheduler()
    scheduler.start()

    # Handle shutdown signals
    def handle_shutdown(signum, frame):
        logger.info(f"Received signal {signum}, shutting down")
        scheduler.stop()
        exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        scheduler.stop()


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    run_scheduler_standalone()
