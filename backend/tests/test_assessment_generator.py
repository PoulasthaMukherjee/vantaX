"""
Tests for AI-assisted assessment generator.

Covers:
- Assessment generator service (assessment_generator.py)
- Generate API endpoint
"""

import json
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.assessment import Assessment
from app.models.enums import AssessmentStatus, AssessmentVisibility, EvaluationMode
from app.worker.tasks.assessment_generator import (
    _parse_response,
    generate_assessment,
)


# =============================================================================
# Assessment Generator Service Tests
# =============================================================================


class TestAssessmentGenerator:
    """Tests for assessment_generator.py functions."""

    def test_parse_response_valid_json(self):
        """Test parsing valid JSON response."""
        content = json.dumps({
            "title": "Todo API",
            "problem_statement": "Build a REST API",
            "build_requirements": "Use Python and FastAPI",
            "input_output_examples": "GET /todos -> []",
            "acceptance_criteria": "All CRUD operations work",
            "constraints": "No external databases",
            "submission_instructions": "Submit via GitHub",
            "starter_code": None,
            "helpful_docs": None,
            "suggested_tags": ["python", "api"],
        })

        result = _parse_response(content)

        assert result is not None
        assert result["title"] == "Todo API"
        assert result["problem_statement"] == "Build a REST API"
        assert result["suggested_tags"] == ["python", "api"]

    def test_parse_response_json_in_markdown(self):
        """Test parsing JSON wrapped in markdown code block."""
        content = """Here's your assessment:

```json
{
  "title": "Todo API",
  "problem_statement": "Build a REST API",
  "build_requirements": "Use Python",
  "input_output_examples": "GET /todos",
  "acceptance_criteria": "Works",
  "constraints": "None",
  "submission_instructions": "GitHub"
}
```

Let me know if you need changes!"""

        result = _parse_response(content)

        assert result is not None
        assert result["title"] == "Todo API"

    def test_parse_response_raw_json_in_text(self):
        """Test parsing raw JSON object embedded in text."""
        content = """Sure, here's the assessment:
{"title": "Test", "problem_statement": "Test problem", "build_requirements": "Build it", "input_output_examples": "In/Out", "acceptance_criteria": "Pass", "constraints": "None", "submission_instructions": "Submit"}
Hope that helps!"""

        result = _parse_response(content)

        assert result is not None
        assert result["title"] == "Test"

    def test_parse_response_invalid_json(self):
        """Test that invalid JSON returns None."""
        content = "This is not JSON at all, just plain text."

        result = _parse_response(content)

        assert result is None

    def test_parse_response_malformed_json(self):
        """Test that malformed JSON returns None."""
        content = '{"title": "Test", "missing_closing_brace": '

        result = _parse_response(content)

        assert result is None

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_success(self, mock_call_llm):
        """Test successful assessment generation."""
        mock_response = json.dumps({
            "title": "Todo REST API",
            "problem_statement": "Build a complete REST API for managing todos",
            "build_requirements": "- Use Python 3.10+\n- Use FastAPI\n- SQLite database",
            "input_output_examples": "POST /todos {title: 'Test'} -> {id: 1, title: 'Test'}",
            "acceptance_criteria": "- CRUD operations work\n- Input validation",
            "constraints": "- No external services\n- Complete in 3 days",
            "submission_instructions": "Push to GitHub and submit URL",
            "starter_code": "from fastapi import FastAPI\napp = FastAPI()",
            "helpful_docs": "https://fastapi.tiangolo.com",
            "suggested_tags": ["python", "fastapi", "rest-api"],
        })
        mock_call_llm.return_value = mock_response

        result = generate_assessment(
            description="Build a REST API for todos",
            difficulty="intermediate",
            role="backend engineer",
            time_limit_days=3,
            tags=["python"],
        )

        assert result["title"] == "Todo REST API"
        assert "REST API" in result["problem_statement"]
        assert result["suggested_tags"] == ["python", "fastapi", "rest-api"]
        mock_call_llm.assert_called_once()

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_retry_on_invalid_json(self, mock_call_llm):
        """Test that generation retries with stricter prompt on invalid JSON."""
        # First call returns invalid JSON, second returns valid
        mock_call_llm.side_effect = [
            "Here's your assessment but no JSON",
            json.dumps({
                "title": "Test",
                "problem_statement": "Test",
                "build_requirements": "Test",
                "input_output_examples": "Test",
                "acceptance_criteria": "Test",
                "constraints": "Test",
                "submission_instructions": "Test",
            }),
        ]

        result = generate_assessment(description="Test assessment")

        assert result["title"] == "Test"
        assert mock_call_llm.call_count == 2

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_fails_after_retry(self, mock_call_llm):
        """Test that generation raises exception if both attempts fail."""
        mock_call_llm.return_value = "Invalid response without JSON"

        with pytest.raises(Exception) as exc_info:
            generate_assessment(description="Test assessment")

        assert "Failed to generate" in str(exc_info.value)


# =============================================================================
# API Endpoint Tests
# =============================================================================


