import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'akis_super_secret_key_2026';

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Yetkisiz erişim. Token bulunamadı.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Geçersiz veya süresi dolmuş token.' });
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
