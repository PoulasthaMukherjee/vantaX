import { escapeHtml } from './emailService';

const baseStyles = `
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0D0D1A; color: #fff; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
  .header { text-align: center; margin-bottom: 32px; }
  .header h1 { color: #A78BFA; font-size: 24px; margin: 0; }
  .header p { color: #71717A; font-size: 14px; margin-top: 4px; }
  .card { background: #141428; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .label { color: #71717A; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .value { color: #fff; font-size: 15px; margin-bottom: 12px; }
  .footer { text-align: center; color: #71717A; font-size: 13px; margin-top: 32px; }
  .accent { color: #FBBF24; }
  .primary { color: #A78BFA; }
`;

function wrap(title: string, subtitle: string, body: string): string {
  return `<!DOCTYPE html><html><head><style>${baseStyles}</style></head><body>
<div class="container">
  <div class="header"><h1>${title}</h1><p>${subtitle}</p></div>
  ${body}
  <div class="footer">VantaHire &middot; Human decisions, AI acceleration.<br/>Bangalore, India &middot; hello@vantahire.com</div>
</div></body></html>`;
}

function field(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<div class="label">${label}</div><div class="value">${escapeHtml(value)}</div>`;
}

export function companyNotificationEmail(data: Record<string, any>): { subject: string; html: string } {
  const roles = Array.isArray(data.rolesHiringFor) ? data.rolesHiringFor.join(', ') : data.rolesHiringFor;
  const skills = Array.isArray(data.skillsLookingFor) ? data.skillsLookingFor.join(', ') : data.skillsLookingFor;
  const body = `
    <div class="card">
      <h3 style="color:#A78BFA;margin-top:0;">Company Details</h3>
      ${field('Company', data.companyName)}
      ${field('Website', data.websiteUrl)}
      ${field('Company Size', data.companySize || data.companyStage)}
      ${field('Industry', data.industry)}
      ${field('Roles Hiring For', roles)}
      ${field('Number of Roles', data.numberRoles || data.approxOpenings)}
    </div>
    <div class="card">
      <h3 style="color:#FF5BA8;margin-top:0;">Company Problem</h3>
      ${field('Problem Description', data.problemDescription || data.businessContext)}
      ${field('Skills to Evaluate', skills)}
      ${field('Tech Stack', data.techStack || data.preferredStack)}
      ${field('Strong Solution Should Demonstrate', data.strongSolutionCriteria || data.customEvalCriteria)}
    </div>
    <div class="card">
      <h3 style="color:#FBBF24;margin-top:0;">Participation Details</h3>
      ${field('Final Round Attendee', data.finalRoundAttendeeName)}
      ${field('Final Round Attendee Role', data.finalRoundAttendeeRole)}
      ${field('Preferred Timeline', data.preferredTimeline)}
      ${field('Contact', data.contactName)}
      ${field('Email', data.contactEmail)}
      ${field('LinkedIn', data.contactLinkedin)}
      ${field('Suggest a challenge?', data.suggestChallenge ? 'Yes' : 'No')}
    </div>
  `;

  return {
    subject: `[VantaX] New Company Submission: ${data.companyName}`,
    html: wrap('VantaX Company Submission', 'New hiring audition partner request received', body),
  };
}

export function companyConfirmationEmail(data: Record<string, any>): { subject: string; html: string } {
  const body = `
    <div class="card">
      <p style="color:#A1A1AA;">Hi ${escapeHtml(data.contactName)},</p>
      <p style="color:#fff;">Thank you for applying to become a <span class="primary">VantaX hiring partner</span>.</p>
      <p style="color:#A1A1AA;">We've received your company problem from <strong>${escapeHtml(data.companyName)}</strong> and will review how to convert it into a hiring audition.</p>
      <p style="color:#A1A1AA;">Our team will follow up on scope, timeline, and final-round coordination shortly.</p>
      <p style="color:#A1A1AA;margin-top:16px;">If you have questions, reply to this email or reach out at hello@vantahire.com.</p>
    </div>`;

  return {
    subject: `VantaX 2026 — Hiring Partner Request Received`,
    html: wrap('Request Received', `VantaX 2026 — ${data.companyName}`, body),
  };
}

export function companyFlowVerificationEmail(data: {
  contactName: string;
  companyName: string;
  code: string;
}): { subject: string; html: string } {
  const body = `
    <div class="card">
      <p style="color:#A1A1AA;">Hi ${escapeHtml(data.contactName)},</p>
      <p style="color:#fff;">Use the verification code below to unlock your <span class="primary">VantaX hiring audition draft</span>.</p>
      <div style="margin:24px 0;padding:20px;border:1px dashed rgba(255,255,255,0.14);text-align:center;">
        <div class="label">Verification Code</div>
        <div style="font-size:32px;font-weight:700;letter-spacing:0.2em;color:#FBBF24;">${escapeHtml(data.code)}</div>
      </div>
      <p style="color:#A1A1AA;">This code expires in 15 minutes for <strong>${escapeHtml(data.companyName)}</strong>.</p>
    </div>`;

  return {
    subject: 'VantaX — Verify your work email',
    html: wrap('Verify Your Work Email', `VantaX hiring audition for ${data.companyName}`, body),
  };
}

export function companyFlowDraftSubmittedEmail(data: {
  contactName: string;
  companyName: string;
}): { subject: string; html: string } {
  const body = `
    <div class="card">
      <p style="color:#A1A1AA;">Hi ${escapeHtml(data.contactName)},</p>
      <p style="color:#fff;">Your hiring audition draft for <span class="primary">${escapeHtml(data.companyName)}</span> has been submitted for review.</p>
      <p style="color:#A1A1AA;">Our team will review the generated assessment, tighten scope where needed, and follow up on next steps.</p>
      <p style="color:#A1A1AA;margin-top:16px;">If you need to update anything, reply to this email or contact hello@vantahire.com.</p>
    </div>`;

  return {
    subject: 'VantaX — Draft submitted for review',
    html: wrap('Draft Submitted', `VantaX hiring audition for ${data.companyName}`, body),
  };
}

export function candidateConfirmationEmail(data: Record<string, any>, { paid = true }: { paid?: boolean } = {}): { subject: string; html: string } {
  const paymentLine = paid
    ? `We've received your payment of ₹199 + GST and your application is all set.`
    : `Your application is all set.`;
  const body = `
    <div class="card">
      <p style="color:#A1A1AA;">Hi ${escapeHtml(data.fullName)},</p>
      <p style="color:#fff;">Your registration for <span class="primary">VantaX 2026</span> is confirmed!</p>
      <p style="color:#A1A1AA;">${paymentLine}</p>
      <p style="color:#fff;margin-top:16px;font-weight:600;">What happens next?</p>
      <ul style="color:#A1A1AA;padding-left:20px;">
        <li>You'll receive challenge details before the assessment window opens</li>
        <li>All 3 problem statements will be available on the platform</li>
        <li>Top performers get direct hiring exposure with partner companies</li>
      </ul>
      <p style="color:#A1A1AA;margin-top:16px;">If you have questions, reply to this email or reach out at hello@vantahire.com.</p>
    </div>`;

  return {
    subject: 'VantaX 2026 — Registration Confirmed',
    html: wrap('Registration Confirmed', 'VantaX 2026 — You\'re In!', body),
  };
}

