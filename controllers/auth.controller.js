import { passport, isGoogleConfigured } from '../config/passport.js';

export const authController = {
  googleStart: (req, res, next) => {
    if (!isGoogleConfigured) {
      return res.status(500).json({ ok: false, message: 'Google OAuth not configured' });
    }
    return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  },

  googleCallback: [
    (req, res, next) => {
      if (!isGoogleConfigured) {
        return res.status(500).json({ ok: false, message: 'Google OAuth not configured' });
      }
      return passport.authenticate('google', {
        failureRedirect: '/auth/failure',
        session: true,
      })(req, res, next);
    },
    (req, res) => {
      const target = process.env.CLIENT_URL || 'http://localhost:5173';
      try {
        // Redirect to frontend landing page after successful authentication
        return res.redirect(`${target}/landing`);
      } catch {
        return res.redirect('/auth/failure');
      }
    },
  ],

  loginSuccess: (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Not authenticated' });
    res.json({ ok: true, user: req.user });
  },

  logout: (req, res, next) => {
    req.logout(err => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  },

  failure: (req, res) => {
    res.status(401).json({ ok: false, message: 'Authentication failed' });
  },
};
