import express from 'express';
import { assistantChat, assistantStatus } from '../controllers/assistantController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

// "Akkuş" yönetim paneli asistanı (yalnız yöneticiler). İşlemler onaylanınca mevcut uçlara gider; burada çalıştırılmaz.
const router = express.Router();
router.use(verifyToken, checkRole(['ADMIN']));
router.get('/status', assistantStatus);
router.post('/chat', assistantChat);

export default router;
