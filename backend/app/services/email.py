"""
Email service using Brevo (formerly Sendinblue).

Handles transactional emails for invites, notifications, etc.
"""

import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Brevo API endpoint
BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"

# HTTP client for sync operations
_sync_client: httpx.Client | None = None


def _get_sync_client() -> httpx.Client:
    """Get or create sync HTTP client."""
    global _sync_client
    if _sync_client is None:
        _sync_client = httpx.Client(timeout=10.0)
    return _sync_client


@dataclass
class EmailResult:
    """Result of an email send attempt."""

    success: bool
    message_id: str | None = None
    error: str | None = None


async def send_email(
    to_email: str,
    to_name: str | None,
    subject: str,
    html_content: str,
    text_content: str | None = None,
    reply_to: str | None = None,
) -> EmailResult:
    """
    Send a transactional email via Brevo API.

    Args:
        to_email: Recipient email address
        to_name: Recipient name (optional)
        subject: Email subject
        html_content: HTML body
        text_content: Plain text body (optional)
        reply_to: Reply-to address (optional)

    Returns:
        EmailResult with success status and message ID
    """
    # Skip if Brevo not configured
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping email send")
        return EmailResult(success=False, error="Brevo not configured")

    # Build payload
    payload: dict[str, Any] = {
        "sender": {
            "email": settings.brevo_sender_email,
            "name": settings.brevo_sender_name,
        },
        "to": [
            {
                "email": to_email,
                "name": to_name or to_email,
            }
        ],
        "subject": subject,
        "htmlContent": html_content,
    }

    if text_content:
        payload["textContent"] = text_content

    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    # Send request
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                BREVO_API_URL,
                json=payload,
                headers={
                    "api-key": settings.brevo_api_key,
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )

            if response.status_code == 201:
                data = response.json()
                logger.info(f"Email sent to {to_email}: {data.get('messageId')}")
                return EmailResult(
                    success=True,
                    message_id=data.get("messageId"),
                )
            else:
                error = response.text
                logger.error(f"Brevo API error: {response.status_code} - {error}")
                return EmailResult(
                    success=False, error=f"API error: {response.status_code}"
                )

    except httpx.TimeoutException:
        logger.error(f"Brevo API timeout for {to_email}")
        return EmailResult(success=False, error="API timeout")
    except Exception as e:
        logger.exception(f"Email send failed: {e}")
        return EmailResult(success=False, error=str(e))


# =============================================================================
# Email Templates
# =============================================================================


