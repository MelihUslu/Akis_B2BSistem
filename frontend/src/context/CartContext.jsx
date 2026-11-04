import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { normalizeQty } from '../utils/format';
import { useAuth } from './AuthContext';
import { getActing, ACTING_EVENT } from '../utils/acting';
import api from '../services/api';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

/**
 * Sepet kullanıcıya özeldir: tarayıcıda "akis_cart:<kullanıcı>:<kapsam>" anahtarında tutulur, çıkışta silinir.
 * Bayinin kendi sepeti sunucuya da yazılır (telefonda başlanan sepet bilgisayarda devam eder; yeni olan geçerli).
 * Bayi adına işlem yapan yönetici / plasiyerin her bayi için ayrı, yalnızca bu tarayıcıda duran sepeti olur.
 */
const scopeOf = () => {
  const acting = getActing();
  return acting ? `act:${acting.companyId}` : 'own';
};
const keyOf = (userId, scope) => `akis_cart:${userId}:${scope}`;
const readLocal = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && Array.isArray(v.items) ? v : { items: [], updatedAt: 0 };
  } catch {
    return { items: [], updatedAt: 0 };
  }
};
const writeLocal = (key, items) => {
  try { localStorage.setItem(key, JSON.stringify({ items, updatedAt: Date.now() })); } catch { /* gizli sekme */ }
};
const clearUserCarts = (userId) => {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`akis_cart:${userId}:`)).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('akis_cart'); // eski sürümün ortak anahtarı
  } catch { /* gizli sekme */ }
};

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [scope, setScope] = useState(scopeOf);
  const key = user ? keyOf(user.id, scope) : null;
  const syncServer = Boolean(user) && user.role === 'BAYI' && scope === 'own';
  // Sepet hangi anahtara aitse onunla birlikte tutulur; anahtar değişince (çıkış, başka kullanıcı, bayi adına mod)
  // o anahtarın sepeti render sırasında yüklenir
  const [state, setState] = useState(() => ({ key, items: key ? readLocal(key).items : [] }));
  if (state.key !== key) setState({ key, items: key ? readLocal(key).items : [] });
  const cart = state.key === key ? state.items : [];
  const setCart = (fn) => setState((prev) => ({ key: prev.key, items: typeof fn === 'function' ? fn(prev.items) : fn }));
  const [isCartOpen, setIsCartOpen] = useState(false);
  const loadedKey = useRef(key);
  const saveTimer = useRef(null);
  const lastUser = useRef(user?.id);

  // Bayi adına moduna girip çıkınca sepet kapsamı değişir
  useEffect(() => {
    const onChange = () => setScope(scopeOf());
    window.addEventListener(ACTING_EVENT, onChange);
    return () => window.removeEventListener(ACTING_EVENT, onChange);
  }, []);

  // Çıkışta / kullanıcı değişince önceki kişinin sepeti tarayıcıdan silinir. Bayinin kendi sepetinde sunucudaki
  // kayıt daha yeniyse (başka cihazda güncellendi) o kullanılır.
  useEffect(() => {
    if (lastUser.current && lastUser.current !== user?.id) clearUserCarts(lastUser.current);
    lastUser.current = user?.id;
    loadedKey.current = key;
    if (!key || !syncServer) return undefined;
    const localAt = readLocal(key).updatedAt;
    let cancelled = false;
    api.get('/cart').then(({ data }) => {
      if (cancelled || loadedKey.current !== key) return;
      const serverAt = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
      if (serverAt > localAt && Array.isArray(data.items)) {
        setState({ key, items: data.items });
        writeLocal(key, data.items);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [key, syncServer, user?.id]);

  const persist = (items) => {
    if (!key) return;
    writeLocal(key, items);
    if (!syncServer) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { api.put('/cart', { items }).catch(() => {}); }, 800);
  };

  const update = (fn) => setCart((prev) => {
    const next = fn(prev);
    persist(next);
    return next;
  });

  // product.price: bayiye özel net birim fiyat (TL, KDV hariç). Kesin tutar sipariş özetinde sunucudan hesaplanır.
  const addToCart = (product, quantity) => {
    update(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      const qty = parseInt(quantity);

      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: normalizeQty(item.quantity + qty, item) }
            : item
        );
      }
      // parentName / variantLabel: varyantlı ürünlerde ana ürün adı ve seçim ("Gramaj: 1 kg · Ambalaj: Kutu")
      const { id, name, sku, images, unit, moq, stepQuantity, vatRate, price, parentName, variantLabel } = product;
      return [...prevCart, { id, name: parentName || name, variantLabel, sku, images, unit, moq, stepQuantity, vatRate, price, quantity: normalizeQty(qty, product) }];
    });
  };

  const removeFromCart = (productId) => {
    update(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    update(prevCart =>
      prevCart.map(item =>
        item.id === productId ? { ...item, quantity: normalizeQty(quantity, item) } : item
      )
    );
  };

  const clearCart = () => {
    update(() => []);
  };

  const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const cartVat = cart.reduce((total, item) => total + (item.price * item.quantity * ((item.vatRate ?? 20) / 100)), 0);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartTotal,
      cartVat,
      cartCount,
      isCartOpen,
      setIsCartOpen
    }}>
      {children}
    </CartContext.Provider>
  );
};
