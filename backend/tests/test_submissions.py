"""
Submission API tests.

Tests submission creation, status tracking, and scoring flow.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Assessment, CandidateProfile, Organization, Submission, User
from app.models.enums import AssessmentStatus, SubmissionStatus
from app.services.github import ValidationResult


class TestSubmissionCreation:
    """Tests for POST /api/v1/submissions."""

    @pytest.fixture
    def published_assessment(
        self,
        db: Session,
        test_org: Organization,
        test_owner: User,
    ) -> Assessment:
        """Create a published assessment for testing."""
        assessment = Assessment(
            organization_id=test_org.id,
            title="Test Assessment",
            problem_statement="Build a REST API",
            build_requirements="Use Python/FastAPI",
            input_output_examples="GET /items returns []",
            acceptance_criteria="All tests pass",
            constraints="None",
            submission_instructions="Submit via GitHub",
            weight_correctness=20,
            weight_quality=15,
            weight_readability=15,
            weight_robustness=15,
            weight_clarity=15,
            weight_depth=10,
            weight_structure=10,
            status=AssessmentStatus.PUBLISHED,
            created_by=test_owner.id,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    @patch("app.worker.queue.enqueue_scoring_job")
    @patch("app.api.v1.submissions.validate_github_url")
    def test_create_submission_success(
        self,
        mock_validate_github: MagicMock,
        mock_enqueue: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
        published_assessment: Assessment,
    ):
        """Successful submission creation."""
        mock_validate_github.return_value = ValidationResult(is_valid=True)
        mock_enqueue.return_value = "job-123"

        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(published_assessment.id),
                "github_repo_url": "https://github.com/testuser/testrepo",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["status"] in ("QUEUED", "SUBMITTED")
        assert data["data"]["github_repo_url"] == "https://github.com/testuser/testrepo"

    def test_create_submission_invalid_github_url(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        published_assessment: Assessment,
    ):
        """Submission with invalid GitHub URL fails."""
        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(published_assessment.id),
                "github_repo_url": "not-a-valid-url",
            },
        )

        assert response.status_code == 422

    def test_create_submission_non_github_url(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        published_assessment: Assessment,
    ):
        """Submission with non-GitHub URL fails."""
        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(published_assessment.id),
                "github_repo_url": "https://gitlab.com/user/repo",
            },
        )

        assert response.status_code == 422

    @patch("app.worker.queue.enqueue_scoring_job")
    @patch("app.api.v1.submissions.validate_github_url")
    def test_duplicate_submission_rejected(
        self,
        mock_validate_github: MagicMock,
        mock_enqueue: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
        published_assessment: Assessment,
        db: Session,
        test_candidate: User,
        test_org: Organization,
    ):
        """One submission per user per assessment enforced."""
        mock_validate_github.return_value = ValidationResult(is_valid=True)
        mock_enqueue.return_value = "job-123"

        # Create existing submission
        existing = Submission(
            organization_id=test_org.id,
            candidate_id=test_candidate.id,
            assessment_id=published_assessment.id,
            github_repo_url="https://github.com/test/existing",
            status=SubmissionStatus.EVALUATED,
        )
        db.add(existing)
        db.commit()

        # Try to create another
        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(published_assessment.id),
                "github_repo_url": "https://github.com/test/new",
            },
        )

        assert response.status_code == 409
        assert "ALREADY_SUBMITTED" in response.text

    @patch("app.api.v1.submissions.validate_github_url")
    def test_submission_to_nonexistent_assessment(
        self,
        mock_validate_github: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
    ):
        """Submission to non-existent assessment fails."""
        from uuid import uuid4

        # Ensure URL validation passes so we can assert ASSESSMENT_NOT_FOUND.
        mock_validate_github.return_value = ValidationResult(is_valid=True)

        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(uuid4()),
                "github_repo_url": "https://github.com/test/repo",
            },
        )

        assert response.status_code == 404


class TestSubmissionStatus:
    """Tests for GET /api/v1/submissions/{id}/status."""

    @pytest.fixture
    def test_submission(
        self,
        db: Session,
        test_org: Organization,
        test_candidate: User,
        test_owner: User,
    ) -> Submission:
        """Create a test submission."""
        assessment = Assessment(
            organization_id=test_org.id,
            title="Test Assessment",
            problem_statement="Test",
            build_requirements="Test",
            input_output_examples="Test",
            acceptance_criteria="Test",
            constraints="None",
            submission_instructions="Submit",
            weight_correctness=20,
            weight_quality=15,
            weight_readability=15,
            weight_robustness=15,
            weight_clarity=15,
            weight_depth=10,
            weight_structure=10,
            status=AssessmentStatus.PUBLISHED,
            created_by=test_owner.id,
        )
        db.add(assessment)
        db.commit()

        submission = Submission(
            organization_id=test_org.id,
            candidate_id=test_candidate.id,
            assessment_id=assessment.id,
            github_repo_url="https://github.com/test/repo",
            status=SubmissionStatus.SCORING,
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission

    def test_get_submission_status(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        test_submission: Submission,
    ):
        """Get submission status for polling."""
        response = client.get(
            f"/api/v1/submissions/{test_submission.id}/status",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["status"] == "SCORING"
        assert data["data"]["id"] == str(test_submission.id)

    def test_get_submission_detail(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        test_submission: Submission,
    ):
        """Get full submission detail."""
        response = client.get(
            f"/api/v1/submissions/{test_submission.id}",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["github_repo_url"] == "https://github.com/test/repo"


class TestSubmissionList:
    """Tests for GET /api/v1/submissions."""

    @pytest.fixture
    def multiple_submissions(
        self,
        db: Session,
        test_org: Organization,
        test_candidate: User,
        test_owner: User,
    ) -> list[Submission]:
        """Create multiple test submissions."""
        submissions = []
        for i in range(3):
            assessment = Assessment(
                organization_id=test_org.id,
                title=f"Assessment {i}",
                problem_statement="Test",
                build_requirements="Test",
                input_output_examples="Test",
                acceptance_criteria="Test",
                constraints="None",
                submission_instructions="Submit",
                weight_correctness=20,
                weight_quality=15,
                weight_readability=15,
                weight_robustness=15,
                weight_clarity=15,
                weight_depth=10,
                weight_structure=10,
                status=AssessmentStatus.PUBLISHED,
                created_by=test_owner.id,
            )
            db.add(assessment)
            db.commit()

            submission = Submission(
                organization_id=test_org.id,
                candidate_id=test_candidate.id,
                assessment_id=assessment.id,
                github_repo_url=f"https://github.com/test/repo{i}",
                status=SubmissionStatus.EVALUATED,
                final_score=70 + i * 10,
            )
            db.add(submission)
            submissions.append(submission)

        db.commit()
        for s in submissions:
            db.refresh(s)
        return submissions

    def test_list_my_submissions(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        multiple_submissions: list[Submission],
    ):
        """List user's own submissions."""
        response = client.get(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 3

    def test_list_submissions_filter_by_status(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        multiple_submissions: list[Submission],
    ):
        """Filter submissions by status."""
        response = client.get(
            "/api/v1/submissions?status=EVALUATED",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        for sub in data["data"]:
            assert sub["status"] == "EVALUATED"
