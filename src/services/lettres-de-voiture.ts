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

export async function uploadPdfToStorage(documentNumber: string, pdfUri: string) {
  return uploadLocalFileToStorage(
    `lettresDeVoiture/${documentNumber}/document.pdf`,
    pdfUri,
    'application/pdf'
  );
}

export async function upsertLettreDeVoiture(payload: LettreDeVoiturePayload) {
  const documentRef = doc(db, COLLECTION_NAME, payload.documentNumber);
  const createdAt = new Date(payload.createdAtIso);

  await setDoc(
    documentRef,
    {
      ...payload,
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