async def send_admin_invite_email(
    to_email: str,
    to_name: str | None,
    organization_name: str,
    role: str,
    inviter_name: str,
    invite_url: str,
) -> EmailResult:
    """
    Send admin/reviewer invite email.

    Args:
        to_email: Recipient email
        to_name: Recipient name
        organization_name: Name of the org
        role: Role being invited to (admin, reviewer)
        inviter_name: Name of person who sent the invite
        invite_url: URL to accept the invite
    """
    subject = f"You've been invited to join {organization_name} on Vibe"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }}
            .footer {{ margin-top: 40px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>You're Invited!</h1>
            <p>{inviter_name} has invited you to join <strong>{organization_name}</strong> as a <strong>{role}</strong> on Vibe.</p>
            <p>Vibe is an AI-powered developer assessment platform that helps teams evaluate technical talent.</p>
            <p style="margin: 30px 0;">
                <a href="{invite_url}" class="button">Accept Invitation</a>
            </p>
            <p>Or copy this link: <br><a href="{invite_url}">{invite_url}</a></p>
            <p class="footer">
                This invitation expires in 7 days.<br>
                If you didn't expect this invite, you can ignore this email.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
You're Invited!

{inviter_name} has invited you to join {organization_name} as a {role} on Vibe.

Accept the invitation here:
{invite_url}

This invitation expires in 7 days.
If you didn't expect this invite, you can ignore this email.
    """

    return await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


async def send_assessment_invite_email(
    to_email: str,
    to_name: str | None,
    organization_name: str,
    assessment_title: str,
    assessment_url: str,
) -> EmailResult:
    """
    Send assessment invitation email.

    Args:
        to_email: Recipient email
        to_name: Recipient name
        organization_name: Name of the org
        assessment_title: Title of the assessment
        assessment_url: URL to view/start the assessment
    """
    subject = f"You're invited to complete: {assessment_title}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }}
            .footer {{ margin-top: 40px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Assessment Invitation</h1>
            <p><strong>{organization_name}</strong> has invited you to complete a technical assessment.</p>
            <h2>{assessment_title}</h2>
            <p style="margin: 30px 0;">
                <a href="{assessment_url}" class="button">View Assessment</a>
            </p>
            <p>Or copy this link: <br><a href="{assessment_url}">{assessment_url}</a></p>
            <p class="footer">
                If you didn't expect this invite, you can ignore this email.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Assessment Invitation

{organization_name} has invited you to complete a technical assessment.

Assessment: {assessment_title}

View the assessment here:
{assessment_url}

If you didn't expect this invite, you can ignore this email.
    """

    return await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


async def send_score_ready_email(
    to_email: str,
    to_name: str | None,
    assessment_title: str,
    score: float,
    submission_url: str,
) -> EmailResult:
    """
    Send notification that submission has been scored.

    Args:
        to_email: Recipient email
        to_name: Recipient name
        assessment_title: Title of the assessment
        score: Final score (0-100)
        submission_url: URL to view submission details
    """
    subject = f"Your submission has been scored: {assessment_title}"

    # Determine score color/message
    if score >= 80:
        score_color = "#10b981"  # green
        score_message = "Excellent work!"
    elif score >= 60:
        score_color = "#f59e0b"  # yellow
        score_message = "Good effort!"
    else:
        score_color = "#6b7280"  # gray
        score_message = "Keep practicing!"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .score {{ font-size: 48px; font-weight: bold; color: {score_color}; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }}
            .footer {{ margin-top: 40px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Your Submission is Scored!</h1>
            <p>Your submission for <strong>{assessment_title}</strong> has been evaluated.</p>
            <p class="score">{score:.0f}/100</p>
            <p>{score_message}</p>
            <p style="margin: 30px 0;">
                <a href="{submission_url}" class="button">View Detailed Results</a>
            </p>
            <p>Or copy this link: <br><a href="{submission_url}">{submission_url}</a></p>
            <p class="footer">
                View the full breakdown of your scores and AI feedback.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Your Submission is Scored!

Your submission for {assessment_title} has been evaluated.

Score: {score:.0f}/100
{score_message}

View your detailed results:
{submission_url}
    """

    return await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


# =============================================================================
# Sync versions for worker tasks
# =============================================================================


def send_email_sync(
    to_email: str,
    to_name: str | None,
    subject: str,
    html_content: str,
    text_content: str | None = None,
) -> EmailResult:
    """
    Sync version of send_email for use in worker tasks.
    """
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping email send")
        return EmailResult(success=False, error="Brevo not configured")

    payload: dict[str, Any] = {
        "sender": {
            "email": settings.brevo_sender_email,
            "name": settings.brevo_sender_name,
        },
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }

    if text_content:
        payload["textContent"] = text_content

    try:
        client = _get_sync_client()
        response = client.post(
            BREVO_API_URL,
            json=payload,
            headers={
                "api-key": settings.brevo_api_key,
                "Content-Type": "application/json",
            },
        )

        if response.status_code == 201:
            data = response.json()
            logger.info(f"Email sent to {to_email}: {data.get('messageId')}")
            return EmailResult(success=True, message_id=data.get("messageId"))
        else:
            logger.error(f"Brevo API error: {response.status_code}")
            return EmailResult(
                success=False, error=f"API error: {response.status_code}"
            )

    except Exception as e:
        logger.exception(f"Email send failed: {e}")
        return EmailResult(success=False, error=str(e))


def send_score_failed_email_sync(
    to_email: str,
    to_name: str | None,
    assessment_title: str,
    submission_url: str,
    error_reason: str | None = None,
) -> EmailResult:
    """
    Sync version of score failed notification for use in worker tasks.

    Per SPRINT-PLAN.md: notify candidates when scoring fails.
    """
    subject = f"Scoring issue with your submission: {assessment_title}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .warning {{ color: #f59e0b; font-size: 18px; font-weight: bold; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }}
            .footer {{ margin-top: 40px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Scoring Issue</h1>
            <p>We encountered an issue while scoring your submission for <strong>{assessment_title}</strong>.</p>
            <p class="warning">Our team has been notified and is looking into it.</p>
            <p>You don't need to resubmit - we will automatically retry scoring your submission.</p>
            <p style="margin: 30px 0;">
                <a href="{submission_url}" class="button">View Submission</a>
            </p>
            <p>Or copy this link: <br><a href="{submission_url}">{submission_url}</a></p>
            <p class="footer">
                If this issue persists, please contact support.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Scoring Issue

We encountered an issue while scoring your submission for {assessment_title}.

Our team has been notified and is looking into it.
You don't need to resubmit - we will automatically retry scoring your submission.

View your submission:
{submission_url}

If this issue persists, please contact support.
    """

    return send_email_sync(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


def send_score_ready_email_sync(
    to_email: str,
    to_name: str | None,
    assessment_title: str,
    score: float,
    submission_url: str,
) -> EmailResult:
    """
    Sync version of send_score_ready_email for use in worker tasks.
    """
    subject = f"Your submission has been scored: {assessment_title}"

    if score >= 80:
        score_color = "#10b981"
        score_message = "Excellent work!"
    elif score >= 60:
        score_color = "#f59e0b"
        score_message = "Good effort!"
    else:
        score_color = "#6b7280"
        score_message = "Keep practicing!"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .score {{ font-size: 48px; font-weight: bold; color: {score_color}; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }}
            .footer {{ margin-top: 40px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Your Submission is Scored!</h1>
            <p>Your submission for <strong>{assessment_title}</strong> has been evaluated.</p>
            <p class="score">{score:.0f}/100</p>
            <p>{score_message}</p>
            <p style="margin: 30px 0;">
                <a href="{submission_url}" class="button">View Detailed Results</a>
            </p>
            <p>Or copy this link: <br><a href="{submission_url}">{submission_url}</a></p>
            <p class="footer">
                View the full breakdown of your scores and AI feedback.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Your Submission is Scored!

Your submission for {assessment_title} has been evaluated.

Score: {score:.0f}/100
{score_message}

View your detailed results:
{submission_url}
    """

    return send_email_sync(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )
