import { useCart } from '../context/CartContext';
import api, { errorMessage } from '../services/api';

/**
 * Geçmiş siparişi güncel bayi fiyatlarıyla sepete ekler.
 * Satıştan kalkmış, fiyatı gizli veya stokta olmayan ürünler atlanır ve raporlanır.
 */
const useReorder = () => {
  const { addToCart, setIsCartOpen } = useCart();

  return async (order) => {
    const items = order.items.filter((i) => i.status === 'APPROVED' || order.status === 'PENDING');
    try {
      const res = await api.post('/products/resolve-skus', { skus: items.map((i) => i.product.sku) });
      const bySku = new Map(res.data.found.map((p) => [p.sku, p]));
      const skipped = [];
      let added = 0;

      for (const item of items) {
        const product = bySku.get(item.product.sku);
        if (!product || product.priceHidden || !product.inStock || product.requiresVariant) {
          skipped.push(item.variantLabel ? `${item.product.parent?.name || item.product.name} (${item.variantLabel})` : item.product.name);
          continue;
        }
        addToCart({ ...product, price: product.netPrice }, item.quantity);
        added++;
      }

      if (added > 0) setIsCartOpen(true);
      return { added, skipped };
    } catch (error) {
      throw new Error(errorMessage(error, 'Ürünler sepete eklenemedi.'), { cause: error });
    }
  };
};

export default useReorder;
