import { Router } from 'express';
import { changePassword, getMe, login, register } from '../controllers/auth.controller.js';
import { checkNotBlocked, verifyToken } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import { validateBody } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../schemas/auth.js';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), register);
router.post('/login', authRateLimiter, validateBody(loginSchema), login);
router.get('/me', verifyToken, checkNotBlocked, getMe);
router.post('/change-password', verifyToken, checkNotBlocked, validateBody(changePasswordSchema), changePassword);

export const authRouter = router;
