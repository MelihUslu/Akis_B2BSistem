import express from 'express';
import {
  listTeam, inviteTeamMember, updateTeamMember, resetTeamMemberPassword,
  listDealerUsers, addDealerUser, updateDealerUser, resetDealerUserPassword
} from '../controllers/teamController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

// Firma ekibi (yöneticiler)
router.get('/admins', requirePermission('SETTINGS'), listTeam);
router.post('/admins', requirePermission('SETTINGS'), inviteTeamMember);
router.patch('/admins/:id', requirePermission('SETTINGS'), updateTeamMember);
router.post('/admins/:id/reset-password', requirePermission('SETTINGS'), resetTeamMemberPassword);

// Bayinin kendi kullanıcıları (ana kullanıcı yönetir)
router.get('/my-company', checkRole(['BAYI']), listDealerUsers);
router.post('/my-company', checkRole(['BAYI']), addDealerUser);
router.patch('/my-company/:userId', checkRole(['BAYI']), updateDealerUser);
router.post('/my-company/:userId/reset-password', checkRole(['BAYI']), resetDealerUserPassword);

export default router;
