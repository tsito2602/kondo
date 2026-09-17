import { useEffect } from 'react';

import { confirmDeletion as confirmDeletionService } from '../../utils/confirm-deletion';
import { useUiEmitterOptional } from '../mediator';

let dispatch = null as ReturnType<typeof useUiEmitterOptional> | null;

export function ConfirmDeletionBridge() {
  const emit = useUiEmitterOptional();
  useEffect(() => {
    dispatch = emit;
    return () => { if (dispatch === emit) dispatch = null; };
  }, [emit]);
  return null;
}

export function confirmDeletion(title: string, message: string, onConfirm: () => void) {
  if (!dispatch) return confirmDeletionService(title, message, onConfirm);
  return dispatch<void>({ type: 'dialog.confirmDeletion', payload: [title, message, onConfirm] });
}
