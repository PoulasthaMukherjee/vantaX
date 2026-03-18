#!/usr/bin/env python3
"""
Security Audit Script.

Checks:
1. All endpoints have proper authentication
2. Organization isolation in queries
3. No secrets hardcoded
4. File path validation
5. Input validation patterns

Usage:
    python scripts/security_audit.py
"""

import ast
import os
import re
import sys
from pathlib import Path
from typing import NamedTuple


class Finding(NamedTuple):
    severity: str  # HIGH, MEDIUM, LOW, INFO
    category: str
    file: str
    line: int
    message: str


findings: list[Finding] = []


def add_finding(severity: str, category: str, file: str, line: int, message: str):
    findings.append(Finding(severity, category, file, line, message))


# =============================================================================
# Check 1: Endpoint Authentication
# =============================================================================


def check_endpoint_auth(api_dir: Path):
    """Check all router endpoints have authentication dependencies."""
    print("Checking endpoint authentication...")

    # Patterns that indicate authentication
    auth_patterns = [
        r"Depends\s*\(\s*get_current_user",
        r"Depends\s*\(\s*get_current_org",
        r"Depends\s*\(\s*require_role",
        r"Depends\s*\(\s*get_current_membership",
        r"dependencies\s*=\s*\[.*require_role",
    ]

    # Endpoints that don't require auth (whitelist)
    public_endpoints = [
        "health",
        "ready",
        "prometheus",
        "public",
        "root",
    ]

    for py_file in api_dir.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue

        content = py_file.read_text()

        # Find all route decorators
        route_pattern = (
            r'@router\.(get|post|put|patch|delete)\s*\(\s*["\']([^"\']+)["\']'
        )

        for match in re.finditer(route_pattern, content):
            method = match.group(1)
            path = match.group(2)
            line_num = content[: match.start()].count("\n") + 1

            # Skip public endpoints
            if any(
                pub in path.lower() or pub in str(py_file).lower()
                for pub in public_endpoints
            ):
                continue

            # Check if there's auth in the next ~20 lines (function definition)
            func_start = match.end()
            func_snippet = content[func_start : func_start + 1500]

            has_auth = any(re.search(pat, func_snippet) for pat in auth_patterns)

            if not has_auth:
                add_finding(
                    "HIGH",
                    "AUTH",
                    str(py_file.relative_to(api_dir.parent.parent)),
                    line_num,
                    f"Endpoint {method.upper()} {path} may lack authentication",
                )


# =============================================================================
# Check 2: Organization Isolation
# =============================================================================


def check_org_isolation(models_dir: Path, api_dir: Path):
    """Check queries filter by organization_id where appropriate."""
    print("Checking organization isolation...")

    # Models that should be org-scoped
    org_scoped_models = [
        "Assessment",
        "Submission",
        "CandidateProfile",
        "Event",
        "EventRegistration",
        "AdminInvite",
        "ActivityLog",
        "PointsLog",
    ]

    for py_file in api_dir.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue

        content = py_file.read_text()

        for model in org_scoped_models:
            # Find queries on this model
            query_pattern = rf"db\.query\s*\(\s*{model}\s*\)"

            for match in re.finditer(query_pattern, content):
                line_num = content[: match.start()].count("\n") + 1

                # Check if organization_id filter exists in next ~10 lines
                query_start = match.start()
                query_snippet = content[query_start : query_start + 500]

                if (
                    "organization_id" not in query_snippet
                    and "org.id" not in query_snippet
                ):
                    # Check if this is in a public endpoint
                    if "/public/" in str(py_file) or "public" in py_file.name:
                        continue

                    add_finding(
                        "MEDIUM",
                        "ORG_ISOLATION",
                        str(py_file.relative_to(api_dir.parent.parent)),
                        line_num,
                        f"Query on {model} may lack organization_id filter",
                    )


# =============================================================================
# Check 3: Secrets in Code
# =============================================================================


