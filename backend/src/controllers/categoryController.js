import prisma from '../utils/prisma.js';
import { accessFor } from '../services/catalogAccess.js';
import { groupList } from './productController.js';

export const getCategories = async (req, res) => {
  try {
    const { isFlat = false } = req.query;
    // Pasif kategoriler sadece ADMIN'e gösterilir
    const isAdmin = req.user.role === 'ADMIN' && req.query.isAdmin === 'true';
    // Bayi, grubuna kapalı kategorileri (ve alt kategorilerini) görmez; ürün sayısı da görebildikleriyle sayılır
    const access = !isAdmin && req.user.companyId ? await accessFor(prisma, await prisma.company.findUnique({ where: { id: req.user.companyId } })) : null;
    const visible = isAdmin ? {} : { isActive: true, ...(access?.hiddenCategories.size && { id: { notIn: [...access.hiddenCategories] } }) };
    const productWhere = { parentId: null, ...(isAdmin ? {} : { isActive: true }), ...(access && { OR: [{ visibleGroups: { isEmpty: true } }, { visibleGroups: { has: access.group } }] }) };

    const categories = await prisma.category.findMany({
      where: visible,
      orderBy: { sortOrder: 'asc' }
    });

    if (isFlat === 'true' || isFlat === true) {
      const flatList = categories.map(cat => {
        let fullName = cat.name;
        const findParent = (pid) => categories.find(c => c.id === pid);
        
        let parent = findParent(cat.parentId);
        let depth = 0;
        while (parent && depth < 10) { // Infinite loop guard
          fullName = `${parent.name} > ${fullName}`;
          parent = findParent(parent.parentId);
          depth++;
        }
        
        return { ...cat, name: fullName };
      });

      flatList.sort((a, b) => a.name.localeCompare(b.name));
      return res.json(flatList);
    }

    // Tree yapısı için children include ederek tekrar çek (veya manuel oluştur)
    const categoriesWithChildren = await prisma.category.findMany({
      where: visible,
      // Ürün sayısı yalnızca ana ürünleri sayar (varyantlar ayrı ürün kaydıdır)
      include: {
        _count: { select: { products: { where: productWhere } } },
        children: { where: visible, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: { where: productWhere } } } } }
      },
      orderBy: { sortOrder: 'asc' }
    });

    const tree = categoriesWithChildren.filter(c => c.parentId === null);
    res.json(tree);
  } catch (error) {
    console.error('Kategori listeleme hatası:', error);
    res.status(500).json({ message: 'Kategoriler listelenirken hata oluştu.' });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, parentId, sortOrder, isActive, imageUrl, visibleGroups } = req.body;
    const category = await prisma.category.create({
      data: {
        name,
        parentId: parentId ? parseInt(parentId) : null,
        sortOrder: parseInt(sortOrder) || 0,
        isActive: isActive !== undefined ? isActive : true,
        imageUrl,
        visibleGroups: groupList(visibleGroups)
      }
    });
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: 'Kategori oluşturulamadı.' });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, sortOrder, isActive, imageUrl, visibleGroups } = req.body;

    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data: {
        name,
        parentId: parentId ? parseInt(parentId) : null,
        sortOrder: parseInt(sortOrder) || 0,
        isActive,
        imageUrl,
        ...(visibleGroups !== undefined && { visibleGroups: groupList(visibleGroups) })
      }
    });
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: 'Güncelleme başarısız.' });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    // Çocukları var mı kontrol et
    const childrenCount = await prisma.category.count({ where: { parentId: parseInt(id) } });
    if (childrenCount > 0) {
      return res.status(400).json({ message: 'Alt kategorisi olan bir kategori silinemez.' });
    }
    
    await prisma.category.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Kategori silindi.' });
  } catch (error) {
    res.status(500).json({ message: 'Silme işlemi başarısız.' });
  }
};

export const reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body; // Array of { id, sortOrder }

    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'Geçersiz veri formatı.' });
    }

    const updates = categories.map(cat => 
      prisma.category.update({
        where: { id: parseInt(cat.id) },
        data: { sortOrder: parseInt(cat.sortOrder) }
      })
    );

    await prisma.$transaction(updates);
    res.json({ message: 'Sıralama güncellendi.' });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ message: 'Sıralama güncellenirken hata oluştu.' });
  }
};
