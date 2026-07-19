/* eslint-disable @typescript-eslint/no-require-imports */

export const repo: {
  LOCK_TTL_MINUTI: number;
  acquireLock: (notionPageId: string, schedaNumero: string | null, op: string) => Promise<{ acquired: boolean; record?: Record<string, unknown>; lockedBy?: string; lockScadenza?: string }>;
  releaseLock: (notionPageId: string, op: string) => Promise<boolean>;
  holdsLock: (notionPageId: string, op: string) => Promise<boolean>;
  upsertProgress: (args: { notionPageId: string; schedaNumero?: string | null; operatore: string; annotazioni: unknown; fotoCount: number }) => Promise<Record<string, unknown>>;
  finalize: (args: { notionPageId: string; operatore: string; pdfDriveId: string; pdfDriveUrl: string }) => Promise<Record<string, unknown>>;
  findByNotionPageId: (notionPageId: string) => Promise<Record<string, unknown> | null>;
  findBySchedaNumero: (scheda: string) => Promise<Record<string, unknown> | null>;
  listInSospeso: () => Promise<Record<string, unknown>[]>;
  addFoto: (args: { notionPageId: string; schedaNumero?: string | null; driveId: string; driveUrl: string; operatore: string }) => Promise<Record<string, unknown>>;
  removeFoto: (fotoId: string) => Promise<Record<string, unknown> | null>;
  listFoto: (notionPageId: string) => Promise<Record<string, unknown>[]>;
  appendLog: (args: { schedaNumero: string; operatore?: string; azione: string; dettaglio?: unknown }) => Promise<void>;
  getLog: (schedaNumero: string) => Promise<Record<string, unknown>[]>;
  setNotionSyncOk: (notionPageId: string, ok: boolean) => Promise<void>;
  listNotionSyncFalliti: () => Promise<Record<string, unknown>[]>;
  deleteScheda: (notionPageId: string) => Promise<boolean>;
} = require("../../verifiche-backend/verificheRepository");

export const notionSvc: {
  aggiornaStatoOdp: (pageId: string, opts: { pdfBuffer?: Buffer; pdfFilename?: string }) => Promise<void>;
  getPdfOriginale: (pageId: string) => Promise<Buffer | null>;
} = require("../../verifiche-backend/notionService");

export const driveSvc: {
  uploadVerificaPdf: (auth: unknown, pdf: Buffer, scheda: string) => Promise<{ id: string; webViewLink: string }>;
  uploadFotoVerifica: (auth: unknown, jpeg: Buffer, scheda: string, prog: number) => Promise<{ id: string; webViewLink: string }>;
  downloadFile: (auth: unknown, fileId: string) => Promise<Buffer>;
  deleteFile: (auth: unknown, fileId: string) => Promise<void>;
} = require("../../verifiche-backend/driveService");

// Notion page IDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export const SCHEDA_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
