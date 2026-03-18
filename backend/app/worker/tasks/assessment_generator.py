"""
AI-assisted assessment generator.

Uses LLM to generate assessment content from a brief description.
"""

import json
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Reuse provider config from scoring module
PROVIDER_CONFIG = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
        "env_key": "GROQ_API_KEY",
        "timeout": 60,
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
        "timeout": 90,
    },
}

PROVIDER_ORDER = ["groq", "openai"]

GENERATION_PROMPT = """You are an expert technical assessment designer creating coding challenges for developer hiring.

Given a brief description, generate a complete coding assessment with all required fields.

## Input Description
{description}

## Additional Context (if provided)
- Difficulty: {difficulty}
- Target role: {role}
- Time limit: {time_limit} days
- Tags/skills: {tags}

## Instructions
Generate a comprehensive coding assessment. Be specific, practical, and fair.

Return ONLY a valid JSON object with this exact structure:
```json
{{
  "title": "<concise title for the assessment>",
  "problem_statement": "<detailed problem description - what the candidate needs to understand and solve, 2-3 paragraphs>",
  "build_requirements": "<specific technical requirements - languages, frameworks, features to implement, 3-5 bullet points>",
  "input_output_examples": "<concrete examples of expected inputs and outputs, with sample data>",
  "acceptance_criteria": "<clear criteria for a successful submission - what must work, 4-6 bullet points>",
  "constraints": "<any limitations, restrictions, or important notes - time complexity, no external libraries, etc.>",
  "submission_instructions": "<how to submit - repo structure, README requirements, deployment if needed>",
  "starter_code": "<optional starter code or boilerplate, or null if not needed>",
  "helpful_docs": "<relevant documentation links or resources, or null>",
  "suggested_tags": ["<tag1>", "<tag2>", "<tag3>"]
}}
```

Make the assessment:
- Clear and unambiguous
- Practical and real-world applicable
- Appropriately scoped for the time limit
- Testable with clear success criteria

Return ONLY the JSON object, no other text."""

STRICT_JSON_RETRY = """Your response was not valid JSON. Return ONLY a valid JSON object with the assessment fields. No markdown, no explanation, just the JSON object starting with {{ and ending with }}."""


def generate_assessment(
    description: str,
    difficulty: str = "intermediate",
    role: str | None = None,
    time_limit_days: int = 3,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Generate assessment content from a brief description.

    Args:
        description: Brief description of desired assessment
        difficulty: easy, intermediate, or hard
        role: Target role (e.g., "backend engineer", "full-stack developer")
        time_limit_days: Expected completion time
        tags: Relevant skill tags

    Returns:
        Dict with generated assessment fields

    Raises:
        Exception if generation fails
    """
    prompt = GENERATION_PROMPT.format(
        description=description,
        difficulty=difficulty,
        role=role or "software engineer",
        time_limit=time_limit_days,
        tags=", ".join(tags) if tags else "not specified",
    )

    # Try to generate with LLM
    response = _call_llm(prompt)
    result = _parse_response(response)

    if result is None:
        # Retry with stricter prompt
        logger.warning("JSON parsing failed, retrying with stricter prompt")
        retry_response = _call_llm(prompt + "\n\n" + STRICT_JSON_RETRY)
        result = _parse_response(retry_response)

    if result is None:
        raise Exception("Failed to generate valid assessment content")

    return result


def _call_llm(prompt: str) -> str:
    """Call LLM with fallback across providers."""
    messages = [{"role": "user", "content": prompt}]
    last_error: Exception | None = None

    for provider in PROVIDER_ORDER:
        config = PROVIDER_CONFIG[provider]
        api_key = os.getenv(str(config["env_key"]))

        if not api_key:
            continue

        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }

            payload = {
                "model": config["model"],
                "messages": messages,
                "temperature": 0.7,  # Some creativity for generation
                "max_tokens": 2000,
            }

            with httpx.Client(timeout=config["timeout"]) as client:
                response = client.post(
                    str(config["url"]),
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

            return data["choices"][0]["message"]["content"]

        except Exception as e:
            logger.warning(f"Provider {provider} failed: {e}")
            last_error = e
            continue

    raise Exception(f"All LLM providers failed: {last_error}")


def _parse_response(content: str) -> dict[str, Any] | None:
    """Parse JSON from LLM response."""
    import re

    # Try direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code blocks
    json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", content)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON object
    json_match = re.search(r"\{[\s\S]*\}", content)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    logger.error(f"Failed to parse JSON from response: {content[:500]}")
    return None
