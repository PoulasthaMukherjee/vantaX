import { Router } from 'express';
import { desc } from 'drizzle-orm';
import type { AssessmentDraft } from '../assessmentGenerator';
import { db } from '../db';
import { candidates, companies, companyAuditionDrafts, juryMembers } from '../schema';

const router = Router();

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

function hasAssessmentContext(row: typeof companyAuditionDrafts.$inferSelect) {
  return Boolean(row.problemContext || row.generatedDraftJson || row.editedDraftJson || row.submittedAt);
}

function toDraftResponse(row: typeof companyAuditionDrafts.$inferSelect) {
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

function isAuthorized(authHeader: string | undefined, adminKey: string) {
  if (!authHeader) {
    return false;
  }

  if (authHeader === adminKey) {
    return true;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === adminKey;
  }

  return false;
}

router.get('/registrations', async (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return res.status(503).json({ error: 'Admin API not configured' });
  }

  const authHeader = req.get('authorization') ?? req.get('x-admin-key') ?? undefined;
  if (!isAuthorized(authHeader, adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [candidateRows, companyRows, juryRows, draftRows] = await Promise.all([
      db.select().from(candidates).orderBy(desc(candidates.createdAt)),
      db.select().from(companies).orderBy(desc(companies.createdAt)),
      db.select().from(juryMembers).orderBy(desc(juryMembers.createdAt)),
      db.select().from(companyAuditionDrafts).orderBy(desc(companyAuditionDrafts.updatedAt)),
    ]);
    const assessmentDrafts = draftRows.filter(hasAssessmentContext).map(toDraftResponse);

    return res.json({
      counts: {
        candidates: candidateRows.length,
        companies: companyRows.length,
        assessmentDrafts: assessmentDrafts.length,
        juryMembers: juryRows.length,
      },
      candidates: candidateRows,
      companies: companyRows,
      assessmentDrafts,
      juryMembers: juryRows,
    });
  } catch (error) {
    console.error('Admin registrations fetch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
