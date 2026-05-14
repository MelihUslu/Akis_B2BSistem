import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyToken, getMe);

// Test routes for roles
router.get('/admin-only', verifyToken, checkRole(['ADMIN']), (req, res) => {
  res.json({ message: 'Hoş geldiniz, Admin.' });
});

router.get('/bayi-only', verifyToken, checkRole(['BAYI']), (req, res) => {
  res.json({ message: 'Hoş geldiniz, Bayi.' });
});

export default router;
