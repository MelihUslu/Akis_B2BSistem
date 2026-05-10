import prisma from '../utils/prisma.js';
import xlsx from 'xlsx';

export const getProducts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search, 
      categoryId, 
      brand, 
      minPrice, 
      maxPrice,
      isAdmin = false // Bu flag'i middleware veya user role üzerinden set edeceğiz
    } = req.query;
    
    // Global ayarı kontrol et
    const globalHideSetting = await prisma.setting.findUnique({ where: { key: 'global_hide_price' } });
    const isGlobalHide = globalHideSetting?.value === 'true';

    const skip = (page - 1) * limit;
    
    // Filtreleme objesi
    const where = {
      isMaster: true, // Sadece ana ürünleri getir, varyantlar içinde olacak
      ...((isAdmin === 'true' || isAdmin === true) ? {} : { isActive: true }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { brand: { contains: search } }
        ]
      }),
      ...(categoryId && { categoryId: parseInt(categoryId) }),
      ...(brand && { brand }),
      ...( (minPrice || maxPrice) && {
        price: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) })
        }
      })
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          category: true,
          variants: true,
          alternatives: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    // Bayi için Stok & Fiyat Gizleme Maskeleme
    const processedProducts = isAdmin ? products : products.map(p => {
      const maskStock = (qty) => {
        if (qty > 100) return '100+';
        if (qty > 0 && qty <= 5) return 'Son 5 Ürün';
        if (qty <= 0) return 'Tükendi';
        return qty;
      };

      const shouldHidePrice = isGlobalHide || p.hidePrice;

      return {
        ...p,
        stock: maskStock(p.stock),
        price: shouldHidePrice ? 0 : p.price,
        priceHidden: shouldHidePrice,
        costPrice: undefined, // Maliyeti gizle
        variants: p.variants.map(v => ({
          ...v,
          stock: maskStock(v.stock),
          price: (shouldHidePrice || v.hidePrice) ? 0 : v.price,
          priceHidden: shouldHidePrice || v.hidePrice,
          costPrice: undefined
        }))
      };
    });

    res.json({
      data: processedProducts,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Ürünler listelenirken hata oluştu.' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { 
      name, sku, barcode, brand, price, costPrice, currency, vatRate,
      stock, unit, moq, stepQuantity, shortDesc, longDesc, categoryId,
      images, pdfUrl, videoUrl, variants, hidePrice
    } = req.body;

    const product = await prisma.product.create({
      data: {
        name, sku, barcode, brand,
        price: parseFloat(price),
        costPrice: costPrice ? parseFloat(costPrice) : null,
        currency,
        vatRate: parseFloat(vatRate),
        stock: parseInt(stock),
        unit,
        moq: parseInt(moq) || 1,
        stepQuantity: parseInt(stepQuantity) || 1,
        shortDesc,
        longDesc,
        images: JSON.stringify(images),
        pdfUrl,
        videoUrl,
        categoryId: categoryId ? parseInt(categoryId) : null,
        isMaster: true,
        isActive: true,
        hidePrice: hidePrice === true || hidePrice === 'true',
        // Eğer varyantlar varsa alt ürün olarak oluştur
        variants: variants && variants.length > 0 ? {
          create: variants.map(v => ({
            name: `${name} - ${v.variantName}`,
            sku: v.sku,
            barcode: v.barcode,
            price: parseFloat(v.price || price),
            stock: parseInt(v.stock || 0),
            isMaster: false,
            isActive: true,
            hidePrice: hidePrice === true || hidePrice === 'true'
          }))
        } : undefined
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Ürün oluşturulamadı. SKU benzersiz olmalıdır.' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Sayısal alanları dönüştür
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.costPrice) updateData.costPrice = parseFloat(updateData.costPrice);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);
    if (updateData.vatRate) updateData.vatRate = parseFloat(updateData.vatRate);
    if (updateData.categoryId) updateData.categoryId = parseInt(updateData.categoryId);
    if (updateData.images) updateData.images = JSON.stringify(updateData.images);
    if (updateData.hidePrice !== undefined) updateData.hidePrice = updateData.hidePrice === true || updateData.hidePrice === 'true';

    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Ürün güncellenemedi.' });
  }
};

export const bulkUpdate = async (req, res) => {
  const { type } = req.params; // 'price', 'stock', 'upload'
  if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi.' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    for (const item of data) {
      if (!item.SKU) continue;

      const updateData = {};
      if (type === 'price' && item.Price) updateData.price = parseFloat(item.Price);
      if (type === 'stock' && item.Stock !== undefined) updateData.stock = parseInt(item.Stock);
      
      if (Object.keys(updateData).length > 0) {
        await prisma.product.update({
          where: { sku: String(item.SKU) },
          data: updateData
        });
      }
    }

    res.json({ message: 'Toplu güncelleme tamamlandı.' });
  } catch (error) {
    res.status(500).json({ message: 'Excel işleme hatası.' });
  }
};

export const linkAlternative = async (req, res) => {
  try {
    const { productId, alternativeId } = req.body;
    await prisma.product.update({
      where: { id: parseInt(productId) },
      data: { alternativeToId: parseInt(alternativeId) }
    });
    res.json({ message: 'Alternatif ürün başarıyla bağlandı.' });
  } catch (error) {
    res.status(400).json({ message: 'Bağlama işlemi başarısız.' });
  }
};

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi.' });
    // Docker ortamında /uploads klasörüne kaydedilir
    const imageUrl = `http://localhost:5001/uploads/images/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ message: 'Resim yükleme hatası.' });
  }
};

export const getFilters = async (req, res) => {
  try {
    const brands = await prisma.product.findMany({
      select: { brand: true },
      distinct: ['brand'],
      where: { brand: { not: null } }
    });
    
    res.json({
      brands: brands.map(b => b.brand),
      vatRates: [1, 10, 20],
      units: ['Adet', 'Kutu', 'Koli', 'Metre', 'Kg']
    });
  } catch (error) {
    res.status(500).json({ message: 'Filtreler alınamadı.' });
  }
};
