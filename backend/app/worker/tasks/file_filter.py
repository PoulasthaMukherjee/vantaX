"""
File filter for code analysis.

Filters repository files based on extension, size, and count limits.
Follows architecture-decisions.md specifications.

Supports custom patterns for per-assessment filtering:
- Include patterns: "*.py", "src/**/*.ts"
- Exclude patterns: "!**/test/**", "!*.spec.js"
- Uses fnmatch-style glob matching on full relative paths
"""

import fnmatch
import os
from pathlib import PurePath
from typing import Any

# Allowed code extensions
ALLOWED_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".rb",
    ".php",
    ".cs",
    ".swift",
    ".kt",
    ".scala",
}

# Directories to ignore
IGNORED_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    "venv",
    ".venv",
    "dist",
    "build",
    ".next",
    "target",
    "vendor",
    ".idea",
    ".vscode",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
    "egg-info",
    ".eggs",
}

# File patterns to ignore (minified, bundled, generated)
IGNORED_PATTERNS = {
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
    "*.min.*",
}

# Hard limits per architecture-decisions.md
MAX_FILE_SIZE = 200 * 1024  # 200KB per file
MAX_FILE_COUNT = 40  # Max 40 files analyzed
MAX_TOTAL_SIZE = 2 * 1024 * 1024  # 2MB total for LLM context


def _should_ignore_file(filename: str) -> bool:
    """Check if file matches any ignored pattern."""
    for pattern in IGNORED_PATTERNS:
        if fnmatch.fnmatch(filename, pattern):
            return True
    return False


def _should_ignore_dir(dirname: str) -> bool:
    """Check if directory should be ignored."""
    return dirname in IGNORED_DIRS or dirname.startswith(".")


def _glob_match(path: str, pattern: str) -> bool:
    """
    Match a file path against a glob pattern.

    Uses pathlib.PurePath.match() for proper ** handling.

    Supports:
    - Simple wildcards: *.py, test_*.js
    - Directory wildcards: **/ matches any number of directories
    - Full path matching: src/**/*.ts
    - Multiple ** in pattern: **/test/**

    Args:
        path: Relative file path (e.g., "src/utils/helper.py")
        pattern: Glob pattern (e.g., "src/**/*.py", "**/test/**")

    Returns:
        True if path matches pattern
    """
    # Normalize path separators
    path = path.replace("\\", "/")
    pattern = pattern.replace("\\", "/")

    # Use pathlib for proper ** handling
    # PurePath.match() handles ** correctly in Python 3.12+
    # For earlier versions, we need a fallback
    try:
        from pathlib import PurePath

        # PurePath.match treats ** as matching any number of directories
        # but only from Python 3.12+. For compatibility, implement manually.
        path_obj = PurePath(path)

        # Try pathlib match first (works well for simple patterns)
        if path_obj.match(pattern):
            return True

        # For patterns starting with **, also try matching against each subpath
        # This handles "**/test/**" matching "src/test/file.py"
        if pattern.startswith("**/") or pattern.startswith("**\\"):
            # Pattern like "**/test/**" or "**/foo.py"
            sub_pattern = pattern[3:]  # Remove leading **/
            parts = path.split("/")
            for i in range(len(parts)):
                subpath = "/".join(parts[i:])
                if PurePath(subpath).match(sub_pattern):
                    return True
                # Also try fnmatch for the subpath
                if fnmatch.fnmatch(subpath, sub_pattern):
                    return True

        # Handle patterns with ** in the middle like "src/**/test.py"
        if "**" in pattern and not pattern.startswith("**"):
            # Split on ** and check if path matches the structure
            before, after = pattern.split("**", 1)
            before = before.rstrip("/")
            after = after.lstrip("/")

            if before and not path.startswith(before):
                return False

            if after:
                # Check if the remaining path matches the after pattern
                if before:
                    remaining = path[len(before) :].lstrip("/")
                else:
                    remaining = path

                # Try matching after against each suffix of remaining
                parts = remaining.split("/")
                for i in range(len(parts)):
                    subpath = "/".join(parts[i:])
                    if fnmatch.fnmatch(subpath, after) or PurePath(subpath).match(
                        after
                    ):
                        return True
            else:
                # Pattern ends with **, matches everything under before
                return True

        return False

    except Exception:
        # Fallback to simple fnmatch
        return fnmatch.fnmatch(path, pattern)


