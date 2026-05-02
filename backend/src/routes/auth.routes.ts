import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

router.post('/login', async (req: any, res) => {
  const { username, password } = req.body;
  
  // Debug info for mobile/cross-site issues
  const origin = req.headers.origin;
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true';

  try {
    const user = await authService.getUserByUsername(username);
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    // Auto-detect if we should use Secure/SameSite=None
    // In production/HTTPS, we MUST use SameSite=None to support mobile and cross-site access
    const useSecure = isHttps || (process.env.NODE_ENV === 'production');
    const sameSiteValue = useSecure ? 'none' : 'lax';

    res.cookie('session', token, {
      httpOnly: true,
      secure: useSecure,
      sameSite: sameSiteValue,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ 
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
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
    
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const useSecure = isHttps || (process.env.NODE_ENV === 'production');
    const sameSiteValue = useSecure ? 'none' : 'lax';

    res.cookie('session', token, {
      httpOnly: true,
      secure: useSecure,
      sameSite: sameSiteValue,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ 
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (e: any) {
    console.error('Signup Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

router.post('/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const useSecure = isHttps || (process.env.NODE_ENV === 'production');
  const sameSiteValue = useSecure ? 'none' : 'lax';

  res.clearCookie('session', {
    httpOnly: true,
    secure: useSecure,
    sameSite: sameSiteValue,
    path: '/',
  });
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await authService.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
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
