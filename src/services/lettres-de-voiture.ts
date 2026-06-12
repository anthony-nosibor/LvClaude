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
import {
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
  type UploadMetadata,
} from 'firebase/storage';

import { db } from '@/firebase';
import { storage } from '@/firebase';

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

async function uriToBlob(uri: string) {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Impossible de lire le fichier local: ${response.status}`);
  }

  return response.blob();
}

async function uploadAndReadUrl(
  storagePath: string,
  data: Blob | string,
  metadata: UploadMetadata,
  format?: 'base64' | 'data_url'
) {
  const storageRef = ref(storage, storagePath);

  if (typeof data === 'string') {
    await uploadString(storageRef, data, format, metadata);
  } else {
    await uploadBytes(storageRef, data, metadata);
  }

  return {
    path: storagePath,
    url: await getDownloadURL(storageRef),
  };
}

export async function uploadPhotoToStorage(documentNumber: string, photoUri: string) {
  const photoBlob = await uriToBlob(photoUri);

  return uploadAndReadUrl(
    `lettresDeVoiture/${documentNumber}/photo.jpg`,
    photoBlob,
    { contentType: 'image/jpeg' }
  );
}

export async function uploadSignatureToStorage(documentNumber: string, signatureDataUrl: string) {
  return uploadAndReadUrl(
    `lettresDeVoiture/${documentNumber}/signature.png`,
    signatureDataUrl,
    { contentType: 'image/png' },
    'data_url'
  );
}

export async function uploadPdfToStorage(documentNumber: string, pdfBase64: string) {
  return uploadAndReadUrl(
    `lettresDeVoiture/${documentNumber}/document.pdf`,
    pdfBase64,
    { contentType: 'application/pdf' },
    'base64'
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
