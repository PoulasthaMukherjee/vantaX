"""
Event (hackathon) API tests.

Tests event CRUD, registration, assessments, leaderboard, and certificates.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Assessment, Organization, Submission, User
from app.models.enums import (
    AssessmentStatus,
    EventStatus,
    EventVisibility,
    SubmissionStatus,
)
from app.models.event import Event, EventAssessment, EventInvite, EventRegistration

# =============================================================================
# Event CRUD Tests
# =============================================================================


class TestEventCRUD:
    """Tests for event create, read, update, delete."""

    @pytest.fixture
    def event_data(self) -> dict:
        """Valid event creation data."""
        now = datetime.utcnow()
        return {
            "title": "Test Hackathon",
            "slug": f"test-hackathon-{uuid4().hex[:8]}",
            "description": "A test hackathon event",
            "short_description": "Test event",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(),
            "max_participants": 100,
            "max_submissions_per_user": 3,
            "visibility": "public",
        }

    def test_create_event_as_admin(
        self,
        client: TestClient,
        auth_headers: dict,
        event_data: dict,
    ):
        """Admin can create an event."""
        response = client.post(
            "/api/v1/events",
            headers=auth_headers,
            json=event_data,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["title"] == event_data["title"]
        assert data["data"]["slug"] == event_data["slug"]
        assert data["data"]["status"] == "draft"

    def test_create_event_as_candidate_fails(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        event_data: dict,
    ):
        """Candidates cannot create events."""
        response = client.post(
            "/api/v1/events",
            headers=candidate_auth_headers,
            json=event_data,
        )

        assert response.status_code == 403

    def test_create_event_duplicate_slug_fails(
        self,
        client: TestClient,
        auth_headers: dict,
        event_data: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Duplicate slug within org fails."""
        # Create existing event
        existing = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Existing Event",
            slug=event_data["slug"],
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(existing)
        db.commit()

        response = client.post(
            "/api/v1/events",
            headers=auth_headers,
            json=event_data,
        )

        assert response.status_code == 409
        assert "SLUG_EXISTS" in response.text

    def test_list_events(
        self,
        client: TestClient,
        auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """List events in organization."""
        # Create test events
        for i in range(3):
            event = Event(
                organization_id=test_org.id,
                created_by=test_user.id,
                title=f"Event {i}",
                slug=f"event-{i}-{uuid4().hex[:8]}",
                starts_at=datetime.utcnow() + timedelta(days=1),
                ends_at=datetime.utcnow() + timedelta(days=7),
                status=EventStatus.UPCOMING,
                visibility=EventVisibility.PUBLIC,
            )
            db.add(event)
        db.commit()

        response = client.get("/api/v1/events", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) >= 3

    def test_get_event_by_id(
        self,
        client: TestClient,
        auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Get event by ID."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Test Event",
            slug=f"test-event-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.UPCOMING,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        response = client.get(f"/api/v1/events/{event.id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["id"] == str(event.id)
        assert data["data"]["title"] == "Test Event"

    def test_get_event_by_slug(
        self,
        client: TestClient,
        auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Get event by slug."""
        slug = f"test-slug-{uuid4().hex[:8]}"
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Test Event",
            slug=slug,
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(event)
        db.commit()

        response = client.get(f"/api/v1/events/{slug}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["slug"] == slug

    def test_update_event(
        self,
        client: TestClient,
        auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Update event."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Original Title",
            slug=f"update-test-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        response = client.patch(
            f"/api/v1/events/{event.id}",
            headers=auth_headers,
            json={"title": "Updated Title", "status": "upcoming"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["title"] == "Updated Title"
        assert data["data"]["status"] == "upcoming"

    def test_delete_event(
        self,
        client: TestClient,
        owner_auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_owner: User,
    ):
        """Owner can delete event."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_owner.id,
            title="To Delete",
            slug=f"delete-test-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        response = client.delete(
            f"/api/v1/events/{event.id}",
            headers=owner_auth_headers,
        )

        assert response.status_code == 200

        # Verify deleted
        deleted = db.query(Event).filter(Event.id == event.id).first()
        assert deleted is None


# =============================================================================
# Event Registration Tests
# =============================================================================


class TestEventRegistration:
    """Tests for event registration and unregistration."""

    @pytest.fixture
    def active_event(
        self,
        db: Session,
        test_org: Organization,
        test_user: User,
    ) -> Event:
        """Create an active event open for registration."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Active Event",
            slug=f"active-event-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
            visibility=EventVisibility.PUBLIC,
            max_participants=100,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    def test_register_for_event(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        active_event: Event,
    ):
        """User can register for an active event."""
        response = client.post(
            f"/api/v1/events/{active_event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["event_id"] == str(active_event.id)

    def test_register_duplicate_fails(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        active_event: Event,
        db: Session,
        test_candidate: User,
    ):
        """Cannot register twice for same event."""
        # Create existing registration
        reg = EventRegistration(
            event_id=active_event.id,
            user_id=test_candidate.id,
            registered_at=datetime.utcnow(),
        )
        db.add(reg)
        db.commit()

        response = client.post(
            f"/api/v1/events/{active_event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 409
        assert "ALREADY_REGISTERED" in response.text

    def test_register_for_ended_event_fails(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Cannot register for ended event."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Ended Event",
            slug=f"ended-event-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(days=7),
            ends_at=datetime.utcnow() - timedelta(days=1),
            status=EventStatus.ENDED,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        response = client.post(
            f"/api/v1/events/{event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 400
        assert "REGISTRATION_CLOSED" in response.text

    def test_register_event_at_capacity_fails(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
    ):
        """Cannot register when event is at capacity."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Full Event",
            slug=f"full-event-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
            max_participants=1,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        # Fill the event
        other_user = User(
            firebase_uid=f"other-{uuid4().hex[:8]}",
            email=f"other-{uuid4().hex[:8]}@example.com",
            name="Other User",
        )
        db.add(other_user)
        db.commit()

        reg = EventRegistration(
            event_id=event.id,
            user_id=other_user.id,
        )
        db.add(reg)
        db.commit()

        response = client.post(
            f"/api/v1/events/{event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 400
        assert "EVENT_FULL" in response.text

    def test_unregister_from_event(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        active_event: Event,
        db: Session,
        test_candidate: User,
    ):
        """User can unregister from event."""
        # Create registration
        reg = EventRegistration(
            event_id=active_event.id,
            user_id=test_candidate.id,
        )
        db.add(reg)
        db.commit()

        response = client.delete(
            f"/api/v1/events/{active_event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 200


# =============================================================================
# Event Invite Tests
# =============================================================================


class TestEventInvites:
    """Tests for invite_only enforcement and invite management."""

    @pytest.fixture
    def invite_only_event(
        self,
        db: Session,
        test_org: Organization,
        test_user: User,
    ) -> Event:
        """Create an invite_only active event."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Invite Only Event",
            slug=f"invite-only-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=2),
            status=EventStatus.ACTIVE,
            visibility=EventVisibility.INVITE_ONLY,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    def test_invite_only_registration_requires_invite(
        self,
        client: TestClient,
        candidate_auth_headers: dict,
        invite_only_event: Event,
    ):
        """Invite-only events require an invite to register."""
        response = client.post(
            f"/api/v1/events/{invite_only_event.id}/register",
            headers=candidate_auth_headers,
        )

        assert response.status_code == 403
        assert "INVITE_REQUIRED" in response.text

    def test_invite_only_registration_accepts_invite_and_marks_accepted(
        self,
        client: TestClient,
        auth_headers: dict,
        candidate_auth_headers: dict,
        invite_only_event: Event,
        db: Session,
        test_candidate: User,
    ):
        """A valid invite enables registration and is marked accepted."""
        # Admin creates invite for candidate email
        resp_invite = client.post(
            f"/api/v1/events/{invite_only_event.id}/invites",
            headers=auth_headers,
            json={"email": test_candidate.email},
        )
        assert resp_invite.status_code == 201

        # Candidate registers
        resp_register = client.post(
            f"/api/v1/events/{invite_only_event.id}/register",
            headers=candidate_auth_headers,
        )
        assert resp_register.status_code == 200

        invite = (
            db.query(EventInvite)
            .filter(
                EventInvite.event_id == invite_only_event.id,
                EventInvite.email == test_candidate.email.lower(),
            )
            .first()
        )
        assert invite is not None
        assert invite.accepted_at is not None
        assert invite.user_id == test_candidate.id

    def test_revoke_invite_prevents_registration(
        self,
        client: TestClient,
        auth_headers: dict,
        candidate_auth_headers: dict,
        invite_only_event: Event,
        test_candidate: User,
    ):
        """Revoked invites do not allow registration."""
        # Create invite
        resp_invite = client.post(
            f"/api/v1/events/{invite_only_event.id}/invites",
            headers=auth_headers,
            json={"email": test_candidate.email},
        )
        assert resp_invite.status_code == 201
        invite_id = resp_invite.json()["data"]["id"]

        # Revoke invite
        resp_revoke = client.delete(
            f"/api/v1/events/{invite_only_event.id}/invites/{invite_id}",
            headers=auth_headers,
        )
        assert resp_revoke.status_code == 200

        # Candidate cannot register
        resp_register = client.post(
            f"/api/v1/events/{invite_only_event.id}/register",
            headers=candidate_auth_headers,
        )
        assert resp_register.status_code == 403
        assert "INVITE_REQUIRED" in resp_register.text

    def test_reinvite_after_revoke_allows_registration(
        self,
        client: TestClient,
        auth_headers: dict,
        candidate_auth_headers: dict,
        invite_only_event: Event,
        test_candidate: User,
    ):
        """Re-inviting after revoke re-enables registration."""
        # Create invite
        resp_invite = client.post(
            f"/api/v1/events/{invite_only_event.id}/invites",
            headers=auth_headers,
            json={"email": test_candidate.email},
        )
        assert resp_invite.status_code == 201
        invite_id = resp_invite.json()["data"]["id"]

        # Revoke invite
        resp_revoke = client.delete(
            f"/api/v1/events/{invite_only_event.id}/invites/{invite_id}",
            headers=auth_headers,
        )
        assert resp_revoke.status_code == 200

        # Re-invite same email (should not IntegrityError)
        resp_reinvite = client.post(
            f"/api/v1/events/{invite_only_event.id}/invites",
            headers=auth_headers,
            json={"email": test_candidate.email},
        )
        assert resp_reinvite.status_code == 201

        # Candidate can now register
        resp_register = client.post(
            f"/api/v1/events/{invite_only_event.id}/register",
            headers=candidate_auth_headers,
        )
        assert resp_register.status_code == 200


# =============================================================================
# Event Assessment Tests
# =============================================================================


class TestEventAssessments:
    """Tests for linking assessments to events."""

    @pytest.fixture
    def event_with_assessment(
        self,
        db: Session,
        test_org: Organization,
        test_user: User,
        test_owner: User,
    ) -> tuple[Event, Assessment]:
        """Create event and assessment for testing."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Event with Assessment",
            slug=f"event-assess-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() + timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.UPCOMING,
        )
        db.add(event)

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
        db.refresh(event)
        db.refresh(assessment)

        return event, assessment

    def test_add_assessment_to_event(
        self,
        client: TestClient,
        auth_headers: dict,
        event_with_assessment: tuple[Event, Assessment],
    ):
        """Admin can add assessment to event."""
        event, assessment = event_with_assessment

        response = client.post(
            f"/api/v1/events/{event.id}/assessments",
            headers=auth_headers,
            json={
                "assessment_id": str(assessment.id),
                "points_multiplier": 1.5,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["data"]["assessment_id"] == str(assessment.id)
        assert data["data"]["points_multiplier"] == 1.5

    def test_list_event_assessments(
        self,
        client: TestClient,
        auth_headers: dict,
        event_with_assessment: tuple[Event, Assessment],
        db: Session,
    ):
        """List assessments linked to an event."""
        event, assessment = event_with_assessment

        # Link assessment
        ea = EventAssessment(
            event_id=event.id,
            assessment_id=assessment.id,
            points_multiplier=2.0,
        )
        db.add(ea)
        db.commit()

        response = client.get(
            f"/api/v1/events/{event.id}/assessments",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["points_multiplier"] == 2.0

    def test_remove_assessment_from_event(
        self,
        client: TestClient,
        auth_headers: dict,
        event_with_assessment: tuple[Event, Assessment],
        db: Session,
    ):
        """Admin can remove assessment from event."""
        event, assessment = event_with_assessment

        # Link assessment
        ea = EventAssessment(
            event_id=event.id,
            assessment_id=assessment.id,
        )
        db.add(ea)
        db.commit()

        response = client.delete(
            f"/api/v1/events/{event.id}/assessments/{assessment.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200


# =============================================================================
# Event Leaderboard Tests
# =============================================================================


class TestEventLeaderboard:
    """Tests for event leaderboard with points_multiplier."""

    @pytest.fixture
    def event_with_submissions(
        self,
        db: Session,
        test_org: Organization,
        test_user: User,
        test_owner: User,
    ) -> Event:
        """Create event with assessments and submissions for leaderboard testing."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Leaderboard Test Event",
            slug=f"leaderboard-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(days=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        # Create two assessments with different multipliers
        assessments = []
        for i, multiplier in enumerate([1.0, 2.0]):
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
            db.refresh(assessment)

            ea = EventAssessment(
                event_id=event.id,
                assessment_id=assessment.id,
                points_multiplier=multiplier,
            )
            db.add(ea)
            assessments.append(assessment)

        db.commit()

        # Create users with submissions
        for user_idx in range(3):
            user = User(
                firebase_uid=f"lb-user-{user_idx}-{uuid4().hex[:8]}",
                email=f"lb-user-{user_idx}-{uuid4().hex[:8]}@example.com",
                name=f"Leaderboard User {user_idx}",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            # Register for event
            reg = EventRegistration(event_id=event.id, user_id=user.id)
            db.add(reg)

            # Submit to both assessments with different scores
            for assess_idx, assessment in enumerate(assessments):
                # User 0: 80, 90 -> 80*1 + 90*2 = 260
                # User 1: 90, 80 -> 90*1 + 80*2 = 250
                # User 2: 70, 100 -> 70*1 + 100*2 = 270
                base_scores = [
                    [80, 90],
                    [90, 80],
                    [70, 100],
                ]
                score = base_scores[user_idx][assess_idx]

                sub = Submission(
                    organization_id=test_org.id,
                    candidate_id=user.id,
                    assessment_id=assessment.id,
                    event_id=event.id,
                    github_repo_url=f"https://github.com/test/repo-{user_idx}-{assess_idx}",
                    status=SubmissionStatus.EVALUATED,
                    final_score=Decimal(str(score)),
                    evaluated_at=datetime.utcnow(),
                )
                db.add(sub)

        db.commit()
        db.refresh(event)
        return event

    def test_leaderboard_weighted_scores(
        self,
        client: TestClient,
        auth_headers: dict,
        event_with_submissions: Event,
    ):
        """Leaderboard uses points_multiplier for weighted scores."""
        response = client.get(
            f"/api/v1/events/{event_with_submissions.id}/leaderboard",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        entries = data["data"]["entries"]

        # Should have 3 users
        assert len(entries) == 3

        # Verify ranking order (User 2 > User 0 > User 1)
        # User 2: 70*1 + 100*2 = 270
        # User 0: 80*1 + 90*2 = 260
        # User 1: 90*1 + 80*2 = 250
        assert entries[0]["total_score"] == 270.0
        assert entries[1]["total_score"] == 260.0
        assert entries[2]["total_score"] == 250.0

        # Verify ranks
        assert entries[0]["rank"] == 1
        assert entries[1]["rank"] == 2
        assert entries[2]["rank"] == 3

    def test_leaderboard_pagination(
        self,
        client: TestClient,
        auth_headers: dict,
        event_with_submissions: Event,
    ):
        """Leaderboard supports pagination."""
        response = client.get(
            f"/api/v1/events/{event_with_submissions.id}/leaderboard?limit=2&offset=0",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]["entries"]) == 2

        # Get second page
        response2 = client.get(
            f"/api/v1/events/{event_with_submissions.id}/leaderboard?limit=2&offset=2",
            headers=auth_headers,
        )

        assert response2.status_code == 200
        data2 = response2.json()
        assert len(data2["data"]["entries"]) == 1
        assert data2["data"]["entries"][0]["rank"] == 3


# =============================================================================
# Event Submission Integration Tests
# =============================================================================


class TestEventSubmissionIntegration:
    """Tests for submission creation within event context."""

    @pytest.fixture
    def active_event_with_assessment(
        self,
        db: Session,
        test_org: Organization,
        test_user: User,
        test_owner: User,
        test_candidate: User,
    ) -> tuple[Event, Assessment]:
        """Create active event with assessment and registered user."""
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="Submission Test Event",
            slug=f"sub-event-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
            max_submissions_per_user=2,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        assessment = Assessment(
            organization_id=test_org.id,
            title="Event Assessment",
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
        db.refresh(assessment)

        # Link assessment to event
        ea = EventAssessment(
            event_id=event.id,
            assessment_id=assessment.id,
        )
        db.add(ea)

        # Register candidate
        reg = EventRegistration(
            event_id=event.id,
            user_id=test_candidate.id,
        )
        db.add(reg)
        db.commit()

        return event, assessment

    @patch("app.worker.queue.enqueue_scoring_job")
    @patch("app.api.v1.submissions.validate_github_url")
    def test_submission_with_event_context(
        self,
        mock_validate_github: MagicMock,
        mock_enqueue: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
        active_event_with_assessment: tuple[Event, Assessment],
    ):
        """Submission with event_id links to event."""
        from app.services.github import ValidationResult

        mock_validate_github.return_value = ValidationResult(is_valid=True)
        mock_enqueue.return_value = "job-123"

        event, assessment = active_event_with_assessment

        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(assessment.id),
                "event_id": str(event.id),
                "github_repo_url": "https://github.com/test/event-sub",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["data"]["event_id"] == str(event.id)

    @patch("app.api.v1.submissions.validate_github_url")
    def test_submission_to_unlinked_assessment_fails(
        self,
        mock_validate_github: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
        test_owner: User,
        test_candidate: User,
    ):
        """Cannot submit to assessment not linked to event."""
        from app.services.github import ValidationResult

        mock_validate_github.return_value = ValidationResult(is_valid=True)

        # Create event
        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="No Assessment Event",
            slug=f"no-assess-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
        )
        db.add(event)

        # Create unlinked assessment
        assessment = Assessment(
            organization_id=test_org.id,
            title="Unlinked Assessment",
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
        db.refresh(event)
        db.refresh(assessment)

        # Register user
        reg = EventRegistration(event_id=event.id, user_id=test_candidate.id)
        db.add(reg)
        db.commit()

        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(assessment.id),
                "event_id": str(event.id),
                "github_repo_url": "https://github.com/test/repo",
            },
        )

        assert response.status_code == 400
        assert "ASSESSMENT_NOT_IN_EVENT" in response.text

    @patch("app.api.v1.submissions.validate_github_url")
    def test_submission_without_registration_fails(
        self,
        mock_validate_github: MagicMock,
        client: TestClient,
        candidate_auth_headers: dict,
        db: Session,
        test_org: Organization,
        test_user: User,
        test_owner: User,
    ):
        """Cannot submit to event without registration."""
        from app.services.github import ValidationResult

        mock_validate_github.return_value = ValidationResult(is_valid=True)

        event = Event(
            organization_id=test_org.id,
            created_by=test_user.id,
            title="No Reg Event",
            slug=f"no-reg-{uuid4().hex[:8]}",
            starts_at=datetime.utcnow() - timedelta(hours=1),
            ends_at=datetime.utcnow() + timedelta(days=7),
            status=EventStatus.ACTIVE,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

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
        db.refresh(assessment)

        # Link assessment but don't register user
        ea = EventAssessment(event_id=event.id, assessment_id=assessment.id)
        db.add(ea)
        db.commit()

        response = client.post(
            "/api/v1/submissions",
            headers=candidate_auth_headers,
            json={
                "assessment_id": str(assessment.id),
                "event_id": str(event.id),
                "github_repo_url": "https://github.com/test/repo",
            },
        )

        assert response.status_code == 403
        assert "NOT_REGISTERED" in response.text
