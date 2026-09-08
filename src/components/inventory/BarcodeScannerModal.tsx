import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { CodeScanner } from 'react-native-vision-camera-barcode-scanner';

import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { AppButton } from '../common/AppButton';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}

export function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const [locked, setLocked] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLocked(false);
      setScannerError(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Scan barcode</Text>
            <Text style={styles.subtitle}>Point the camera at a product barcode.</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {!hasPermission ? (
          <View style={styles.messageWrap}>
            <Text style={styles.messageTitle}>Camera access is required</Text>
            <Text style={styles.message}>
              HomeStock only uses the camera here to read the barcode you point it at.
            </Text>
            {canRequestPermission ? (
              <AppButton title="Allow camera" onPress={() => void requestPermission()} />
            ) : (
              <Text style={styles.message}>
                Camera permission is disabled for HomeStock. Enable it from your device settings and reopen the scanner.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CodeScanner
              style={StyleSheet.absoluteFill}
              isActive={visible && !locked}
              barcodeFormats={['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'itf']}
              onBarcodeScanned={(barcodes) => {
                const value = barcodes[0]?.rawValue?.trim();
                if (locked || !value) return;
                setLocked(true);
                onScanned(value);
              }}
              onError={(error) => {
                setScannerError(error instanceof Error ? error.message : 'Unable to scan barcodes.');
              }}
            />
            <View pointerEvents="none" style={styles.overlay}>
              <View style={styles.target} />
              <Text style={styles.hint}>Keep the barcode inside the frame</Text>
            </View>
            {scannerError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{scannerError}</Text>
              </View>
            ) : null}
            {locked ? (
              <View style={styles.lockedBanner}>
                <Text style={styles.lockedText}>Barcode captured…</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: {
    paddingTop: 56,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: colors.dark,
  },
  title: { color: colors.white, fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#B8C3D7', marginTop: spacing.xs },
  close: { color: colors.white, fontWeight: '800', paddingTop: spacing.xs },
  messageWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  messageTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  message: { color: colors.textMuted, lineHeight: 22 },
  cameraWrap: { flex: 1, overflow: 'hidden' },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  target: {
    width: '82%',
    height: 190,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: spacing.lg,
    color: colors.white,
    backgroundColor: 'rgba(11,18,32,0.72)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    fontWeight: '700',
  },
  errorBanner: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    top: spacing.xl,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger, textAlign: 'center', fontWeight: '700' },
  lockedBanner: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 40,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  lockedText: { color: colors.text, textAlign: 'center', fontWeight: '800' },
});
