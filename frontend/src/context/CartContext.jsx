import React, { createContext, useContext, useState, useEffect } from 'react';
import { normalizeQty } from '../utils/format';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('akis_cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });
  
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('akis_cart', JSON.stringify(cart));
  }, [cart]);

  // product.price: bayiye özel net birim fiyat (TL, KDV hariç). Kesin tutar sipariş özetinde sunucudan hesaplanır.
  const addToCart = (product, quantity) => {
    setCart(prevCart => {
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
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId ? { ...item, quantity: normalizeQty(quantity, item) } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
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
