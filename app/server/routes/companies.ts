import { Router } from 'express';
import { db } from '../db';
import { companies } from '../schema';
import { getEmailService } from '../emailService';
import { companyNotificationEmail, companyConfirmationEmail } from '../emailTemplates';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const problemDescription = data.problemDescription || data.businessContext || '';
    const problemTitle =
      data.problemTitle ||
      problemDescription
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) ||
      'Company hiring problem';

    if (!data.companyName || !data.websiteUrl || !data.contactName || !data.contactEmail || !problemDescription) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [result] = await db.insert(companies).values({
      companyName: data.companyName,
      websiteUrl: data.websiteUrl,
      industry: data.industry || null,
      companySize: data.companySize || null,
      companyStage: data.companySize || data.companyStage || null,
      rolesHiringFor: data.rolesHiringFor ? JSON.stringify(data.rolesHiringFor) : null,
      contactName: data.contactName,
      contactRole: data.finalRoundAttendeeRole || data.contactRole || null,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone || null,
      contactLinkedin: data.contactLinkedin || null,
      problemTitle,
      problemDescription,
      businessContext: problemDescription,
      coreTask: data.strongSolutionCriteria || problemDescription,
      expectedDeliverables: data.expectedDeliverables ? JSON.stringify(data.expectedDeliverables) : null,
      preferredStack: data.techStack || data.preferredStack || null,
      techStack: data.techStack || null,
      toolRestrictions: data.toolRestrictions || null,
      difficultyLevel: data.difficultyLevel || null,
      nominateJury: data.nominateJury || null,
      juryName: data.finalRoundAttendeeName || data.juryName || null,
      juryDesignation: data.finalRoundAttendeeRole || data.juryDesignation || null,
      customEvalCriteria: data.strongSolutionCriteria || data.customEvalCriteria || null,
      strongSolutionCriteria: data.strongSolutionCriteria || null,
      hiringIntent: data.hiringIntent || null,
      preferredTimeline: data.preferredTimeline || null,
      approxOpenings: data.numberRoles || data.approxOpenings || null,
      numberRoles: data.numberRoles || null,
      skillsLookingFor: data.skillsLookingFor ? JSON.stringify(data.skillsLookingFor) : null,
      finalRoundAttendeeName: data.finalRoundAttendeeName || null,
      finalRoundAttendeeRole: data.finalRoundAttendeeRole || null,
      suggestChallenge: Boolean(data.suggestChallenge),
      confirmations: data.confirmations ? JSON.stringify(data.confirmations) : null,
    }).returning();

    // Send emails
    const emailService = await getEmailService();
    if (emailService) {
      const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
      const notification = companyNotificationEmail(data);
      await emailService.sendEmail({ to: notificationTo, ...notification });

      const confirmation = companyConfirmationEmail(data);
      await emailService.sendEmail({ to: data.contactEmail, ...confirmation });
    }

    res.status(201).json({ success: true, id: result.id });
  } catch (e) {
    console.error('Company creation error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
