import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../firebase';

export interface CandidateIdentity {
  firebaseUid: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

// Extend Express Request to carry verified candidate identity
declare global {
  namespace Express {
    interface Request {
      candidate?: CandidateIdentity;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.candidate = {
      firebaseUid: decoded.uid,
      email: decoded.email ?? '',
      name: decoded.name ?? decoded.email ?? '',
      emailVerified: decoded.email_verified ?? false,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
