import express from 'express';
import { addFavorite, removeFavorite, listTemplates, createTemplate, updateTemplate, deleteTemplate } from '../controllers/listController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, checkRole(['BAYI']));

router.post('/favorites/:productId', addFavorite);
router.delete('/favorites/:productId', removeFavorite);

router.get('/templates', listTemplates);
router.post('/templates', createTemplate);
router.patch('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

export default router;
