import crypto from 'crypto';

const VIBE_API_URL = process.env.VITE_API_URL || 'http://localhost:8000';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

/**
 * Core HMAC fetch wrapper
 */
async function syncToVibe(endpoint: string, payload: any) {
  if (!INTERNAL_SECRET) {
    console.warn("INTERNAL_SERVICE_SECRET is missing. Cannot sync to vibe.");
    return null;
  }
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = JSON.stringify(payload);
  const message = `vantax:${timestamp}:${bodyString}`;
  
  const signature = crypto.createHmac('sha256', INTERNAL_SECRET).update(message).digest('hex');
  
  try {
    const response = await fetch(`${VIBE_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'vantax',
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: bodyString
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Vibe sync failed for ${endpoint}: ${errorText}`);
      throw new Error(`Sync failed: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error(`Network error syncing to vibe (${endpoint}):`, err);
    throw err;
  }
}

/**
 * Sync an audition (Vantax) to an Event (Vibe)
 */
export async function syncAuditionToVibe(audition: any) {
  const payload = {
    external_id: `audition_${audition.id}`,
    title: audition.title,
    slug: audition.slug,
    description: "Vantax Audition",
    starts_at: audition.createdAt.toISOString(),
    ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // default 1 year
  };
  return syncToVibe('/api/internal/events/upsert', payload);
}

/**
 * Sync an audition round (Vantax) to an Assessment (Vibe)
 */
export async function syncRoundToVibe(round: any, eventExternalId: string) {
  const payload = {
    external_id: `round_${round.id}`,
    event_external_id: eventExternalId,
    title: round.title,
    problem_statement: round.description || "No description provided."
  };
  return syncToVibe('/api/internal/assessments/upsert', payload);
}

/**
 * Sync a candidate registration (Vantax) to a Participant (Vibe)
 */
export async function syncParticipantToVibe(user: any, eventExternalId: string) {
  const payload = {
    external_id: `user_${user.id}`,
    event_external_id: eventExternalId,
    email: user.email,
    name: user.fullName
  };
  return syncToVibe('/api/internal/participants/upsert', payload);
}