export function candidateNotificationEmail(data: Record<string, any>): { subject: string; html: string } {
  const body = `
    <div class="card">
      <h3 style="color:#A78BFA;margin-top:0;">Candidate Details</h3>
      ${field('Name', data.fullName)}
      ${field('Email', data.email)}
      ${field('Phone', data.phone)}
      ${field('LinkedIn', data.linkedinUrl)}
      ${field('College', data.college)}
      ${field('Graduation Year', data.graduationYear)}
      ${field('Degree / Branch', data.degreeBranch)}
      ${field('Referral Source', data.referralSource)}
      ${field('Payment Status', data.paymentStatus)}
      ${field('Payment ID', data.paymentId)}
    </div>`;

  return {
    subject: `[VantaX] New Candidate Registration: ${data.fullName}`,
    html: wrap('VantaX Candidate Registration', 'New candidate registered', body),
  };
}

export function juryNotificationEmail(data: Record<string, any>): { subject: string; html: string } {
  const body = `
    <div class="card">
      <h3 style="color:#A78BFA;margin-top:0;">Jury Member Details</h3>
      ${field('Name', data.fullName)}
      ${field('Email', data.email)}
      ${field('LinkedIn', data.linkedinUrl)}
      ${field('Current Role', data.currentRole)}
      ${field('Company', data.company)}
      ${field('Domain Expertise', data.domainExpertise)}
      ${field('Experience', data.yearsExperience)}
      ${field('Availability', data.availability)}
      ${field('Motivation', data.motivation)}
    </div>`;

  return {
    subject: `[VantaX] New Jury Application: ${data.fullName}`,
    html: wrap('VantaX Jury Application', 'New jury member signup', body),
  };
}

export function juryConfirmationEmail(data: Record<string, any>): { subject: string; html: string } {
  const body = `
    <div class="card">
      <p style="color:#A1A1AA;">Hi ${escapeHtml(data.fullName)},</p>
      <p style="color:#fff;">Thank you for expressing interest in serving as a <span class="primary">VantaX 2026 Jury Member</span>.</p>
      <p style="color:#A1A1AA;">We've received your application. Our team will coordinate next steps and provide evaluation guidelines before the assessment window.</p>
      <p style="color:#A1A1AA;margin-top:16px;">If you have questions, reply to this email or reach out at hello@vantahire.com.</p>
    </div>`;

  return {
    subject: 'VantaX 2026 — Jury Application Received',
    html: wrap('Application Received', 'VantaX 2026 Jury Panel', body),
  };
}
