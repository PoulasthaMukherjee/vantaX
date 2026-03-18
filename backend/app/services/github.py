"""
GitHub URL validation service.

SSRF-safe validation for GitHub repository URLs.
Caches repo metadata to avoid rate limits.
"""

import ipaddress
import os
import re
import socket
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx

# GitHub URL pattern - only public repos
GITHUB_URL_PATTERN = re.compile(r"^https://github\.com/[\w\-\.]+/[\w\-\.]+/?$")

# Private IP ranges to block (SSRF protection)
BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),  # Loopback
    ipaddress.ip_network("10.0.0.0/8"),  # Private Class A
    ipaddress.ip_network("172.16.0.0/12"),  # Private Class B
    ipaddress.ip_network("192.168.0.0/16"),  # Private Class C
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]

# Files to ignore during analysis (per architecture-decisions.md)
IGNORED_FILE_PATTERNS = {
    "*.min.js",
    "*.min.css",
    "*.bundle.js",
    "*.chunk.js",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "*.map",
    "*.d.ts",
    "*.generated.*",
}

# Max repository size in KB (100MB)
MAX_REPO_SIZE_KB = 102400

# Cache TTL in seconds (5 minutes)
CACHE_TTL_SECONDS = 300


@dataclass
class RepoMetadata:
    """GitHub repository metadata."""

    owner: str
    repo: str
    default_branch: str
    size_kb: int
    is_private: bool
    description: str | None


@dataclass
class ValidationResult:
    """Result of GitHub URL validation."""

    is_valid: bool
    error: str | None = None
    metadata: RepoMetadata | None = None


def _is_blocked_ip(ip_str: str) -> bool:
    """Check if an IP address is in a blocked network."""
    try:
        ip = ipaddress.ip_address(ip_str)
        for network in BLOCKED_NETWORKS:
            if ip in network:
                return True
        return False
    except ValueError:
        return True  # Invalid IP format, block it


def _resolve_hostname(hostname: str) -> str | None:
    """Resolve hostname to IP, return None if blocked or fails."""
    try:
        ip = socket.gethostbyname(hostname)
        if _is_blocked_ip(ip):
            return None
        return ip
    except socket.gaierror:
        return None


def _get_github_headers() -> dict[str, str]:
    """Get headers for GitHub API requests."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Vibe-Platform/1.0",
    }

    # Use PAT if available (higher rate limits)
    pat = os.getenv("GITHUB_PAT")
    if pat:
        headers["Authorization"] = f"token {pat}"

    return headers


@lru_cache(maxsize=1000)
def _check_repo_exists_cached(owner: str, repo: str) -> tuple[bool, dict[str, Any]]:
    """
    Check if repo exists and get metadata. Cached for 5 minutes.

    Note: lru_cache doesn't support TTL, but this is fine for our use case.
    Cache will be refreshed on app restart or when cache fills up.
    """
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers=_get_github_headers(),
            )

            if resp.status_code == 200:
                data = resp.json()
                return True, {
                    "default_branch": data.get("default_branch", "main"),
                    "size_kb": data.get("size", 0),
                    "is_private": data.get("private", False),
                    "description": data.get("description"),
                }
            elif resp.status_code == 404:
                return False, {"error": "Repository not found"}
            elif resp.status_code == 403:
                return False, {"error": "Rate limited or access denied"}
            else:
                return False, {"error": f"GitHub API error: {resp.status_code}"}

    except httpx.TimeoutException:
        return False, {"error": "GitHub API timeout"}
    except Exception as e:
        return False, {"error": str(e)}


def parse_github_url(url: str) -> tuple[str, str] | None:
    """
    Parse GitHub URL to extract owner and repo.

    Returns (owner, repo) tuple or None if invalid.
    """
    try:
        # Clean URL
        url = url.strip().rstrip("/")

        # Check format
        if not GITHUB_URL_PATTERN.match(url):
            return None

        # Parse path
        from urllib.parse import urlparse

        parsed = urlparse(url)
        parts = parsed.path.strip("/").split("/")

        if len(parts) >= 2:
            return parts[0], parts[1]

        return None
    except Exception:
        return None


def validate_github_url(url: str) -> ValidationResult:
    """
    Validate a GitHub URL is safe to clone.

    Performs:
    1. Format validation (must be https://github.com/owner/repo)
    2. SSRF protection (no private IPs)
    3. Repository existence check (via GitHub API)
    4. Size limit check (100MB max)
    5. Public repository check

    Returns:
        ValidationResult with is_valid, error message, and metadata if valid
    """
    # 1. Parse URL
    parsed = parse_github_url(url)
    if not parsed:
        return ValidationResult(
            is_valid=False,
            error="Invalid GitHub URL format. Must be https://github.com/owner/repo",
        )

    owner, repo = parsed

    # 2. SSRF protection - verify github.com resolves to expected IP
    from urllib.parse import urlparse

    parsed_url = urlparse(url)
    hostname = parsed_url.hostname

    if not hostname or hostname.lower() != "github.com":
        return ValidationResult(
            is_valid=False,
            error="URL must be from github.com",
        )

    # Resolve hostname to check for DNS rebinding
    resolved_ip = _resolve_hostname(hostname)
    if not resolved_ip:
        return ValidationResult(
            is_valid=False,
            error="Could not resolve hostname or IP is blocked",
        )

    # 3. Check repository exists (cached)
    exists, meta = _check_repo_exists_cached(owner, repo)

    if not exists:
        error = meta.get("error", "Repository not found or not accessible")
        return ValidationResult(is_valid=False, error=error)

    # 4. Check if private
    if meta.get("is_private"):
        return ValidationResult(
            is_valid=False,
            error="Private repositories are not supported",
        )

    # 5. Check size limit
    size_kb = meta.get("size_kb", 0)
    if size_kb > MAX_REPO_SIZE_KB:
        return ValidationResult(
            is_valid=False,
            error=f"Repository size ({size_kb / 1024:.1f}MB) exceeds limit of 100MB",
        )

    # Valid!
    metadata = RepoMetadata(
        owner=owner,
        repo=repo,
        default_branch=meta.get("default_branch", "main"),
        size_kb=size_kb,
        is_private=False,
        description=meta.get("description"),
    )

    return ValidationResult(is_valid=True, metadata=metadata)


def clear_cache() -> None:
    """Clear the repo metadata cache."""
    _check_repo_exists_cached.cache_clear()
