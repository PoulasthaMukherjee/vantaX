"""
Security utilities including Firebase token verification.
"""

import logging
from typing import Optional

import firebase_admin
from firebase_admin import auth, credentials
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

# Firebase app initialization
_firebase_app: Optional[firebase_admin.App] = None


class DecodedToken(BaseModel):
    """Decoded Firebase token data."""

    uid: str
    email: Optional[str] = None
    email_verified: bool = False
    name: Optional[str] = None
    picture: Optional[str] = None


def init_firebase() -> None:
    """
    Initialize Firebase Admin SDK.
    Call once on application startup.
    """
    global _firebase_app

    if _firebase_app is not None:
        return

    try:
        if settings.firebase_service_account_path:
            # Use service account credentials
            cred = credentials.Certificate(settings.firebase_service_account_path)
            _firebase_app = firebase_admin.initialize_app(cred)
            logger.info("Firebase initialized with service account")
        else:
            # Use project ID only (for token verification)
            # This works for verifying tokens without full admin access
            _firebase_app = firebase_admin.initialize_app(
                options={"projectId": settings.firebase_project_id}
            )
            logger.info(
                f"Firebase initialized with project ID: {settings.firebase_project_id}"
            )
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        raise


def verify_firebase_token(token: str) -> DecodedToken:
    """
    Verify a Firebase ID token and return decoded data.

    Args:
        token: Firebase ID token from Authorization header

    Returns:
        DecodedToken with user info

    Raises:
        ValueError: If token is invalid or expired
    """
    # TEST MODE: Handle mock tokens for testing (mock-token-{firebase_uid})
    # Only enabled in test/development environments
    if token.startswith("mock-token-") and settings.environment in (
        "test",
        "development",
    ):
        firebase_uid = token.replace("mock-token-", "")
        logger.debug(f"Mock token accepted for testing: {firebase_uid}")
        return DecodedToken(
            uid=firebase_uid,
            email=f"{firebase_uid}@example.com",
            email_verified=True,
            name="Test User",
        )

    if _firebase_app is None:
        init_firebase()

    try:
        # Verify the token
        decoded = auth.verify_id_token(token, check_revoked=True)

        return DecodedToken(
            uid=decoded["uid"],
            email=decoded.get("email"),
            email_verified=decoded.get("email_verified", False),
            name=decoded.get("name"),
            picture=decoded.get("picture"),
        )

    except auth.ExpiredIdTokenError:
        logger.warning("Firebase token expired")
        raise ValueError("Token expired")

    except auth.RevokedIdTokenError:
        logger.warning("Firebase token revoked")
        raise ValueError("Token revoked")

    except auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid Firebase token: {e}")
        raise ValueError("Invalid token")

    except Exception as e:
        logger.error(f"Firebase token verification error: {e}")
        raise ValueError(f"Token verification failed: {e}")


def get_firebase_user(uid: str) -> Optional[dict]:
    """
    Get Firebase user record by UID.
    Requires service account credentials.

    Args:
        uid: Firebase user ID

    Returns:
        User record dict or None if not found
    """
    if _firebase_app is None:
        init_firebase()

    try:
        user = auth.get_user(uid)
        return {
            "uid": user.uid,
            "email": user.email,
            "email_verified": user.email_verified,
            "display_name": user.display_name,
            "photo_url": user.photo_url,
            "disabled": user.disabled,
        }
    except auth.UserNotFoundError:
        return None
    except Exception as e:
        logger.error(f"Error fetching Firebase user {uid}: {e}")
        return None
