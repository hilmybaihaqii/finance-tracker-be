import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  requestChangePasswordOTP,
  changePassword,
  requestForgotPassword,
  resetPassword,
  deleteAccount,
} from './auth.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';

const router = Router();

// Public Routes
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/forgot-password/request', requestForgotPassword);
router.post('/forgot-password/reset', resetPassword);

// Protected Routes (Wajib Login & Ada Token)
router.post('/change-password/request-otp', authenticateToken, requestChangePasswordOTP);
router.post('/change-password', authenticateToken, changePassword);
router.delete('/account', authenticateToken, deleteAccount);

export default router;