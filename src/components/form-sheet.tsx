import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

type Props = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  canSave?: boolean;
  dirty?: boolean;
  error?: string;
}>;

export function FormSheet({ visible, title, onClose, onSave, saveLabel = '保存', canSave = true, dirty = false, error, children }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => listener.remove();
  }, []);
  useEffect(() => { if (error) scroll.current?.scrollToEnd({ animated: !reduceMotion }); }, [error, reduceMotion]);
  const close = () => {
    if (!dirty) return onClose();
    if (Platform.OS === 'web') {
      if (globalThis.confirm('変更を保存せずに閉じますか？')) onClose();
    } else Alert.alert('変更を保存せずに閉じますか？', undefined, [
      { text: '編集を続ける', style: 'cancel' },
      { text: '変更を破棄', style: 'destructive', onPress: onClose },
    ]);
  };
  return <Modal visible={visible} transparent={Platform.OS === 'web'} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} animationType={reduceMotion ? 'none' : Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      {Platform.OS === 'web' ? <Pressable accessibilityLabel="シートを閉じる" onPress={close} style={StyleSheet.absoluteFill} /> : null}
      <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
        <View accessibilityViewIsModal style={styles.fill}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={close} style={styles.headerButton}><Text style={styles.close}>閉じる</Text></Pressable>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
            {onSave ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={onSave} style={styles.headerButton}><Text style={[styles.save, !canSave && styles.disabled]}>{saveLabel}</Text></Pressable> : <View style={styles.headerButton} />}
          </View>
          <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
            {children}
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Platform.OS === 'web' ? 'rgba(24,42,54,0.3)' : palette.canvas, padding: Platform.OS === 'web' ? 16 : 0 },
  sheet: { width: '100%', flex: 1, maxWidth: 640, maxHeight: Platform.OS === 'web' ? '92%' : '100%', backgroundColor: palette.canvas, borderRadius: Platform.OS === 'web' ? 24 : 0, overflow: 'hidden' },
  fill: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  headerButton: { minWidth: 64, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  close: { fontSize: 15, color: palette.slate },
  save: { fontSize: 16, fontWeight: '700', color: palette.ocean },
  disabled: { opacity: 0.35 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 24, color: palette.ink, fontWeight: '700' },
  content: { padding: 24, paddingBottom: 40, gap: 12 },
  error: { padding: 14, borderRadius: 8, color: palette.danger, fontSize: 14, lineHeight: 21, backgroundColor: palette.paper },
});
