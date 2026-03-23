import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { candidateUsers, candidates } from '../schema';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/auth/me — returns the authenticated candidate's identity.
// Creates a candidate_users row on first login (upsert-like behaviour).
router.get('/me', requireAuth, async (req, res) => {
  const { firebaseUid, email, name, emailVerified } = req.candidate!;

  try {
    // Look up by firebase_uid
    const existing = await db
      .select({
        user: candidateUsers,
        profile: candidates,
      })
      .from(candidateUsers)
      .leftJoin(candidates, eq(candidateUsers.candidateId, candidates.id))
      .where(eq(candidateUsers.firebaseUid, firebaseUid))
      .limit(1);

    if (existing.length > 0) {
      // Update email_verified and name if they changed
      const [updated] = await db
        .update(candidateUsers)
        .set({
          email,
          fullName: name,
          emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(candidateUsers.firebaseUid, firebaseUid))
        .returning();
      return res.json({ candidate: updated, profile: existing[0].profile });
    }

    // First login — create the identity record
    const [created] = await db
      .insert(candidateUsers)
      .values({ firebaseUid, email, fullName: name, emailVerified })
      .returning();

    return res.json({ candidate: created, profile: null });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
