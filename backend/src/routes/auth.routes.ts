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
const cookieSecure = isProd || crossSiteCookies;

router.post('/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  const { username, password } = req.body;
  try {
    const user = await authService.getUserByUsername(username);
    console.log('User found:', user ? { id: user.id, username: user.username } : 'none');
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
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
    console.error('Login Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

router.post('/signup', async (req, res) => {
  const { username, password, fullName } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authService.createUser(username, passwordHash, fullName);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('session', token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (e: any) {
    console.error('Signup Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
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
        username: user.username,
        user_metadata: { full_name: user.fullName, avatar_url: user.avatarUrl }
      },
      roles
    });
  } catch (e: any) {
    console.error('Auth Me Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export default router;