def _matches_custom_patterns(
    relative_path: str,
    include_patterns: list[str],
    exclude_patterns: list[str],
    apply_default_extension_filter: bool = False,
) -> bool:
    """
    Check if a file path matches custom include/exclude patterns.

    Args:
        relative_path: Relative file path from repo root
        include_patterns: List of patterns that files must match (if any specified)
        exclude_patterns: List of patterns that exclude files
        apply_default_extension_filter: If True and no include patterns,
            apply default extension-based filtering

    Returns:
        True if file should be included
    """
    # If include patterns are specified, file must match at least one
    if include_patterns:
        matched = False
        for pattern in include_patterns:
            if _glob_match(relative_path, pattern):
                matched = True
                break
        if not matched:
            return False
    elif apply_default_extension_filter:
        # No include patterns but we should apply default extension filtering
        # This handles the case of exclusion-only patterns
        ext = os.path.splitext(relative_path)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return False
        # Also check ignored file patterns
        filename = os.path.basename(relative_path)
        if _should_ignore_file(filename):
            return False

    # Must not match any exclude pattern
    for pattern in exclude_patterns:
        if _glob_match(relative_path, pattern):
            return False

    return True


def _parse_patterns(
    custom_patterns: list[str] | None,
) -> tuple[list[str], list[str]]:
    """
    Parse custom patterns into include and exclude lists.

    Patterns starting with '!' are exclusions.

    Args:
        custom_patterns: List of patterns, or None for defaults

    Returns:
        Tuple of (include_patterns, exclude_patterns)
    """
    if not custom_patterns:
        return [], []

    include = []
    exclude = []

    for pattern in custom_patterns:
        pattern = pattern.strip()
        if not pattern:
            continue
        if pattern.startswith("!"):
            exclude.append(pattern[1:])
        else:
            include.append(pattern)

    return include, exclude


def filter_code_files(
    repo_path: str,
    custom_patterns: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Filter and collect code files from a cloned repository.

    Args:
        repo_path: Path to the cloned repository or uploaded files
        custom_patterns: Optional list of glob patterns for filtering.
            - Include patterns: "*.py", "src/**/*.ts"
            - Exclude patterns (prefixed with !): "!**/test/**", "!*.spec.js"
            - If None, uses default extension-based filtering

    Returns:
        List of dicts with path, content, and size for each file
    """
    files: list[dict[str, Any]] = []
    total_size = 0

    # Parse custom patterns
    include_patterns, exclude_patterns = _parse_patterns(custom_patterns)
    use_custom_patterns = bool(include_patterns or exclude_patterns)

    # When only exclusion patterns are provided (no include patterns),
    # we still need to apply default extension filtering to avoid
    # including non-code files
    apply_default_ext_filter = bool(exclude_patterns) and not bool(include_patterns)

    # Walk directory tree
    for root, dirs, filenames in os.walk(repo_path):
        # Filter out ignored directories (modifies dirs in-place)
        dirs[:] = [d for d in dirs if not _should_ignore_dir(d)]

        for filename in filenames:
            filepath = os.path.join(root, filename)
            relative_path = os.path.relpath(filepath, repo_path)
            # Normalize to forward slashes for pattern matching
            relative_path_normalized = relative_path.replace("\\", "/")

            # Apply filtering based on custom patterns or defaults
            if use_custom_patterns:
                # Custom patterns specified - use them
                # If only exclusions, also apply default extension filter
                if not _matches_custom_patterns(
                    relative_path_normalized,
                    include_patterns,
                    exclude_patterns,
                    apply_default_extension_filter=apply_default_ext_filter,
                ):
                    continue
            else:
                # Default filtering: extension-based
                ext = os.path.splitext(filename)[1].lower()
                if ext not in ALLOWED_EXTENSIONS:
                    continue

                # Check ignored patterns
                if _should_ignore_file(filename):
                    continue

            # Check file size
            try:
                size = os.path.getsize(filepath)
            except OSError:
                continue

            if size > MAX_FILE_SIZE:
                continue

            if size == 0:
                continue

            # Check limits
            if len(files) >= MAX_FILE_COUNT:
                break

            if total_size + size > MAX_TOTAL_SIZE:
                break

            # Read file content
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            # Add to list
            files.append(
                {
                    "path": relative_path,
                    "content": content,
                    "size": size,
                }
            )
            total_size += size

        # Check if we've hit limits
        if len(files) >= MAX_FILE_COUNT or total_size >= MAX_TOTAL_SIZE:
            break

    # Sort by path for consistent ordering
    files.sort(key=lambda f: str(f["path"]))

    return files


def get_file_summary(files: list[dict]) -> dict:
    """
    Get summary statistics for filtered files.

    Args:
        files: List of filtered file dicts

    Returns:
        Dict with file count, total size, extensions breakdown
    """
    extensions: dict[str, int] = {}
    total_size = 0

    for file in files:
        ext = os.path.splitext(file["path"])[1].lower()
        extensions[ext] = extensions.get(ext, 0) + 1
        total_size += file["size"]

    return {
        "file_count": len(files),
        "total_size": total_size,
        "extensions": extensions,
    }
