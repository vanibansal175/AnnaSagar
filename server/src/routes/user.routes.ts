import { Router } from 'express';
import { updateProfile } from '../controllers/auth.controller.js';
import { checkNotBlocked, verifyToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/auth.js';

const router = Router();

router.patch('/me', verifyToken, checkNotBlocked, validateBody(updateProfileSchema), updateProfile);

export const userRouter = router;
