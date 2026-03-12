import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload, CheckCircle2, Loader2 } from 'lucide-react';
import FadeInOnScroll from '../../components/motion/FadeInOnScroll';
import FormField from '../../components/form/FormField';
import FormSection from '../../components/form/FormSection';
import SubmitButton from '../../components/form/SubmitButton';
import { submitCandidate, createPaymentOrder, verifyPayment } from '../../lib/api';

declare global {
  interface Window {
    Cashfree: any;
  }
}

function loadCashfreeSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.head.appendChild(script);
  });
}

export default function RegistrationForm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    college: '',
    graduationYear: '',
    degreeBranch: '',
    referralSource: '',
  });
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  // Handle return from Cashfree checkout
  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    const orderId = searchParams.get('order_id');

    if (paymentParam === 'success' && orderId) {
      setVerifying(true);
      // Clear params from URL
      setSearchParams({}, { replace: true });

      let attempts = 0;
      const maxAttempts = 10;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const result = await verifyPayment(orderId);
          if (result.paymentStatus === 'completed') {
            clearInterval(interval);
            setVerifying(false);
            setSuccess(true);
          } else if (result.paymentStatus === 'failed') {
            clearInterval(interval);
            setVerifying(false);
            setError('Payment failed. Please try registering again.');
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            setVerifying(false);
            setPaymentPending(true);
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            setVerifying(false);
            setPaymentPending(true);
          }
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.fullName || !form.email || !form.phone || !form.linkedinUrl) {
      setError('Please fill in all required fields');
      return;
    }
    if (!resume) {
      setError('Please upload your resume (PDF)');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      fd.append('resume', resume);
      const result = await submitCandidate(fd);

      if (!result.paymentRequired) {
        // Payment disabled — registration complete
        setSuccess(true);
        return;
      }

      // Payment enabled — create Cashfree order and open checkout
      const order = await createPaymentOrder(result.id);
      await loadCashfreeSDK();

      const cashfree = window.Cashfree({ mode: order.cfEnvironment || 'production' });
      await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_self',
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <section id="register" className="py-20 px-4 max-w-2xl mx-auto">
        <FadeInOnScroll>
          <div className="bg-card border border-border p-12 text-center">
            <Loader2 size={48} className="text-purple-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Verifying Payment...</h2>
            <p className="text-text-muted text-[16px]">
              Please wait while we confirm your payment. This may take a few seconds.
            </p>
          </div>
        </FadeInOnScroll>
      </section>
    );
  }

  if (paymentPending) {
    return (
      <section id="register" className="py-20 px-4 max-w-2xl mx-auto">
        <FadeInOnScroll>
          <div className="bg-card border border-border p-12 text-center">
            <Loader2 size={48} className="text-gold-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Payment Processing</h2>
            <p className="text-text-muted text-[16px] mb-4">
              Your payment is being processed. This can take a minute. You'll receive a confirmation email once it's complete.
            </p>
            <p className="text-text-muted text-[16px]">
              If you don't receive an email within 15 minutes, contact us at hello@vantahire.com.
            </p>
          </div>
        </FadeInOnScroll>
      </section>
    );
  }

  if (success) {
    return (
      <section id="register" className="py-20 px-4 max-w-2xl mx-auto">
        <FadeInOnScroll>
          <div className="bg-card border border-border p-12 text-center">
            <CheckCircle2 size={48} className="text-success mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">
              <span className="text-purple-500">{'// '}</span>Registration Complete!
            </h2>
            <p className="text-text-muted text-[16px] mb-6">
              Thank you{form.fullName ? `, ${form.fullName}` : ''}. We've received your application. Check your email for confirmation. We'll be in touch as VantaX 2026 approaches.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/what-is-vantax" className="text-[16px] text-gold-500 hover:text-gold-400 transition-colors">Learn more about VantaX &rarr;</Link>
            </div>
          </div>
        </FadeInOnScroll>
      </section>
    );
  }

  return (
    <section id="register" className="py-20 px-4 max-w-2xl mx-auto">
      <FadeInOnScroll>
        <div className="bg-card border border-border p-8 sm:p-10">
          <h2 className="text-xl font-bold mb-1">
            <span className="text-purple-500">{'$ '}</span>vantax --register
          </h2>
          <p className="text-text-muted text-[16px] mb-2">Seats capped per problem. Once full, registration closes.</p>
          <p className="text-gold-500 text-[16px] font-bold mb-8">₹199 + GST — Access all 3 challenges + get shortlisted for interviews</p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <FormSection title="Basic Information">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Full Name" required value={form.fullName} onChange={set('fullName')} placeholder="Your full name" />
                <FormField label="Email" required type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Phone" required value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
                <FormField label="LinkedIn URL" required value={form.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
              </div>

              {/* Resume upload */}
              <div>
                <label className="block text-[16px] font-medium mb-1">
                  Resume (PDF) <span className="text-gold-500">*</span>
                </label>
                <p className="text-[16px] text-text-muted mb-1.5">Resume is collected for recruiter context only. Shortlisting is based on your challenge performance.</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setResume(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-3 px-4 py-4 border-2 border-dashed transition-colors text-[16px] ${
                    resume
                      ? 'border-success/40 bg-success/5 text-success'
                      : 'border-border text-text-muted hover:border-gold-500 hover:text-gold-500'
                  }`}
                >
                  <Upload size={16} />
                  {resume ? resume.name : 'Click to upload resume (PDF, max 5MB)'}
                </button>
              </div>
            </FormSection>

            <FormSection title="Optional Details" description="Help us understand your background better">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="College / University" value={form.college} onChange={set('college')} placeholder="Your institution" />
                <FormField label="Graduation Year" value={form.graduationYear} onChange={set('graduationYear')} placeholder="e.g. 2026" />
              </div>
              <FormField label="Degree / Branch" value={form.degreeBranch} onChange={set('degreeBranch')} placeholder="e.g. B.Tech CSE" />
              <FormField label="How did you hear about VantaX?" value={form.referralSource} onChange={set('referralSource')} placeholder="LinkedIn, friend, college, etc." />
            </FormSection>

            {error && (
              <div className="bg-pink/10 border border-pink/30 p-3 text-[16px] text-pink">{error}</div>
            )}

            <SubmitButton loading={loading}>Register & Pay ₹235</SubmitButton>
          </form>
        </div>
      </FadeInOnScroll>
    </section>
  );
}
