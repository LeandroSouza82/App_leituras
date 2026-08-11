import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import './Toast.css';

export const useToast = () => {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
};

const Toast = ({ message, type = 'success', onClose, duration = 2800 }) => {
  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) {
    return null;
  }

  const isError = type === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div className={`toast toast-${isError ? 'error' : 'success'}`} role="status" aria-live="polite">
      <Icon size={20} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Fechar notificação">
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
