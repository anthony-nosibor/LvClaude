import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/brand';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  subscribeToLettresDeVoiture,
  type LettreDeVoitureRecord,
} from '@/services/lettres-de-voiture';

function formatDate(date: Date | null) {
  if (!date) {
    return 'Date inconnue';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export default function HistoryScreen() {
  const [lettres, setLettres] = useState<LettreDeVoitureRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToLettresDeVoiture(
      (records) => {
        setLettres(records);
        setErrorMessage('');
        setIsLoading(false);
      },
      (error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const historyStats = useMemo(
    () => [
      {
        label: 'Documents',
        value: String(lettres.length),
      },
      {
        label: 'PDF générés',
        value: String(lettres.filter((lettre) => lettre.status === 'pdf_generated').length),
      },
      {
        label: 'Signatures',
        value: String(lettres.filter((lettre) => lettre.media.hasSignature).length),
      },
      {
        label: 'Photos jointes',
        value: String(lettres.filter((lettre) => lettre.media.hasPhoto).length),
      },
    ],
    [lettres]
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Suivi documentaire</Text>
            <Text style={styles.title}>Historique</Text>
            <Text style={styles.subtitle}>
              Les lettres sauvegardées dans Firebase apparaissent ici en temps réel.
            </Text>
          </View>

          <View style={styles.statsRow}>
            {historyStats.map((item) => (
              <View key={item.label} style={styles.statCard}>
                <Text style={styles.statValue}>{item.value}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {isLoading && (
            <View style={styles.feedbackState}>
              <ActivityIndicator color={BrandColors.orange} />
              <Text style={styles.feedbackText}>Chargement Firebase...</Text>
            </View>
          )}

          {!isLoading && errorMessage && (
            <View style={[styles.feedbackState, styles.errorState]}>
              <Text style={styles.errorTitle}>Impossible de charger l'historique</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {!isLoading && !errorMessage && lettres.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyAccent} />
              <Text style={styles.emptyTitle}>Aucun document enregistré</Text>
              <Text style={styles.emptyText}>
                Créez une lettre de voiture puis sauvegardez-la pour alimenter cet historique.
              </Text>
            </View>
          )}

          {!isLoading && !errorMessage && lettres.length > 0 && (
            <View style={styles.list}>
              {lettres.map((lettre) => (
                <View key={lettre.id} style={styles.letterCard}>
                  <View style={styles.letterHeader}>
                    <View style={styles.letterTitleBlock}>
                      <Text style={styles.letterNumber}>{lettre.documentNumber}</Text>
                      <Text style={styles.letterDate}>{formatDate(lettre.createdAt)}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        lettre.status === 'pdf_generated' && styles.statusBadgeDone,
                      ]}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          lettre.status === 'pdf_generated' && styles.statusBadgeDoneText,
                        ]}>
                        {lettre.status === 'pdf_generated' ? 'PDF généré' : 'Brouillon'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.letterBody}>
                    <Text style={styles.letterLine}>Expéditeur : {lettre.expediteur || 'Non renseigné'}</Text>
                    <Text style={styles.letterLine}>
                      Destinataire : {lettre.destinataire || 'Non renseigné'}
                    </Text>
                    <Text style={styles.letterLine}>
                      Trajet : {lettre.lieuChargement || 'Départ ?'} {'->'}{' '}
                      {lettre.lieuLivraison || 'Arrivée ?'}
                    </Text>
                    <Text style={styles.letterLine}>
                      Marchandise : {lettre.marchandise || 'Non renseignée'}
                    </Text>
                  </View>

                  <View style={styles.mediaRow}>
                    <Text style={styles.mediaChip}>
                      {lettre.media.hasPhoto ? 'Photo jointe' : 'Sans photo'}
                    </Text>
                    <Text style={styles.mediaChip}>
                      {lettre.media.hasSignature ? 'Signature validée' : 'Sans signature'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
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
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    width: '100%',
  },
  header: {
    gap: Spacing.one,
  },
  eyebrow: {
    color: BrandColors.orange,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: BrandColors.ink,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    color: BrandColors.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 560,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 132,
    padding: Spacing.three,
  },
  statValue: {
    color: BrandColors.blue,
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: BrandColors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  feedbackState: {
    alignItems: 'center',
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  feedbackText: {
    color: BrandColors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  errorState: {
    alignItems: 'flex-start',
    borderColor: '#F0C5C5',
  },
  errorTitle: {
    color: BrandColors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  emptyAccent: {
    backgroundColor: BrandColors.orange,
    borderRadius: 999,
    height: 5,
    marginBottom: Spacing.three,
    width: 72,
  },
  emptyTitle: {
    color: BrandColors.ink,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: BrandColors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: Spacing.two,
    maxWidth: 420,
    textAlign: 'center',
  },
  list: {
    gap: Spacing.three,
  },
  letterCard: {
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  letterHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  letterTitleBlock: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  letterNumber: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  letterDate: {
    color: BrandColors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#EEF0FA',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  statusBadgeDone: {
    backgroundColor: '#EEF8F3',
  },
  statusBadgeText: {
    color: BrandColors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeDoneText: {
    color: BrandColors.success,
  },
  letterBody: {
    gap: Spacing.one,
  },
  letterLine: {
    color: BrandColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  mediaChip: {
    backgroundColor: BrandColors.surfaceSoft,
    borderColor: BrandColors.line,
    borderRadius: 999,
    borderWidth: 1,
    color: BrandColors.blue,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
