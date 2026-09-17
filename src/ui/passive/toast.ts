import { useCallback } from 'react';

import { ToastHost, ToastProvider, useToast as useToastService } from '../../components/toast';
import { useUiEmitterOptional } from '../mediator';

export { ToastHost, ToastProvider };

export function useToast() {
  const service = useToastService();
  const emit = useUiEmitterOptional();
  return useCallback((message: string) => {
    if (!emit) return service(message);
    return emit<void>({ type: 'toast.show', payload: [message] });
  }, [emit, service]);
}
