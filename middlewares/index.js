import morgan from 'morgan';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { passport } from '../config/passport.js';

export function registerMiddleware(app) {
  app.use(morgan('dev'));
  app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
  secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
}
