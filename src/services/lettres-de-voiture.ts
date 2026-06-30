import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import * as FileSystem from 'expo-file-system/legacy';

import { app, db } from '@/firebase';

const COLLECTION_NAME = 'lettresDeVoiture';
const FIELD_QUEUE_DIR_NAME = 'noha-field-queue';
const FIELD_QUEUE_FILE_NAME = 'pending.json';

export type LettreDeVoitureStatus = 'draft' | 'pdf_generated';

export type LettreDeVoiturePayload = {
  documentNumber: string;
  createdAtIso: string;
  expediteur: string;
  destinataire: string;
  lieuChargement: string;
  lieuLivraison: string;
  marchandise: string;
  reference: string;
  quantite: string;
  observations: string;
  status: LettreDeVoitureStatus;
  media: {
    hasPhoto: boolean;
    hasSignature: boolean;
    photoLocalUri: string | null;
    photoPath: string | null;
    photoUrl: string | null;
    signatureDataUrl: string | null;
    signaturePath: string | null;
    signatureUrl: string | null;
    pdfLocalUri: string | null;
    pdfPath: string | null;
    pdfUrl: string | null;
  };
  storageError: string | null;
};

export type LettreDeVoitureRecord = LettreDeVoiturePayload & {
  id: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type PendingFieldDocument = LettreDeVoiturePayload & {
  queuedAtIso: string;
  lastAttemptAtIso: string | null;
  attemptCount: number;
};

export type FieldSyncSummary = {
  attempted: number;
  synced: number;
  pending: number;
  errors: string[];
};

type TimestampLike = {
  toDate: () => Date;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as TimestampLike).toDate === 'function'
  );
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (isTimestampLike(value)) {
    return value.toDate();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeMedia(value: unknown): LettreDeVoiturePayload['media'] {
  if (typeof value !== 'object' || value === null) {
    return {
      hasPhoto: false,
      hasSignature: false,
      photoLocalUri: null,
      photoPath: null,
      photoUrl: null,
      signatureDataUrl: null,
      signaturePath: null,
      signatureUrl: null,
      pdfLocalUri: null,
      pdfPath: null,
      pdfUrl: null,
    };
  }

  const media = value as Record<string, unknown>;

  return {
    hasPhoto: media.hasPhoto === true,
    hasSignature: media.hasSignature === true,
    photoLocalUri: typeof media.photoLocalUri === 'string' ? media.photoLocalUri : null,
    photoPath: typeof media.photoPath === 'string' ? media.photoPath : null,
    photoUrl: typeof media.photoUrl === 'string' ? media.photoUrl : null,
    signatureDataUrl: typeof media.signatureDataUrl === 'string' ? media.signatureDataUrl : null,
    signaturePath: typeof media.signaturePath === 'string' ? media.signaturePath : null,
    signatureUrl: typeof media.signatureUrl === 'string' ? media.signatureUrl : null,
    pdfLocalUri: typeof media.pdfLocalUri === 'string' ? media.pdfLocalUri : null,
    pdfPath: typeof media.pdfPath === 'string' ? media.pdfPath : null,
    pdfUrl: typeof media.pdfUrl === 'string' ? media.pdfUrl : null,
  };
}

function normalizeStatus(value: unknown): LettreDeVoitureStatus {
  return value === 'pdf_generated' ? 'pdf_generated' : 'draft';
}

function fromFirestoreDoc(id: string, data: DocumentData): LettreDeVoitureRecord {
  return {
    id,
    documentNumber: normalizeString(data.documentNumber) || id,
    createdAtIso: normalizeString(data.createdAtIso),
    expediteur: normalizeString(data.expediteur),
    destinataire: normalizeString(data.destinataire),
    lieuChargement: normalizeString(data.lieuChargement),
    lieuLivraison: normalizeString(data.lieuLivraison),
    marchandise: normalizeString(data.marchandise),
    reference: normalizeString(data.reference),
    quantite: normalizeString(data.quantite),
    observations: normalizeString(data.observations),
    status: normalizeStatus(data.status),
    media: normalizeMedia(data.media),
    storageError: normalizeString(data.storageError) || null,
    createdAt: readDate(data.createdAt) ?? readDate(data.createdAtIso),
    updatedAt: readDate(data.updatedAt),
  };
}

function toLettrePayload(payload: LettreDeVoiturePayload): LettreDeVoiturePayload {
  return {
    documentNumber: payload.documentNumber,
    createdAtIso: payload.createdAtIso,
    expediteur: payload.expediteur,
    destinataire: payload.destinataire,
    lieuChargement: payload.lieuChargement,
    lieuLivraison: payload.lieuLivraison,
    marchandise: payload.marchandise,
    reference: payload.reference,
    quantite: payload.quantite,
    observations: payload.observations,
    status: payload.status,
    media: {
      hasPhoto: payload.media.hasPhoto,
      hasSignature: payload.media.hasSignature,
      photoLocalUri: payload.media.photoLocalUri,
      photoPath: payload.media.photoPath,
      photoUrl: payload.media.photoUrl,
      signatureDataUrl: payload.media.signatureDataUrl,
      signaturePath: payload.media.signaturePath,
      signatureUrl: payload.media.signatureUrl,
      pdfLocalUri: payload.media.pdfLocalUri,
      pdfPath: payload.media.pdfPath,
      pdfUrl: payload.media.pdfUrl,
    },
    storageError: payload.storageError,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erreur inconnue.';
}

function getStorageBucket() {
  const bucket =
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? app.options.storageBucket;

  if (!bucket) {
    throw new Error('Bucket Firebase Storage non configuré.');
  }

  return bucket;
}

function getPublicStorageUrl(bucket: string, storagePath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket
  )}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function getUploadUrl(bucket: string, storagePath: string) {
  const params = new URLSearchParams({
    uploadType: 'media',
    name: storagePath,
  });

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket
  )}/o?${params.toString()}`;
}

function readStorageError(status: number, body: string, bucket: string) {
  let message = body;

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message ?? body;
  } catch {
    message = body;
  }

  if (status === 404) {
    return `Bucket Storage introuvable (${bucket}). Active Storage ou corrige EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET. Réponse: ${message}`;
  }

  if (status === 401 || status === 403) {
    return `Storage refuse l'accès (${status}). Vérifie les règles Firebase Storage. Réponse: ${message}`;
  }

  return `Storage HTTP ${status}: ${message}`;
}

