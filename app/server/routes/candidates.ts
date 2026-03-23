import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { candidates, candidateUsers } from '../schema';
import { uploadResume } from '../middleware/upload';
import { getEmailService } from '../emailService';
import { candidateConfirmationEmail, candidateNotificationEmail } from '../emailTemplates';
import { requireAuth } from '../middleware/auth';

const router = Router();
const LINKEDIN_URL_REGEX = /^https?:\/\/([\w-]+\.)?linkedin\.com\/.+$/i;
const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidName(value: string): boolean {
  return /^[A-Za-z][A-Za-z\s'-]{0,48}[A-Za-z]$/.test(value) || /^[A-Za-z]{1,50}$/.test(value);
}

function validateProfileFields(firstName: string, lastName: string, phone: string, linkedinUrl: string): string | null {
  if (!firstName || !lastName || !phone || !linkedinUrl) return 'Missing required fields';
  if (!isValidName(firstName) || !isValidName(lastName)) return 'Enter valid first and last names';
  if (!PHONE_REGEX.test(phone)) return 'Enter a valid phone number in international format';
  if (!LINKEDIN_URL_REGEX.test(linkedinUrl)) return 'Enter a valid LinkedIn URL';
  return null;
}

// POST /profile — Create profile on first submission (authenticated)
router.post('/profile', requireAuth, (req, res) => {
  uploadResume(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const firstName = sanitizeText(req.body.firstName);
    const lastName = sanitizeText(req.body.lastName);
    const phone = sanitizeText(req.body.phone);
    const linkedinUrl = sanitizeText(req.body.linkedinUrl);
    const { firebaseUid, email } = req.candidate!;
    const paymentEnabled = process.env.ENABLE_PAYMENT === 'true';

    const validationError = validateProfileFields(firstName, lastName, phone, linkedinUrl);
    if (validationError) return res.status(400).json({ error: validationError });

    if (!req.file) return res.status(400).json({ error: 'Resume PDF is required' });

    try {
      const resumePath = `/uploads/${req.file.filename}`;
      const fullName = `${firstName} ${lastName}`.trim();

      const [result] = await db.insert(candidates).values({
        fullName,
        email: email.toLowerCase(),
        phone,
        linkedinUrl,
        resumePath,
        accountStatus: paymentEnabled ? 'inactive' : 'active',
        paymentStatus: paymentEnabled ? 'pending' : 'completed',
      }).returning();

      // Link to candidate_users
      await db.update(candidateUsers)
        .set({ candidateId: result.id })
        .where(eq(candidateUsers.firebaseUid, firebaseUid));

      if (!paymentEnabled) {
        const emailService = await getEmailService();
        if (emailService) {
          const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
          emailService.sendEmail({ to: notificationTo, ...candidateNotificationEmail(result) }).catch(console.error);
          emailService.sendEmail({ to: result.email, ...candidateConfirmationEmail(result, { paid: false }) }).catch(console.error);
        }
      }

      res.status(201).json({ success: true, profile: result });
    } catch (e: any) {
      if (e?.code === '23505') {
        const [existing] = await db.select().from(candidates).where(eq(candidates.email, email.toLowerCase()));
        if (existing) {
          await db.update(candidateUsers)
            .set({ candidateId: existing.id })
            .where(eq(candidateUsers.firebaseUid, firebaseUid));
          return res.status(200).json({ success: true, profile: existing });
        }
      }
      console.error('POST /profile error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// PUT /profile — Update existing profile details (authenticated)
router.put('/profile', requireAuth, (req, res) => {
  uploadResume(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const firstName = sanitizeText(req.body.firstName);
    const lastName = sanitizeText(req.body.lastName);
    const phone = sanitizeText(req.body.phone);
    const linkedinUrl = sanitizeText(req.body.linkedinUrl);
    const { firebaseUid } = req.candidate!;

    const validationError = validateProfileFields(firstName, lastName, phone, linkedinUrl);
    if (validationError) return res.status(400).json({ error: validationError });

    try {
      const [cu] = await db.select().from(candidateUsers).where(eq(candidateUsers.firebaseUid, firebaseUid));
      if (!cu?.candidateId) {
        return res.status(404).json({ error: 'Profile not found. Submit the profile first.' });
      }

      const fullName = `${firstName} ${lastName}`.trim();
      const updates: Record<string, any> = { fullName, phone, linkedinUrl };
      if (req.file) updates.resumePath = `/uploads/${req.file.filename}`;

      const [updated] = await db.update(candidates)
        .set(updates)
        .where(eq(candidates.id, cu.candidateId))
        .returning();

      res.json({ success: true, profile: updated });
    } catch (e: any) {
      console.error('PUT /profile error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

export default router;
