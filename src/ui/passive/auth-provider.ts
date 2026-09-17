import { useMemo } from 'react';

import { AuthProvider, useAuth as useAuthService } from '../../auth/auth-provider';
import { useUiEmitterOptional } from '../mediator';

export { AuthProvider };

export function useAuth() {
  const service = useAuthService();
  const emit = useUiEmitterOptional();
  const commands = useMemo(() => emit ? {
    startDemo: () => emit<void>({ type: 'auth.startDemo' }),
    exitDemo: () => emit<void>({ type: 'auth.exitDemo' }),
    request: <T,>(path: string, init?: RequestInit) => emit<Promise<T>>({ type: 'auth.request', payload: [path, init] }),
    requestRaw: (path: string, init?: RequestInit) => emit<Promise<Response>>({ type: 'auth.requestRaw', payload: [path, init] }),
    signIn: () => emit<Promise<void>>({ type: 'auth.signIn' }),
    signOut: () => emit<Promise<void>>({ type: 'auth.signOut' }),
    updateProfile: (name: string) => emit<Promise<void>>({ type: 'auth.updateProfile', payload: [name] }),
  } : null, [emit]);
  return useMemo(() => commands ? ({ ...service, ...commands } satisfies typeof service) : service, [commands, service]);
}
