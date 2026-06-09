import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/brand';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  subscribeToLettresDeVoiture,
  type LettreDeVoitureRecord,
} from '@/services/lettres-de-voiture';

const shortcuts = [
  { title: 'Historique', description: 'Retrouver les lettres générées' },
  { title: 'Modèles', description: 'Préparer les informations récurrentes' },
  { title: 'Paramètres', description: 'Logo, société et mentions PDF' },
];

export default function HomeScreen() {
  const router = useRouter();
  const [lettres, setLettres] = useState<LettreDeVoitureRecord[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToLettresDeVoiture(
      (records) => {
        setLettres(records);
      },
      () => {
        setLettres([]);
      }
    );

    return unsubscribe;
  }, []);

  const dashboardItems = useMemo(
    () => [
      {
        label: 'Brouillons',
        value: String(lettres.filter((lettre) => lettre.status === 'draft').length),
        tone: BrandColors.blue,
      },
      {
        label: 'PDF générés',
        value: String(lettres.filter((lettre) => lettre.status === 'pdf_generated').length),
        tone: BrandColors.orange,
      },
      {
        label: 'Signatures',
        value: String(lettres.filter((lettre) => lettre.media.hasSignature).length),
        tone: BrandColors.success,
      },
    ],
    [lettres]
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.logoPanel}>
            <Image
              source={require('@/assets/images/splash-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>Gestion transport</Text>
            <Text style={styles.title}>Lettres de voiture</Text>
            <Text style={styles.subtitle}>
              Créez, signez et exportez vos documents depuis le terrain.
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/lettre-de-voiture')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Nouvelle lettre de voiture</Text>
          </Pressable>

          <View style={styles.metricsGrid}>
            {dashboardItems.map((item) => (
              <View key={item.label} style={styles.metricCard}>
                <View style={[styles.metricAccent, { backgroundColor: item.tone }]} />
                <Text style={styles.metricValue}>{item.value}</Text>
                <Text style={styles.metricLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Raccourcis</Text>
          </View>

          <View style={styles.shortcutList}>
            {shortcuts.map((item) => (
              <View key={item.title} style={styles.shortcutCard}>
                <View>
                  <Text style={styles.shortcutTitle}>{item.title}</Text>
                  <Text style={styles.shortcutDescription}>{item.description}</Text>
                </View>
              </View>
            ))}
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
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    width: '100%',
  },
  logoPanel: {
    alignItems: 'center',
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
  },
  logo: {
    aspectRatio: 1400 / 349,
    maxWidth: 560,
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
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 520,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.orange,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: Spacing.four,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  metricCard: {
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: Spacing.three,
  },
  metricAccent: {
    borderRadius: 999,
    height: 4,
    marginBottom: Spacing.three,
    width: 42,
  },
  metricValue: {
    color: BrandColors.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    color: BrandColors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  sectionHeader: {
    borderBottomColor: BrandColors.line,
    borderBottomWidth: 1,
    paddingBottom: Spacing.two,
  },
  sectionTitle: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  shortcutList: {
    gap: Spacing.two,
  },
  shortcutCard: {
    backgroundColor: BrandColors.surface,
    borderColor: BrandColors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: Spacing.three,
  },
  shortcutTitle: {
    color: BrandColors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  shortcutDescription: {
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.half,
  },
  pressed: {
    opacity: 0.82,
  },
});