async function assertReadableFile(fileUri: string) {
  const info = await FileSystem.getInfoAsync(fileUri);

  if (!info.exists) {
    throw new Error(`Fichier local introuvable: ${fileUri}`);
  }
}

async function uploadLocalFileToStorage(
  storagePath: string,
  fileUri: string,
  contentType: string
) {
  const bucket = getStorageBucket();
  await assertReadableFile(fileUri);

  const result = await FileSystem.uploadAsync(getUploadUrl(bucket, storagePath), fileUri, {
    headers: {
      'Content-Type': contentType,
    },
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(readStorageError(result.status, result.body, bucket));
  }

  return {
    localUri: fileUri,
    path: storagePath,
    url: getPublicStorageUrl(bucket, storagePath),
  };
}

function parseSignatureDataUrl(signatureDataUrl: string) {
  const match = signatureDataUrl.match(/^data:(image\/png|image\/jpeg)?;base64,(.*)$/);

  if (!match) {
    throw new Error('Format de signature invalide.');
  }

  return {
    base64: match[2],
    contentType: match[1] ?? 'image/png',
  };
}

async function writeSignatureToCache(documentNumber: string, signatureDataUrl: string) {
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('Cache local indisponible pour préparer la signature.');
  }

  const { base64 } = parseSignatureDataUrl(signatureDataUrl);
  const fileUri = `${cacheDirectory}${documentNumber}-signature.png`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return fileUri;
}

function sanitizeCacheFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function writePdfToCache(documentNumber: string, pdfBase64: string) {
  const cacheDirectory = FileSystem.cacheDirectory;

  if (!cacheDirectory) {
    throw new Error('Cache local indisponible pour préparer le PDF.');
  }

  const fileUri = `${cacheDirectory}${sanitizeCacheFileName(documentNumber)}-document.pdf`;

  await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await assertReadableFile(fileUri);

  return fileUri;
}

export async function preparePdfForStorage(
  documentNumber: string,
  pdfUri: string,
  pdfBase64?: string
) {
  return pdfBase64 ? writePdfToCache(documentNumber, pdfBase64) : pdfUri;
}

function getFieldQueueBaseDirectory() {
  const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

  if (!directory) {
    throw new Error('Stockage local indisponible pour le mode terrain.');
  }

  return `${directory}${FIELD_QUEUE_DIR_NAME}/`;
}

function getFieldDocumentDirectory(documentNumber: string) {
  return `${getFieldQueueBaseDirectory()}${sanitizeCacheFileName(documentNumber)}/`;
}

function getFieldDocumentFileUri(documentNumber: string) {
  return `${getFieldDocumentDirectory(documentNumber)}${FIELD_QUEUE_FILE_NAME}`;
}

async function ensureDirectory(directoryUri: string) {
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
}

async function copyLocalFileForQueue(sourceUri: string, destinationUri: string) {
  if (!sourceUri.startsWith('file://')) {
    return sourceUri;
  }

  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);

  if (!sourceInfo.exists) {
    return sourceUri;
  }

  await FileSystem.copyAsync({
    from: sourceUri,
    to: destinationUri,
  });

  return destinationUri;
}

async function persistFieldMedia(payload: LettreDeVoiturePayload) {
  const documentDirectory = getFieldDocumentDirectory(payload.documentNumber);
  await ensureDirectory(documentDirectory);

  const media = { ...payload.media };

  if (media.photoLocalUri) {
    media.photoLocalUri = await copyLocalFileForQueue(
      media.photoLocalUri,
      `${documentDirectory}photo.jpg`
    );
  }

  if (media.pdfLocalUri) {
    media.pdfLocalUri = await copyLocalFileForQueue(
      media.pdfLocalUri,
      `${documentDirectory}document.pdf`
    );
  }

  return {
    ...toLettrePayload(payload),
    media,
  };
}

function parsePendingFieldDocument(contents: string): PendingFieldDocument {
  const parsed = JSON.parse(contents) as Partial<PendingFieldDocument>;
  const documentNumber = normalizeString(parsed.documentNumber);

  if (!documentNumber) {
    throw new Error('Document terrain local invalide.');
  }

  const attemptCount =
    typeof parsed.attemptCount === 'number' && Number.isFinite(parsed.attemptCount)
      ? parsed.attemptCount
      : 0;

  return {
    documentNumber,
    createdAtIso: normalizeString(parsed.createdAtIso),
    expediteur: normalizeString(parsed.expediteur),
    destinataire: normalizeString(parsed.destinataire),
    lieuChargement: normalizeString(parsed.lieuChargement),
    lieuLivraison: normalizeString(parsed.lieuLivraison),
    marchandise: normalizeString(parsed.marchandise),
    reference: normalizeString(parsed.reference),
    quantite: normalizeString(parsed.quantite),
    observations: normalizeString(parsed.observations),
    status: normalizeStatus(parsed.status),
    media: normalizeMedia(parsed.media),
    storageError: normalizeString(parsed.storageError) || null,
    queuedAtIso: normalizeString(parsed.queuedAtIso) || new Date().toISOString(),
    lastAttemptAtIso: normalizeString(parsed.lastAttemptAtIso) || null,
    attemptCount,
  };
}

async function writePendingFieldDocument(document: PendingFieldDocument) {
  const documentDirectory = getFieldDocumentDirectory(document.documentNumber);
  await ensureDirectory(documentDirectory);
  await FileSystem.writeAsStringAsync(
    getFieldDocumentFileUri(document.documentNumber),
    JSON.stringify(document, null, 2)
  );
}

