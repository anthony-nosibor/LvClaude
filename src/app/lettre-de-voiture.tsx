import React, { useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraView } from 'expo-camera';
import * as Print from 'expo-print';
import SignatureView from 'react-native-signature-canvas';

import { BrandColors } from '@/constants/brand';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  uploadPdfToStorage,
  uploadPhotoToStorage,
  uploadSignatureToStorage,
  upsertLettreDeVoiture,
  type LettreDeVoitureStatus,
} from '@/services/lettres-de-voiture';

const steps = [
  { title: 'Parties', caption: 'Expéditeur et destinataire' },
  { title: 'Trajet', caption: 'Chargement et livraison' },
  { title: 'Marchandise', caption: 'Contenu transporté' },
  { title: 'Photo', caption: 'Justificatif terrain' },
  { title: 'Signature', caption: 'Validation client' },
  { title: 'PDF', caption: 'Document final' },
] as const;

const MEDIA_UPLOAD_TIMEOUT_MS = 12000;
const PDF_GENERATION_TIMEOUT_MS = 30000;
const PDF_FALLBACK_TIMEOUT_MS = 15000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type UploadedMedia = {
  photoPath: string | null;
  photoUrl: string | null;
  signaturePath: string | null;
  signatureUrl: string | null;
  pdfLocalUri: string | null;
  pdfPath: string | null;
  pdfUrl: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Une erreur inconnue a bloqué la sauvegarde Firebase.";
}

function appendStorageError(currentError: string | null, nextError: string) {
  return currentError ? `${currentError} | ${nextError}` : nextError;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'quiet' && styles.quietButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text
        style={[
          styles.actionButtonText,
          variant === 'secondary' && styles.secondaryButtonText,
          variant === 'quiet' && styles.quietButtonText,
          disabled && styles.disabledButtonText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  ...props
}: TextInputProps & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA0B8"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput]}
        {...props}
      />
    </View>
  );
}

