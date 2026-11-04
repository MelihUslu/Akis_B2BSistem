import express from 'express';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { myDealers, mySummary } from '../controllers/plasiyerController.js';

const router = express.Router();
router.use(verifyToken, checkRole(['PLASIYER']));

router.get('/dealers', myDealers);
router.get('/summary', mySummary);

export default router;