export async function enqueueFieldDocument(payload: LettreDeVoiturePayload) {
  const existingDocument = await getPendingFieldDocument(payload.documentNumber);
  const queuedAtIso = existingDocument?.queuedAtIso ?? new Date().toISOString();
  const persistedPayload = await persistFieldMedia(payload);
  const pendingDocument: PendingFieldDocument = {
    ...persistedPayload,
    queuedAtIso,
    lastAttemptAtIso: existingDocument?.lastAttemptAtIso ?? null,
    attemptCount: existingDocument?.attemptCount ?? 0,
  };

  await writePendingFieldDocument(pendingDocument);

  return pendingDocument;
}

export async function getPendingFieldDocument(documentNumber: string) {
  try {
    const contents = await FileSystem.readAsStringAsync(getFieldDocumentFileUri(documentNumber));
    return parsePendingFieldDocument(contents);
  } catch {
    return null;
  }
}

export async function listPendingFieldDocuments() {
  try {
    const baseDirectory = getFieldQueueBaseDirectory();
    const queueInfo = await FileSystem.getInfoAsync(baseDirectory);

    if (!queueInfo.exists) {
      return [];
    }

    const entries = await FileSystem.readDirectoryAsync(baseDirectory);
    const documents = await Promise.all(
      entries.map(async (entry) => {
        try {
          const contents = await FileSystem.readAsStringAsync(
            `${baseDirectory}${entry}/${FIELD_QUEUE_FILE_NAME}`
          );
          return parsePendingFieldDocument(contents);
        } catch {
          return null;
        }
      })
    );

    return documents
      .filter((document): document is PendingFieldDocument => Boolean(document))
      .sort((a, b) => b.queuedAtIso.localeCompare(a.queuedAtIso));
  } catch {
    return [];
  }
}

export async function removePendingFieldDocument(documentNumber: string) {
  await FileSystem.deleteAsync(getFieldDocumentDirectory(documentNumber), { idempotent: true });
}

async function uploadMissingFieldMedia(payload: LettreDeVoiturePayload) {
  const media = { ...payload.media };
  const errors: string[] = [];

  if (media.hasPhoto && !media.photoUrl) {
    if (media.photoLocalUri) {
      try {
        const uploadedPhoto = await uploadPhotoToStorage(payload.documentNumber, media.photoLocalUri);
        media.photoLocalUri = uploadedPhoto.localUri;
        media.photoPath = uploadedPhoto.path;
        media.photoUrl = uploadedPhoto.url;
      } catch (error) {
        errors.push(`photo: ${getErrorMessage(error)}`);
      }
    } else {
      errors.push('photo: fichier local absent');
    }
  }

  if (media.hasSignature && !media.signatureUrl) {
    if (media.signatureDataUrl) {
      try {
        const uploadedSignature = await uploadSignatureToStorage(
          payload.documentNumber,
          media.signatureDataUrl
        );
        media.signaturePath = uploadedSignature.path;
        media.signatureUrl = uploadedSignature.url;
      } catch (error) {
        errors.push(`signature: ${getErrorMessage(error)}`);
      }
    } else {
      errors.push('signature: donnée locale absente');
    }
  }

  if (payload.status === 'pdf_generated' && !media.pdfUrl) {
    if (media.pdfLocalUri) {
      try {
        const uploadedPdf = await uploadPdfToStorage(payload.documentNumber, media.pdfLocalUri);
        media.pdfLocalUri = uploadedPdf.localUri;
        media.pdfPath = uploadedPdf.path;
        media.pdfUrl = uploadedPdf.url;
      } catch (error) {
        errors.push(`PDF: ${getErrorMessage(error)}`);
      }
    } else {
      errors.push('PDF: fichier local absent');
    }
  }

  return {
    media,
    storageError: errors.length ? `Storage incomplet (${errors.join(' | ')})` : null,
  };
}

