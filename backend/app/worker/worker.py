"""
RQ Worker entry point.

Run with: python -m app.worker.worker
"""

import logging
import os
import sys

# Add parent directory to path for imports
sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

import redis
from rq import Connection, Worker

from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    """Start the RQ worker."""
    logger.info("Starting RQ worker...")

    # Connect to Redis
    conn = redis.from_url(settings.redis_url)

    # Queues to listen on
    queues = ["scoring"]

    with Connection(conn):
        worker = Worker(queues)
        logger.info(f"Worker listening on queues: {queues}")
        worker.work()


if __name__ == "__main__":
    main()
