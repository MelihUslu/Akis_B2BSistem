import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const TenantContext = createContext(null);

/**
 * Alt alan adındaki firmanın marka bilgisi (ad, logo) ve erişim durumu.
 * Firma bulunamazsa `notFound` true olur.
 */
export const TenantProvider = ({ children }) => {
  const [state, setState] = useState({ loading: true, tenant: null, notFound: false });

  const refresh = () =>
    api.get('/tenant/public')
      .then((res) => {
        setState({ loading: false, tenant: res.data, notFound: false });
        document.title = `${res.data.name} · B2B Portal`;
      })
      .catch((err) => setState({ loading: false, tenant: null, notFound: err.response?.status === 404 }));

  useEffect(() => { refresh(); }, []);

  return <TenantContext.Provider value={{ ...state, refresh }}>{children}</TenantContext.Provider>;
};

export const useTenant = () => useContext(TenantContext) || { tenant: null };
