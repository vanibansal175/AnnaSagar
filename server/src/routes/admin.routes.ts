import { Request, Response, Router } from 'express';
import { checkNotBlocked, checkRole, verifyToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { sendSuccess } from '../utils/api-response.js';

const router = Router();

router.use(verifyToken, checkNotBlocked, checkRole('admin'));

router.get('/users', async (_req: Request, res: Response) => {
  const users = await User.find().select('-passwordHash');
  sendSuccess(res, users);
});

export const adminRouter = router;
