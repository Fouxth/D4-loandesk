import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const isProd = process.env.NODE_ENV === 'production';
const crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true';
const cookieSameSite: 'lax' | 'none' = crossSiteCookies ? 'none' : 'lax';
const cookieSecure = isProd;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await authService.getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('session', token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/signup', async (req, res) => {
  const { email, password, fullName } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authService.createUser(email, passwordHash, fullName);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('session', token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('session', {
    sameSite: cookieSameSite,
    secure: cookieSecure,
  });
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await authService.getUserById(req.userId!);
    const roles = await authService.getUserRoles(req.userId!);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.fullName, avatar_url: user.avatarUrl }
      },
      roles
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
