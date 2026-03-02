import type { ReactNode } from 'react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
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
import Card from '../components/ui/Card';
import SectionHeader from '../components/ui/SectionHeader';

const STORAGE_KEY = 'vantax_admin_api_key';

type PanelKey = 'overview' | 'candidates' | 'companies' | 'jury';

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
    juryMembers: number;
  };
  candidates: Candidate[];
  companies: Company[];
  juryMembers: JuryMember[];
}

interface ActivityItem {
  id: string;
  type: 'Candidate' | 'Company' | 'Jury';
  name: string;
  detail: string;
  createdAt: string | null;
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

function toCsv<Row extends Record<string, unknown>>(rows: Row[], columns: Array<{ key: keyof Row; label: string }>) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const rawValue = row[column.key];
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
    gold: 'from-gold-500/20 to-gold-500/5 border-gold-500/20 text-gold-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-400',
    blue: 'from-blue/20 to-blue/5 border-blue/20 text-blue',
    green: 'from-success/20 to-success/5 border-success/20 text-success',
  };

  return (
    <Card hover={false} className={`p-5 border bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">{label}</p>
          <p className="mt-3 text-3xl font-bold text-text-primary">{value}</p>
          <p className="mt-2 text-sm text-text-secondary">{hint}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-bg/70 px-5 py-6 text-sm text-text-secondary">
      {message}
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
  const totalVisible = filteredCandidates.length + filteredCompanies.length + filteredJury.length;
  const totalOverall = data ? data.counts.candidates + data.counts.companies + data.counts.juryMembers : 0;
  const recentOverall = data ? countRecent([...data.candidates, ...data.companies, ...data.juryMembers], 24) : 0;

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
                  lead="Review intake across candidates, companies, and jury members, filter fast, export snapshots, and watch new submissions land without digging through logs."
                />
              </div>
            </div>
            <Card hover={false} className="w-full max-w-xl p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck size={22} className="text-purple-400" />
                </div>
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">Secure access</h3>
                    {activeKey ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-success">Connected</span>
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Key required</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    Use the Railway `ADMIN_API_KEY`. It is stored in session storage for this browser tab only.
                  </p>
                  <div className="mt-4 flex flex-col gap-3">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                        <KeyRound size={14} className="text-gold-400" />
                        Admin API key
                      </span>
                      <input
                        type="password"
                        value={inputKey}
                        onChange={(event) => setInputKey(event.target.value)}
                        placeholder="Paste your Railway admin key"
                        className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
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
                  {error && <p className="mt-3 text-sm text-pink">{error}</p>}
                </div>
              </div>
            </Card>
          </div>

          {!activeKey && !data && (
            <Card hover={false} className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-400">Ready when you are</p>
                  <h3 className="mt-2 text-2xl font-bold">Unlock the intake dashboard to inspect every registration.</h3>
                  <p className="mt-3 max-w-2xl text-sm text-text-secondary">
                    Once the key is loaded, this page fetches all candidate, company, and jury records from the live API and keeps the dataset searchable.
                  </p>
                </div>
                <div className="min-w-[220px] rounded-2xl border border-border-subtle bg-purple-500/[0.06] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-purple-400">Endpoint</p>
                  <p className="mt-2 font-mono text-sm text-text-primary">GET /api/admin/registrations</p>
                </div>
              </div>
            </Card>
          )}

          {(data || loading || activeKey) && (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                  label="Jury"
                  value={String(filteredJury.length)}
                  hint={`${data?.counts.juryMembers ?? 0} total, ${countRecent(data?.juryMembers ?? [], 24)} in the last 24h`}
                  tone="green"
                  icon={<FileText size={20} />}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                <Card hover={false} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-400">Live Query Layer</p>
                      <h3 className="mt-2 text-2xl font-bold">Search, scope, and export the registration snapshot.</h3>
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
                      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                        <Search size={14} className="text-gold-400" />
                        Search across all registrations
                      </span>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Name, email, problem title, referral source, role..."
                        className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['overview', 'Overview'],
                        ['candidates', 'Candidates'],
                        ['companies', 'Companies'],
                        ['jury', 'Jury'],
                      ] as Array<[PanelKey, string]>).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setActivePanel(value)}
                          className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                            activePanel === value
                              ? 'border-gold-500/40 bg-gold-500/10 text-gold-400'
                              : 'border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 size={14} className="text-purple-400" />
                      Last synced: {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Not loaded yet'}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Activity size={14} className="text-gold-400" />
                      {recentOverall} new registration{recentOverall === 1 ? '' : 's'} in the last 24h
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Download size={14} className="text-gold-400" />
                      {activePanel === 'overview' ? 'Overview exports 3 CSV files' : 'Exports the filtered active tab as CSV'}
                    </span>
                  </div>
                </Card>

                <Card hover={false} className="p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-purple-400">Recent Activity</p>
                  <h3 className="mt-2 text-xl font-bold">Freshest submissions</h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    The most recent visible records based on your current search query.
                  </p>

                  <div className="mt-5 space-y-3">
                    {activityFeed.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-bg/70 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-400">{item.type}</p>
                            <p className="mt-1 font-semibold text-text-primary">{item.name}</p>
                            <p className="mt-1 text-sm text-text-secondary">{item.detail}</p>
                          </div>
                          <span className="text-xs text-text-muted">{formatCompactDate(item.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                    {activityFeed.length === 0 && <EmptySection message="No matching registrations yet for the current query." />}
                  </div>
                  {latestItem && (
                    <div className="mt-5 rounded-2xl border border-border-subtle bg-purple-500/[0.06] px-4 py-3 text-sm text-text-secondary">
                      Latest visible submission: <span className="font-semibold text-text-primary">{latestItem.name}</span> ({latestItem.type}) at{' '}
                      <span className="text-text-primary">{formatDateTime(latestItem.createdAt)}</span>
                    </div>
                  )}
                </Card>
              </div>

              {(activePanel === 'overview' || activePanel === 'candidates') && (
                <Card hover={false} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-400">Candidate Intake</p>
                      <h3 className="mt-2 text-2xl font-bold">Applications from individual participants</h3>
                      <p className="mt-2 text-sm text-text-secondary">
                        Resume submissions, payment state, education details, and referral sources.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border-subtle bg-bg/70 px-4 py-3 text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold">{filteredCandidates.length}</p>
                      <p className="text-xs text-text-secondary">of {data?.counts.candidates ?? 0} candidates</p>
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
                          <div key={row.id} className="rounded-2xl border border-border bg-bg/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-text-primary">{row.fullName}</p>
                                <p className="text-sm text-text-secondary">{row.email}</p>
                              </div>
                              <span className="text-xs text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-text-secondary">
                              <p>Phone: {row.phone}</p>
                              <p>College: {row.college || 'Not provided'}</p>
                              <p>Payment: {row.paymentStatus || 'pending'}</p>
                              <p>Referral: {row.referralSource || 'Not provided'}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="text-gold-400 hover:text-gold-500 transition-colors">
                                LinkedIn
                              </a>
                              <a href={row.resumePath} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-text-primary transition-colors">
                                Resume
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto rounded-2xl border border-border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-bg/80 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 font-semibold">Candidate</th>
                              <th className="px-4 py-3 font-semibold">Contact</th>
                              <th className="px-4 py-3 font-semibold">Profile</th>
                              <th className="px-4 py-3 font-semibold">Payment</th>
                              <th className="px-4 py-3 font-semibold">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCandidates.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-semibold text-text-primary">{row.fullName}</p>
                                  <p className="mt-1 text-xs text-text-secondary">{row.college || 'No college provided'}</p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {row.degreeBranch || 'Degree not set'}
                                    {row.graduationYear ? ` • ${row.graduationYear}` : ''}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.email}</p>
                                  <p className="mt-1">{row.phone}</p>
                                  <p className="mt-1 text-xs text-text-muted">Referral: {row.referralSource || 'Not provided'}</p>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex flex-col gap-2">
                                    <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="text-gold-400 hover:text-gold-500 transition-colors">
                                      Open LinkedIn
                                    </a>
                                    <a href={row.resumePath} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-text-primary transition-colors">
                                      Open Resume
                                    </a>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p className="capitalize">{row.paymentStatus || 'pending'}</p>
                                  <p className="mt-1 text-xs text-text-muted">{row.paymentId || 'No payment id yet'}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>
              )}

              {(activePanel === 'overview' || activePanel === 'companies') && (
                <Card hover={false} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-400">Company Intake</p>
                      <h3 className="mt-2 text-2xl font-bold">Problem statements and hiring demand</h3>
                      <p className="mt-2 text-sm text-text-secondary">
                        Track who submitted, what problem they posted, and the hiring intent behind it.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border-subtle bg-bg/70 px-4 py-3 text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold">{filteredCompanies.length}</p>
                      <p className="text-xs text-text-secondary">of {data?.counts.companies ?? 0} companies</p>
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
                          <div key={row.id} className="rounded-2xl border border-border bg-bg/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-text-primary">{row.companyName}</p>
                                <p className="text-sm text-text-secondary">{row.problemTitle}</p>
                              </div>
                              <span className="text-xs text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-text-secondary">
                              <p>Contact: {row.contactName} ({row.contactEmail})</p>
                              <p>Hiring intent: {row.hiringIntent || 'Not provided'}</p>
                              <p>Industry: {row.industry || 'Not provided'}</p>
                              <p>Preferred stack: {row.preferredStack || 'Not provided'}</p>
                            </div>
                            <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-gold-400 hover:text-gold-500 transition-colors">
                              Visit website
                            </a>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto rounded-2xl border border-border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-bg/80 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 font-semibold">Company</th>
                              <th className="px-4 py-3 font-semibold">Contact</th>
                              <th className="px-4 py-3 font-semibold">Problem</th>
                              <th className="px-4 py-3 font-semibold">Hiring</th>
                              <th className="px-4 py-3 font-semibold">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCompanies.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-semibold text-text-primary">{row.companyName}</p>
                                  <p className="mt-1 text-xs text-text-secondary">{row.industry || 'Industry not set'}</p>
                                  <a href={row.websiteUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-gold-400 hover:text-gold-500 transition-colors">
                                    {row.websiteUrl}
                                  </a>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.contactName}</p>
                                  <p className="mt-1 text-xs">{row.contactEmail}</p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {[row.contactRole, row.contactPhone].filter(Boolean).join(' • ') || 'Role and phone not provided'}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <p className="font-medium text-text-primary">{row.problemTitle}</p>
                                  <p className="mt-1 text-xs text-text-secondary line-clamp-2">{row.coreTask}</p>
                                  <p className="mt-2 text-xs text-text-muted">
                                    Deliverables: {formatStoredValue(row.expectedDeliverables)}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.hiringIntent || 'Not provided'}</p>
                                  <p className="mt-1 text-xs text-text-muted">Openings: {row.approxOpenings || 'Not provided'}</p>
                                  <p className="mt-1 text-xs text-text-muted">Skills: {formatStoredValue(row.skillsLookingFor)}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>
              )}

              {(activePanel === 'overview' || activePanel === 'jury') && (
                <Card hover={false} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-400">Jury Intake</p>
                      <h3 className="mt-2 text-2xl font-bold">Reviewers, operators, and domain experts</h3>
                      <p className="mt-2 text-sm text-text-secondary">
                        Track jury applicants, their experience, and their stated availability.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border-subtle bg-bg/70 px-4 py-3 text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Showing</p>
                      <p className="mt-1 text-2xl font-bold">{filteredJury.length}</p>
                      <p className="text-xs text-text-secondary">of {data?.counts.juryMembers ?? 0} jury members</p>
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
                          <div key={row.id} className="rounded-2xl border border-border bg-bg/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-text-primary">{row.fullName}</p>
                                <p className="text-sm text-text-secondary">{row.email}</p>
                              </div>
                              <span className="text-xs text-text-muted">{formatCompactDate(row.createdAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-text-secondary">
                              <p>Role: {row.currentRole || 'Not provided'}</p>
                              <p>Company: {row.company || 'Not provided'}</p>
                              <p>Availability: {row.availability || 'Not provided'}</p>
                              <p>Experience: {row.yearsExperience || 'Not provided'}</p>
                            </div>
                            <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-gold-400 hover:text-gold-500 transition-colors">
                              Open LinkedIn
                            </a>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 hidden md:block overflow-x-auto rounded-2xl border border-border">
                        <table className="min-w-full text-sm">
                          <thead className="bg-bg/80 text-left">
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 font-semibold">Jury Member</th>
                              <th className="px-4 py-3 font-semibold">Current Context</th>
                              <th className="px-4 py-3 font-semibold">Expertise</th>
                              <th className="px-4 py-3 font-semibold">Availability</th>
                              <th className="px-4 py-3 font-semibold">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJury.map((row) => (
                              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-card-hover/50">
                                <td className="px-4 py-4 align-top">
                                  <p className="font-semibold text-text-primary">{row.fullName}</p>
                                  <p className="mt-1 text-xs text-text-secondary">{row.email}</p>
                                  <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-gold-400 hover:text-gold-500 transition-colors">
                                    Open LinkedIn
                                  </a>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p>{row.currentRole || 'Role not provided'}</p>
                                  <p className="mt-1 text-xs">{row.company || 'Company not provided'}</p>
                                  <p className="mt-1 text-xs text-text-muted">{row.yearsExperience || 'Experience not provided'}</p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">
                                  <p className="line-clamp-2">{formatStoredValue(row.domainExpertise)}</p>
                                  <p className="mt-2 text-xs text-text-muted line-clamp-2">
                                    Motivation: {row.motivation || 'Not provided'}
                                  </p>
                                </td>
                                <td className="px-4 py-4 align-top text-text-secondary">{row.availability || 'Not provided'}</td>
                                <td className="px-4 py-4 align-top text-text-secondary">{formatDateTime(row.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
