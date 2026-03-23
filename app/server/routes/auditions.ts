import { Router } from 'express';
import { db } from '../db';
import { auditions, auditionRounds, auditionRegistrations, candidateUsers, candidates } from '../schema';
import { requireAuth } from '../middleware/auth';
import { syncAuditionToVibe, syncRoundToVibe, syncParticipantToVibe } from '../vibeSync';
import { eq, and } from 'drizzle-orm';

const router = Router();

// GET all published auditions (Public / Dashboard)
router.get('/', async (req, res) => {
  try {
    const list = await db.select().from(auditions).where(eq(auditions.status, 'published'));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch auditions' });
  }
});

// GET specific audition
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [audition] = await db.select().from(auditions).where(eq(auditions.slug, slug));
    if (!audition) return res.status(404).json({ error: 'Not found' });
    
    const rounds = await db.select().from(auditionRounds).where(eq(auditionRounds.auditionId, audition.id));
    res.json({ ...audition, rounds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audition' });
  }
});

// POST register for an audition (Protected)
router.post('/:slug/register', requireAuth, async (req, res) => {
  try {
    const slug = req.params.slug as string;
    const { firebaseUid } = req.candidate!;
    
    // Find candidate user
    const [user] = await db.select().from(candidateUsers).where(eq(candidateUsers.firebaseUid, firebaseUid));
    if (!user) return res.status(404).json({ error: 'User profile not found' });
    if (!user.candidateId) return res.status(403).json({ error: 'Complete your profile to continue' });

    const [profile] = await db.select().from(candidates).where(eq(candidates.id, user.candidateId));
    const isActive = profile?.accountStatus === 'active' && profile?.paymentStatus === 'completed';
    if (!isActive) {
      return res.status(403).json({ error: "Account isn't active yet. Complete profile and payment first." });
    }
    
    // Find audition
    const [audition] = await db.select().from(auditions).where(eq(auditions.slug, slug));
    if (!audition) return res.status(404).json({ error: 'Audition not found' });
    
    // Check if already registered
    const [existing] = await db.select().from(auditionRegistrations).where(
      and(
        eq(auditionRegistrations.auditionId, audition.id),
        eq(auditionRegistrations.candidateUserId, user.id)
      )
    );
    
    if (existing) return res.status(400).json({ error: 'Already registered' });
    
    // Sync participant to Vibe
    const syncRes = await syncParticipantToVibe(user, `audition_${audition.id}`);
    const vibeParticipantId = syncRes?.participant_id || null;
    
    // Create registration
    const [reg] = await db.insert(auditionRegistrations).values({
      auditionId: audition.id,
      candidateUserId: user.id,
      vibeParticipantId
    }).returning();
    
    res.json({ success: true, registration: reg });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// Admin ONLY route to publish & sync an audition
router.post('/:id/publish', async (req, res) => {
  try {
    const auditionId = parseInt(req.params.id);
    const [audition] = await db.select().from(auditions).where(eq(auditions.id, auditionId));
    if (!audition) return res.status(404).json({ error: 'Audition not found' });
    
    // Sync Event to Vibe
    const eventSync = await syncAuditionToVibe(audition);
    const vibeEventId = eventSync?.event_id;
    
    // Publish locally
    await db.update(auditions)
      .set({ status: 'published', vibeEventId, publishedAt: new Date() })
      .where(eq(auditions.id, auditionId));
      
    // Sync all rounds to Vibe Assessments
    const rounds = await db.select().from(auditionRounds).where(eq(auditionRounds.auditionId, audition.id));
    for (const round of rounds) {
      const roundSync = await syncRoundToVibe(round, `audition_${audition.id}`);
      if (roundSync?.assessment_id) {
        await db.update(auditionRounds)
          .set({ vibeAssessmentId: roundSync.assessment_id })
          .where(eq(auditionRounds.id, round.id));
      }
    }
    
    res.json({ success: true, vibeEventId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to publish' });
  }
});

export default router;
