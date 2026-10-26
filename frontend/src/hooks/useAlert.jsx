import React, { useCallback, useState } from 'react';
import CustomAlert from '../components/CustomAlert';

/**
 * CustomAlert'i tek satırda kullanmak için:
 *   const { alertElement, showAlert, confirm } = useAlert();
 *   showAlert({ type: 'success', title: '...', message: '...' });
 *   if (await confirm({ title: 'Emin misiniz?', message: '...' })) { ... }
 */
const useAlert = () => {
  const [state, setState] = useState({ isOpen: false });

  const close = useCallback(() => setState((prev) => ({ ...prev, isOpen: false })), []);

  const showAlert = useCallback(({ type = 'info', title, message, confirmText, onConfirm }) => {
    setState({ isOpen: true, type, title, message, confirmText, onConfirm });
  }, []);

  const confirm = useCallback(({ type = 'warning', title, message, confirmText = 'Evet', cancelText = 'Vazgeç' }) =>
    new Promise((resolve) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; resolve(value); } };
      setState({
        isOpen: true, type, title, message, confirmText, cancelText,
        onConfirm: () => settle(true),
        onCancel: () => settle(false),
        onClose: () => settle(false),
      });
    }), []);

  const alertElement = (
    <CustomAlert
      isOpen={state.isOpen}
      type={state.type}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      onConfirm={state.onConfirm}
      onCancel={state.onCancel}
      onClose={() => { state.onClose?.(); close(); }}
    />
  );

  return { alertElement, showAlert, confirm };
};

export default useAlert;
