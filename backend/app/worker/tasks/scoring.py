"""
LLM scoring module.

Handles prompt building, LLM calls, and score parsing.
"""

import json
import logging
import os
import time
from typing import Any, cast

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.assessment import Assessment
from app.models.llm_usage import LLMUsageLog

logger = logging.getLogger(__name__)

# LLM Provider configurations
PROVIDER_CONFIG = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
        "timeout": 30,
        "cost_per_1k_input": 0.00059,
        "cost_per_1k_output": 0.00079,
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
        "timeout": 60,
        "cost_per_1k_input": 0.005,
        "cost_per_1k_output": 0.015,
    },
}


def _get_api_key(provider: str) -> str | None:
    """Get API key for a provider from settings."""
    if provider == "groq":
        return settings.groq_api_key
    elif provider == "openai":
        return settings.openai_api_key
    return None

# Provider order for fallback
PROVIDER_ORDER = ["groq", "openai"]

# Max retries for rate limits
MAX_RETRIES = 3

# Token budget for context (~7k tokens)
MAX_CONTEXT_CHARS = 28000  # ~7k tokens at 4 chars/token

# Stricter prompt for JSON retry (per SPRINT-PLAN.md)
STRICT_JSON_RETRY_PROMPT = """Your previous response was not valid JSON.

Return ONLY a valid JSON object with this EXACT structure - no markdown, no explanation, no code fences:

{"correctness": <0-100>, "quality": <0-100>, "readability": <0-100>, "robustness": <0-100>, "clarity": <0-100>, "depth": <0-100>, "structure": <0-100>, "comment": "<brief assessment>"}

All values must be integers between 0-100. Return ONLY this JSON object, nothing else."""


def build_scoring_prompt(
    assessment: Assessment,
    files: list[dict],
    explanation: str | None = None,
) -> str:
    """
    Build the scoring prompt for the LLM.

    Args:
        assessment: Assessment with problem and rubric
        files: List of code files (path, content)
        explanation: Optional candidate explanation

    Returns:
        Complete prompt string
    """
    # Build file content string with truncation
    file_contents = []
    total_chars = 0

    for file in files:
        file_header = f"\n### File: {file['path']}\n```\n"
        file_footer = "\n```\n"
        content = file["content"]

        # Truncate if needed
        available = (
            MAX_CONTEXT_CHARS - total_chars - len(file_header) - len(file_footer) - 1000
        )
        if available <= 0:
            break

        if len(content) > available:
            content = content[:available] + "\n... (truncated)"

        file_contents.append(f"{file_header}{content}{file_footer}")
        total_chars += len(file_header) + len(content) + len(file_footer)

    files_text = "".join(file_contents)

    # Build the prompt
    prompt = f"""You are an expert code reviewer evaluating a coding submission.

## Problem Statement
{assessment.problem_statement}

## Requirements
{assessment.build_requirements}

## Acceptance Criteria
{assessment.acceptance_criteria}

## Code Files Submitted
{files_text}

"""

    if explanation:
        prompt += f"""## Candidate's Explanation
{explanation}

"""

    prompt += """## Scoring Instructions
Score the submission on each dimension from 0-100. Be fair but thorough.

Return your evaluation as valid JSON with this exact structure:
```json
{
  "correctness": <0-100>,
  "quality": <0-100>,
  "readability": <0-100>,
  "robustness": <0-100>,
  "clarity": <0-100>,
  "depth": <0-100>,
  "structure": <0-100>,
  "comment": "<brief overall assessment>"
}
```

Scoring criteria:
- correctness: Does the code solve the problem correctly?
- quality: Is the code well-written with good patterns?
- readability: Is the code easy to understand?
- robustness: Does it handle edge cases and errors?
- clarity: Is the explanation/reasoning clear?
- depth: Does it show deep understanding?
- structure: Is it well-organized?

Return ONLY the JSON object, no other text."""

    return prompt


