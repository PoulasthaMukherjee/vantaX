import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMe, submitProfile, updateProfile, createPaymentOrder, verifyPayment } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardModal } from '../components/layout/DashboardLayout';
import {
  Loader2, CheckCircle2, AlertCircle, Upload,
  User, CreditCard, LayoutDashboard, ExternalLink, X, ArrowLeft,
} from 'lucide-react';

declare global { interface Window { Cashfree: any } }

function loadCashfreeSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.head.appendChild(script);
  });
}

type CandidateProfile = {
  id: number; fullName: string; email: string; phone: string;
  linkedinUrl: string; resumePath: string | null;
  paymentStatus: 'pending' | 'completed' | 'failed' | null;
  accountStatus: 'inactive' | 'active' | null;
};
type ModalView = 'profile' | 'payment' | null;

const LINKEDIN_REGEX = /^https?:\/\/([\w-]+\.)?linkedin\.com\/.+$/i;
const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;
const NAME_REGEX = /^[A-Za-z][A-Za-z\s'-]{0,48}[A-Za-z]$|^[A-Za-z]{1,50}$/;
const MAX_RESUME_MB = 5 * 1024 * 1024;

// ─── Step pill indicator ──────────────────────────────────────────────────────
function StepPill({ step, current }: { step: number; label: string; current: number }) {
  const done = current > step;
  return (
    <div className={`flex items-center justify-center w-7 h-7 border rounded-full text-xs font-bold shrink-0 ${done ? 'bg-green-500/20 border-green-500 text-green-400'
        : current === step ? 'bg-purple-600/20 border-purple-500 text-purple-300'
          : 'border-border text-text-muted'
      }`}>
      {done ? <CheckCircle2 size={14} /> : step}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHandlers } = useDashboardModal();

  // ── Server state ──
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // ── Modal state ──
  const [modalView, setModalView] = useState<ModalView>(null);

  // ── Profile form state ──
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [touched, setTouch] = useState<Record<string, true>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Payment state ──
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // ── Derived ──
  const formErrors = useMemo(() => {
    const e: Record<string, string> = {};
    const fn = firstName.trim(), ln = lastName.trim(), ph = phone.trim(), li = linkedinUrl.trim();
    if (!fn) e.firstName = 'Required';
    else if (!NAME_REGEX.test(fn)) e.firstName = 'Enter a valid name';
    if (!ln) e.lastName = 'Required';
    else if (!NAME_REGEX.test(ln)) e.lastName = 'Enter a valid name';
    if (!ph) e.phone = 'Required';
    else if (!PHONE_REGEX.test(ph)) e.phone = 'e.g. +919876543210';
    if (!li) e.linkedinUrl = 'Required';
    else if (!LINKEDIN_REGEX.test(li)) e.linkedinUrl = 'Enter a valid LinkedIn URL';
    // Resume required only when creating, not when editing (unless user picks a new file)
    if (!profile) {
      if (!resume) e.resume = 'Required';
      else if (resume.type !== 'application/pdf') e.resume = 'PDF only';
      else if (resume.size > MAX_RESUME_MB) e.resume = 'Max 5 MB';
    } else if (resume) {
      if (resume.type !== 'application/pdf') e.resume = 'PDF only';
      else if (resume.size > MAX_RESUME_MB) e.resume = 'Max 5 MB';
    }
    return e;
  }, [firstName, lastName, phone, linkedinUrl, resume, profile]);

  const isFormComplete = Object.keys(formErrors).length === 0;
  const isAccountActive = profile?.accountStatus === 'active' && profile?.paymentStatus === 'completed';

  // Pre-fill form fields when editing
  function prefillForm(p: CandidateProfile | null) {
    if (!p) return;
    const parts = p.fullName.trim().split(' ');
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' ') ?? '');
    setPhone(p.phone ?? '');
    setLinkedinUrl(p.linkedinUrl ?? '');
    setResume(null);
    setTouch({});
    setFormError('');
  }

  // Register modal open handlers for the DashboardLayout dropdown
  const openProfile = useCallback(() => {
    prefillForm(profile);
    setModalView('profile');
  }, [profile]);

  const openPayment = useCallback(() => {
    setPaymentError('');
    setModalView('payment');
  }, []);

  useEffect(() => {
    setHandlers(openProfile, openPayment);
  }, [openProfile, openPayment]);

  // ── Lifecycle: fetch profile + handle payment redirect ──
  useEffect(() => {
    fetchMe();
    const paymentParam = searchParams.get('payment');
    const orderId = searchParams.get('order_id');
    if (paymentParam === 'success' && orderId) {
      setVerifyingPayment(true);
      setSearchParams({}, { replace: true });
      verifyPaymentStatus(orderId);
    }
  }, []);

  // Smart modal routing on load:
  // - No profile → profile form (first time)
  // - Profile exists, not active → payment step directly (skip re-filling)
  // - Active → nothing
  useEffect(() => {
    if (loading) return;
    if (!profile) {
      setModalView('profile');
    } else if (profile.accountStatus !== 'active') {
      setModalView('payment');
    }
  }, [loading, profile]);

  const fetchMe = async () => {
    try {
      const data = await getMe();
      setProfile(data.profile);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const verifyPaymentStatus = async (orderId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const result = await verifyPayment(orderId);
        if (result.paymentStatus === 'completed') {
          clearInterval(interval);
          setVerifyingPayment(false);
          setPaymentLoading(false);
          setModalView(null);   // ← close the modal
          await fetchMe();      // ← refresh profile so dashboard shows active
        } else if (result.paymentStatus === 'failed' || attempts >= 12) {
          clearInterval(interval);
          setVerifyingPayment(false);
          setPaymentLoading(false);
          if (result.paymentStatus !== 'completed') setPaymentError('Payment failed or timed out. Please try again.');
        }
      } catch {
        if (attempts >= 12) { clearInterval(interval); setVerifyingPayment(false); setPaymentLoading(false); }
      }
    }, 2000);
  };

  const t = (field: string) => setTouch(prev => ({ ...prev, [field]: true }));

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouch({ firstName: true, lastName: true, phone: true, linkedinUrl: true, resume: true });
    if (!isFormComplete) return;
    setFormLoading(true);
    setFormError('');
    try {
      const fd = new FormData();
      fd.append('firstName', firstName.trim());
      fd.append('lastName', lastName.trim());
      fd.append('phone', phone.trim());
      fd.append('linkedinUrl', linkedinUrl.trim());
      if (resume) fd.append('resume', resume);

      const isEditing = !!profile;
      const fn = isEditing ? updateProfile : submitProfile;
      const res = await fn(fd);
      setProfile(res.profile);

      // After submit: go to payment step if not active, else close
      if (res.profile.accountStatus !== 'active') {
        setModalView('payment');
      } else {
        setModalView(null);
      }
    } catch (err: any) {
      setFormError(err.message || 'Error saving profile. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!profile) return;
    setPaymentLoading(true);
    setPaymentError('');
    try {
      const order = await createPaymentOrder(profile.id);
      await loadCashfreeSDK();
      const cashfree = window.Cashfree({ mode: order.cfEnvironment || 'production' });

      cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_modal'
      }).then((result: any) => {
        // Cashfree returns result.error if the user explicitly clicked the 'X' to close the modal
        // or if a catastrophic failure occurred before payment could be processed.
        if (result && result.error) {
          setPaymentLoading(false);
          setPaymentError('Payment was cancelled or failed. Please try again.');
          return;
        }
        
        // Otherwise, it completed a transaction flow (either success or bank-declined)
        // We poll the backend to verify the final status securely
        setVerifyingPayment(true);
        verifyPaymentStatus(order.orderId);
      });

    } catch (err: any) {
      setPaymentError(err.message || 'Error processing payment. Please try again.');
      setPaymentLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL — shared between profile & payment views
  // ─────────────────────────────────────────────────────────────────────────────
  const modal = modalView !== null && (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f0f14] w-full max-w-xl border border-purple-500/20 shadow-2xl flex flex-col max-h-[92vh]">

        {/* ─ Header ─ */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          {/* Step indicators */}
          <div className="flex items-center gap-3 mb-4">
            <StepPill step={1} label="Profile" current={modalView === 'profile' ? 1 : 2} />
            <div className={`flex-1 h-px ${profile ? 'bg-purple-500/40' : 'bg-border'}`} />
            <StepPill step={2} label="Payment" current={modalView === 'payment' ? 2 : profile ? 2 : 1} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              {modalView === 'profile' && (
                <>
                  <h2 className="text-xl font-bold">{profile ? 'Update Profile' : 'Complete Your Profile'}</h2>
                  <p className="text-text-muted text-sm mt-0.5">
                    {profile ? 'Change your details below and save.' : 'Fill in your details to get started.'}
                  </p>
                </>
              )}
              {modalView === 'payment' && (
                <>
                  <h2 className="text-xl font-bold">Activate Account</h2>
                  <p className="text-text-muted text-sm mt-0.5">Complete payment to unlock all challenges.</p>
                </>
              )}
            </div>

            {/* Close — only allow closing if profile already exists (can't escape first-time) */}
            {profile && (
              <button
                onClick={() => setModalView(null)}
                className="p-1.5 text-text-muted hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ─ Content ─ */}
        <div className="overflow-y-auto flex-1">

          {/* PROFILE FORM */}
          {modalView === 'profile' && (
            <form onSubmit={handleSubmitProfile} className="p-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1.5">First Name <span className="text-pink">*</span></label>
                  <input type="text" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} onBlur={() => t('firstName')}
                    placeholder="Arjun"
                    className="w-full bg-bg border border-border px-4 py-2.5 text-sm focus:border-purple-500 outline-none transition-colors" />
                  {touched.firstName && formErrors.firstName && <p className="mt-1 text-xs text-pink">{formErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Last Name <span className="text-pink">*</span></label>
                  <input type="text" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} onBlur={() => t('lastName')}
                    placeholder="Sharma"
                    className="w-full bg-bg border border-border px-4 py-2.5 text-sm focus:border-purple-500 outline-none transition-colors" />
                  {touched.lastName && formErrors.lastName && <p className="mt-1 text-xs text-pink">{formErrors.lastName}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input type="email" value={user?.email || ''} disabled
                  className="w-full bg-black/30 border border-border px-4 py-2.5 text-sm opacity-50 cursor-not-allowed text-text-muted" />
                <p className="text-xs text-text-muted mt-1">Pre-filled from Google · cannot be changed</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Phone Number <span className="text-pink">*</span></label>
                <input type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)} onBlur={() => t('phone')}
                  placeholder="+919876543210"
                  className="w-full bg-bg border border-border px-4 py-2.5 text-sm focus:border-purple-500 outline-none transition-colors" />
                {touched.phone && formErrors.phone && <p className="mt-1 text-xs text-pink">{formErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">LinkedIn URL <span className="text-pink">*</span></label>
                <input type="url" value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)} onBlur={() => t('linkedinUrl')}
                  placeholder="https://www.linkedin.com/in/your-profile"
                  className="w-full bg-bg border border-border px-4 py-2.5 text-sm focus:border-purple-500 outline-none transition-colors" />
                {touched.linkedinUrl && formErrors.linkedinUrl && <p className="mt-1 text-xs text-pink">{formErrors.linkedinUrl}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Resume <span className="text-pink">*</span>
                  {profile && <span className="text-text-muted font-normal ml-1">(leave blank to keep existing)</span>}
                </label>
                <input ref={fileRef} type="file" accept=".pdf,application/pdf"
                  onChange={(e) => { setResume(e.target.files?.[0] || null); t('resume'); }}
                  className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed text-sm transition-all ${resume ? 'border-green-500/50 bg-green-500/5 text-green-400'
                      : 'border-border text-text-muted hover:border-purple-500/50 hover:text-white'
                    }`}>
                  <Upload size={14} />
                  {resume ? resume.name : profile ? 'Upload new resume (optional)' : 'Click to upload your resume'}
                </button>
                {touched.resume && formErrors.resume && <p className="mt-1 text-xs text-pink">{formErrors.resume}</p>}
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-pink/10 border border-pink/30 p-3 text-pink text-sm">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {formError}
                </div>
              )}

              <button type="submit" disabled={formLoading}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {formLoading
                  ? <><Loader2 className="animate-spin" size={15} /> Saving…</>
                  : profile ? 'Save Changes →' : 'Submit & Continue →'
                }
              </button>
            </form>
          )}

          {/* PAYMENT VIEW */}
          {modalView === 'payment' && (
            <div className="p-6">
              {/* Back to profile */}
              <button onClick={() => { prefillForm(profile); setModalView('profile'); }}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-white transition-colors mb-6">
                <ArrowLeft size={14} /> Back to Profile
              </button>

              {/* Checklist */}
              <div className="space-y-3 mb-8 pb-6 border-b border-border">
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                  <span className="text-white font-medium">Profile submitted</span>
                  <span className="ml-auto text-green-400 text-xs font-semibold">Done</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {isAccountActive ? (
                    <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-gold-500 rounded-full shrink-0" />
                  )}
                  <span className="text-white font-medium">Registration payment</span>
                  <span className={`ml-auto text-xs font-semibold ${isAccountActive ? 'text-green-400' : 'text-gold-500'}`}>
                    {isAccountActive ? 'Completed' : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="text-center mb-8">
                <p className="text-4xl font-bold">₹199</p>
                <p className="text-text-muted text-sm mt-1">+ 18% GST · One-time registration fee</p>
              </div>

              {/* Errors */}
              {(paymentError || profile?.paymentStatus === 'failed') && (
                <div className="mb-5 flex items-start gap-2 bg-pink/10 border border-pink/30 p-3 text-pink text-sm">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {paymentError || 'Previous payment was not completed. Please try again.'}
                </div>
              )}

              <button onClick={handlePayNow} disabled={paymentLoading || isAccountActive}
                className="w-full bg-gold-500 hover:bg-gold-400 text-black font-bold py-3.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {paymentLoading
                  ? <><Loader2 className="animate-spin" size={15} /> Processing…</>
                  : isAccountActive ? 'Account Already Active ✓'
                    : 'Pay ₹199 & Activate'
                }
              </button>

              <p className="text-xs text-text-muted text-center mt-4">
                Secure payment via Cashfree. You'll be redirected back after payment.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / verifying
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading || verifyingPayment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg">
        <Loader2 className="animate-spin text-purple-500" size={48} />
        <p className="text-text-muted">
          {verifyingPayment ? 'Verifying payment, please wait…' : 'Loading your dashboard…'}
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main dashboard body — same regardless of state, modal renders on top
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="py-10 px-6 max-w-screen-xl mx-auto min-h-screen">

      {/* Top header */}
      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold">
            {profile ? `Welcome back, ${profile.fullName.split(' ')[0]}` : 'Candidate Dashboard'}
          </h1>
          <p className="text-text-muted mt-1 text-sm">
            {isAccountActive ? 'Your account is active. Challenges will appear below.'
              : 'Complete your profile and payment to unlock dashboard access.'}
          </p>
        </div>

        {/* Account status badge */}
        {isAccountActive ? (
          <div className="flex items-center gap-1.5 bg-green-500/10 text-green-400 text-xs px-3 py-1.5 border border-green-500/30 shrink-0">
            <CheckCircle2 size={12} /> Account Active
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-gold-500/10 text-gold-500 text-xs px-3 py-1.5 border border-gold-500/30 shrink-0">
            <AlertCircle size={12} /> Not Activated
          </div>
        )}
      </div>

      {/* Dashboard grid — blurred/disabled when inactive */}
      <div className={`grid md:grid-cols-3 gap-6 ${!isAccountActive ? 'opacity-50 pointer-events-none select-none' : ''}`}>
        {/* Profile card */}
        <div className="bg-[#0f0f14] border border-border p-6 md:col-span-1">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-4">
            <User size={13} /> Your Profile
          </div>
          {profile ? (
            <>
              <p className="text-lg font-bold mb-4">{profile.fullName}</p>
              <div className="space-y-3 text-sm">
                <div><p className="text-text-muted text-xs mb-0.5">Email</p><p>{profile.email}</p></div>
                <div><p className="text-text-muted text-xs mb-0.5">Phone</p><p>{profile.phone}</p></div>
                <div>
                  <p className="text-text-muted text-xs mb-0.5">LinkedIn</p>
                  <a href={profile.linkedinUrl} target="_blank" rel="noreferrer"
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors truncate">
                    View Profile <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <p className="text-text-muted text-sm">No profile yet.</p>
          )}
        </div>

        {/* Challenges placeholder */}
        <div className="bg-[#0f0f14] border border-border p-6 md:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-4">
            <LayoutDashboard size={13} /> Live Challenges
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 border border-purple-500/30 bg-purple-500/10 flex items-center justify-center mb-4">
              <LayoutDashboard size={26} className="text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Active Challenges Yet</h3>
            <p className="text-text-muted text-sm max-w-xs">
              The first audition round will be announced soon. You'll be notified when it goes live.
            </p>
          </div>
        </div>
      </div>

      {/* Inactive CTA */}
      {!isAccountActive && (
        <div className="mt-8 bg-[#0f0f14] border border-gold-500/30 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gold-500 mb-1">Your account isn't active yet</p>
            <p className="text-text-muted text-sm">
              {!profile ? 'Complete your profile to get started.' : 'Complete payment to unlock full access.'}
            </p>
          </div>
          <button
            onClick={() => !profile ? setModalView('profile') : setModalView('payment')}
            className="bg-gold-500 hover:bg-gold-400 text-black font-bold px-6 py-2.5 text-sm transition-colors shrink-0"
          >
            {!profile ? 'Complete Profile' : 'Activate Now'}
          </button>
        </div>
      )}

      {/* The unified modal */}
      {modal}
    </div>
  );
}
