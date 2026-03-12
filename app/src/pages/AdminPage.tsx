import type { ReactNode } from 'react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import type { AssessmentDraft as AssessmentDocument, CompanyFlowDraft } from '../lib/api';
import {
  Activity,
  Building2,
  Clock3,
  Download,
  FileText,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import SectionHeader from '../components/ui/SectionHeader';

const STORAGE_KEY = 'vantax_admin_api_key';

type PanelKey = 'overview' | 'candidates' | 'companies' | 'assessments' | 'jury';

interface Candidate {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  resumePath: string;
  college: string | null;
  graduationYear: string | null;
  degreeBranch: string | null;
  referralSource: string | null;
  paymentStatus: string | null;
  paymentId: string | null;
  createdAt: string | null;
}

interface Company {
  id: number;
  companyName: string;
  websiteUrl: string;
  industry: string | null;
  companyStage: string | null;
  contactName: string;
  contactRole: string | null;
  contactEmail: string;
  contactPhone: string | null;
  problemTitle: string;
  businessContext: string;
  coreTask: string;
  expectedDeliverables: string | null;
  preferredStack: string | null;
  toolRestrictions: string | null;
  difficultyLevel: string | null;
  nominateJury: string | null;
  juryName: string | null;
  juryDesignation: string | null;
  customEvalCriteria: string | null;
  hiringIntent: string | null;
  approxOpenings: string | null;
  skillsLookingFor: string | null;
  confirmations: string | null;
  createdAt: string | null;
}

interface JuryMember {
  id: number;
  fullName: string;
  email: string;
  linkedinUrl: string;
  currentRole: string | null;
  company: string | null;
  domainExpertise: string | null;
  yearsExperience: string | null;
  availability: string | null;
  motivation: string | null;
  createdAt: string | null;
}

interface RegistrationResponse {
  counts: {
    candidates: number;
    companies: number;
    assessmentDrafts: number;
    juryMembers: number;
  };
  candidates: Candidate[];
  companies: Company[];
  assessmentDrafts: CompanyFlowDraft[];
  juryMembers: JuryMember[];
}

interface ActivityItem {
  id: string;
  type: 'Candidate' | 'Company' | 'Assessment' | 'Jury';
  name: string;
  detail: string;
  createdAt: string | null;
}

interface AssessmentExportRow {
  id: number;
  status: string;
  companyName: string;
  contactName: string;
  workEmail: string;
  websiteUrl: string;
  industry: string;
  companySize: string;
  rolesHiringFor: string;
  skillsToEvaluate: string;
  problemContext: string;
  problemTitle: string;
  problemSummary: string;
  candidatePrompt: string;
  round1Task: string;
  round2Task: string;
  round3Task: string;
  evaluationCriteria: string;
  deliverables: string;
  constraints: string;
  reviewNotes: string;
  submittedAt: string;
  updatedAt: string;
}

function getAssessmentRecordDraft(row: CompanyFlowDraft) {
  return row.editedDraft ?? row.generatedDraft;
}

function getAssessmentTitle(row: CompanyFlowDraft) {
  const draft = getAssessmentRecordDraft(row);
  return draft?.problemStatement.title || 'Draft in progress';
}

function formatArrayValue(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'Not provided';
}

function renderPlainBlock(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCompactDate(value: string | null) {
  if (!value) {
    return 'No activity yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No activity yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatStoredValue(value: string | null | undefined) {
  if (!value) {
    return 'Not provided';
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((item): item is string => Boolean(item));
      return cleaned.length > 0 ? cleaned.join(', ') : 'Not provided';
    }
  } catch {
    // Keep original string when the value is not JSON.
  }

  return value;
}

function includesQuery(query: string, values: Array<string | null | undefined>) {
  if (!query) {
    return true;
  }

  return values.some((value) => (value ?? '').toLowerCase().includes(query));
}

function countRecent(values: Array<{ createdAt: string | null }>, hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return values.filter((value) => {
    if (!value.createdAt) {
      return false;
    }

    const timestamp = new Date(value.createdAt).getTime();
    return !Number.isNaN(timestamp) && timestamp >= cutoff;
  }).length;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalized = value == null ? '' : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toCsv<Row extends object>(rows: Row[], columns: Array<{ key: keyof Row; label: string }>) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const rawValue = (row as Record<string, unknown>)[String(column.key)];
        const normalized =
          typeof rawValue === 'string' || typeof rawValue === 'number'
            ? rawValue
            : rawValue == null
              ? ''
              : JSON.stringify(rawValue);
        return escapeCsvCell(normalized);
      })
      .join(','),
  );

  return [header, ...body].join('\n');
}