def call_llm_sync(
    prompt: str,
    organization_id: str,
    submission_id: str,
    db: Session,
) -> dict:
    """
    Call LLM with fallback and logging.

    Args:
        prompt: The scoring prompt
        organization_id: For budget tracking
        submission_id: For logging
        db: Database session

    Returns:
        LLM response dict

    Raises:
        Exception if all providers fail
    """
    messages = [{"role": "user", "content": prompt}]
    last_error: Exception | None = None

    for provider in PROVIDER_ORDER:
        config = PROVIDER_CONFIG[provider]
        api_key = _get_api_key(provider)

        if not api_key:
            continue

        for attempt in range(MAX_RETRIES):
            start_time = time.time()

            try:
                response = _call_provider(provider, config, api_key, messages)
                latency_ms = int((time.time() - start_time) * 1000)

                # Log successful call
                _log_llm_usage(
                    db=db,
                    organization_id=organization_id,
                    submission_id=submission_id,
                    provider=provider,
                    model=str(config["model"]),
                    prompt_tokens=response.get("prompt_tokens", 0),
                    completion_tokens=response.get("completion_tokens", 0),
                    latency_ms=latency_ms,
                    success=True,
                    attempt_number=attempt + 1,
                )

                return response

            except httpx.HTTPStatusError as e:
                latency_ms = int((time.time() - start_time) * 1000)

                # Log failed attempt
                _log_llm_usage(
                    db=db,
                    organization_id=organization_id,
                    submission_id=submission_id,
                    provider=provider,
                    model=str(config["model"]),
                    prompt_tokens=0,
                    completion_tokens=0,
                    latency_ms=latency_ms,
                    success=False,
                    error_type=f"HTTP_{e.response.status_code}",
                    attempt_number=attempt + 1,
                )

                # Rate limit - exponential backoff and retry
                if e.response.status_code == 429:
                    wait_time = 2**attempt
                    logger.warning(f"Rate limited by {provider}, waiting {wait_time}s")
                    time.sleep(wait_time)
                    continue

                # Server error - retry
                if e.response.status_code >= 500:
                    wait_time = 2**attempt
                    logger.warning(
                        f"Server error from {provider}, waiting {wait_time}s"
                    )
                    time.sleep(wait_time)
                    continue

                last_error = e
                break

            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                _log_llm_usage(
                    db=db,
                    organization_id=organization_id,
                    submission_id=submission_id,
                    provider=provider,
                    model=str(config["model"]),
                    prompt_tokens=0,
                    completion_tokens=0,
                    latency_ms=latency_ms,
                    success=False,
                    error_type=type(e).__name__,
                    attempt_number=attempt + 1,
                )
                last_error = e
                break

    raise Exception(f"All LLM providers failed. Last error: {last_error}")


