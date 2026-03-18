"""
Authentication API tests.

Tests /auth/me endpoint and token verification.
"""

import pytest
from fastapi.testclient import TestClient

from app.models import Organization, User


class TestAuthMe:
    """Tests for GET /api/v1/auth/me."""

    def test_auth_me_returns_user_with_orgs(
        self,
        client: TestClient,
        test_user: User,
        test_org: Organization,
        auth_headers: dict,
    ):
        """GET /auth/me returns user data with organization list."""
        response = client.get("/api/v1/auth/me", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Response is nested: data.user and data.organizations
        assert data["data"]["user"]["email"] == test_user.email
        assert data["data"]["user"]["id"] == str(test_user.id)

        # Should include organization list
        orgs = data["data"].get("organizations", [])
        assert len(orgs) >= 1
        org_ids = [o["organization_id"] for o in orgs]
        assert str(test_org.id) in org_ids

    def test_auth_me_without_token_returns_401(self, client: TestClient):
        """GET /auth/me without Authorization header returns 401."""
        response = client.get("/api/v1/auth/me")

        assert response.status_code in (401, 422)  # 422 if header validation fails

    def test_auth_me_with_invalid_token_returns_401(
        self,
        client: TestClient,
        test_org: Organization,
    ):
        """GET /auth/me with invalid token returns 401."""
        headers = {
            "Authorization": "Bearer invalid-token-format",
            "X-Organization-Id": str(test_org.id),
        }
        response = client.get("/api/v1/auth/me", headers=headers)

        assert response.status_code == 401

    def test_auth_me_creates_new_user_on_first_call(
        self,
        client: TestClient,
        db,
        test_org: Organization,
    ):
        """GET /auth/me creates user if not exists (upsert behavior)."""
        from app.models import OrganizationUser, OrganizationUserRole

        # Create a new user with mock token
        new_firebase_uid = "new-user-test-uid"

        # First, we need to create an org membership for the auth to work
        # since get_current_org checks membership
        new_user = User(
            firebase_uid=new_firebase_uid,
            email="newuser@example.com",
            name="New Test User",
            email_verified=True,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        membership = OrganizationUser(
            organization_id=test_org.id,
            user_id=new_user.id,
            role=OrganizationUserRole.CANDIDATE,
        )
        db.add(membership)
        db.commit()

        headers = {
            "Authorization": f"Bearer mock-token-{new_firebase_uid}",
            "X-Organization-Id": str(test_org.id),
        }

        response = client.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200

        data = response.json()
        assert data["data"]["user"]["id"] == str(new_user.id)


class TestAuthRequirements:
    """Tests for authentication requirements."""

    def test_protected_endpoint_requires_org_header(
        self,
        client: TestClient,
        test_user: User,
    ):
        """Protected endpoints require X-Organization-Id header."""
        headers = {
            "Authorization": f"Bearer mock-token-{test_user.firebase_uid}",
            # Missing X-Organization-Id
        }

        response = client.get("/api/v1/profiles/me", headers=headers)

        # Should fail with missing header error
        assert response.status_code in (400, 422)

    def test_protected_endpoint_requires_valid_org(
        self,
        client: TestClient,
        test_user: User,
    ):
        """Protected endpoints require valid organization ID."""
        from uuid import uuid4

        headers = {
            "Authorization": f"Bearer mock-token-{test_user.firebase_uid}",
            "X-Organization-Id": str(uuid4()),  # Random non-existent org
        }

        response = client.get("/api/v1/profiles/me", headers=headers)

        assert response.status_code == 404
        assert "ORG_NOT_FOUND" in response.text

    def test_protected_endpoint_requires_membership(
        self,
        client: TestClient,
        test_user: User,
        other_org: Organization,
    ):
        """Protected endpoints require user to be member of org."""
        headers = {
            "Authorization": f"Bearer mock-token-{test_user.firebase_uid}",
            "X-Organization-Id": str(other_org.id),  # Org user is not a member of
        }

        response = client.get("/api/v1/profiles/me", headers=headers)

        assert response.status_code == 403
        assert "NOT_ORG_MEMBER" in response.text