export default function LettreDeVoitureScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [expediteur, setExpediteur] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [lieuChargement, setLieuChargement] = useState('');
  const [lieuLivraison, setLieuLivraison] = useState('');
  const [marchandise, setMarchandise] = useState('');
  const [reference, setReference] = useState('');
  const [quantite, setQuantite] = useState('');
  const [observations, setObservations] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [signatureMessage, setSignatureMessage] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const signatureRef = useRef<any>(null);
  const createdAt = useMemo(() => new Date(), []);
  const documentNumber = useMemo(() => {
    const stamp = createdAt
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 12);
    return `NOHA-${stamp}`;
  }, [createdAt]);

  const canGeneratePdf = Boolean(
    expediteur.trim() &&
      destinataire.trim() &&
      lieuChargement.trim() &&
      lieuLivraison.trim() &&
      marchandise.trim() &&
      signature
  );
  const isSaving = saveState === 'saving';
  const saveButtonLabel = isSaving ? 'Sauvegarde...' : 'Sauvegarder';
  const emptyUploadedMedia: UploadedMedia = {
    photoPath: null,
    photoUrl: null,
    signaturePath: null,
    signatureUrl: null,
    pdfLocalUri: null,
    pdfPath: null,
    pdfUrl: null,
  };

  const buildPayload = (
    status: LettreDeVoitureStatus,
    uploadedMedia: UploadedMedia = emptyUploadedMedia,
    storageError: string | null = null
  ) => ({
    documentNumber,
    createdAtIso: createdAt.toISOString(),
    expediteur: expediteur.trim(),
    destinataire: destinataire.trim(),
    lieuChargement: lieuChargement.trim(),
    lieuLivraison: lieuLivraison.trim(),
    marchandise: marchandise.trim(),
    reference: reference.trim(),
    quantite: quantite.trim(),
    observations: observations.trim(),
    status,
    media: {
      hasPhoto: Boolean(photo),
      hasSignature: Boolean(signature),
      photoLocalUri: photo,
      photoPath: uploadedMedia.photoPath,
      photoUrl: uploadedMedia.photoUrl,
      signatureDataUrl: signature,
      signaturePath: uploadedMedia.signaturePath,
      signatureUrl: uploadedMedia.signatureUrl,
      pdfLocalUri: uploadedMedia.pdfLocalUri,
      pdfPath: uploadedMedia.pdfPath,
      pdfUrl: uploadedMedia.pdfUrl,
    },
    storageError,
  });

  const uploadCurrentMedia = async ({
    pdfLocalUri,
  }: {
    pdfLocalUri?: string | null;
  } = {}) => {
    const uploadedMedia: UploadedMedia = { ...emptyUploadedMedia, pdfLocalUri: pdfLocalUri ?? null };
    const errors: string[] = [];

    if (photo) {
      try {
        const uploadedPhoto = await withTimeout(
          uploadPhotoToStorage(documentNumber, photo),
          MEDIA_UPLOAD_TIMEOUT_MS,
          'upload photo trop long'
        );
        uploadedMedia.photoPath = uploadedPhoto.path;
        uploadedMedia.photoUrl = uploadedPhoto.url;
      } catch (error) {
        errors.push(`photo: ${getErrorMessage(error)}`);
      }
    }

    if (signature) {
      try {
        const uploadedSignature = await withTimeout(
          uploadSignatureToStorage(documentNumber, signature),
          MEDIA_UPLOAD_TIMEOUT_MS,
          'upload signature trop long'
        );
        uploadedMedia.signaturePath = uploadedSignature.path;
        uploadedMedia.signatureUrl = uploadedSignature.url;
      } catch (error) {
        errors.push(`signature: ${getErrorMessage(error)}`);
      }
    }

    if (pdfLocalUri) {
      try {
        const uploadedPdf = await withTimeout(
          uploadPdfToStorage(documentNumber, pdfLocalUri),
          MEDIA_UPLOAD_TIMEOUT_MS,
          'upload PDF trop long'
        );
        uploadedMedia.pdfPath = uploadedPdf.path;
        uploadedMedia.pdfUrl = uploadedPdf.url;
      } catch (error) {
        errors.push(`PDF: ${getErrorMessage(error)}`);
      }
    }

    return {
      uploadedMedia,
      storageError: errors.length ? `Storage incomplet (${errors.join(' | ')})` : null,
    };
  };

  const saveLettre = async (
    status: LettreDeVoitureStatus = 'draft',
    uploadedMedia: UploadedMedia = emptyUploadedMedia,
    storageError: string | null = null
  ) => {
    setSaveState('saving');
    setSaveMessage('');

    try {
      const id = await upsertLettreDeVoiture(buildPayload(status, uploadedMedia, storageError));
      setSavedDocumentId(id);
      setSaveState('saved');
      setSaveMessage(
        storageError
          ? `Document sauvegardé, mais ${storageError}`
          : status === 'pdf_generated'
          ? 'Document sauvegardé dans Firebase.'
          : 'Brouillon sauvegardé dans Firebase.'
      );
      return true;
    } catch (error) {
      setSaveState('error');
      setSaveMessage(getErrorMessage(error));
      return false;
    }
  };

  const askForCameraPermission = async () => {
    setCameraMessage('');
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');

    if (status !== 'granted') {
      setCameraMessage("L'accès à la caméra a été refusé.");
    }
  };

  const takePicture = async () => {
    if (isTakingPicture) return;

    setIsTakingPicture(true);
    setCameraMessage('');

    try {
      const captured = await cameraRef.current?.takePictureAsync({ quality: 0.82 });
      if (captured?.uri) {
        setPhoto(captured.uri);
      } else {
        setCameraMessage("La photo n'a pas pu être capturée.");
      }
    } catch (error) {
      setCameraMessage(getErrorMessage(error));
    } finally {
      setIsTakingPicture(false);
    }
  };

  const handleSignature = (signatureValue: string) => {
    setSignature(signatureValue);
    setSignatureMessage('Signature validée.');
  };

  const handleClearSignature = () => {
    signatureRef.current?.clearSignature();
    setSignature(null);
    setSignatureMessage('');
  };

  const handleConfirmSignature = () => {
    setSignatureMessage('');
    signatureRef.current?.readSignature();
  };

  const handleEmptySignature = () => {
    setSignature(null);
    setSignatureMessage('Signez dans le cadre avant de valider.');
  };

  const handleSignatureError = (error: unknown) => {
    setSignatureMessage(getErrorMessage(error));
    setIsScrollEnabled(true);
  };

  const handleSaveDraft = async () => {
    if (isSaving) return;

    const saved = await saveLettre('draft');
    if (!saved) return;

    setSaveState('saving');
    setSaveMessage('Archivage des fichiers...');

    const { uploadedMedia, storageError } = await uploadCurrentMedia();
    await saveLettre('draft', uploadedMedia, storageError);
  };

  const generatePdf = async () => {
    if (!canGeneratePdf || isSaving) return;

    setSaveState('saving');
    setSaveMessage('Sauvegarde Firebase...');

    const logoUri = Image.resolveAssetSource(require('@/assets/images/splash-logo.png')).uri;
    const rows = [
      ['Document', documentNumber],
      ['Date', formatDate(createdAt)],
      ['Expéditeur', expediteur],
      ['Destinataire', destinataire],
      ['Lieu de chargement', lieuChargement],
      ['Lieu de livraison', lieuLivraison],
      ['Référence', reference || 'Non renseignée'],
      ['Quantité / colisage', quantite || 'Non renseigné'],
      ['Marchandise', marchandise],
      ['Observations', observations || 'Aucune'],
    ];

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { box-sizing: border-box; }
            body {
              color: #20243A;
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 36px;
            }
            .header {
              align-items: center;
              border-bottom: 4px solid #F47F20;
              display: flex;
              justify-content: space-between;
              padding-bottom: 18px;
            }
            .logo { height: 74px; object-fit: contain; }
            .badge {
              border: 1px solid #DEE2EF;
              border-radius: 8px;
              color: #56599C;
              font-size: 12px;
              font-weight: 700;
              padding: 10px 14px;
              text-align: right;
            }
            h1 {
              color: #33386F;
              font-size: 28px;
              margin: 28px 0 18px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            td {
              border-bottom: 1px solid #DEE2EF;
              font-size: 14px;
              padding: 13px 10px;
              vertical-align: top;
            }
            td:first-child {
              color: #69708A;
              font-weight: 700;
              width: 34%;
            }
            .media-grid {
              display: flex;
              gap: 18px;
              margin-top: 28px;
            }
            .media-card {
              border: 1px solid #DEE2EF;
              border-radius: 8px;
              flex: 1;
              min-height: 132px;
              padding: 14px;
            }
            .media-title {
              color: #56599C;
              font-size: 13px;
              font-weight: 800;
              margin-bottom: 12px;
              text-transform: uppercase;
            }
            .signature {
              max-height: 150px;
              object-fit: contain;
              width: 100%;
            }
            .empty {
              color: #9AA0B8;
              font-size: 13px;
              padding-top: 48px;
              text-align: center;
            }
            .attachment {
              color: #20243A;
              font-size: 14px;
              font-weight: 700;
              line-height: 20px;
              padding-top: 28px;
              text-align: center;
            }
            .footer {
              border-top: 1px solid #DEE2EF;
              color: #69708A;
              font-size: 11px;
              margin-top: 34px;
              padding-top: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img class="logo" src="${logoUri}" />
            <div class="badge">
              ${escapeHtml(documentNumber)}<br />
              ${escapeHtml(formatDate(createdAt))}
            </div>
          </div>
          <h1>Lettre de voiture</h1>
          <table>
            ${rows
              .map(
                ([label, value]) =>
                  `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
              )
              .join('')}
          </table>
          <div class="media-grid">
            <div class="media-card">
              <div class="media-title">Photo marchandise</div>
              ${
                photo
                  ? '<div class="attachment">Photo jointe et archivée séparément</div>'
                  : '<div class="empty">Aucune photo jointe</div>'
              }
            </div>
            <div class="media-card">
              <div class="media-title">Signature</div>
              ${
                signature
                  ? `<img class="signature" src="${signature}" />`
                  : '<div class="empty">Signature manquante</div>'
              }
            </div>
          </div>
          <div class="footer">
            NohaTransport - Le service qui facilite votre quotidien
          </div>
        </body>
      </html>
    `;

    const fallbackHtml = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body {
              color: #20243A;
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 28px;
            }
            h1 {
              color: #33386F;
              font-size: 24px;
              margin: 0 0 14px;
            }
            .meta {
              border-bottom: 3px solid #F47F20;
              color: #56599C;
              font-size: 12px;
              font-weight: 700;
              margin-bottom: 18px;
              padding-bottom: 12px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            td {
              border-bottom: 1px solid #DEE2EF;
              font-size: 13px;
              padding: 10px 8px;
              vertical-align: top;
            }
            td:first-child {
              color: #69708A;
              font-weight: 700;
              width: 36%;
            }
            .footer {
              color: #69708A;
              font-size: 11px;
              margin-top: 24px;
            }
          </style>
        </head>
        <body>
          <h1>Lettre de voiture</h1>
          <div class="meta">${escapeHtml(documentNumber)} - ${escapeHtml(formatDate(createdAt))}</div>
          <table>
            ${rows
              .map(
                ([label, value]) =>
                  `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
              )
              .join('')}
            <tr><td>Photo</td><td>${photo ? 'Photo jointe et archivée séparément' : 'Aucune photo jointe'}</td></tr>
            <tr><td>Signature</td><td>${signature ? 'Signature validée' : 'Signature manquante'}</td></tr>
          </table>
          <div class="footer">NohaTransport - Le service qui facilite votre quotidien</div>
        </body>
      </html>
    `;

    const saved = await saveLettre('pdf_generated');

    if (!saved) return;

    setSaveState('saving');
    setSaveMessage('Archivage des fichiers...');

    const { uploadedMedia, storageError } = await uploadCurrentMedia();
    await saveLettre('pdf_generated', uploadedMedia, storageError);

    let printablePdfUri: string | null = null;
    let htmlForPrint = html;
    let finalUploadedMedia = uploadedMedia;
    let finalStorageError = storageError;

    try {
      setSaveState('saving');
      setSaveMessage('Archivage du PDF...');

      const pdfFile = await withTimeout(
        Print.printToFileAsync({ html }),
        PDF_GENERATION_TIMEOUT_MS,
        'génération PDF trop longue'
      );

      printablePdfUri = pdfFile.uri;

      if (pdfFile.uri) {
        try {
          const uploadedPdf = await withTimeout(
            uploadPdfToStorage(documentNumber, pdfFile.uri),
            MEDIA_UPLOAD_TIMEOUT_MS,
            'upload PDF trop long'
          );

          finalUploadedMedia = {
            ...uploadedMedia,
            pdfLocalUri: pdfFile.uri,
            pdfPath: uploadedPdf.path,
            pdfUrl: uploadedPdf.url,
          };
        } catch (error) {
          finalUploadedMedia = {
            ...uploadedMedia,
            pdfLocalUri: pdfFile.uri,
          };
          finalStorageError = appendStorageError(
            finalStorageError,
            `PDF: ${getErrorMessage(error)}`
          );
        }

        await saveLettre('pdf_generated', finalUploadedMedia, finalStorageError);
      }
    } catch (error) {
      const primaryPdfError = getErrorMessage(error);

      try {
        setSaveState('saving');
        setSaveMessage('Génération du PDF allégé...');

        const fallbackPdfFile = await withTimeout(
          Print.printToFileAsync({ html: fallbackHtml }),
          PDF_FALLBACK_TIMEOUT_MS,
          'génération PDF allégé trop longue'
        );

        printablePdfUri = fallbackPdfFile.uri;
        htmlForPrint = fallbackHtml;
        finalUploadedMedia = {
          ...uploadedMedia,
          pdfLocalUri: fallbackPdfFile.uri,
        };
        finalStorageError = appendStorageError(
          finalStorageError,
          `PDF principal: ${primaryPdfError}`
        );

        if (fallbackPdfFile.uri) {
          try {
            const uploadedFallbackPdf = await withTimeout(
              uploadPdfToStorage(documentNumber, fallbackPdfFile.uri),
              MEDIA_UPLOAD_TIMEOUT_MS,
              'upload PDF allégé trop long'
            );

            finalUploadedMedia = {
              ...finalUploadedMedia,
              pdfPath: uploadedFallbackPdf.path,
              pdfUrl: uploadedFallbackPdf.url,
            };
          } catch (uploadFallbackError) {
            finalStorageError = appendStorageError(
              finalStorageError,
              `PDF allégé: ${getErrorMessage(uploadFallbackError)}`
            );
          }
        }
      } catch (fallbackError) {
        htmlForPrint = fallbackHtml;
        finalStorageError = appendStorageError(
          finalStorageError,
          `PDF: ${primaryPdfError}; PDF allégé: ${getErrorMessage(fallbackError)}`
        );
      }

      await saveLettre('pdf_generated', finalUploadedMedia, finalStorageError);
    }

    try {
      setSaveState('saving');
      setSaveMessage('Ouverture du PDF...');

      if (printablePdfUri) {
        await Print.printAsync({ uri: printablePdfUri });
      } else {
        await Print.printAsync({ html: htmlForPrint });
      }

      setSaveState('saved');
      setSaveMessage(
        finalStorageError
          ? `Document sauvegardé, mais ${finalStorageError}`
          : 'Document sauvegardé dans Firebase.'
      );
    } catch (error) {
      setSaveState('error');
      setSaveMessage(
        `Document sauvegardé dans Firebase, mais le PDF ne s'est pas ouvert: ${getErrorMessage(
          error
        )}`
      );
    }
  };

  const goNext = () => setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  const goPrevious = () => setCurrentStep((step) => Math.max(step - 1, 0));

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.section}>
            <Field
              label="Expéditeur"
              value={expediteur}
              onChangeText={setExpediteur}
              placeholder="Nom, adresse, contact"
              multiline
            />
            <Field
              label="Destinataire"
              value={destinataire}
              onChangeText={setDestinataire}
              placeholder="Nom, adresse, contact"
              multiline
            />
          </View>
        );
      case 1:
        return (
          <View style={styles.section}>
            <Field
              label="Lieu de chargement"
              value={lieuChargement}
              onChangeText={setLieuChargement}
              placeholder="Adresse ou site de départ"
              multiline
            />
            <Field
              label="Lieu de livraison"
              value={lieuLivraison}
              onChangeText={setLieuLivraison}
              placeholder="Adresse ou site d'arrivée"
              multiline
            />
          </View>
        );
      case 2:
        return (
          <View style={styles.section}>
            <Field
              label="Marchandise"
              value={marchandise}
              onChangeText={setMarchandise}
              placeholder="Description de la marchandise"
              multiline
            />
            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Field
                  label="Référence"
                  value={reference}
                  onChangeText={setReference}
                  placeholder="Commande, BL..."
                />
              </View>
              <View style={styles.inlineField}>
                <Field
                  label="Quantité"
                  value={quantite}
                  onChangeText={setQuantite}
                  placeholder="Colis, palettes..."
                />
              </View>
            </View>
            <Field
              label="Observations"
              value={observations}
              onChangeText={setObservations}
              placeholder="Réserves, température, consignes..."
              multiline
            />
          </View>
        );
      case 3:
        return (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>Photo de la marchandise</Text>
            {hasPermission === null && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>Autorisation caméra requise.</Text>
                <ActionButton
                  label="Autoriser la caméra"
                  onPress={askForCameraPermission}
                  variant="secondary"
                />
              </View>
            )}
            {hasPermission === false && (
              <View style={[styles.noticeBox, styles.dangerNotice]}>
                <Text style={styles.noticeText}>L'accès à la caméra a été refusé.</Text>
                <ActionButton
                  label="Réessayer"
                  onPress={askForCameraPermission}
                  variant="secondary"
                />
              </View>
            )}
            {hasPermission && !photo && (
              <View style={styles.cameraCard}>
                <CameraView style={styles.cameraPreview} ref={cameraRef} />
                <ActionButton
                  label={isTakingPicture ? 'Capture...' : 'Prendre une photo'}
                  onPress={takePicture}
                  disabled={isTakingPicture}
                />
              </View>
            )}
            {photo && (
              <View style={styles.photoCard}>
                <Image source={{ uri: photo }} style={styles.photoPreview} />
                <ActionButton
                  label="Reprendre la photo"
                  onPress={() => {
                    setPhoto(null);
                    setCameraMessage('');
                  }}
                  variant="secondary"
                />
              </View>
            )}
            {cameraMessage && <Text style={styles.inlineErrorText}>{cameraMessage}</Text>}
          </View>
        );
      case 4:
        return (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>Signature client</Text>
            <View style={styles.signatureContainer}>
              <SignatureView
                ref={signatureRef}
                onOK={handleSignature}
                onEmpty={handleEmptySignature}
                onError={handleSignatureError}
                onBegin={() => {
                  setIsScrollEnabled(false);
                  setSignatureMessage('');
                }}
                onEnd={() => setIsScrollEnabled(true)}
                autoClear={false}
                webStyle={`
                  .m-signature-pad { box-shadow: none; border: none; }
                  .m-signature-pad--body { border: none; }
                  .m-signature-pad--footer { display: none; }
                  body,html { background: #ffffff; }
                `}
              />
            </View>
            <View style={styles.buttonRow}>
              <ActionButton label="Effacer" onPress={handleClearSignature} variant="danger" />
              <ActionButton label="Valider la signature" onPress={handleConfirmSignature} />
            </View>
            {signatureMessage && (
              <Text
                style={[
                  styles.inlineStatusText,
                  !signature && styles.inlineErrorText,
                ]}>
                {signatureMessage}
              </Text>
            )}
            {signature && (
              <View style={styles.signaturePreviewCard}>
                <Text style={styles.previewLabel}>Signature enregistrée</Text>
                <Image resizeMode="contain" style={styles.signaturePreview} source={{ uri: signature }} />
              </View>
            )}
          </View>
        );
      default:
        return (
          <View style={styles.section}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Document prêt</Text>
              <Text style={styles.summaryNumber}>{documentNumber}</Text>
              <View style={styles.summaryRows}>
                <Text style={styles.summaryRow}>Expéditeur : {expediteur || 'à compléter'}</Text>
                <Text style={styles.summaryRow}>Destinataire : {destinataire || 'à compléter'}</Text>
                <Text style={styles.summaryRow}>Marchandise : {marchandise || 'à compléter'}</Text>
                <Text style={styles.summaryRow}>Signature : {signature ? 'validée' : 'manquante'}</Text>
                <Text style={styles.summaryRow}>
                  Firebase : {savedDocumentId ? `document ${savedDocumentId}` : 'non sauvegardé'}
                </Text>
              </View>
            </View>
            {!canGeneratePdf && (
              <Text style={styles.warningText}>
                Complétez les champs obligatoires et validez la signature avant génération.
              </Text>
            )}
          </View>
        );
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          scrollEnabled={isScrollEnabled}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.topBar}>
            <Image
              source={require('@/assets/images/splash-logo.png')}
              resizeMode="contain"
              style={styles.logo}
            />
            <Text style={styles.documentBadge}>{documentNumber}</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Lettre de voiture</Text>
            <Text style={styles.subtitle}>Saisie terrain, signature et PDF en fin de parcours.</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stepList}>
            {steps.map((step, index) => {
              const isActive = currentStep === index;
              const isDone = currentStep > index;
              return (
                <Pressable
                  key={step.title}
                  onPress={() => setCurrentStep(index)}
                  style={[styles.stepPill, isActive && styles.activeStepPill]}>
                  <View style={[styles.stepNumber, (isActive || isDone) && styles.activeStepNumber]}>
                    <Text style={[styles.stepNumberText, (isActive || isDone) && styles.activeStepNumberText]}>
                      {index + 1}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.stepTitle, isActive && styles.activeStepTitle]}>{step.title}</Text>
                    <Text style={styles.stepCaption}>{step.caption}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.formCard}>{renderStepContent()}</View>

          {saveState !== 'idle' && (
            <View style={[styles.syncNotice, saveState === 'error' && styles.syncNoticeError]}>
              <Text
                style={[
                  styles.syncNoticeText,
                  saveState === 'error' && styles.syncNoticeErrorText,
                ]}>
                {saveState === 'saving'
                  ? saveMessage || 'Sauvegarde Firebase en cours...'
                  : saveMessage}
              </Text>
            </View>
          )}

          <View style={styles.navigationRow}>
            <ActionButton
              label="Retour"
              onPress={goPrevious}
              variant="quiet"
              disabled={currentStep === 0}
            />
            <ActionButton
              label={saveButtonLabel}
              onPress={handleSaveDraft}
              variant="secondary"
              disabled={isSaving}
            />
            {currentStep < steps.length - 1 ? (
              <ActionButton label="Continuer" onPress={goNext} />
            ) : (
              <ActionButton
                label="Sauvegarder et générer le PDF"
                onPress={generatePdf}
                disabled={!canGeneratePdf || isSaving}
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.surfaceSoft,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'space-between',
  },
  logo: {
    aspectRatio: 1400 / 349,
    maxWidth: 320,
    width: '60%',
  },
  documentBadge: {
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: BrandColors.blue,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  header: {
    marginTop: Spacing.four,
  },
  title: {
    color: BrandColors.ink,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  subtitle: {
    color: BrandColors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: Spacing.one,
  },
  stepList: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  stepPill: {
    alignItems: 'center',
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minWidth: 188,
    padding: Spacing.two,
  },
  activeStepPill: {
    borderColor: BrandColors.orange,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: BrandColors.surfaceSoft,
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  activeStepNumber: {
    backgroundColor: BrandColors.orange,
  },
  stepNumberText: {
    color: BrandColors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  activeStepNumberText: {
    color: '#FFFFFF',
  },
  stepTitle: {
    color: BrandColors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  activeStepTitle: {
    color: BrandColors.orangeDark,
  },
  stepCaption: {
    color: BrandColors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.three,
  },
  sectionLead: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  field: {
    gap: Spacing.one,
  },
  label: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: BrandColors.surfaceSoft,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: BrandColors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  multilineInput: {
    minHeight: 92,
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  inlineField: {
    flexBasis: 220,
    flexGrow: 1,
  },
  noticeBox: {
    backgroundColor: BrandColors.surfaceSoft,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  dangerNotice: {
    borderColor: '#F0C5C5',
  },
  noticeText: {
    color: BrandColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  cameraCard: {
    gap: Spacing.three,
  },
  cameraPreview: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%',
  },
  photoCard: {
    gap: Spacing.three,
  },
  photoPreview: {
    aspectRatio: 1,
    borderRadius: 8,
    width: '100%',
  },
  signatureContainer: {
    backgroundColor: '#FFFFFF',
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 260,
    overflow: 'hidden',
  },
  signaturePreviewCard: {
    backgroundColor: BrandColors.surfaceSoft,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: Spacing.three,
  },
  previewLabel: {
    color: BrandColors.success,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: Spacing.two,
  },
  inlineStatusText: {
    color: BrandColors.success,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  inlineErrorText: {
    color: BrandColors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  signaturePreview: {
    height: 120,
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 138,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  primaryButton: {
    backgroundColor: BrandColors.orange,
  },
  secondaryButton: {
    backgroundColor: BrandColors.blue,
  },
  quietButton: {
    backgroundColor: 'transparent',
    borderColor: BrandColors.line,
    borderWidth: 1,
  },
  dangerButton: {
    backgroundColor: BrandColors.danger,
  },
  disabledButton: {
    backgroundColor: '#E7E9F2',
    borderColor: '#E7E9F2',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
  },
  quietButtonText: {
    color: BrandColors.blue,
  },
  disabledButtonText: {
    color: '#9AA0B8',
  },
  pressed: {
    opacity: 0.82,
  },
  summaryCard: {
    backgroundColor: BrandColors.surfaceSoft,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: Spacing.three,
  },
  summaryTitle: {
    color: BrandColors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryNumber: {
    color: BrandColors.orange,
    fontSize: 13,
    fontWeight: '800',
    marginTop: Spacing.one,
  },
  summaryRows: {
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  summaryRow: {
    color: BrandColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  warningText: {
    color: BrandColors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  syncNotice: {
    backgroundColor: '#EEF8F3',
    borderColor: '#B9DFC9',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: Spacing.three,
    padding: Spacing.three,
  },
  syncNoticeError: {
    backgroundColor: '#FFF1F1',
    borderColor: '#F0C5C5',
  },
  syncNoticeText: {
    color: BrandColors.success,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  syncNoticeErrorText: {
    color: BrandColors.danger,
  },
  navigationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
    marginTop: Spacing.four,
  },
});
