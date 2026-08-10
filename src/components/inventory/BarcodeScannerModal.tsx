import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { AppButton } from '../common/AppButton';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}

export function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (visible) {
      setLocked(false);
    }
  }, [visible]);

  function handleScan(result: BarcodeScanningResult) {
    if (locked || !result.data) {
      return;
    }
    setLocked(true);
    onScanned(result.data.trim());
  }

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

        {!permission ? (
          <View style={styles.messageWrap}>
            <Text style={styles.message}>Checking camera permission…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.messageWrap}>
            <Text style={styles.messageTitle}>Camera access is required</Text>
            <Text style={styles.message}>
              HomeStock only uses the camera here to read the barcode you point it at.
            </Text>
            <AppButton title="Allow camera" onPress={() => void requestPermission()} />
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                  'code39',
                  'itf14',
                ],
              }}
              onBarcodeScanned={locked ? undefined : handleScan}
            />
            <View pointerEvents="none" style={styles.overlay}>
              <View style={styles.target} />
              <Text style={styles.hint}>Keep the barcode inside the frame</Text>
            </View>
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
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
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
