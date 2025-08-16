import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';

const router = Router();

router.get('/google', authController.googleStart);

router.get('/google/callback', authController.googleCallback);

router.get('/logout', authController.logout);

router.get('/failure', authController.failure);

export default router;
