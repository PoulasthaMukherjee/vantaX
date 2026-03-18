#!/usr/bin/env python3
"""
Validate monitoring setup.

Checks:
1. Prometheus metrics endpoint returns valid metrics
2. Health endpoints respond correctly
3. Alert thresholds are configured
4. Slack webhook (if configured) can send test alert

Usage:
    python scripts/validate_monitoring.py [--test-slack]
"""

import argparse
import sys
from urllib.parse import urlparse

import httpx


def check_health_endpoint(base_url: str) -> bool:
    """Check /api/v1/health returns 200."""
    try:
        resp = httpx.get(f"{base_url}/api/v1/health", timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  [OK] /health: status={data.get('status')}")
            return True
        else:
            print(f"  [FAIL] /health: status_code={resp.status_code}")
            return False
    except Exception as e:
        print(f"  [FAIL] /health: {e}")
        return False


def check_ready_endpoint(base_url: str) -> bool:
    """Check /api/v1/health/ready returns 200 with DB/Redis status."""
    try:
        resp = httpx.get(f"{base_url}/api/v1/health/ready", timeout=10.0)
        data = resp.json()
        if resp.status_code == 200 and data.get("status") == "ready":
            print(
                f"  [OK] /health/ready: database={data.get('database')}, redis={data.get('redis')}"
            )
            return True
        else:
            print(f"  [WARN] /health/ready: {data}")
            return False
    except Exception as e:
        print(f"  [FAIL] /health/ready: {e}")
        return False


def check_prometheus_metrics(base_url: str) -> dict:
    """Check Prometheus metrics endpoint returns valid metrics."""
    try:
        resp = httpx.get(f"{base_url}/api/v1/prometheus/metrics", timeout=10.0)
        if resp.status_code != 200:
            print(f"  [FAIL] /prometheus/metrics: status_code={resp.status_code}")
            return {}

        metrics = {}
        for line in resp.text.split("\n"):
            if line.startswith("#") or not line.strip():
                continue
            # Parse metric name
            if " " in line:
                parts = line.split(" ")
                metric_name = parts[0].split("{")[0]
                metrics[metric_name] = parts[-1]

        print(f"  [OK] /prometheus/metrics: {len(metrics)} metrics found")

        # Check required metrics exist
        required = [
            "vibe_api_up",
            "vibe_queue_depth",
            "vibe_queue_failed_count",
            "vibe_llm_calls_total",
        ]
        for metric in required:
            if metric in metrics:
                print(f"      {metric} = {metrics[metric]}")
            else:
                print(f"      [WARN] {metric} not found")

        return metrics
    except Exception as e:
        print(f"  [FAIL] /prometheus/metrics: {e}")
        return {}


def check_slo_thresholds(base_url: str) -> bool:
    """Check SLO thresholds are configured via metrics endpoint."""
    try:
        resp = httpx.get(f"{base_url}/api/v1/prometheus/metrics", timeout=10.0)
        text = resp.text

        thresholds = {
            "vibe_slo_queue_depth_threshold": None,
            "vibe_slo_job_latency_p95_seconds": None,
        }

        for line in text.split("\n"):
            for name in thresholds:
                if line.startswith(name):
                    value = line.split(" ")[-1]
                    thresholds[name] = value

        print("  SLO Thresholds:")
        for name, value in thresholds.items():
            if value:
                print(f"      {name} = {value}")
            else:
                print(f"      [WARN] {name} not configured")

        return all(v is not None for v in thresholds.values())
    except Exception as e:
        print(f"  [FAIL] SLO check: {e}")
        return False


def test_slack_webhook(webhook_url: str) -> bool:
    """Send test alert to Slack webhook."""
    if not webhook_url:
        print("  [SKIP] No Slack webhook URL configured")
        return True

    try:
        payload = {
            "attachments": [
                {
                    "color": "#36a64f",
                    "title": ":white_check_mark: Monitoring Validation Test",
                    "text": "This is a test alert from the monitoring validation script.",
                    "fields": [
                        {
                            "title": "Test",
                            "value": "validate_monitoring.py",
                            "short": True,
                        },
                        {"title": "Status", "value": "Success", "short": True},
                    ],
                }
            ]
        }

        resp = httpx.post(webhook_url, json=payload, timeout=10.0)
        if resp.status_code == 200:
            print("  [OK] Slack webhook test sent successfully")
            return True
        else:
            print(f"  [FAIL] Slack webhook: status={resp.status_code}")
            return False
    except Exception as e:
        print(f"  [FAIL] Slack webhook: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Validate monitoring setup")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    parser.add_argument(
        "--test-slack", action="store_true", help="Send test Slack alert"
    )
    parser.add_argument(
        "--slack-url", help="Slack webhook URL (or use SLACK_WEBHOOK_URL env)"
    )
    args = parser.parse_args()

    import os

    slack_url = args.slack_url or os.environ.get("SLACK_WEBHOOK_URL")

    print("=" * 60)
    print("Monitoring Validation")
    print("=" * 60)
    print(f"Target: {args.url}")
    print()

    results = []

    print("1. Health Endpoints")
    print("-" * 40)
    results.append(check_health_endpoint(args.url))
    results.append(check_ready_endpoint(args.url))
    print()

    print("2. Prometheus Metrics")
    print("-" * 40)
    metrics = check_prometheus_metrics(args.url)
    results.append(len(metrics) > 0)
    print()

    print("3. SLO Thresholds")
    print("-" * 40)
    results.append(check_slo_thresholds(args.url))
    print()

    if args.test_slack:
        print("4. Slack Webhook Test")
        print("-" * 40)
        results.append(test_slack_webhook(slack_url))
        print()

    print("=" * 60)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"Result: ALL PASSED ({passed}/{total})")
        return 0
    else:
        print(f"Result: {passed}/{total} checks passed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
