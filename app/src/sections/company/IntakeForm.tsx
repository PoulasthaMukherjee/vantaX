import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import FormField from '../../components/form/FormField';
import FormSection from '../../components/form/FormSection';
import CheckboxGroup from '../../components/form/CheckboxGroup';
import SubmitButton from '../../components/form/SubmitButton';
import { submitCompany } from '../../lib/api';
import {
  INDUSTRY_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  ROLE_OPTIONS,
  SKILLS_OPTIONS,
  TIMELINE_OPTIONS,
} from '../../lib/constants';

export default function IntakeForm() {
  const [form, setForm] = useState<Record<string, string>>({
    companyName: '',
    websiteUrl: '',
    companySize: '',
    industry: '',
    numberRoles: '',
    problemDescription: '',
    techStack: '',
    strongSolutionCriteria: '',
    finalRoundAttendeeName: '',
    finalRoundAttendeeRole: '',
    preferredTimeline: '',
    contactName: '',
    contactEmail: '',
    contactLinkedin: '',
  });
  const [rolesHiringFor, setRolesHiringFor] = useState<string[]>([]);
  const [skillsLookingFor, setSkillsLookingFor] = useState<string[]>([]);
  const [supportOptions, setSupportOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const setSelect = (key: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (
      !form.companyName ||
      !form.websiteUrl ||
      !form.companySize ||
      !form.industry ||
      rolesHiringFor.length === 0 ||
      !form.numberRoles ||
      !form.problemDescription ||
      skillsLookingFor.length === 0 ||
      !form.techStack ||
      !form.strongSolutionCriteria ||
      !form.finalRoundAttendeeName ||
      !form.finalRoundAttendeeRole ||
      !form.preferredTimeline ||
      !form.contactName ||
      !form.contactEmail
    ) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await submitCompany({
        ...form,
        rolesHiringFor,
        skillsLookingFor,
        suggestChallenge: supportOptions.includes('I would like Vantax to suggest a challenge based on our role'),
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section id="intake" className="py-20 px-4 max-w-2xl mx-auto">
        <FadeInOnScroll>
          <div className="bg-card border border-border p-12 text-center">
            <CheckCircle2 size={48} className="text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">
              <span className="text-purple-500">{'// '}</span>Submission Received!
            </h2>
            <p className="text-text-muted text-[16px] mb-6">
              Thank you, {form.contactName}. We have received your hiring partner request from {form.companyName}.
              Check your email for confirmation. Our team will review the problem and follow up on next steps shortly.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/" className="text-[16px] text-gold-500 hover:text-gold-400 transition-colors">Back to home &rarr;</Link>
              <Link to="/what-is-vantax" className="text-[16px] text-text-muted hover:text-text-primary transition-colors">Learn more about VantaX &rarr;</Link>
            </div>
          </div>
        </FadeInOnScroll>
      </section>
    );
  }

  return (
    <section id="intake" className="py-20 px-4 max-w-2xl mx-auto">
      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 sm:p-10">
          <h2 className="text-xl font-bold mb-1">
            <span className="text-purple-500">{'$ '}</span>Run a Hiring Audition
          </h2>
          <p className="text-text-muted text-[16px] mb-8">
            Share one real problem. We will turn it into a 3-round hiring audition and bring you the strongest finalists.
          </p>

          <form onSubmit={handleSubmit} className="space-y-10">
            <FormSection title="Section 1: Company Details">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Company Name" required value={form.companyName} onChange={set('companyName')} placeholder="Your company name" />
                <FormField label="Company Website" required value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://..." />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[13px] font-medium mb-1.5">
                    Company Size <span className="text-gold-500 ml-1">*</span>
                  </label>
                  <select
                    value={form.companySize}
                    onChange={setSelect('companySize')}
                    className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5"
                  >
                    <option value="">Select company size</option>
                    {COMPANY_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium mb-1.5">
                    Industry <span className="text-gold-500 ml-1">*</span>
                  </label>
                  <select
                    value={form.industry}
                    onChange={setSelect('industry')}
                    className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5"
                  >
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <CheckboxGroup
                label="Role You Are Hiring For"
                options={ROLE_OPTIONS}
                selected={rolesHiringFor}
                onChange={setRolesHiringFor}
                required
              />

              <FormField
                label="Number of Roles"
                required
                type="number"
                min="1"
                value={form.numberRoles}
                onChange={set('numberRoles')}
                placeholder="e.g. 2"
              />
            </FormSection>

            <FormSection
              title="Section 2: The Company Problem"
              description="Candidates will solve one real problem from your company. VantaX will convert it into 3 audition rounds."
            >
              <FormField
                label="Describe the problem candidates should solve"
                required
                textarea
                value={form.problemDescription}
                onChange={set('problemDescription')}
                placeholder={'Example:\n“Design a scalable API rate limiting system handling 10k requests/sec.”'}
              />

              <CheckboxGroup
                label="Skills You Want to Evaluate"
                options={SKILLS_OPTIONS}
                selected={skillsLookingFor}
                onChange={setSkillsLookingFor}
                required
              />

              <FormField
                label="Tech Stack"
                required
                value={form.techStack}
                onChange={set('techStack')}
                placeholder="Python, Node, React, AWS, Kubernetes"
              />

              <FormField
                label="What Should a Strong Solution Demonstrate?"
                required
                textarea
                value={form.strongSolutionCriteria}
                onChange={set('strongSolutionCriteria')}
                placeholder={'Example:\nscalable architecture\nclean code\nreasoning and tradeoffs'}
              />
            </FormSection>

            <FormSection
              title="Section 3: Participation Details"
              description="Your team only needs to attend the final presentation round."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Who Will Attend the Final Round? Name"
                  required
                  value={form.finalRoundAttendeeName}
                  onChange={set('finalRoundAttendeeName')}
                  placeholder="Hiring manager or interviewer name"
                />
                <FormField
                  label="Who Will Attend the Final Round? Role"
                  required
                  value={form.finalRoundAttendeeRole}
                  onChange={set('finalRoundAttendeeRole')}
                  placeholder="e.g. CTO, Engineering Manager"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5">
                  Preferred Timeline <span className="text-gold-500 ml-1">*</span>
                </label>
                <select
                  value={form.preferredTimeline}
                  onChange={setSelect('preferredTimeline')}
                  className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5"
                >
                  <option value="">Select timeline</option>
                  {TIMELINE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Contact Person Name" required value={form.contactName} onChange={set('contactName')} placeholder="Primary point of contact" />
                <FormField label="Contact Person Email" required type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="you@company.com" />
              </div>

              <FormField
                label="LinkedIn (Optional)"
                value={form.contactLinkedin}
                onChange={set('contactLinkedin')}
                placeholder="https://linkedin.com/in/..."
              />

              <CheckboxGroup
                label="Optional Support"
                options={['I would like Vantax to suggest a challenge based on our role']}
                selected={supportOptions}
                onChange={setSupportOptions}
              />
            </FormSection>

            {error && (
              <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>
            )}

            <SubmitButton loading={loading}>Run a Hiring Audition</SubmitButton>
          </form>
        </div>
      </FadeInOnScroll>
    </section>
  );
}