export async function syncPendingFieldDocument(documentNumber: string) {
  const pendingDocument = await getPendingFieldDocument(documentNumber);

  if (!pendingDocument) {
    throw new Error('Aucun document terrain en attente pour cette référence.');
  }

  const lastAttemptAtIso = new Date().toISOString();
  const attemptCount = pendingDocument.attemptCount + 1;

  try {
    const { media, storageError } = await uploadMissingFieldMedia(pendingDocument);
    const updatedPayload: LettreDeVoiturePayload = {
      ...toLettrePayload(pendingDocument),
      media,
      storageError,
    };

    await upsertLettreDeVoiture(updatedPayload);

    const updatedDocument: PendingFieldDocument = {
      ...updatedPayload,
      queuedAtIso: pendingDocument.queuedAtIso,
      lastAttemptAtIso,
      attemptCount,
    };

    if (!storageError) {
      await removePendingFieldDocument(documentNumber);

      return {
        document: updatedDocument,
        storageError: null,
        synced: true,
      };
    }

    await writePendingFieldDocument(updatedDocument);

    return {
      document: updatedDocument,
      storageError,
      synced: false,
    };
  } catch (error) {
    const updatedDocument: PendingFieldDocument = {
      ...pendingDocument,
      storageError: `Synchronisation en attente (${getErrorMessage(error)})`,
      lastAttemptAtIso,
      attemptCount,
    };

    await writePendingFieldDocument(updatedDocument);

    return {
      document: updatedDocument,
      storageError: updatedDocument.storageError,
      synced: false,
    };
  }
}

export async function syncAllPendingFieldDocuments(): Promise<FieldSyncSummary> {
  const pendingDocuments = await listPendingFieldDocuments();
  const summary: FieldSyncSummary = {
    attempted: pendingDocuments.length,
    synced: 0,
    pending: 0,
    errors: [],
  };

  for (const document of pendingDocuments) {
    const result = await syncPendingFieldDocument(document.documentNumber);

    if (result.synced) {
      summary.synced += 1;
    } else {
      summary.pending += 1;

      if (result.storageError) {
        summary.errors.push(`${document.documentNumber}: ${result.storageError}`);
      }
    }
  }

  return summary;
}

export async function uploadPhotoToStorage(documentNumber: string, photoUri: string) {
  return uploadLocalFileToStorage(
    `lettresDeVoiture/${documentNumber}/photo.jpg`,
    photoUri,
    'image/jpeg'
  );
}

export async function uploadSignatureToStorage(documentNumber: string, signatureDataUrl: string) {
  const signatureFileUri = await writeSignatureToCache(documentNumber, signatureDataUrl);

  return uploadLocalFileToStorage(
    `lettresDeVoiture/${documentNumber}/signature.png`,
    signatureFileUri,
    'image/png'
  );
}

export async function uploadPdfToStorage(
  documentNumber: string,
  pdfUri: string,
  pdfBase64?: string
) {
  const uploadUri = await preparePdfForStorage(documentNumber, pdfUri, pdfBase64);

  return uploadLocalFileToStorage(
    `lettresDeVoiture/${documentNumber}/document.pdf`,
    uploadUri,
    'application/pdf'
  );
}

export async function upsertLettreDeVoiture(payload: LettreDeVoiturePayload) {
  const documentRef = doc(db, COLLECTION_NAME, payload.documentNumber);
  const createdAt = new Date(payload.createdAtIso);
  const lettrePayload = toLettrePayload(payload);

  await setDoc(
    documentRef,
    {
      ...lettrePayload,
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return documentRef.id;
}

export function subscribeToLettresDeVoiture(
  onNext: (records: LettreDeVoitureRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const lettresQuery = query(
    collection(db, COLLECTION_NAME),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(
    lettresQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((documentSnapshot) => fromFirestoreDoc(documentSnapshot.id, documentSnapshot.data())));
    },
    (error) => {
      onError?.(error);
    }
  );
}
