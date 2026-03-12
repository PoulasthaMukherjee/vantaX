import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SEO from '../components/SEO';
import FadeInOnScroll from '../components/motion/FadeInOnScroll';
import FormField from '../components/form/FormField';
import Button from '../components/ui/Button';
import {
  getCompanyFlowDraft,
  regenerateCompanyFlowDraft,
  submitCompanyFlowDraft,
  updateCompanyFlowDraft,
  type AssessmentDraft,
  type CompanyFlowDraft,
} from '../lib/api';
import { TIMELINE_OPTIONS } from '../lib/constants';

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]) {
  return value.join('\n');
}

export default function CompanyDraftPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CompanyFlowDraft | null>(null);
  const [editedDraft, setEditedDraft] = useState<AssessmentDraft | null>(null);
  const [finalRoundAttendeeName, setFinalRoundAttendeeName] = useState('');
  const [finalRoundAttendeeRole, setFinalRoundAttendeeRole] = useState('');
  const [preferredTimeline, setPreferredTimeline] = useState('');
  const [contactLinkedin, setContactLinkedin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const result = await getCompanyFlowDraft(Number(id));
        setDraft(result);
        setEditedDraft(result.editedDraft);
        setFinalRoundAttendeeName(result.finalRoundAttendeeName || result.contactName);
        setFinalRoundAttendeeRole(result.finalRoundAttendeeRole || '');
        setPreferredTimeline(result.preferredTimeline || '');
        setContactLinkedin(result.contactLinkedin || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load draft');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateSection = (section: keyof AssessmentDraft, field: string, value: string) => {
    setEditedDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [section]: {
          ...(current[section] as Record<string, string>),
          [field]: value,
        },
      };
    });
  };

  const updateList = (section: 'evaluationCriteria' | 'deliverables' | 'constraints' | 'reviewNotes', value: string) => {
    setEditedDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [section]: linesToArray(value),
      };
    });
  };

  const saveDraft = async () => {
    if (!id || !editedDraft) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompanyFlowDraft(Number(id), {
        editedDraft,
        finalRoundAttendeeName,
        finalRoundAttendeeRole,
        preferredTimeline,
        contactLinkedin,
      });
      setDraft(updated);
      setEditedDraft(updated.editedDraft);
    } catch (err: any) {
      setError(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!id) return;
    setRegenerating(true);
    setError('');
    try {
      const updated = await regenerateCompanyFlowDraft(Number(id));
      setDraft(updated);
      setEditedDraft(updated.editedDraft);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate draft');
    } finally {
      setRegenerating(false);
    }
  };

  const submit = async () => {
    if (!id || !editedDraft) return;
    if (!finalRoundAttendeeName || !finalRoundAttendeeRole || !preferredTimeline) {
      setError('Please fill in the final round participation details before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await submitCompanyFlowDraft(Number(id), {
        editedDraft,
        finalRoundAttendeeName,
        finalRoundAttendeeRole,
        preferredTimeline,
        contactLinkedin,
      });
      navigate(`/companies/submitted/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit draft');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center text-[16px] text-text-muted">Loading draft...</div>
      </section>
    );
  }

  if (!draft || !editedDraft) {
    return (
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto bg-card border border-border p-8 text-center">
          <p className="text-[16px] text-pink">{error || 'Draft not found.'}</p>
          <Link to="/companies/start" className="inline-block mt-6 text-gold-500 hover:text-gold-400">
            Start a new draft &rarr;
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <SEO
        title={`Review Draft — ${draft.companyName} | VantaX 2026`}
        description="Review, edit, and submit your generated hiring audition draft."
        path={`/companies/draft/${draft.id}`}
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'For Companies', path: '/companies' },
          { name: 'Draft', path: `/companies/draft/${draft.id}` },
        ]}
      />

      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeInOnScroll>
            <div className="bg-card border border-border p-8 sm:p-10">
              <p className="text-[16px] font-bold uppercase tracking-wider text-purple-400 mb-4">
                <span className="text-text-muted">{'// '}</span>Draft Review
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
                Review and edit your generated hiring audition.
              </h1>
              <p className="text-[16px] text-text-secondary">
                {draft.companyName} • {draft.workEmail} • generation #{draft.generationCount}
              </p>
            </div>
          </FadeInOnScroll>

          <div className="grid gap-8 mt-8">
            <FadeInOnScroll>
              <div className="bg-card border border-border p-8 sm:p-10 space-y-6">
                <FormField
                  label="Problem Statement Title"
                  value={editedDraft.problemStatement.title}
                  onChange={(e) => updateSection('problemStatement', 'title', e.target.value)}
                />
                <FormField
                  label="Problem Statement Summary"
                  textarea
                  value={editedDraft.problemStatement.summary}
                  onChange={(e) => updateSection('problemStatement', 'summary', e.target.value)}
                />
                <FormField
                  label="Candidate Prompt"
                  textarea
                  value={editedDraft.problemStatement.candidatePrompt}
                  onChange={(e) => updateSection('problemStatement', 'candidatePrompt', e.target.value)}
                />
              </div>
            </FadeInOnScroll>

            {(['round1', 'round2', 'round3'] as const).map((sectionKey) => {
              const section = editedDraft[sectionKey];
              return (
                <FadeInOnScroll key={sectionKey}>
                  <div className="bg-card border border-border p-8 sm:p-10 space-y-6">
                    <h2 className="text-xl font-bold">{section.title}</h2>
                    <FormField label="Title" value={section.title} onChange={(e) => updateSection(sectionKey, 'title', e.target.value)} />
                    <FormField label="Objective" textarea value={section.objective} onChange={(e) => updateSection(sectionKey, 'objective', e.target.value)} />
                    <FormField label="Task" textarea value={section.task} onChange={(e) => updateSection(sectionKey, 'task', e.target.value)} />
                  </div>
                </FadeInOnScroll>
              );
            })}

            <FadeInOnScroll>
              <div className="bg-card border border-border p-8 sm:p-10 grid gap-6">
                <FormField
                  label="Evaluation Criteria"
                  textarea
                  value={arrayToLines(editedDraft.evaluationCriteria)}
                  onChange={(e) => updateList('evaluationCriteria', e.target.value)}
                />
                <FormField
                  label="Deliverables"
                  textarea
                  value={arrayToLines(editedDraft.deliverables)}
                  onChange={(e) => updateList('deliverables', e.target.value)}
                />
                <FormField
                  label="Constraints"
                  textarea
                  value={arrayToLines(editedDraft.constraints)}
                  onChange={(e) => updateList('constraints', e.target.value)}
                />
                <FormField
                  label="Internal Review Notes"
                  textarea
                  value={arrayToLines(editedDraft.reviewNotes)}
                  onChange={(e) => updateList('reviewNotes', e.target.value)}
                />
              </div>
            </FadeInOnScroll>

            <FadeInOnScroll>
              <div className="bg-card border border-border p-8 sm:p-10 grid gap-6">
                <h2 className="text-xl font-bold">Final Participation Details</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Final Round Attendee Name" required value={finalRoundAttendeeName} onChange={(e) => setFinalRoundAttendeeName(e.target.value)} />
                  <FormField label="Final Round Attendee Role" required value={finalRoundAttendeeRole} onChange={(e) => setFinalRoundAttendeeRole(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium mb-1.5">Preferred Timeline <span className="text-gold-500 ml-1">*</span></label>
                  <select value={preferredTimeline} onChange={(e) => setPreferredTimeline(e.target.value)} className="w-full bg-bg border border-border px-4 py-3 text-[13px] text-text-primary outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5">
                    <option value="">Select timeline</option>
                    {TIMELINE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <FormField label="LinkedIn (Optional)" value={contactLinkedin} onChange={(e) => setContactLinkedin(e.target.value)} />
              </div>
            </FadeInOnScroll>

            {error && <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>}

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={saving || regenerating || submitting}>
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void regenerate()} disabled={saving || regenerating || submitting}>
                {regenerating ? 'Regenerating...' : 'Regenerate Draft'}
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={saving || regenerating || submitting}>
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
