import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import FormField from '../components/form/FormField';
import FormSection from '../components/form/FormSection';
import CheckboxGroup from '../components/form/CheckboxGroup';
import SubmitButton from '../components/form/SubmitButton';
import Button from '../components/ui/Button';
import FadeInOnScroll from '../components/motion/FadeInOnScroll';
import {
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  ROLE_OPTIONS,
  SKILLS_OPTIONS,
} from '../lib/constants';
import {
  generateCompanyFlowDraft,
  startCompanyFlow,
  verifyCompanyFlowEmail,
} from '../lib/api';

export default function CompanyStartPage() {
  const navigate = useNavigate();
  const [draftId, setDraftId] = useState<number | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [step, setStep] = useState<'identity' | 'verify' | 'context'>('identity');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [identity, setIdentity] = useState({
    contactName: '',
    companyName: '',
    workEmail: '',
  });
  const [context, setContext] = useState({
    websiteUrl: '',
    companySize: '',
    industry: '',
    numberRoles: '',
    techStack: '',
    problemContext: '',
    strongSolutionCriteria: '',
  });
  const [rolesHiringFor, setRolesHiringFor] = useState<string[]>([]);
  const [skillsToEvaluate, setSkillsToEvaluate] = useState<string[]>([]);
  const [supportOptions, setSupportOptions] = useState<string[]>([]);

  const setIdentityField = (key: keyof typeof identity) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setIdentity((current) => ({ ...current, [key]: e.target.value }));

  const setContextField = (key: keyof typeof context) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setContext((current) => ({ ...current, [key]: e.target.value }));

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const result = await startCompanyFlow(identity);
      setDraftId(result.draftId);
      setDebugCode(result.debugCode ?? null);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to start company flow');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftId) return;
    setError('');
    setVerifying(true);
    try {
      await verifyCompanyFlowEmail({ draftId, code: verificationCode });
      setStep('context');
    } catch (err: any) {
      setError(err.message || 'Failed to verify email');
    } finally {
      setVerifying(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftId) return;
    setError('');
    setGenerating(true);
    try {
      await generateCompanyFlowDraft(draftId, {
        ...context,
        rolesHiringFor,
        skillsToEvaluate,
        suggestChallenge: supportOptions.includes('I want VantaX to suggest the challenge based on our hiring role'),
      });
      navigate(`/companies/draft/${draftId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate draft');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <SEO
        title="Run a Hiring Audition | VantaX 2026"
        description="Verify your work email, share your hiring context, and generate a draft hiring audition tailored to your company."
        path="/companies/start"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'For Companies', path: '/companies' },
          { name: 'Start', path: '/companies/start' },
        ]}
      />

      <section className="min-h-[80vh] py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <FadeInOnScroll>
            <div className="bg-card border border-border p-8 sm:p-10">
              <p className="text-[16px] font-bold uppercase tracking-wider text-purple-400 mb-4">
                <span className="text-text-muted">{'// '}</span>Company Flow
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
                Generate a hiring audition from your company context.
              </h1>
              <p className="text-[16px] text-text-secondary max-w-2xl">
                Verify your work email first. Then tell us what role you are hiring for, and VantaX will draft the assessment for review.
              </p>
            </div>
          </FadeInOnScroll>

          {step === 'identity' && (
            <FadeInOnScroll>
              <form onSubmit={handleStart} className="mt-8 bg-card border border-border p-8 sm:p-10 space-y-8">
                <FormSection title="Step 1: Verify Your Work Email" description="Use a company email to unlock draft generation.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Your Name" required value={identity.contactName} onChange={setIdentityField('contactName')} placeholder="Full name" />
                    <FormField label="Company Name" required value={identity.companyName} onChange={setIdentityField('companyName')} placeholder="Company name" />
                  </div>
                  <FormField label="Work Email" required type="email" value={identity.workEmail} onChange={setIdentityField('workEmail')} placeholder="you@company.com" />
                </FormSection>

                {error && <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>}

                <SubmitButton loading={sending}>Continue with Work Email</SubmitButton>
              </form>
            </FadeInOnScroll>
          )}

          {step === 'verify' && (
            <FadeInOnScroll>
              <form onSubmit={handleVerify} className="mt-8 bg-card border border-border p-8 sm:p-10 space-y-8">
                <FormSection title="Step 2: Enter Verification Code" description={`We sent a code to ${identity.workEmail}.`}>
                  <FormField label="Verification Code" required value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="6-digit code" />
                  {debugCode && (
                    <p className="text-[14px] text-gold-500">
                      Development code: <span className="font-bold">{debugCode}</span>
                    </p>
                  )}
                </FormSection>

                {error && <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>}

                <div className="flex flex-wrap gap-3">
                  <SubmitButton loading={verifying}>Verify Email</SubmitButton>
                  <Button type="button" variant="outline" onClick={() => setStep('identity')}>
                    Edit Email
                  </Button>
                </div>
              </form>
            </FadeInOnScroll>
          )}

          {step === 'context' && (
            <FadeInOnScroll>
              <form onSubmit={handleGenerate} className="mt-8 bg-card border border-border p-8 sm:p-10 space-y-8">
                <FormSection title="Step 3: Company Context" description="Share enough context for VantaX to draft the hiring audition.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Company Website" required value={context.websiteUrl} onChange={setContextField('websiteUrl')} placeholder="https://..." />
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Company Size <span className="text-gold-500 ml-1">*</span></label>
                      <select value={context.companySize} onChange={setContextField('companySize')} className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5">
                        <option value="">Select company size</option>
                        {COMPANY_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium mb-1.5">Industry <span className="text-gold-500 ml-1">*</span></label>
                    <select value={context.industry} onChange={setContextField('industry')} className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5">
                      <option value="">Select industry</option>
                      {INDUSTRY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <CheckboxGroup label="Roles Hiring For" options={ROLE_OPTIONS} selected={rolesHiringFor} onChange={setRolesHiringFor} required />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Number of Roles" required type="number" min="1" value={context.numberRoles} onChange={setContextField('numberRoles')} placeholder="e.g. 2" />
                    <FormField label="Tech Stack" required value={context.techStack} onChange={setContextField('techStack')} placeholder="Python, React, AWS" />
                  </div>

                  <CheckboxGroup label="Skills to Evaluate" options={SKILLS_OPTIONS} selected={skillsToEvaluate} onChange={setSkillsToEvaluate} required />

                  <FormField
                    label="Business / Problem Context"
                    required
                    textarea
                    value={context.problemContext}
                    onChange={setContextField('problemContext')}
                    placeholder="Describe the role, the real problem area, and what a strong candidate should be able to handle."
                  />

                  <FormField
                    label="What should a strong solution demonstrate?"
                    textarea
                    value={context.strongSolutionCriteria}
                    onChange={setContextField('strongSolutionCriteria')}
                    placeholder="Examples: scalable architecture, clean code, sensible tradeoffs, strong communication."
                  />

                  <CheckboxGroup
                    label="Optional Support"
                    options={['I want VantaX to suggest the challenge based on our hiring role']}
                    selected={supportOptions}
                    onChange={setSupportOptions}
                  />
                </FormSection>

                {error && <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>}

                <SubmitButton loading={generating}>Generate Draft Hiring Audition</SubmitButton>
              </form>
            </FadeInOnScroll>
          )}
        </div>
      </section>
    </>
  );
}
