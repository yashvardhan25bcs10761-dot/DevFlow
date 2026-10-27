import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const icons = { success: CheckCircle2, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => {
      if (current.some((toast) => toast.message === message)) return current;
      return [...current.slice(-3), { id, message, type }];
    });
    window.setTimeout(() => dismissToast(id), 5000);
  }, [dismissToast]);

  useEffect(() => {
    const onToast = (event) => addToast(event.detail?.message, event.detail?.type || 'info');
    window.addEventListener('devflow:toast', onToast);
    return () => window.removeEventListener('devflow:toast', onToast);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info;
          return (
            <div className={`toast toast-${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
              <Icon size={17} aria-hidden="true" />
              <span>{toast.message}</span>
              <button type="button" className="icon-button toast-dismiss" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