def check_secrets(root_dir: Path):
    """Check for hardcoded secrets."""
    print("Checking for hardcoded secrets...")

    secret_patterns = [
        (r'["\']sk-[a-zA-Z0-9]{20,}["\']', "OpenAI API key"),
        (r'["\']gsk_[a-zA-Z0-9]{20,}["\']', "Groq API key"),
        (r'["\']ghp_[a-zA-Z0-9]{20,}["\']', "GitHub PAT"),
        (r'["\']xoxb-[a-zA-Z0-9-]{20,}["\']', "Slack token"),
        (r'password\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded password"),
        (r'secret\s*=\s*["\'][^"\']{16,}["\']', "Hardcoded secret"),
        (r"-----BEGIN (RSA |EC )?PRIVATE KEY-----", "Private key"),
    ]

    exclude_dirs = ["venv", "node_modules", "__pycache__", ".git", "dist"]

    for py_file in root_dir.rglob("*.py"):
        if any(excl in str(py_file) for excl in exclude_dirs):
            continue

        try:
            content = py_file.read_text()
        except:
            continue

        for pattern, desc in secret_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                line_num = content[: match.start()].count("\n") + 1
                add_finding(
                    "HIGH",
                    "SECRETS",
                    str(py_file.relative_to(root_dir)),
                    line_num,
                    f"Potential {desc} found",
                )


# =============================================================================
# Check 4: File Path Validation
# =============================================================================


def check_file_paths(root_dir: Path):
    """Check for path traversal vulnerabilities."""
    print("Checking file path handling...")

    # Patterns that may indicate unsafe path handling
    unsafe_patterns = [
        (r"open\s*\([^)]*\+[^)]*\)", "String concatenation in file path"),
        (r"os\.path\.join\s*\([^)]*request\.[^)]*\)", "User input in path join"),
        (r"Path\s*\([^)]*request\.[^)]*\)", "User input in Path()"),
    ]

    # Safe patterns that validate paths
    safe_patterns = [
        r"resolve\(\)",
        r"is_relative_to",
        r"sanitize",
        r"validate.*path",
    ]

    for py_file in root_dir.rglob("*.py"):
        if "venv" in str(py_file) or "__pycache__" in str(py_file):
            continue

        try:
            content = py_file.read_text()
        except:
            continue

        for pattern, desc in unsafe_patterns:
            for match in re.finditer(pattern, content):
                line_num = content[: match.start()].count("\n") + 1

                # Check if there's validation nearby
                context = content[max(0, match.start() - 200) : match.end() + 200]
                has_validation = any(re.search(sp, context) for sp in safe_patterns)

                if not has_validation:
                    add_finding(
                        "MEDIUM",
                        "PATH_TRAVERSAL",
                        str(py_file.relative_to(root_dir)),
                        line_num,
                        f"Potential path traversal: {desc}",
                    )


# =============================================================================
# Check 5: SQL Injection
# =============================================================================


def check_sql_injection(root_dir: Path):
    """Check for potential SQL injection."""
    print("Checking for SQL injection...")

    # Patterns that may indicate raw SQL with string interpolation
    dangerous_patterns = [
        (r'execute\s*\(\s*f["\']', "f-string in execute()"),
        (r"execute\s*\([^)]*%[^)]*\)", "% formatting in execute()"),
        (r"execute\s*\([^)]*\.format\s*\(", ".format() in execute()"),
        (r'text\s*\(\s*f["\']', "f-string in text()"),
    ]

    for py_file in root_dir.rglob("*.py"):
        if (
            "venv" in str(py_file)
            or "__pycache__" in str(py_file)
            or "alembic" in str(py_file)
        ):
            continue

        try:
            content = py_file.read_text()
        except:
            continue

        for pattern, desc in dangerous_patterns:
            for match in re.finditer(pattern, content):
                line_num = content[: match.start()].count("\n") + 1
                add_finding(
                    "HIGH",
                    "SQL_INJECTION",
                    str(py_file.relative_to(root_dir)),
                    line_num,
                    f"Potential SQL injection: {desc}",
                )


# =============================================================================
# Check 6: Rate Limiting
# =============================================================================


def check_rate_limiting(api_dir: Path):
    """Check sensitive endpoints have rate limiting."""
    print("Checking rate limiting...")

    # Endpoints that should have rate limiting
    sensitive_patterns = [
        r"@router\.post.*auth",
        r"@router\.post.*login",
        r"@router\.post.*submit",
        r"@router\.post.*password",
    ]

    for py_file in api_dir.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue

        content = py_file.read_text()

        for pattern in sensitive_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                line_num = content[: match.start()].count("\n") + 1

                # Check for rate limit mention in file
                if (
                    "rate_limit" not in content.lower()
                    and "ratelimit" not in content.lower()
                ):
                    add_finding(
                        "LOW",
                        "RATE_LIMIT",
                        str(py_file.relative_to(api_dir.parent.parent)),
                        line_num,
                        "Sensitive endpoint may need explicit rate limiting",
                    )


# =============================================================================
# Main
# =============================================================================


def main():
    root_dir = Path(__file__).parent.parent
    api_dir = root_dir / "app" / "api"
    models_dir = root_dir / "app" / "models"

    print("=" * 60)
    print("Security Audit")
    print("=" * 60)
    print()

    # Run all checks
    check_endpoint_auth(api_dir)
    check_org_isolation(models_dir, api_dir)
    check_secrets(root_dir)
    check_file_paths(root_dir)
    check_sql_injection(root_dir)
    check_rate_limiting(api_dir)

    print()
    print("=" * 60)
    print("Findings Summary")
    print("=" * 60)
    print()

    if not findings:
        print("No security issues found!")
        return 0

    # Group by severity
    by_severity = {"HIGH": [], "MEDIUM": [], "LOW": [], "INFO": []}
    for f in findings:
        by_severity[f.severity].append(f)

    for severity in ["HIGH", "MEDIUM", "LOW", "INFO"]:
        if by_severity[severity]:
            print(f"\n[{severity}] ({len(by_severity[severity])} findings)")
            print("-" * 40)
            for f in by_severity[severity]:
                print(f"  {f.category}: {f.file}:{f.line}")
                print(f"    {f.message}")

    print()
    print(f"Total: {len(findings)} findings")
    print(f"  HIGH: {len(by_severity['HIGH'])}")
    print(f"  MEDIUM: {len(by_severity['MEDIUM'])}")
    print(f"  LOW: {len(by_severity['LOW'])}")

    # Return non-zero if HIGH findings
    return 1 if by_severity["HIGH"] else 0


if __name__ == "__main__":
    sys.exit(main())
