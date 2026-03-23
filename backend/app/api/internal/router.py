from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
import traceback

from .deps import InternalAuth
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.models.event import Event, EventRegistration
from app.models.assessment import Assessment
from app.models.enums import AssessmentVisibility, EvaluationMode, AssessmentStatus, EventStatus, EventVisibility

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[InternalAuth],
)

def get_system_context(db: Session):
    sys_user = db.query(User).filter(User.email == "system@vantax.ai").first()
    if not sys_user:
        sys_user = User(email="system@vantax.ai", name="Vantax Engine", firebase_uid="system-vantax-internal")
        db.add(sys_user)
        db.commit()
        db.refresh(sys_user)
        
    org = db.query(Organization).filter(Organization.name == "vantax-engine").first()
    if not org:
        org = Organization(name="vantax-engine", creator_id=sys_user.id)
        db.add(org)
        db.commit()
        db.refresh(org)
        
    return org, sys_user

@router.get("/health")
def internal_health():
    """Health check for internal services"""
    return {"status": "ok", "service": "vibe-internal"}

class EventUpsert(BaseModel):
    external_id: str
    title: str
    slug: str
    description: str | None = None
    starts_at: datetime
    ends_at: datetime

@router.post("/events/upsert")
def upsert_event(payload: EventUpsert, db: Session = Depends(get_db)):
    org, sys_user = get_system_context(db)
    
    event = db.query(Event).filter(Event.external_id == payload.external_id).first()
    if not event:
        event = Event(
            organization_id=org.id,
            created_by=sys_user.id,
            external_id=payload.external_id,
            title=payload.title,
            slug=payload.slug,
            description=payload.description,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            status=EventStatus.ACTIVE,
            visibility=EventVisibility.PUBLIC
        )
        db.add(event)
    else:
        event.title = payload.title
        event.slug = payload.slug
        event.description = payload.description
        event.starts_at = payload.starts_at
        event.ends_at = payload.ends_at
    
    db.commit()
    db.refresh(event)
    return {"status": "ok", "event_id": str(event.id)}

class AssessmentUpsert(BaseModel):
    external_id: str
    event_external_id: str
    title: str
    problem_statement: str

@router.post("/assessments/upsert")
def upsert_assessment(payload: AssessmentUpsert, db: Session = Depends(get_db)):
    org, sys_user = get_system_context(db)
    
    assessment = db.query(Assessment).filter(Assessment.external_id == payload.external_id).first()
    if not assessment:
        assessment = Assessment(
            organization_id=org.id,
            created_by=sys_user.id,
            external_id=payload.external_id,
            title=payload.title,
            problem_statement=payload.problem_statement,
            build_requirements="Not specified",
            input_output_examples="Not specified",
            acceptance_criteria="Passes all test cases",
            constraints="None",
            submission_instructions="Push to your submission repository",
            visibility=AssessmentVisibility.ACTIVE,
            evaluation_mode=EvaluationMode.AI_ONLY,
            status=AssessmentStatus.PUBLISHED
        )
        db.add(assessment)
    else:
        assessment.title = payload.title
        assessment.problem_statement = payload.problem_statement
    
    db.commit()
    db.refresh(assessment)
    return {"status": "ok", "assessment_id": str(assessment.id)}

class ParticipantUpsert(BaseModel):
    external_id: str
    event_external_id: str
    email: str
    name: str

@router.post("/participants/upsert")
def upsert_participant(payload: ParticipantUpsert, db: Session = Depends(get_db)):
    org, sys_user = get_system_context(db)
    
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        user = User(email=payload.email, name=payload.name, firebase_uid=f"ext:{payload.external_id}")
        db.add(user)
        db.commit()
        db.refresh(user)
        
    event = db.query(Event).filter(Event.external_id == payload.event_external_id).first()
    if not event:
        return {"error": "Event not found", "detail": f"Event {payload.event_external_id} does not exist"}
        
    registration = db.query(EventRegistration).filter(
        EventRegistration.event_id == event.id,
        EventRegistration.user_id == user.id
    ).first()
    
    if not registration:
        registration = EventRegistration(
            event_id=event.id,
            user_id=user.id,
            external_id=payload.external_id
        )
        db.add(registration)
        db.commit()
        db.refresh(registration)
        
    return {"status": "ok", "participant_id": str(registration.id)}
