import { randomInt, createHash } from 'crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { generateAssessmentDraft, type AssessmentDraft } from '../assessmentGenerator';
import { db } from '../db';
import { getEmailService } from '../emailService';
import {
  companyAuditionDrafts,
  companies,
} from '../schema';
import {
  companyFlowDraftSubmittedEmail,
  companyFlowVerificationEmail,
  companyNotificationEmail,
} from '../emailTemplates';

const router = Router();

const blockedEmailDomains = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'live.com',
]);

function hashCode(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function makeCode() {
  return String(randomInt(100000, 1000000));
}

function isWorkEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return false;
  }
  return !blockedEmailDomains.has(parts[1]);
}

function parseJsonArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseDraftJson(value: string | null): AssessmentDraft | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AssessmentDraft;
  } catch {
    return null;
  }
}

function toResponse(row: typeof companyAuditionDrafts.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    contactName: row.contactName,
    companyName: row.companyName,
    workEmail: row.workEmail,
    emailVerifiedAt: row.emailVerifiedAt,
    websiteUrl: row.websiteUrl,
    companySize: row.companySize,
    industry: row.industry,
    rolesHiringFor: parseJsonArray(row.rolesHiringFor),
    numberRoles: row.numberRoles,
    techStack: row.techStack,
    skillsToEvaluate: parseJsonArray(row.skillsToEvaluate),
    problemContext: row.problemContext,
    strongSolutionCriteria: row.strongSolutionCriteria,
    suggestChallenge: row.suggestChallenge ?? false,
    generatedDraft: parseDraftJson(row.generatedDraftJson),
    editedDraft: parseDraftJson(row.editedDraftJson),
    generationCount: row.generationCount,
    lastGeneratedAt: row.lastGeneratedAt,
    finalRoundAttendeeName: row.finalRoundAttendeeName,
    finalRoundAttendeeRole: row.finalRoundAttendeeRole,
    preferredTimeline: row.preferredTimeline,
    contactLinkedin: row.contactLinkedin,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.post('/start', async (req, res) => {
  try {
    const { contactName, companyName, workEmail } = req.body ?? {};

    if (!contactName || !companyName || !workEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isWorkEmail(workEmail)) {
      return res.status(400).json({ error: 'Please use a valid work email.' });
    }

    const code = makeCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const [row] = await db.insert(companyAuditionDrafts).values({
      contactName,
      companyName,
      workEmail,
      verificationCodeHash: hashCode(code),
      verificationExpiresAt: expiresAt,
      status: 'lead_captured',
      updatedAt: new Date(),
    }).returning();

    const emailService = await getEmailService();
    let emailSent = false;
    if (emailService) {
      const email = companyFlowVerificationEmail({ contactName, companyName, code });
      emailSent = await emailService.sendEmail({ to: workEmail, ...email });
    }

    return res.status(201).json({
      draftId: row.id,
      emailSent,
      debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
      expiresAt,
    });
  } catch (error) {
    console.error('Company flow start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { draftId, code } = req.body ?? {};
    if (!draftId || !code) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(draftId)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (!row.verificationCodeHash || !row.verificationExpiresAt || row.verificationExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code expired. Start again.' });
    }

    if (row.verificationCodeHash !== hashCode(String(code))) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const [updated] = await db.update(companyAuditionDrafts)
      .set({
        status: 'email_verified',
        emailVerifiedAt: new Date(),
        verificationCodeHash: null,
        verificationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(companyAuditionDrafts.id, row.id))
      .returning();

    return res.json({ success: true, draft: toResponse(updated) });
  } catch (error) {
    console.error('Company flow verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    return res.json(toResponse(row));
  } catch (error) {
    console.error('Company flow fetch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/generate', async (req, res) => {
  try {
    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (!row.emailVerifiedAt) {
      return res.status(403).json({ error: 'Verify work email before generating a draft.' });
    }

    const {
      websiteUrl,
      companySize,
      industry,
      rolesHiringFor,
      numberRoles,
      techStack,
      skillsToEvaluate,
      problemContext,
      strongSolutionCriteria,
      suggestChallenge,
    } = req.body ?? {};

    if (!websiteUrl || !rolesHiringFor?.length || !skillsToEvaluate?.length || !problemContext) {
      return res.status(400).json({ error: 'Missing generation context.' });
    }

    const draft = await generateAssessmentDraft({
      companyName: row.companyName,
      companySize,
      industry,
      rolesHiringFor,
      numberRoles,
      techStack,
      skillsToEvaluate,
      problemContext,
      strongSolutionCriteria,
      suggestChallenge,
    });

    const [updated] = await db.update(companyAuditionDrafts)
      .set({
        status: 'draft_generated',
        websiteUrl,
        companySize: companySize || null,
        industry: industry || null,
        rolesHiringFor: JSON.stringify(rolesHiringFor),
        numberRoles: numberRoles || null,
        techStack: techStack || null,
        skillsToEvaluate: JSON.stringify(skillsToEvaluate),
        problemContext,
        strongSolutionCriteria: strongSolutionCriteria || null,
        suggestChallenge: Boolean(suggestChallenge),
        generatedDraftJson: JSON.stringify(draft),
        editedDraftJson: JSON.stringify(draft),
        generationCount: (row.generationCount ?? 0) + 1,
        lastGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyAuditionDrafts.id, row.id))
      .returning();

    return res.json(toResponse(updated));
  } catch (error) {
    console.error('Company flow generate error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/regenerate', async (req, res) => {
  try {
    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (!row.emailVerifiedAt) {
      return res.status(403).json({ error: 'Verify work email before regenerating.' });
    }

    if (!row.websiteUrl || !row.problemContext || !row.rolesHiringFor || !row.skillsToEvaluate) {
      return res.status(400).json({ error: 'Draft context is incomplete.' });
    }

    const draft = await generateAssessmentDraft({
      companyName: row.companyName,
      companySize: row.companySize,
      industry: row.industry,
      rolesHiringFor: parseJsonArray(row.rolesHiringFor),
      numberRoles: row.numberRoles,
      techStack: row.techStack,
      skillsToEvaluate: parseJsonArray(row.skillsToEvaluate),
      problemContext: row.problemContext,
      strongSolutionCriteria: row.strongSolutionCriteria,
      suggestChallenge: row.suggestChallenge ?? false,
    });

    const [updated] = await db.update(companyAuditionDrafts)
      .set({
        status: 'draft_generated',
        generatedDraftJson: JSON.stringify(draft),
        editedDraftJson: JSON.stringify(draft),
        generationCount: (row.generationCount ?? 0) + 1,
        lastGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyAuditionDrafts.id, row.id))
      .returning();

    return res.json(toResponse(updated));
  } catch (error) {
    console.error('Company flow regenerate error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const { editedDraft, finalRoundAttendeeName, finalRoundAttendeeRole, preferredTimeline, contactLinkedin } = req.body ?? {};

    const [updated] = await db.update(companyAuditionDrafts)
      .set({
        editedDraftJson: editedDraft ? JSON.stringify(editedDraft) : row.editedDraftJson,
        finalRoundAttendeeName: finalRoundAttendeeName || row.finalRoundAttendeeName,
        finalRoundAttendeeRole: finalRoundAttendeeRole || row.finalRoundAttendeeRole,
        preferredTimeline: preferredTimeline || row.preferredTimeline,
        contactLinkedin: contactLinkedin || row.contactLinkedin,
        status: editedDraft ? 'draft_edited' : row.status,
        updatedAt: new Date(),
      })
      .where(eq(companyAuditionDrafts.id, row.id))
      .returning();

    return res.json(toResponse(updated));
  } catch (error) {
    console.error('Company flow update error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/submit', async (req, res) => {
  try {
    const [row] = await db.select().from(companyAuditionDrafts).where(eq(companyAuditionDrafts.id, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const editedDraft = req.body?.editedDraft ? req.body.editedDraft as AssessmentDraft : parseDraftJson(row.editedDraftJson);
    const finalRoundAttendeeName = req.body?.finalRoundAttendeeName || row.finalRoundAttendeeName;
    const finalRoundAttendeeRole = req.body?.finalRoundAttendeeRole || row.finalRoundAttendeeRole;
    const preferredTimeline = req.body?.preferredTimeline || row.preferredTimeline;
    const contactLinkedin = req.body?.contactLinkedin || row.contactLinkedin;

    if (!editedDraft || !row.websiteUrl || !row.problemContext) {
      return res.status(400).json({ error: 'Draft is incomplete.' });
    }

    const payloadForCompanyTable = {
      companyName: row.companyName,
      websiteUrl: row.websiteUrl,
      industry: row.industry || null,
      companySize: row.companySize || null,
      companyStage: row.companySize || null,
      rolesHiringFor: row.rolesHiringFor,
      contactName: row.contactName,
      contactRole: finalRoundAttendeeRole || null,
      contactEmail: row.workEmail,
      contactPhone: null,
      contactLinkedin: contactLinkedin || null,
      problemTitle: editedDraft.problemStatement.title,
      problemDescription: editedDraft.problemStatement.summary,
      businessContext: row.problemContext,
      coreTask: editedDraft.round2.task,
      expectedDeliverables: JSON.stringify(editedDraft.deliverables),
      preferredStack: row.techStack || null,
      techStack: row.techStack || null,
      toolRestrictions: JSON.stringify(editedDraft.constraints),
      difficultyLevel: null,
      nominateJury: null,
      juryName: null,
      juryDesignation: null,
      customEvalCriteria: JSON.stringify(editedDraft.evaluationCriteria),
      strongSolutionCriteria: row.strongSolutionCriteria || null,
      hiringIntent: 'AI draft submitted for review',
      preferredTimeline: preferredTimeline || null,
      approxOpenings: row.numberRoles || null,
      numberRoles: row.numberRoles || null,
      skillsLookingFor: row.skillsToEvaluate,
      finalRoundAttendeeName: finalRoundAttendeeName || row.contactName,
      finalRoundAttendeeRole: finalRoundAttendeeRole || null,
      suggestChallenge: row.suggestChallenge ?? false,
      confirmations: JSON.stringify(editedDraft.reviewNotes),
    };

    const [companyRow] = await db.insert(companies).values(payloadForCompanyTable).returning();

    const [updatedDraft] = await db.update(companyAuditionDrafts)
      .set({
        editedDraftJson: JSON.stringify(editedDraft),
        finalRoundAttendeeName: finalRoundAttendeeName || null,
        finalRoundAttendeeRole: finalRoundAttendeeRole || null,
        preferredTimeline: preferredTimeline || null,
        contactLinkedin: contactLinkedin || null,
        status: 'submitted_for_review',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyAuditionDrafts.id, row.id))
      .returning();

    const emailService = await getEmailService();
    if (emailService) {
      const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
      const notification = companyNotificationEmail({
        ...payloadForCompanyTable,
        skillsLookingFor: parseJsonArray(row.skillsToEvaluate).join(', '),
        rolesHiringFor: parseJsonArray(row.rolesHiringFor).join(', '),
      });
      await emailService.sendEmail({ to: notificationTo, ...notification });

      const submitted = companyFlowDraftSubmittedEmail({
        contactName: row.contactName,
        companyName: row.companyName,
      });
      await emailService.sendEmail({ to: row.workEmail, ...submitted });
    }

    return res.status(201).json({
      success: true,
      companyId: companyRow.id,
      draft: toResponse(updatedDraft),
    });
  } catch (error) {
    console.error('Company flow submit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
