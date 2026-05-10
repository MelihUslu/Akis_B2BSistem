import prisma from '../utils/prisma.js';
import bcrypt from 'bcrypt';

export const getCompanies = async (req, res) => {
  try {
    const { search, status } = req.query;

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search } },
          { taxNumber: { contains: search } },
          { authorizedPerson: { contains: search } }
        ]
      }),
      ...(status && { status })
    };

    const companies = await prisma.company.findMany({
      where,
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: 'Bayiler getirilirken hata oluştu.' });
  }
};

export const createCompany = async (req, res) => {
  try {
    const { 
      name, taxNumber, taxOffice, authorizedPerson, phone, address,
      email, password, // Admin tarafından atanan ilk giriş bilgileri
      riskLimit, dealerGroup, netDiscount, minOrderAmount 
    } = req.body;

    // Şifreyi hashle
    const hashedPassword = await bcrypt.hash(password || '123456', 10);

    const company = await prisma.company.create({
      data: {
        name,
        taxNumber,
        taxOffice,
        authorizedPerson,
        phone,
        address,
        status: 'ACTIVE', // Admin manuel eklediği için direkt aktif yapıyoruz
        riskLimit: parseFloat(riskLimit) || 0,
        dealerGroup: dealerGroup || 'STANDART',
        netDiscount: parseFloat(netDiscount) || 0,
        minOrderAmount: parseFloat(minOrderAmount) || 0,
        users: {
          create: {
            email,
            password: hashedPassword,
            name: authorizedPerson || name,
            role: 'BAYI'
          }
        }
      },
      include: { users: true }
    });

    console.log(`[MAIL MOCK] Bayi Oluşturuldu: ${email} adresine giriş şifresi gönderildi.`);
    
    res.status(201).json(company);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Bayi oluşturulurken hata oluştu. Email veya Vergi No benzersiz olmalıdır.' });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, taxNumber, taxOffice, authorizedPerson, phone, address, status,
      riskLimit, dealerGroup, netDiscount, minOrderAmount 
    } = req.body;

    const company = await prisma.company.update({
      where: { id: parseInt(id) },
      data: {
        name, taxNumber, taxOffice, authorizedPerson, phone, address, status,
        riskLimit: riskLimit !== undefined ? parseFloat(riskLimit) : undefined,
        dealerGroup,
        netDiscount: netDiscount !== undefined ? parseFloat(netDiscount) : undefined,
        minOrderAmount: minOrderAmount !== undefined ? parseFloat(minOrderAmount) : undefined,
      },
    });

    res.json(company);
  } catch (error) {
    res.status(400).json({ message: 'Güncelleme başarısız.' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { companyId } = req.params;
    const newPassword = Math.random().toString(36).slice(-8); // 8 karakterli rastgele şifre
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const company = await prisma.company.findUnique({
      where: { id: parseInt(companyId) },
      include: { users: true }
    });

    if (!company || company.users.length === 0) {
      return res.status(404).json({ message: 'Bayi kullanıcısı bulunamadı.' });
    }

    await prisma.user.update({
      where: { id: company.users[0].id },
      data: { password: hashedPassword }
    });

    console.log(`[MAIL MOCK] Şifre Sıfırlandı: ${company.users[0].email} adresine yeni şifre (${newPassword}) gönderildi.`);

    res.json({ message: 'Şifre başarıyla sıfırlandı ve bayiye iletildi.' });
  } catch (error) {
    res.status(500).json({ message: 'Şifre sıfırlama hatası.' });
  }
};