def _call_provider(
    provider: str,
    config: dict,
    api_key: str,
    messages: list[dict],
) -> dict:
    """
    Call a specific LLM provider.

    Returns:
        Dict with content and token counts
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": config["model"],
        "messages": messages,
        "temperature": 0,  # Deterministic per architecture decisions
        "max_tokens": 1000,
    }

    with httpx.Client(timeout=config["timeout"]) as client:
        response = client.post(
            config["url"],
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    # Extract response
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})

    return {
        "content": content,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
    }


def parse_scores(response: dict) -> dict | None:
    """
    Parse scores from LLM response.

    Args:
        response: LLM response dict with content

    Returns:
        Dict with scores or None if parsing fails
    """
    content = response.get("content", "")

    # Try to extract JSON from the response
    try:
        # Try direct JSON parse first
        scores = json.loads(content)
    except json.JSONDecodeError:
        # Try to find JSON in the response
        import re

        json_match = re.search(r"\{[^}]+\}", content, re.DOTALL)
        if not json_match:
            logger.error(f"No JSON found in response: {content[:200]}")
            return None

        try:
            scores = json.loads(json_match.group())
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON: {json_match.group()[:200]}")
            return None

    # Validate required fields
    required = [
        "correctness",
        "quality",
        "readability",
        "robustness",
        "clarity",
        "depth",
        "structure",
    ]
    for field in required:
        if field not in scores:
            logger.error(f"Missing field: {field}")
            return None

        # Validate score range
        try:
            score = int(scores[field])
            if not 0 <= score <= 100:
                logger.warning(f"Score out of range: {field}={score}, clamping")
                score = max(0, min(100, score))
            scores[field] = score
        except (ValueError, TypeError):
            logger.error(f"Invalid score value: {field}={scores[field]}")
            return None

    return scores


def call_llm_with_json_retry(
    prompt: str,
    organization_id: str,
    submission_id: str,
    db: Session,
) -> tuple[dict, dict | None]:
    """
    Call LLM and retry once with stricter prompt if JSON parsing fails.

    Per SPRINT-PLAN.md: "Invalid JSON retry: once with stricter JSON-only prompt"

    Args:
        prompt: The scoring prompt
        organization_id: For budget tracking
        submission_id: For logging
        db: Database session

    Returns:
        Tuple of (llm_response, parsed_scores) where parsed_scores may be None
    """
    # First attempt
    response = call_llm_sync(
        prompt=prompt,
        organization_id=organization_id,
        submission_id=submission_id,
        db=db,
    )

    scores = parse_scores(response)
    if scores is not None:
        return response, scores

    # JSON parsing failed - retry with stricter prompt
    logger.warning(
        f"JSON parsing failed for submission {submission_id}, retrying with stricter prompt"
    )

    # Build retry messages with context from first response
    retry_messages = [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": response.get("content", "")},
        {"role": "user", "content": STRICT_JSON_RETRY_PROMPT},
    ]

    # Call LLM again with stricter prompt
    retry_response = _call_llm_with_messages(
        messages=retry_messages,
        organization_id=organization_id,
        submission_id=submission_id,
        db=db,
        is_retry=True,
    )

    # Try parsing the retry response
    retry_scores = parse_scores(retry_response)

    if retry_scores is not None:
        logger.info(f"JSON retry successful for submission {submission_id}")
        return retry_response, retry_scores

    # Both attempts failed
    logger.error(f"JSON parsing failed after retry for submission {submission_id}")
    return retry_response, None


def _call_llm_with_messages(
    messages: list[dict],
    organization_id: str,
    submission_id: str,
    db: Session,
    is_retry: bool = False,
) -> dict:
    """
    Internal LLM call with explicit messages (for retry with conversation history).

    Args:
        messages: List of message dicts (role, content)
        organization_id: For budget tracking
        submission_id: For logging
        db: Database session
        is_retry: Whether this is a retry attempt

    Returns:
        LLM response dict
    """
    last_error: Exception | None = None

    for provider in PROVIDER_ORDER:
        config = PROVIDER_CONFIG[provider]
        api_key = _get_api_key(provider)

        if not api_key:
            continue

        start_time = time.time()

        try:
            response = _call_provider(provider, config, api_key, messages)
            latency_ms = int((time.time() - start_time) * 1000)

            # Log successful call
            _log_llm_usage(
                db=db,
                organization_id=organization_id,
                submission_id=submission_id,
                provider=provider,
                model=str(config["model"]),
                prompt_tokens=response.get("prompt_tokens", 0),
                completion_tokens=response.get("completion_tokens", 0),
                latency_ms=latency_ms,
                success=True,
                attempt_number=2 if is_retry else 1,
                error_type="JSON_RETRY" if is_retry else None,
            )

            return response

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            _log_llm_usage(
                db=db,
                organization_id=organization_id,
                submission_id=submission_id,
                provider=provider,
                model=str(config["model"]),
                prompt_tokens=0,
                completion_tokens=0,
                latency_ms=latency_ms,
                success=False,
                error_type=(
                    f"JSON_RETRY_{type(e).__name__}" if is_retry else type(e).__name__
                ),
                attempt_number=2 if is_retry else 1,
            )
            last_error = e
            continue

    raise Exception(f"LLM call failed: {last_error}")


def _log_llm_usage(
    db: Session,
    organization_id: str,
    submission_id: str,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    success: bool,
    error_type: str | None = None,
    attempt_number: int = 1,
) -> None:
    """Log LLM usage for cost tracking."""
    from uuid import UUID

    config = PROVIDER_CONFIG.get(provider, {})
    total_tokens = prompt_tokens + completion_tokens
    cost_per_input = cast(float, config.get("cost_per_1k_input", 0.0))
    cost_per_output = cast(float, config.get("cost_per_1k_output", 0.0))
    cost = (prompt_tokens / 1000) * cost_per_input + (
        completion_tokens / 1000
    ) * cost_per_output

    log = LLMUsageLog(
        organization_id=UUID(organization_id),
        submission_id=UUID(submission_id),
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_usd=cost,
        latency_ms=latency_ms,
        success=success,
        error_type=error_type,
        attempt_number=attempt_number,
    )
    db.add(log)
    db.commit()
