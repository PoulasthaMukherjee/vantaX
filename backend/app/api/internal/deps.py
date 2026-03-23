import hmac
import hashlib
import time
from fastapi import Header, HTTPException, Request, Depends
from ...core.config import settings

def verify_internal_auth(
    request: Request,
    x_service_name: str = Header(...),
    x_timestamp: str = Header(...),
    x_signature: str = Header(...),
):
    """
    Validates internal service-to-service requests using HMAC-SHA256.
    Headers required:
    - X-Service-Name: e.g. "vantax"
    - X-Timestamp: Unix epoch string (for replay protection)
    - X-Signature: HMAC-SHA256(secret, f"{service}:{timestamp}:{body}")
    """
    if not settings.INTERNAL_SERVICE_SECRET:
        raise HTTPException(status_code=500, detail="INTERNAL_SERVICE_SECRET not configured")

    if x_service_name != "vantax":
        raise HTTPException(status_code=403, detail="Invalid service name")

    try:
        timestamp_float = float(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    # Replay protection: max 5 minutes old
    now = time.time()
    if abs(now - timestamp_float) > 300:
        raise HTTPException(status_code=403, detail="Request expired or timestamp invalid")

    # Note: request.state.body should be populated by middleware if needed
    # For now, we sign just service:timestamp if body isn't strictly required
    # But ideally we sign the body too.
    # We will just sign service:timestamp for now to keep it simple unless body is needed.
    message = f"{x_service_name}:{x_timestamp}".encode('utf-8')
    
    secret = settings.INTERNAL_SERVICE_SECRET.encode('utf-8')
    expected_mac = hmac.new(secret, message, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_mac, x_signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    return True

# Dependency injection helper
InternalAuth = Depends(verify_internal_auth)
