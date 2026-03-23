import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { candidates } from '../schema';
import { eq } from 'drizzle-orm';
import { getEmailService } from '../emailService';
import { candidateConfirmationEmail, candidateNotificationEmail } from '../emailTemplates';

const router = Router();

// Log on startup so we can see whether credentials were loaded
setTimeout(() => {
  const appId = process.env.CASHFREE_APP_ID;
  console.log('[payment] CASHFREE_APP_ID loaded:', appId ? `${appId.slice(0, 8)}…` : 'MISSING');
}, 0);

// POST /create-order — Create Cashfree order, return paymentSessionId
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.body;
    if (!candidateId) {
      return res.status(400).json({ error: 'candidateId is required' });
    }

    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    if (candidate.paymentStatus === 'completed' || candidate.accountStatus === 'active') {
      return res.status(409).json({ error: 'Payment already completed' });
    }

    const orderId = `VX_${candidateId}_${Date.now()}`;

    // Read env vars per-request so hot-reload picks them up
    const isProduction = (process.env.CASHFREE_ENV || '').toLowerCase() === 'production';
    const CASHFREE_API = isProduction
      ? 'https://api.cashfree.com/pg/orders'
      : 'https://sandbox.cashfree.com/pg/orders';
    const appId = process.env.CASHFREE_APP_ID || '';
    const secretKey = process.env.CASHFREE_SECRET_KEY || '';

    if (!appId || !secretKey) {
      console.error('[payment] Cashfree credentials missing in .env');
      return res.status(500).json({ error: 'Payment not configured' });
    }

    const response = await fetch(CASHFREE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: 234.82,
        order_currency: 'INR',
        customer_details: {
          customer_id: `cand_${candidateId}`,
          customer_name: candidate.fullName,
          customer_email: candidate.email,
          customer_phone: candidate.phone,
        },
        order_meta: {
          return_url: `${req.headers.origin || process.env.APP_URL || ''}/dashboard?payment=success&order_id=${orderId}`,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cashfree create order error:', data);
      return res.status(502).json({ error: 'Failed to create payment order' });
    }

    res.json({
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      cfEnvironment: isProduction ? 'production' : 'sandbox',
    });
  } catch (e) {
    console.error('Create order error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhook — Cashfree webhook (PAYMENT_SUCCESS, PAYMENT_FAILED, PAYMENT_USER_DROPPED)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;

    if (!signature || !timestamp) {
      console.warn('Webhook missing signature/timestamp headers');
      return res.status(200).json({ ok: true });
    }

    // Verify HMAC-SHA256 signature
    const rawBody = (req as any).rawBody as string;
    const message = timestamp + rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY!)
      .update(message)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.warn('Webhook signature mismatch');
      return res.status(200).json({ ok: true });
    }

    const event = req.body;
    const orderId = event?.data?.order?.order_id as string | undefined;
    const paymentId = event?.data?.payment?.cf_payment_id as string | undefined;
    const eventType = event?.type as string | undefined;

    if (!orderId) {
      return res.status(200).json({ ok: true });
    }

    // Extract candidateId from order ID format: VX_{candidateId}_{timestamp}
    const parts = orderId.split('_');
    const candidateId = parts.length >= 2 ? parseInt(parts[1], 10) : null;
    if (!candidateId || isNaN(candidateId)) {
      console.warn('Could not parse candidateId from orderId:', orderId);
      return res.status(200).json({ ok: true });
    }

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      // Check current status to avoid duplicate processing
      const [current] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
      if (!current || current.paymentStatus === 'completed') {
        return res.status(200).json({ ok: true });
      }

      await db.update(candidates)
        .set({
          paymentStatus: 'completed',
          paymentId: String(paymentId || orderId),
          accountStatus: 'active',
        })
        .where(eq(candidates.id, candidateId));

      const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
      if (candidate) {
        const emailService = await getEmailService();
        if (emailService) {
          const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
          const notification = candidateNotificationEmail(candidate);
          await emailService.sendEmail({ to: notificationTo, ...notification });

          const confirmation = candidateConfirmationEmail(candidate);
          await emailService.sendEmail({ to: candidate.email, ...confirmation });
        }
      }
    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      await db.update(candidates)
        .set({
          paymentStatus: 'failed',
          paymentId: String(paymentId || orderId),
          accountStatus: 'inactive',
        })
        .where(eq(candidates.id, candidateId));
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    // Always return 200 to avoid Cashfree retries on server errors
    res.status(200).json({ ok: true });
  }
});

// POST /verify — Frontend polls this; actively queries Cashfree so it works without webhooks
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const parts = orderId.split('_');
    const candidateId = parts.length >= 2 ? parseInt(parts[1], 10) : null;
    if (!candidateId || isNaN(candidateId)) {
      return res.status(400).json({ error: 'Invalid orderId format' });
    }

    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Already completed — no need to query Cashfree
    if (candidate.paymentStatus === 'completed') {
      return res.json({ paymentStatus: 'completed' });
    }

    // Query Cashfree directly for the real-time order status
    const isProduction = (process.env.CASHFREE_ENV || '').toLowerCase() === 'production';
    const cfBase = isProduction
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
    const appId = process.env.CASHFREE_APP_ID || '';
    const secretKey = process.env.CASHFREE_SECRET_KEY || '';

    if (appId && secretKey) {
      const cfRes = await fetch(`${cfBase}/orders/${orderId}`, {
        headers: {
          'x-api-version': '2023-08-01',
          'x-client-id': appId,
          'x-client-secret': secretKey,
        },
      });

      if (cfRes.ok) {
        const cfOrder = await cfRes.json();
        console.log(`[verify] Cashfree order_status for ${orderId}:`, cfOrder.order_status);

        if (cfOrder.order_status === 'PAID') {
          // Update DB — this is the webhook fallback for local dev
          await db.update(candidates)
            .set({
              paymentStatus: 'completed',
              accountStatus: 'active',
              paymentId: String(cfOrder.cf_order_id || orderId),
            })
            .where(eq(candidates.id, candidateId));

          // Send emails if not already sent (best-effort)
          try {
            const [fresh] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
            const emailService = await getEmailService();
            if (emailService && fresh) {
              const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
              emailService.sendEmail({ to: notificationTo, ...candidateNotificationEmail(fresh) }).catch(() => {});
              emailService.sendEmail({ to: fresh.email, ...candidateConfirmationEmail(fresh) }).catch(() => {});
            }
          } catch { /* non-fatal */ }

          return res.json({ paymentStatus: 'completed' });
        }

        if (cfOrder.order_status === 'EXPIRED') {
          await db.update(candidates)
            .set({ paymentStatus: 'failed' })
            .where(eq(candidates.id, candidateId));
          return res.json({ paymentStatus: 'failed' });
        }
      }
    }

    // Default: return whatever is in DB (pending / failed)
    res.json({ paymentStatus: candidate.paymentStatus ?? 'pending' });
  } catch (e) {
    console.error('Verify error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;
