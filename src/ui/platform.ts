import { useMemo } from 'react';

import { useUiEmitter } from './mediator';

export type SharePayload = { message: string; title?: string; url?: string };
export type UiPickedFile = { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
export type UiDocumentSource = { uri?: string; bytes?: ArrayBuffer };
export type UiOpenDocument = { filename: string; contentType: string; load: () => Promise<UiDocumentSource> };
export type UiDownloadFile = { filename: string; contentType: string; bytes: ArrayBuffer };
export type UiPwaStatus = { standalone: boolean; updateAvailable: boolean; ios: boolean };
export type UiPwaUpdateResult = { activated: boolean; message: string };

export function useUiPlatform() {
  const emit = useUiEmitter('Platform');
  return useMemo(() => ({
    openURL: (url: string) => emit<Promise<unknown>>({ type: 'platform.openURL', payload: [url] }),
    share: (payload: SharePayload) => emit<Promise<unknown>>({ type: 'platform.share', payload: [payload] }),
    copyText: (value: string) => emit<Promise<boolean>>({ type: 'platform.copyText', payload: [value] }),
    uuid: () => emit<string>({ type: 'platform.uuid' }),
    pickDocuments: () => emit<Promise<UiPickedFile[] | null>>({ type: 'platform.pickDocuments' }),
    downloadFile: (file: UiDownloadFile) => emit<void>({ type: 'platform.downloadFile', payload: [file] }),
    openDocument: (document: UiOpenDocument) => emit<Promise<void>>({ type: 'platform.openDocument', payload: [document] }),
    processCoverImage: (file: UiPickedFile) => emit<Promise<string>>({ type: 'platform.processCoverImage', payload: [file] }),
    confirmDiscard: () => emit<Promise<boolean>>({ type: 'platform.confirmDiscard' }),
    ensureOfflineReady: () => emit<Promise<void>>({ type: 'platform.ensureOfflineReady' }),
    persistStorage: () => emit<Promise<boolean>>({ type: 'platform.persistStorage' }),
    getPwaStatus: () => emit<Promise<UiPwaStatus>>({ type: 'platform.getPwaStatus' }),
    installPwa: () => emit<Promise<boolean>>({ type: 'platform.installPwa' }),
    activatePwaUpdate: (pendingCount: number) => emit<Promise<UiPwaUpdateResult>>({ type: 'platform.activatePwaUpdate', payload: [pendingCount] }),
  }), [emit]);
}
