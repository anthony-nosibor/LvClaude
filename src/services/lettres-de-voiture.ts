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

import { db } from '@/firebase';

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
    signatureDataUrl: string | null;
  };
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
      signatureDataUrl: null,
    };
  }

  const media = value as Record<string, unknown>;

  return {
    hasPhoto: media.hasPhoto === true,
    hasSignature: media.hasSignature === true,
    photoLocalUri: typeof media.photoLocalUri === 'string' ? media.photoLocalUri : null,
    signatureDataUrl: typeof media.signatureDataUrl === 'string' ? media.signatureDataUrl : null,
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
    createdAt: readDate(data.createdAt) ?? readDate(data.createdAtIso),
    updatedAt: readDate(data.updatedAt),
  };
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
