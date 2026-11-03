import jwt from 'jsonwebtoken';
import { sessionRevoked } from '../services/passwordResetService.js';
import prisma from '../utils/prisma.js';
import { cached } from '../utils/cache.js';
import { JWT_SECRET } from '../config.js';
import { tenantAccess, ACCESS_MESSAGES } from './tenantMiddleware.js';
import { hasPermission } from '../services/permissions.js';

// Abonelik bittiğinde de ADMIN'in erişebileceği uçlar (ödeme yapıp hesabı açabilmesi için)
const ALLOWED_WHEN_INACTIVE = ['/api/billing', '/api/auth/me', '/api/tenant', '/api/notifications'];

const readToken = (req) => req.headers.authorization?.split(' ')[1];

// Kiracı kullanıcıları (ADMIN, BAYI). resolveTenant'tan sonra çalışmalıdır.
export const verifyToken = async (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Yetkisiz erişim. Token bulunamadı.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Geçersiz veya süresi dolmuş token.' });
  }

  // Bir firmanın token'ı başka firmanın adresinde kullanılamaz
  if (!req.tenant || decoded.tenantId !== req.tenant.id) {
    return res.status(401).json({ message: 'Oturum bu firmaya ait değil. Lütfen tekrar giriş yapın.' });
  }

  try {
    // Askıya alınan bayi veya silinen kullanıcı, token süresi dolmadan da sistemden çıkarılır
    // 10 sn önbellek (her istekte veritabanına gidilmez); kullanıcıya yazma ve firma durumu değişikliği önbelleği
    // anında temizler (utils/prisma.js), pasife alınan kullanıcı / askıya alınan bayi beklemeden çıkarılır
    const user = await cached(`authuser:${req.tenant.id}:${decoded.id}`, 10_000, () => prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, role: true, companyId: true, isOwner: true, permissions: true, isActive: true, passwordChangedAt: true, company: { select: { status: true } } }
    }));

    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
    }
    if (!user.isActive) {
      return res.status(401).json({ message: 'Kullanıcı hesabınız devre dışı bırakılmış.' });
    }
    if (sessionRevoked(decoded, user.passwordChangedAt)) {
      return res.status(401).json({ message: 'Şifreniz değiştirildi. Lütfen yeniden giriş yapın.' });
    }
    if (user.role === 'BAYI' && user.company?.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Hesabınız askıya alınmıştır. Lütfen firma yetkilisiyle iletişime geçin.' });
    }

    const access = tenantAccess(req.tenant);
    if (!access.active) {
      const allowed = user.role === 'ADMIN'
        && !['SUSPENDED', 'CANCELLED'].includes(access.reason)
        && ALLOWED_WHEN_INACTIVE.some(p => req.originalUrl.startsWith(p));
      if (!allowed) {
        return res.status(402).json({ message: ACCESS_MESSAGES[access.reason], code: 'SUBSCRIPTION_INACTIVE', reason: access.reason });
      }
    }

    req.user = {
      id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId, tenantId: req.tenant.id,
      isOwner: user.isOwner, permissions: Array.isArray(user.permissions) ? user.permissions : [],
      // Platform destek oturumu ise yöneticinin adı (işlem kaydına yazılır)
      impersonatedBy: decoded.impersonatedBy || null
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Kimlik doğrulama sırasında sunucu hatası oluştu.' });
  }
};

// Platform sahibi (SUPER_ADMIN). platformContext'ten sonra çalışmalıdır.
export const verifyPlatform = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Yetkisiz erişim. Token bulunamadı.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'SUPER_ADMIN' || decoded.tenantId !== null) {
      return res.status(403).json({ message: 'Bu alan sadece platform yöneticilerine açıktır.' });
    }
    const user = await prisma.user.findFirst({ where: { id: decoded.id, role: 'SUPER_ADMIN', tenantId: null } });
    if (!user) return res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
    if (sessionRevoked(decoded, user.passwordChangedAt)) return res.status(401).json({ message: 'Şifreniz değiştirildi. Lütfen yeniden giriş yapın.' });
    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Geçersiz veya süresi dolmuş token.' });
  }
};

export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Yetkisiz erişim. Kullanıcı bilgisi yok.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır.' });
    }

    next();
  };
};

/**
 * Firma yöneticisinin belirli bir yetkisi olmalı (firma sahibi her zaman geçer).
 * verifyToken'dan sonra çalışmalıdır.
 */
export const requirePermission = (permission) => (req, res, next) => {
  if (hasPermission(req.user, permission)) return next();
  return res.status(403).json({ message: 'Bu işlem için yetkiniz yok. Firma yöneticinizden yetki isteyin.', code: 'NO_PERMISSION', permission });
};

// Verilen yetkilerden en az birine sahip olmak yeterli
export const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (permissions.some(p => hasPermission(req.user, p))) return next();
  return res.status(403).json({ message: 'Bu işlem için yetkiniz yok.', code: 'NO_PERMISSION' });
};

// Platform destek oturumunda (müşteri olarak giriş) hesabın güvenlik ayarları değiştirilemez
export const blockImpersonation = (req, res, next) => {
  if (req.user?.impersonatedBy) return res.status(403).json({ message: 'Destek oturumunda bu işlem yapılamaz. Hesap sahibinin kendisi yapmalıdır.' });
  next();
};
