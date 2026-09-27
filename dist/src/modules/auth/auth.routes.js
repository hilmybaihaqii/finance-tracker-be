import { Router } from 'express';
import { register, login, verifyEmail } from './auth.controller.js';
const router = Router();
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
export default router;
//# sourceMappingURL=auth.routes.js.map