function buildActivityFeed(data: RegistrationResponse | null, query: string) {
  if (!data) {
    return [] as ActivityItem[];
  }

  const items: ActivityItem[] = [];

  for (const row of data.candidates) {
    if (!includesQuery(query, [row.fullName, row.email, row.phone, row.college, row.referralSource])) {
      continue;
    }
    items.push({
      id: `candidate-${row.id}`,
      type: 'Candidate',
      name: row.fullName,
      detail: row.email,
      createdAt: row.createdAt,
    });
  }

  for (const row of data.companies) {
    if (!includesQuery(query, [row.companyName, row.contactName, row.contactEmail, row.problemTitle, row.industry])) {
      continue;
    }
    items.push({
      id: `company-${row.id}`,
      type: 'Company',
      name: row.companyName,
      detail: row.problemTitle,
      createdAt: row.createdAt,
    });
  }

  for (const row of data.assessmentDrafts) {
    const draft = getAssessmentRecordDraft(row);
    if (
      !includesQuery(query, [
        row.companyName,
        row.contactName,
        row.workEmail,
        row.problemContext,
        row.techStack,
        row.finalRoundAttendeeName,
        draft?.problemStatement.title,
      ])
    ) {
      continue;
    }
    items.push({
      id: `assessment-${row.id}`,
      type: 'Assessment',
      name: row.companyName,
      detail: getAssessmentTitle(row),
      createdAt: row.submittedAt ?? row.updatedAt ?? row.createdAt,
    });
  }

  for (const row of data.juryMembers) {
    if (!includesQuery(query, [row.fullName, row.email, row.company, row.currentRole, row.availability])) {
      continue;
    }
    items.push({
      id: `jury-${row.id}`,
      type: 'Jury',
      name: row.fullName,
      detail: row.email,
      createdAt: row.createdAt,
    });
  }

  return items.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'gold' | 'purple' | 'blue' | 'green';
  icon: ReactNode;
}) {
  const tones = {
    gold: 'border-gold-500/30 text-gold-400',
    purple: 'border-purple-500/30 text-purple-400',
    blue: 'border-blue/30 text-blue',
    green: 'border-success/30 text-success',
  };

  return (
    <div className={`bg-card border p-5 terminal-border-left ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[16px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
          <p className="mt-3 text-3xl font-bold text-text-primary">{value}</p>
          <p className="mt-2 text-[16px] text-text-secondary">{hint}</p>
        </div>
        <div className="w-10 h-10 border border-border bg-bg flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-border bg-bg px-5 py-6 text-[16px] text-text-muted">
      <span className="text-purple-500">{'// '}</span>{message}
    </div>
  );
}

export default function AdminPage() {
  const [inputKey, setInputKey] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  });
  const [activeKey, setActiveKey] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  });
  const [reloadIndex, setReloadIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<PanelKey>('overview');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<RegistrationResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (activeKey) {
      window.sessionStorage.setItem(STORAGE_KEY, activeKey);
      return;
    }

    window.sessionStorage.removeItem(STORAGE_KEY);
  }, [activeKey]);

  useEffect(() => {
    if (!activeKey) {
      setData(null);
      setError('');
      return;
    }

    let cancelled = false;

    async function loadRegistrations() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/admin/registrations', {
          headers: {
            'x-admin-key': activeKey,
          },
        });

        if (response.status === 401) {
          throw new Error('The admin key was rejected. Update the key and try again.');
        }

        if (!response.ok) {
          throw new Error('Unable to load registrations right now.');
        }

        const payload = (await response.json()) as RegistrationResponse;
        if (!cancelled) {
          setData(payload);
          setLastLoadedAt(new Date().toISOString());
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : 'Unable to load registrations right now.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRegistrations();

    return () => {
      cancelled = true;
    };
  }, [activeKey, reloadIndex]);

  const filteredCandidates = data
    ? data.candidates.filter((row) =>
        includesQuery(deferredQuery, [
          row.fullName,
          row.email,
          row.phone,
          row.college,
          row.degreeBranch,
          row.referralSource,
          row.paymentStatus,
        ]),
      )
    : [];

  const filteredCompanies = data
    ? data.companies.filter((row) =>
        includesQuery(deferredQuery, [
          row.companyName,
          row.contactName,
          row.contactEmail,
          row.problemTitle,
          row.industry,
          row.hiringIntent,
          row.preferredStack,
        ]),
      )
    : [];

  const filteredAssessments = data
    ? data.assessmentDrafts.filter((row) => {
        const draft = getAssessmentRecordDraft(row);
        return includesQuery(deferredQuery, [
          row.companyName,
          row.contactName,
          row.workEmail,
          row.problemContext,
          row.techStack,
          row.finalRoundAttendeeName,
          draft?.problemStatement.title,
          draft?.problemStatement.summary,
        ]);
      })
    : [];

  const filteredJury = data
    ? data.juryMembers.filter((row) =>
        includesQuery(deferredQuery, [
          row.fullName,
          row.email,
          row.company,
          row.currentRole,
          row.availability,
          row.yearsExperience,
        ]),
      )
    : [];

  const activityFeed = buildActivityFeed(data, deferredQuery);
  const latestItem = activityFeed[0] ?? null;
  const totalVisible = filteredCandidates.length + filteredCompanies.length + filteredAssessments.length + filteredJury.length;
  const totalOverall = data
    ? data.counts.candidates + data.counts.companies + data.counts.assessmentDrafts + data.counts.juryMembers
    : 0;
  const recentOverall = data
    ? countRecent(
        [
          ...data.candidates,
          ...data.companies,
          ...data.assessmentDrafts.map((row) => ({ createdAt: row.updatedAt ?? row.submittedAt ?? row.createdAt })),
          ...data.juryMembers,
        ],
        24,
      )
    : 0;

  function submitKey() {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError('Enter the admin API key from Railway first.');
      return;
    }

    setActiveKey(trimmed);
    setReloadIndex((value) => value + 1);
  }

  function clearKey() {
    setInputKey('');
    setActiveKey('');
    setData(null);
    setError('');
    setLastLoadedAt(null);
  }

  function refreshData() {
    if (!activeKey) {
      return;
    }

    setReloadIndex((value) => value + 1);
  }

  function downloadSnapshot() {
    if (!data) {
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const downloadFile = (filename: string, csv: string) => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      window.URL.revokeObjectURL(objectUrl);
    };

    const candidateColumns: Array<{ key: keyof Candidate; label: string }> = [
      { key: 'id', label: 'ID' },
      { key: 'fullName', label: 'Full Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'linkedinUrl', label: 'LinkedIn URL' },
      { key: 'resumePath', label: 'Resume Path' },
      { key: 'college', label: 'College' },
      { key: 'graduationYear', label: 'Graduation Year' },
      { key: 'degreeBranch', label: 'Degree Branch' },
      { key: 'referralSource', label: 'Referral Source' },
      { key: 'paymentStatus', label: 'Payment Status' },
      { key: 'paymentId', label: 'Payment ID' },
      { key: 'createdAt', label: 'Created At' },
    ];

    const companyColumns: Array<{ key: keyof Company; label: string }> = [
      { key: 'id', label: 'ID' },
      { key: 'companyName', label: 'Company Name' },
      { key: 'websiteUrl', label: 'Website URL' },
      { key: 'industry', label: 'Industry' },
      { key: 'companyStage', label: 'Company Stage' },
      { key: 'contactName', label: 'Contact Name' },
      { key: 'contactRole', label: 'Contact Role' },
      { key: 'contactEmail', label: 'Contact Email' },
      { key: 'contactPhone', label: 'Contact Phone' },
      { key: 'problemTitle', label: 'Problem Title' },
      { key: 'businessContext', label: 'Business Context' },
      { key: 'coreTask', label: 'Core Task' },
      { key: 'expectedDeliverables', label: 'Expected Deliverables' },
      { key: 'preferredStack', label: 'Preferred Stack' },
      { key: 'toolRestrictions', label: 'Tool Restrictions' },
      { key: 'difficultyLevel', label: 'Difficulty Level' },
      { key: 'nominateJury', label: 'Nominate Jury' },
      { key: 'juryName', label: 'Jury Name' },
      { key: 'juryDesignation', label: 'Jury Designation' },
      { key: 'customEvalCriteria', label: 'Custom Eval Criteria' },
      { key: 'hiringIntent', label: 'Hiring Intent' },
      { key: 'approxOpenings', label: 'Approx Openings' },
      { key: 'skillsLookingFor', label: 'Skills Looking For' },
      { key: 'confirmations', label: 'Confirmations' },
      { key: 'createdAt', label: 'Created At' },
    ];

    const juryColumns: Array<{ key: keyof JuryMember; label: string }> = [
      { key: 'id', label: 'ID' },
      { key: 'fullName', label: 'Full Name' },
      { key: 'email', label: 'Email' },
      { key: 'linkedinUrl', label: 'LinkedIn URL' },
      { key: 'currentRole', label: 'Current Role' },
      { key: 'company', label: 'Company' },
      { key: 'domainExpertise', label: 'Domain Expertise' },
      { key: 'yearsExperience', label: 'Years Experience' },
      { key: 'availability', label: 'Availability' },
      { key: 'motivation', label: 'Motivation' },
      { key: 'createdAt', label: 'Created At' },
    ];

    const assessmentColumns: Array<{ key: keyof AssessmentExportRow; label: string }> = [
      { key: 'id', label: 'ID' },
      { key: 'status', label: 'Status' },
      { key: 'companyName', label: 'Company Name' },
      { key: 'contactName', label: 'Contact Name' },
      { key: 'workEmail', label: 'Work Email' },
      { key: 'websiteUrl', label: 'Website URL' },
      { key: 'industry', label: 'Industry' },
      { key: 'companySize', label: 'Company Size' },
      { key: 'rolesHiringFor', label: 'Roles Hiring For' },
      { key: 'skillsToEvaluate', label: 'Skills To Evaluate' },
      { key: 'problemContext', label: 'Business Context' },
      { key: 'problemTitle', label: 'Problem Title' },
      { key: 'problemSummary', label: 'Problem Summary' },
      { key: 'candidatePrompt', label: 'Candidate Prompt' },
      { key: 'round1Task', label: 'Round 1 Task' },
      { key: 'round2Task', label: 'Round 2 Task' },
      { key: 'round3Task', label: 'Round 3 Task' },
      { key: 'evaluationCriteria', label: 'Evaluation Criteria' },
      { key: 'deliverables', label: 'Deliverables' },
      { key: 'constraints', label: 'Constraints' },
      { key: 'reviewNotes', label: 'Review Notes' },
      { key: 'submittedAt', label: 'Submitted At' },
      { key: 'updatedAt', label: 'Updated At' },
    ];

    if (activePanel === 'overview' || activePanel === 'candidates') {
      downloadFile(
        `vantax-candidates-${timestamp}.csv`,
        toCsv(
          filteredCandidates.map((row) => ({
            ...row,
            createdAt: formatDateTime(row.createdAt),
          })),
          candidateColumns,
        ),
      );
    }

    if (activePanel === 'overview' || activePanel === 'companies') {
      downloadFile(
        `vantax-companies-${timestamp}.csv`,
        toCsv(
          filteredCompanies.map((row) => ({
            ...row,
            expectedDeliverables: formatStoredValue(row.expectedDeliverables),
            skillsLookingFor: formatStoredValue(row.skillsLookingFor),
            confirmations: formatStoredValue(row.confirmations),
            createdAt: formatDateTime(row.createdAt),
          })),
          companyColumns,
        ),
      );
    }

    if (activePanel === 'overview' || activePanel === 'assessments') {
      const assessmentRows: AssessmentExportRow[] = filteredAssessments.map((row) => {
        const draft = getAssessmentRecordDraft(row);
        return {
          id: row.id,
          status: row.status,
          companyName: row.companyName,
          contactName: row.contactName,
          workEmail: row.workEmail,
          websiteUrl: row.websiteUrl || '',
          industry: row.industry || '',
          companySize: row.companySize || '',
          rolesHiringFor: formatArrayValue(row.rolesHiringFor),
          skillsToEvaluate: formatArrayValue(row.skillsToEvaluate),
          problemContext: row.problemContext || '',
          problemTitle: draft?.problemStatement.title || '',
          problemSummary: draft?.problemStatement.summary || '',
          candidatePrompt: draft?.problemStatement.candidatePrompt || '',
          round1Task: draft?.round1.task || '',
          round2Task: draft?.round2.task || '',
          round3Task: draft?.round3.task || '',
          evaluationCriteria: formatArrayValue(draft?.evaluationCriteria || []),
          deliverables: formatArrayValue(draft?.deliverables || []),
          constraints: formatArrayValue(draft?.constraints || []),
          reviewNotes: formatArrayValue(draft?.reviewNotes || []),
          submittedAt: formatDateTime(row.submittedAt),
          updatedAt: formatDateTime(row.updatedAt),
        };
      });

      downloadFile(`vantax-assessments-${timestamp}.csv`, toCsv(assessmentRows, assessmentColumns));
    }

    if (activePanel === 'overview' || activePanel === 'jury') {
      downloadFile(
        `vantax-jury-${timestamp}.csv`,
        toCsv(
          filteredJury.map((row) => ({
            ...row,
            domainExpertise: formatStoredValue(row.domainExpertise),
            createdAt: formatDateTime(row.createdAt),
          })),
          juryColumns,
        ),
      );
    }
  }

  return (
    <>
      <Helmet>
        <title>Admin Console | VantaX</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <section className="pt-12 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge pulse>Private Operations Console</Badge>
              <div className="mt-6">
                <SectionHeader
                  label="Admin"
                  title="Track registrations in one live command center."
                  lead="Review intake across candidates, companies, assessment drafts, and jury members, filter fast, export snapshots, and watch new submissions land without digging through logs."
                />
              </div>
            </div>
            <div className="w-full max-w-xl bg-card border border-border p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 border border-purple-500/30 bg-purple-500/5 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} className="text-purple-500" />
                </div>
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-[16px] font-bold uppercase tracking-wider"><span className="text-purple-500">{'// '}</span>Secure access</h3>
                    {activeKey ? (
                      <span className="text-[16px] font-bold uppercase tracking-widest text-success">Connected</span>
                    ) : (
                      <span className="text-[16px] font-bold uppercase tracking-widest text-text-muted">Key required</span>
                    )}
                  </div>
                  <p className="mt-2 text-[16px] text-text-muted">
                    Use the Railway <code className="text-purple-500">ADMIN_API_KEY</code>. Stored in session storage for this tab only.
                  </p>
                  <div className="mt-4 flex flex-col gap-3">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-[16px] font-bold uppercase tracking-wider">
                        <KeyRound size={14} className="text-gold-500" />
                        Admin API key
                      </span>
                      <input
                        type="password"
                        value={inputKey}
                        onChange={(event) => setInputKey(event.target.value)}
                        placeholder="Paste your Railway admin key"
                        className="w-full bg-bg border border-border px-4 py-3 text-[16px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={submitKey} disabled={loading}>
                        {activeKey ? 'Update & Refresh' : 'Unlock Console'}
                      </Button>
                      <Button variant="outline" onClick={refreshData} disabled={!activeKey || loading}>
                        <span className="inline-flex items-center gap-2">
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                          Refresh
                        </span>
                      </Button>
                      <Button variant="ghost" onClick={clearKey} disabled={!activeKey && !inputKey}>
                        <span className="inline-flex items-center gap-2">
                          <LogOut size={16} />
                          Clear
                        </span>
                      </Button>
                    </div>
                  </div>
                  {error && <p className="mt-3 text-[16px] text-pink">{error}</p>}
                </div>
              </div>
            </div>
          </div>

          {!activeKey && !data && (
            <div className="bg-card border border-border p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Ready when you are</p>
                  <h3 className="mt-2 text-xl font-bold"><span className="text-purple-500">{'$ '}</span>Unlock the intake dashboard to inspect every registration.</h3>
                  <p className="mt-3 max-w-2xl text-[16px] text-text-muted">
                    Once the key is loaded, this page fetches candidate, company, assessment draft, and jury records from the live API and keeps the dataset searchable.
                  </p>
                </div>
                <div className="min-w-[220px] border border-dashed border-purple-500/30 bg-purple-500/5 px-5 py-4">
                  <p className="text-[16px] font-bold uppercase tracking-widest text-purple-500">Endpoint</p>
                  <p className="mt-2 text-[16px] text-text-primary">GET /api/admin/registrations</p>
                </div>
              </div>
            </div>
          )}

          {(data || loading || activeKey) && (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Visible Records"
                  value={String(totalVisible)}
                  hint={deferredQuery ? `Filtered from ${totalOverall} total records` : 'Current working set across all forms'}
                  tone="gold"
                  icon={<Activity size={20} />}
                />
                <MetricCard
                  label="Candidates"
                  value={String(filteredCandidates.length)}
                  hint={`${data?.counts.candidates ?? 0} total, ${countRecent(data?.candidates ?? [], 24)} in the last 24h`}
                  tone="purple"
                  icon={<Users size={20} />}
                />
                <MetricCard
                  label="Companies"
                  value={String(filteredCompanies.length)}
                  hint={`${data?.counts.companies ?? 0} total, ${countRecent(data?.companies ?? [], 24)} in the last 24h`}
                  tone="blue"
                  icon={<Building2 size={20} />}
                />
                <MetricCard
                  label="Assessments"
                  value={String(filteredAssessments.length)}
                  hint={`${data?.counts.assessmentDrafts ?? 0} total, ${countRecent((data?.assessmentDrafts ?? []).map((row) => ({ createdAt: row.updatedAt ?? row.submittedAt ?? row.createdAt })), 24)} updated in the last 24h`}
                  tone="green"
                  icon={<FileText size={20} />}
                />
                <MetricCard
                  label="Jury"
                  value={String(filteredJury.length)}
                  hint={`${data?.counts.juryMembers ?? 0} total, ${countRecent(data?.juryMembers ?? [], 24)} in the last 24h`}
                  tone="purple"
                  icon={<ShieldCheck size={20} />}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                <div className="bg-card border border-border p-5 sm:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500"><span className="text-purple-500">{'// '}</span>Live Query Layer</p>
                      <h3 className="mt-2 text-xl font-bold">Search, scope, and export the registration snapshot.</h3>
                    </div>
                    <Button variant="outline" onClick={downloadSnapshot} disabled={!data}>
                      <span className="inline-flex items-center gap-2">
                        <Download size={16} />
                        Export CSV
                      </span>
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-[16px] font-bold uppercase tracking-wider">
                        <Search size={14} className="text-gold-500" />
                        Search across all registrations
                      </span>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Name, email, problem title, referral source, role..."
                        className="w-full bg-bg border border-border px-4 py-3 text-[16px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-purple-500 focus:bg-purple-500/5"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['overview', 'Overview'],
                        ['candidates', 'Candidates'],
                        ['companies', 'Companies'],
                        ['assessments', 'Assessments'],
                        ['jury', 'Jury'],
                      ] as Array<[PanelKey, string]>).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setActivePanel(value)}
                          className={`px-4 py-3 text-[16px] font-bold uppercase tracking-wider border transition-all ${
                            activePanel === value
                              ? 'border-gold-500/40 bg-gold-500/10 text-gold-500'
                              : 'border-border text-text-muted hover:border-border-hover hover:text-text-primary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-[16px] text-text-muted">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 size={14} className="text-purple-500" />
                      Last synced: {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Not loaded yet'}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Activity size={14} className="text-gold-500" />
                      {recentOverall} new registration{recentOverall === 1 ? '' : 's'} in the last 24h
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Download size={14} className="text-gold-500" />
                      {activePanel === 'overview' ? 'Overview exports 4 CSV files' : 'Exports the filtered active tab as CSV'}
                    </span>
                  </div>
                </div>

                <div className="bg-card border border-border p-5 sm:p-6">
                  <p className="text-[16px] font-bold uppercase tracking-widest text-purple-500">Recent Activity</p>
                  <h3 className="mt-2 text-lg font-bold"><span className="text-purple-500">{'// '}</span>Freshest submissions</h3>
                  <p className="mt-2 text-[16px] text-text-muted">
                    The most recent visible records based on your current search query.
                  </p>

                  <div className="mt-5 space-y-3">
                    {activityFeed.slice(0, 6).map((item) => (
                      <div key={item.id} className="border border-border bg-bg px-4 py-3 terminal-border-left">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">{item.type}</p>
                            <p className="mt-1 text-[16px] font-bold text-text-primary">{item.name}</p>
                            <p className="mt-1 text-[16px] text-text-muted">{item.detail}</p>
                          </div>
                          <span className="text-[16px] text-text-muted">{formatCompactDate(item.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                    {activityFeed.length === 0 && <EmptySection message="No matching registrations yet for the current query." />}
                  </div>
                  {latestItem && (
                    <div className="mt-5 border border-dashed border-purple-500/30 bg-purple-500/5 px-4 py-3 text-[16px] text-text-muted">
                      Latest visible submission: <span className="font-bold text-text-primary">{latestItem.name}</span> ({latestItem.type}) at{' '}
                      <span className="text-text-primary">{formatDateTime(latestItem.createdAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {(activePanel === 'overview' || activePanel === 'candidates') && (
                <div className="bg-card border border-border p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500"><span className="text-purple-500">{'// '}</span>Candidate Intake</p>
                      <h3 className="mt-2 text-xl font-bold">Applications from individual participants</h3>
                      <p className="mt-2 text-[16px] text-text-muted">
                        Resume submissions, payment state, education details, and referral sources.
                      </p>
                    </div>
                    <div className="border border-border bg-bg px-4 py-3 text-right">
                      <p className="text-[16px] font-bold uppercase tracking-widest text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold text-gold-500">{filteredCandidates.length}</p>
                      <p className="text-[16px] text-text-muted">of {data?.counts.candidates ?? 0} candidates</p>
                    </div>
                  </div>

                  {filteredCandidates.length === 0 ? (
                    <div className="mt-5">
                      <EmptySection message="No candidate records match the current filters." />
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-4 md:hidden">
                        {filteredCandidates.map((row) => (
                          <div key={row.id} className="border border-border bg-bg p-4 terminal-border-left">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[16px] font-bold text-text-primary">{row.fullName}</p>
                                <p className="text-[16px] text-text-muted">{row.email}</p>
                              </div>
                              <span className="text-[16px] text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-[16px] text-text-muted">
                              <p>Phone: {row.phone}</p>
                              <p>College: {row.college || 'Not provided'}</p>
                              <p>Payment: {row.paymentStatus || 'pending'}</p>
                              <p>Referral: {row.referralSource || 'Not provided'}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3 text-[16px]">
                              <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="text-gold-500 hover:text-gold-400 transition-colors">
                                LinkedIn
                              </a>
                              <a href={row.resumePath} target="_blank" rel="noreferrer" className="text-purple-500 hover:text-purple-400 transition-colors">
                                Resume
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto border border-border">
                        <table className="min-w-full text-[16px]">
                          <thead className="bg-purple-500/5 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Candidate</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Contact</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Profile</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Payment</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCandidates.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50 transition-colors">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-bold text-text-primary">{row.fullName}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">{row.college || 'No college provided'}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">
                                    {row.degreeBranch || 'Degree not set'}
                                    {row.graduationYear ? ` • ${row.graduationYear}` : ''}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.email}</p>
                                  <p className="mt-1">{row.phone}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">Referral: {row.referralSource || 'Not provided'}</p>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex flex-col gap-2">
                                    <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="text-gold-500 hover:text-gold-400 transition-colors">
                                      Open LinkedIn
                                    </a>
                                    <a href={row.resumePath} target="_blank" rel="noreferrer" className="text-purple-500 hover:text-purple-400 transition-colors">
                                      Open Resume
                                    </a>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p className="capitalize">{row.paymentStatus || 'pending'}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">{row.paymentId || 'No payment id yet'}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-muted">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {(activePanel === 'overview' || activePanel === 'companies') && (
                <div className="bg-card border border-border p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500"><span className="text-purple-500">{'// '}</span>Company Intake</p>
                      <h3 className="mt-2 text-xl font-bold">Problem statements and hiring demand</h3>
                      <p className="mt-2 text-[16px] text-text-muted">
                        Track who submitted, what problem they posted, and the hiring intent behind it.
                      </p>
                    </div>
                    <div className="border border-border bg-bg px-4 py-3 text-right">
                      <p className="text-[16px] font-bold uppercase tracking-widest text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold text-gold-500">{filteredCompanies.length}</p>
                      <p className="text-[16px] text-text-muted">of {data?.counts.companies ?? 0} companies</p>
                    </div>
                  </div>

                  {filteredCompanies.length === 0 ? (
                    <div className="mt-5">
                      <EmptySection message="No company records match the current filters." />
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-4 md:hidden">
                        {filteredCompanies.map((row) => (
                          <div key={row.id} className="border border-border bg-bg p-4 terminal-border-left">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[16px] font-bold text-text-primary">{row.companyName}</p>
                                <p className="text-[16px] text-text-muted">{row.problemTitle}</p>
                              </div>
                              <span className="text-[16px] text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-[16px] text-text-muted">
                              <p>Contact: {row.contactName} ({row.contactEmail})</p>
                              <p>Hiring intent: {row.hiringIntent || 'Not provided'}</p>
                              <p>Industry: {row.industry || 'Not provided'}</p>
                              <p>Preferred stack: {row.preferredStack || 'Not provided'}</p>
                            </div>
                            <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-[16px] text-gold-500 hover:text-gold-400 transition-colors">
                              Visit website
                            </a>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto border border-border">
                        <table className="min-w-full text-[16px]">
                          <thead className="bg-purple-500/5 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Company</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Contact</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Problem</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Hiring</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCompanies.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50 transition-colors">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-bold text-text-primary">{row.companyName}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">{row.industry || 'Industry not set'}</p>
                                  <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[16px] text-gold-500 hover:text-gold-400 transition-colors">
                                    {row.websiteUrl}
                                  </a>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.contactName}</p>
                                  <p className="mt-1 text-[16px]">{row.contactEmail}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">
                                    {[row.contactRole, row.contactPhone].filter(Boolean).join(' • ') || 'Role and phone not provided'}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <p className="font-bold text-text-primary">{row.problemTitle}</p>
                                  <p className="mt-1 text-[16px] text-text-muted line-clamp-2">{row.coreTask}</p>
                                  <p className="mt-2 text-[16px] text-text-muted">
                                    Deliverables: {formatStoredValue(row.expectedDeliverables)}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.hiringIntent || 'Not provided'}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">Openings: {row.approxOpenings || 'Not provided'}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">Skills: {formatStoredValue(row.skillsLookingFor)}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-muted">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activePanel === 'assessments' && (
                <div className="bg-card border border-border p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500"><span className="text-purple-500">{'// '}</span>Assessment Drafts</p>
                      <h3 className="mt-2 text-xl font-bold">Full assessment context from the company flow</h3>
                      <p className="mt-2 text-[16px] text-text-muted">
                        Review the business context, generated assessment, edited version, and submission metadata without losing round-level detail.
                      </p>
                    </div>
                    <div className="border border-border bg-bg px-4 py-3 text-right">
                      <p className="text-[16px] font-bold uppercase tracking-widest text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold text-gold-500">{filteredAssessments.length}</p>
                      <p className="text-[16px] text-text-muted">of {data?.counts.assessmentDrafts ?? 0} assessments</p>
                    </div>
                  </div>

                  {filteredAssessments.length === 0 ? (
                    <div className="mt-5">
                      <EmptySection message="No assessment drafts match the current filters." />
                    </div>
                  ) : (
                    <div className="mt-5 space-y-5">
                      {filteredAssessments.map((row) => {
                        const draft = getAssessmentRecordDraft(row);
                        const rounds: Array<[string, AssessmentDocument['round1'] | undefined]> = [
                          ['Round 1', draft?.round1],
                          ['Round 2', draft?.round2],
                          ['Round 3', draft?.round3],
                        ];

                        return (
                          <article key={row.id} className="border border-border bg-bg p-5 terminal-border-left">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">{row.status.replace(/_/g, ' ')}</p>
                                  {row.submittedAt && <p className="text-[16px] text-text-muted">Submitted {formatDateTime(row.submittedAt)}</p>}
                                </div>
                                <h4 className="mt-2 text-xl font-bold text-text-primary">{row.companyName}</h4>
                                <p className="mt-1 text-[16px] text-text-muted">
                                  {row.contactName} • {row.workEmail}
                                </p>
                                <p className="mt-2 text-[16px] text-text-secondary">{getAssessmentTitle(row)}</p>
                              </div>
                              <div className="min-w-[240px] border border-border px-4 py-3 text-[16px] text-text-muted">
                                <p>Website: {row.websiteUrl || 'Not provided'}</p>
                                <p className="mt-1">Industry: {row.industry || 'Not provided'}</p>
                                <p className="mt-1">Size: {row.companySize || 'Not provided'}</p>
                                <p className="mt-1">Roles: {formatArrayValue(row.rolesHiringFor)}</p>
                                <p className="mt-1">Skills: {formatArrayValue(row.skillsToEvaluate)}</p>
                              </div>
                            </div>

                            <div className="mt-5 grid gap-5 xl:grid-cols-2">
                              <div className="space-y-4">
                                <div>
                                  <p className="text-[16px] font-bold uppercase tracking-widest text-purple-500">Business Context</p>
                                  <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                    {renderPlainBlock(row.problemContext || 'Not provided')}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[16px] font-bold uppercase tracking-widest text-purple-500">Problem Statement</p>
                                  <p className="mt-2 text-[16px] font-bold text-text-primary">
                                    {draft?.problemStatement.title || 'Not generated yet'}
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                    {renderPlainBlock(draft?.problemStatement.summary || 'Not provided')}
                                  </p>
                                  <p className="mt-3 whitespace-pre-wrap text-[16px] text-text-muted">
                                    {renderPlainBlock(draft?.problemStatement.candidatePrompt || 'Not provided')}
                                  </p>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="border border-border p-4">
                                    <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Evaluation</p>
                                    <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                      {renderPlainBlock(formatArrayValue(draft?.evaluationCriteria || []))}
                                    </p>
                                  </div>
                                  <div className="border border-border p-4">
                                    <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Deliverables</p>
                                    <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                      {renderPlainBlock(formatArrayValue(draft?.deliverables || []))}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {rounds.map(([label, round]) => (
                                  <div key={label} className="border border-border p-4">
                                    <p className="text-[16px] font-bold uppercase tracking-widest text-purple-500">{label}</p>
                                    <p className="mt-2 text-[16px] font-bold text-text-primary">{round?.title || 'Not provided'}</p>
                                    <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                      {renderPlainBlock(round?.objective || 'No objective recorded')}
                                    </p>
                                    <p className="mt-3 whitespace-pre-wrap text-[16px] text-text-muted">
                                      {renderPlainBlock(round?.task || 'No task recorded')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="mt-5 grid gap-4 xl:grid-cols-3">
                              <div className="border border-border p-4">
                                <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Constraints</p>
                                <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                  {renderPlainBlock(formatArrayValue(draft?.constraints || []))}
                                </p>
                              </div>
                              <div className="border border-border p-4">
                                <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Review Notes</p>
                                <p className="mt-2 whitespace-pre-wrap text-[16px] text-text-secondary">
                                  {renderPlainBlock(formatArrayValue(draft?.reviewNotes || []))}
                                </p>
                              </div>
                              <div className="border border-border p-4">
                                <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500">Submission Metadata</p>
                                <p className="mt-2 text-[16px] text-text-secondary">
                                  Final round attendee: {row.finalRoundAttendeeName || 'Not provided'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-secondary">
                                  Role: {row.finalRoundAttendeeRole || 'Not provided'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-secondary">
                                  Timeline: {row.preferredTimeline || 'Not provided'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-secondary">
                                  Tech stack: {row.techStack || 'Not provided'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-secondary">
                                  Strong solution criteria: {row.strongSolutionCriteria || 'Not provided'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-secondary">
                                  Challenge suggested: {row.suggestChallenge ? 'Yes' : 'No'}
                                </p>
                                <p className="mt-1 text-[16px] text-text-muted">Last updated: {formatDateTime(row.updatedAt)}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {(activePanel === 'overview' || activePanel === 'jury') && (
                <div className="bg-card border border-border p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[16px] font-bold uppercase tracking-widest text-gold-500"><span className="text-purple-500">{'// '}</span>Jury Intake</p>
                      <h3 className="mt-2 text-xl font-bold">Reviewers, operators, and domain experts</h3>
                      <p className="mt-2 text-[16px] text-text-muted">
                        Track jury applicants, their experience, and their stated availability.
                      </p>
                    </div>
                    <div className="border border-border bg-bg px-4 py-3 text-right">
                      <p className="text-[16px] font-bold uppercase tracking-widest text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold text-gold-500">{filteredJury.length}</p>
                      <p className="text-[16px] text-text-muted">of {data?.counts.juryMembers ?? 0} jury members</p>
                    </div>
                  </div>

                  {filteredJury.length === 0 ? (
                    <div className="mt-5">
                      <EmptySection message="No jury records match the current filters." />
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-4 md:hidden">
                        {filteredJury.map((row) => (
                          <div key={row.id} className="border border-border bg-bg p-4 terminal-border-left">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[16px] font-bold text-text-primary">{row.fullName}</p>
                                <p className="text-[16px] text-text-muted">{row.email}</p>
                              </div>
                              <span className="text-[16px] text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-[16px] text-text-muted">
                              <p>Role: {row.currentRole || 'Not provided'}</p>
                              <p>Company: {row.company || 'Not provided'}</p>
                              <p>Availability: {row.availability || 'Not provided'}</p>
                              <p>Experience: {row.yearsExperience || 'Not provided'}</p>
                            </div>
                            <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-[16px] text-gold-500 hover:text-gold-400 transition-colors">
                              Open LinkedIn
                            </a>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto border border-border">
                        <table className="min-w-full text-[16px]">
                          <thead className="bg-purple-500/5 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Jury Member</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Current Context</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Expertise</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Availability</th>
                              <th className="px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-text-muted">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJury.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50 transition-colors">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-bold text-text-primary">{row.fullName}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">{row.email}</p>
                                  <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[16px] text-gold-500 hover:text-gold-400 transition-colors">
                                    Open LinkedIn
                                  </a>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.currentRole || 'Role not provided'}</p>
                                  <p className="mt-1 text-[16px]">{row.company || 'Company not provided'}</p>
                                  <p className="mt-1 text-[16px] text-text-muted">{row.yearsExperience || 'Experience not provided'}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p className="line-clamp-2">{formatStoredValue(row.domainExpertise)}</p>
                                  <p className="mt-2 text-[16px] text-text-muted line-clamp-2">
                                    Motivation: {row.motivation || 'Not provided'}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-muted">{row.availability || 'Not provided'}</td>
                                <td className="px-4 py-4 align-top text-text-muted">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
