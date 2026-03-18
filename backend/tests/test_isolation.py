"""
Cross-organization isolation tests.

Verifies that users cannot access data from other organizations.
This is a critical security requirement.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    CandidateProfile,
    Organization,
    OrganizationUser,
    OrganizationUserRole,
    Submission,
    User,
)
from app.models.enums import AssessmentStatus, SubmissionStatus
from app.services.github import ValidationResult


class TestCrossOrgIsolation:
    """Tests to verify cross-org data isolation."""

    @pytest.fixture
    def org_a_assessment(
        self, db: Session, test_org: Organization, test_owner: User
    ) -> Assessment:
        """Create an assessment in org A (test_org)."""
        assessment = Assessment(
            organization_id=test_org.id,
            title="Org A Assessment",
            problem_statement="Test problem",
            build_requirements="Test requirements",
            input_output_examples="Test examples",
            acceptance_criteria="Test criteria",
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

    @pytest.fixture
    def org_b_assessment(
        self, db: Session, other_org: Organization, other_user: User
    ) -> Assessment:
        """Create an assessment in org B (other_org)."""
        assessment = Assessment(
            organization_id=other_org.id,
            title="Org B Assessment",
            problem_statement="Other problem",
            build_requirements="Other requirements",
            input_output_examples="Other examples",
            acceptance_criteria="Other criteria",
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
            created_by=other_user.id,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    def test_cannot_list_other_org_assessments(
        self,
        client: TestClient,
        auth_headers: dict,
        org_a_assessment: Assessment,
        org_b_assessment: Assessment,
    ):
        """User should only see assessments from their org."""
        response = client.get("/api/v1/assessments", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assessment_ids = [a["id"] for a in data["data"]]

        # Should see org A assessment
        assert str(org_a_assessment.id) in assessment_ids
        # Should NOT see org B assessment
        assert str(org_b_assessment.id) not in assessment_ids

    def test_cannot_get_other_org_assessment(
        self,
        client: TestClient,
        auth_headers: dict,
        org_b_assessment: Assessment,
    ):
        """User cannot GET assessment from another org."""
        response = client.get(
            f"/api/v1/assessments/{org_b_assessment.id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @patch("app.api.v1.submissions.validate_github_url")
    def test_cannot_create_submission_for_other_org_assessment(
        self,
        mock_validate_github: MagicMock,
        client: TestClient,
        auth_headers: dict,
        org_b_assessment: Assessment,
    ):
        """User cannot submit to assessment in another org."""
        # Ensure URL validation passes so we can assert the org-scoped assessment lookup behavior.
        mock_validate_github.return_value = ValidationResult(is_valid=True)

        response = client.post(
            "/api/v1/submissions",
            headers=auth_headers,
            json={
                "assessment_id": str(org_b_assessment.id),
                "github_repo_url": "https://github.com/test/repo",
            },
        )

        # Should fail - assessment not found (from user's org perspective)
        assert response.status_code == 404


class TestCrossOrgSubmissionIsolation:
    """Tests for submission isolation."""

    @pytest.fixture
    def org_a_submission(
        self,
        db: Session,
        test_org: Organization,
        test_candidate: User,
        test_owner: User,
    ) -> Submission:
        """Create a submission in org A."""
        # First create an assessment
        assessment = Assessment(
            organization_id=test_org.id,
            title="Test Assessment",
            problem_statement="Test problem",
            build_requirements="Test requirements",
            input_output_examples="Test examples",
            acceptance_criteria="Test criteria",
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

        submission = Submission(
            organization_id=test_org.id,
            candidate_id=test_candidate.id,
            assessment_id=assessment.id,
            github_repo_url="https://github.com/test/repo",
            status=SubmissionStatus.EVALUATED,
            final_score=85,
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission

    @pytest.fixture
    def org_b_submission(
        self,
        db: Session,
        other_org: Organization,
        other_user: User,
    ) -> Submission:
        """Create a submission in org B."""
        assessment = Assessment(
            organization_id=other_org.id,
            title="Other Assessment",
            problem_statement="Other problem",
            build_requirements="Other requirements",
            input_output_examples="Other examples",
            acceptance_criteria="Other criteria",
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
            created_by=other_user.id,
        )
        db.add(assessment)
        db.commit()

        submission = Submission(
            organization_id=other_org.id,
            candidate_id=other_user.id,
            assessment_id=assessment.id,
            github_repo_url="https://github.com/other/repo",
            status=SubmissionStatus.EVALUATED,
            final_score=90,
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission

    def test_cannot_get_other_org_submission(
        self,
        client: TestClient,
        auth_headers: dict,
        org_b_submission: Submission,
    ):
        """User cannot GET submission from another org."""
        response = client.get(
            f"/api/v1/submissions/{org_b_submission.id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestCrossOrgProfileIsolation:
    """Tests for profile isolation."""

    @pytest.fixture
    def org_b_profile(
        self, db: Session, other_org: Organization, other_user: User
    ) -> CandidateProfile:
        """Create a profile in org B."""
        profile = CandidateProfile(
            organization_id=other_org.id,
            user_id=other_user.id,
            name="Other User Profile",
            github_url="https://github.com/otheruser",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def test_cannot_get_other_org_profile(
        self,
        client: TestClient,
        auth_headers: dict,
        org_b_profile: CandidateProfile,
    ):
        """User cannot GET profile from another org."""
        response = client.get(
            f"/api/v1/profiles/{org_b_profile.user_id}",
            headers=auth_headers,
        )

        # Should return 404 (not found in user's org)
        assert response.status_code == 404


class TestOrgHeaderEnforcement:
    """Tests that org header is always required and validated."""

    def test_all_protected_endpoints_require_org_header(
        self,
        client: TestClient,
        test_user: User,
    ):
        """All protected endpoints must require X-Organization-Id header."""
        headers = {
            "Authorization": f"Bearer mock-token-{test_user.firebase_uid}",
            # Missing X-Organization-Id
        }

        protected_endpoints = [
            ("GET", "/api/v1/assessments"),
            ("GET", "/api/v1/submissions"),
            ("GET", "/api/v1/profiles/me"),
            ("GET", "/api/v1/organizations/current"),
            ("GET", "/api/v1/leaderboard"),
        ]

        for method, path in protected_endpoints:
            if method == "GET":
                response = client.get(path, headers=headers)
            elif method == "POST":
                response = client.post(path, headers=headers, json={})

            assert response.status_code in (
                400,
                422,
            ), f"{method} {path} should require org header"