class TestAssessmentGenerateAPI:
    """Tests for POST /assessments/generate endpoint."""

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_endpoint_success(
        self, mock_call_llm, client, owner_auth_headers
    ):
        """Test successful assessment generation via API."""
        mock_call_llm.return_value = json.dumps({
            "title": "E-commerce API",
            "problem_statement": "Build an e-commerce backend",
            "build_requirements": "Use Node.js and Express",
            "input_output_examples": "GET /products -> [{id: 1}]",
            "acceptance_criteria": "Products CRUD works",
            "constraints": "3 day time limit",
            "submission_instructions": "Submit GitHub URL",
            "starter_code": None,
            "helpful_docs": None,
            "suggested_tags": ["nodejs", "express", "api"],
        })

        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build an e-commerce backend API",
                "difficulty": "intermediate",
                "time_limit_days": 3,
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["title"] == "E-commerce API"
        assert data["data"]["problem_statement"] == "Build an e-commerce backend"
        assert data["data"]["suggested_tags"] == ["nodejs", "express", "api"]

    def test_generate_assessment_requires_admin(
        self, client, candidate_auth_headers
    ):
        """Test that candidates cannot generate assessments."""
        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build a todo app",
                "difficulty": "easy",
            },
            headers=candidate_auth_headers,
        )

        assert response.status_code == 403

    def test_generate_assessment_requires_description(
        self, client, owner_auth_headers
    ):
        """Test that description is required."""
        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "difficulty": "easy",
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 422

    def test_generate_assessment_validates_description_length(
        self, client, owner_auth_headers
    ):
        """Test that description must be at least 10 characters."""
        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "short",
                "difficulty": "easy",
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 422

    def test_generate_assessment_validates_difficulty(
        self, client, owner_auth_headers
    ):
        """Test that difficulty must be valid enum value."""
        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build a REST API for todos",
                "difficulty": "impossible",
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 422

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_with_all_options(
        self, mock_call_llm, client, owner_auth_headers
    ):
        """Test generation with all optional parameters."""
        mock_call_llm.return_value = json.dumps({
            "title": "ML Pipeline",
            "problem_statement": "Build an ML data pipeline",
            "build_requirements": "Use Python and scikit-learn",
            "input_output_examples": "Input CSV -> trained model",
            "acceptance_criteria": "Model accuracy > 80%",
            "constraints": "No cloud services",
            "submission_instructions": "Submit Jupyter notebook",
            "starter_code": "import pandas as pd",
            "helpful_docs": "https://scikit-learn.org",
            "suggested_tags": ["python", "ml", "data-science"],
        })

        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build a machine learning pipeline for classification",
                "difficulty": "hard",
                "role": "ML Engineer",
                "time_limit_days": 7,
                "tags": ["python", "machine-learning"],
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["title"] == "ML Pipeline"
        assert data["data"]["starter_code"] == "import pandas as pd"

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_assessment_handles_llm_failure(
        self, mock_call_llm, client, owner_auth_headers
    ):
        """Test that LLM failures return appropriate error."""
        mock_call_llm.side_effect = Exception("LLM provider unavailable")

        response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build a REST API for todos",
                "difficulty": "easy",
            },
            headers=owner_auth_headers,
        )

        assert response.status_code == 500
        data = response.json()
        assert "GENERATION_FAILED" in str(data)


# =============================================================================
# Integration Tests
# =============================================================================


class TestAssessmentGenerateIntegration:
    """Integration tests for full generate -> create flow."""

    @patch("app.worker.tasks.assessment_generator._call_llm")
    def test_generate_then_create_assessment(
        self, mock_call_llm, client, owner_auth_headers, db
    ):
        """Test generating assessment content then creating it."""
        mock_call_llm.return_value = json.dumps({
            "title": "Blog API",
            "problem_statement": "Build a blog backend with posts and comments",
            "build_requirements": "Use any language/framework",
            "input_output_examples": "POST /posts -> {id, title, content}",
            "acceptance_criteria": "CRUD for posts and comments",
            "constraints": "Complete within time limit",
            "submission_instructions": "Submit via GitHub URL",
            "starter_code": None,
            "helpful_docs": None,
            "suggested_tags": ["api", "backend"],
        })

        # Step 1: Generate
        gen_response = client.post(
            "/api/v1/assessments/generate",
            json={
                "description": "Build a blog API with posts and comments",
                "difficulty": "intermediate",
                "time_limit_days": 3,
            },
            headers=owner_auth_headers,
        )

        assert gen_response.status_code == 200
        generated = gen_response.json()["data"]

        # Step 2: Create using generated content
        create_response = client.post(
            "/api/v1/assessments",
            json={
                "title": generated["title"],
                "problem_statement": generated["problem_statement"],
                "build_requirements": generated["build_requirements"],
                "input_output_examples": generated["input_output_examples"],
                "acceptance_criteria": generated["acceptance_criteria"],
                "constraints": generated["constraints"],
                "submission_instructions": generated["submission_instructions"],
                "time_limit_days": 3,
                "tags": generated.get("suggested_tags", []),
            },
            headers=owner_auth_headers,
        )

        assert create_response.status_code == 201
        created = create_response.json()["data"]
        assert created["title"] == "Blog API"
        assert created["status"] == "published"

        # Verify in database
        assessment = db.query(Assessment).filter(Assessment.id == created["id"]).first()
        assert assessment is not None
        assert assessment.title == "Blog API"
