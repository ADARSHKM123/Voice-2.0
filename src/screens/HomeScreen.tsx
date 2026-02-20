import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  ActivityIndicator,
  FlatList,
  Animated,
  StatusBar,
} from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import VoiceSvg from '../../assets/icons/voice-recorder.svg';
import { useAuth } from '../context/AuthContext';
import { processTranscript } from '../services/voice';
import { getEntries, createEntry, updateEntry, deleteEntry } from '../services/vault';
import { toBase64, fromBase64 } from '../services/api';
import * as ElevenLabs from '../services/elevenlabs';
import type { ConversationState } from '../services/elevenlabs';

async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'App needs access to your microphone for voice commands',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

interface VaultItem {
  id: string;
  encrypted_data: string;
  category: string;
  created_at: string;
}

// Initialize TTS
Tts.setDefaultLanguage('en-US');
Tts.setDefaultRate(0.45);

function speak(text: string) {
  Tts.stop();
  Tts.speak(text);
}

export default function HomeScreen() {
  const { user, logout } = useAuth();

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'groq' | 'elevenlabs'>('groq');

  // ── Groq mode state ────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [intentResult, setIntentResult] = useState<string>('');

  // ── ElevenLabs mode state ──────────────────────────────────────────────────
  const [convState, setConvState] = useState<ConversationState>('idle');
  const [convMessages, setConvMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);

  // ── Shared state ───────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<VaultItem[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Pulse animation when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(ringAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      ring.start();
      return () => {
        pulse.stop();
        ring.stop();
        pulseAnim.setValue(1);
        ringAnim.setValue(0);
      };
    }
  }, [isListening, pulseAnim, ringAnim]);

  useEffect(() => {
    Voice.onSpeechStart = () => {};
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = (event: SpeechResultsEvent) => {
      const text = event.value?.[0] || '';
      setTranscript(text);
    };
    Voice.onSpeechError = (_event: SpeechErrorEvent) => {
      setIsListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // ElevenLabs handlers — set once, stable references via closures
  useEffect(() => {
    ElevenLabs.setHandlers({
      onStateChange: (state: ConversationState) => setConvState(state),
      onUserTranscript: (text: string) =>
        setConvMessages(prev => [...prev, { role: 'user', text }]),
      onAgentTranscript: (text: string) =>
        setConvMessages(prev => [...prev, { role: 'agent', text }]),
      onError: (message: string) => Alert.alert('Connection Error', message),
      onVaultChanged: loadEntries,
    });
    return () => {
      ElevenLabs.stopConversation();
    };
  }, []);

  // Load vault entries on mount
  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEntries = async () => {
    setLoadingEntries(true);
    const result = await getEntries();
    if (result.success && result.data) {
      setEntries(result.data);
    }
    setLoadingEntries(false);
  };

  // When transcript is set, automatically process it
  useEffect(() => {
    if (transcript && !isListening) {
      handleProcessTranscript(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, isListening]);

  const handleProcessTranscript = async (text: string) => {
    setProcessing(true);
    setIntentResult('');
    try {
      const result = await processTranscript(text);
      if (result.success && result.data) {
        const intent = result.data.intent;
        setIntentResult(
          `Action: ${intent.action}` +
            (intent.service ? `\nService: ${intent.service}` : '') +
            (intent.username ? `\nUsername: ${intent.username}` : '') +
            (intent.password ? `\nPassword: ${intent.password}` : ''),
        );

        // Save action
        if (intent.action === 'save' && intent.service) {
          if (!intent.password) {
            const msg = `No password detected for ${intent.service}. Please say the password after the service name, for example: save my Amazon password hunter42`;
            setIntentResult(msg);
            speak(`No password detected for ${intent.service}. Please include the password in your command.`);
          } else {
            const payload = JSON.stringify({
              service: intent.service,
              username: intent.username,
              password: intent.password,
            });
            await createEntry({
              encryptedData: toBase64(payload),
              iv: toBase64('placeholder-iv'),
              tag: toBase64('placeholder-tag'),
              category: intent.category || 'password',
            });
            await loadEntries();
            const msg = `Saved password for ${intent.service}`;
            setIntentResult(msg);
            speak(msg);
          }
        }

        // Retrieve action
        if (intent.action === 'retrieve' && intent.service) {
          const entriesResult = await getEntries();
          if (entriesResult.success && entriesResult.data) {
            const serviceLower = intent.service.toLowerCase();
            let found = false;
            for (const entry of entriesResult.data) {
              try {
                const raw = fromBase64(entry.encrypted_data);
                const decoded = JSON.parse(raw);
                if (decoded.service && decoded.service.toLowerCase().includes(serviceLower)) {
                  const lines = [`Found ${decoded.service}:`];
                  let speechParts = `Your ${decoded.service} password is `;
                  if (decoded.username) {
                    lines.push(`Username: ${decoded.username}`);
                  }
                  if (decoded.password) {
                    lines.push(`Password: ${decoded.password}`);
                    speechParts += decoded.password.split('').join(' ');
                  } else {
                    speechParts += 'not set';
                  }
                  setIntentResult(lines.join('\n'));
                  speak(speechParts);
                  found = true;
                  break;
                }
              } catch (decodeErr) {
                console.log('[Retrieve] Could not decode entry:', entry.id, decodeErr);
              }
            }
            if (!found) {
              const msg = `No saved password found for ${intent.service}`;
              setIntentResult(msg);
              speak(msg);
            }
          }
        }

        // List action
        if (intent.action === 'list') {
          await loadEntries();
        }

        // Update action
        if (intent.action === 'update' && intent.service) {
          if (!intent.password) {
            const msg = `No new password detected for ${intent.service}. Say the new password in your command.`;
            setIntentResult(msg);
            speak(msg);
          } else {
            const entriesResult = await getEntries();
            if (entriesResult.success && entriesResult.data) {
              const serviceLower = intent.service.toLowerCase();
              let updated = false;
              for (const entry of entriesResult.data) {
                try {
                  const raw = fromBase64(entry.encrypted_data);
                  const decoded = JSON.parse(raw);
                  if (decoded.service && decoded.service.toLowerCase().includes(serviceLower)) {
                    const newPayload = JSON.stringify({
                      service: decoded.service,
                      username: intent.username ?? decoded.username,
                      password: intent.password,
                    });
                    await updateEntry(entry.id, {
                      encryptedData: toBase64(newPayload),
                      iv: toBase64('placeholder-iv'),
                      tag: toBase64('placeholder-tag'),
                      category: entry.category,
                    });
                    await loadEntries();
                    const msg = `Updated password for ${decoded.service}`;
                    setIntentResult(msg);
                    speak(msg);
                    updated = true;
                    break;
                  }
                } catch {
                  // skip unreadable entries
                }
              }
              if (!updated) {
                const msg = `No saved entry found for ${intent.service}`;
                setIntentResult(msg);
                speak(msg);
              }
            }
          }
        }

        // Delete action
        if (intent.action === 'delete' && intent.service) {
          const entriesResult = await getEntries();
          if (entriesResult.success && entriesResult.data) {
            const serviceLower = intent.service.toLowerCase();
            let deleted = false;
            for (const entry of entriesResult.data) {
              try {
                const raw = fromBase64(entry.encrypted_data);
                const decoded = JSON.parse(raw);
                if (decoded.service && decoded.service.toLowerCase().includes(serviceLower)) {
                  await deleteEntry(entry.id);
                  await loadEntries();
                  const msg = `Deleted password for ${decoded.service}`;
                  setIntentResult(msg);
                  speak(msg);
                  deleted = true;
                  break;
                }
              } catch {
                // skip unreadable entries
              }
            }
            if (!deleted) {
              const msg = `No saved entry found for ${intent.service}`;
              setIntentResult(msg);
              speak(msg);
            }
          }
        }
      } else {
        setIntentResult(result.error || 'Failed to process voice command');
      }
    } catch (err: any) {
      setIntentResult(err.message || 'Error processing transcript');
    } finally {
      setProcessing(false);
    }
  };

  const startListening = async () => {
    try {
      setTranscript('');
      setIntentResult('');
      await Voice.start('en-US');
      setIsListening(true);
    } catch (err) {
      console.error('Error starting voice:', err);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (err) {
      console.error('Error stopping voice:', err);
    }
  };

  const handlePress = async () => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Microphone permission is required for voice recording.');
      return;
    }

    if (mode === 'elevenlabs') {
      if (ElevenLabs.isActive()) {
        ElevenLabs.stopConversation();
      } else {
        setConvMessages([]);
        await ElevenLabs.startConversation();
      }
    } else {
      if (isListening) {
        await stopListening();
      } else {
        await startListening();
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'password': return '#3B82F6';
      case 'note': return '#8B5CF6';
      case 'card': return '#F59E0B';
      default: return '#6B7280';
    }
  };

  const renderEntry = ({ item }: { item: VaultItem }) => (
    <View style={styles.entryCard}>
      <View style={[styles.entryBadge, { backgroundColor: getCategoryColor(item.category) + '20' }]}>
        <Text style={[styles.entryBadgeText, { color: getCategoryColor(item.category) }]}>
          {item.category}
        </Text>
      </View>
      <View style={styles.entryInfo}>
        <Text style={styles.entryId} numberOfLines={1}>
          {item.id.slice(0, 8)}...
        </Text>
        <Text style={styles.entryDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#08080D" />

      {/* Ambient glow */}
      <View style={styles.glowContainer}>
        <View style={styles.glowOrb1} />
        <View style={styles.glowOrb2} />
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Voice Vault</Text>
            <Text style={styles.headerEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} activeOpacity={0.7}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'groq' && styles.modeBtnActive]}
            onPress={() => { setMode('groq'); ElevenLabs.stopConversation(); }}
            activeOpacity={0.7}>
            <Text style={[styles.modeBtnText, mode === 'groq' && styles.modeBtnTextActive]}>
              Commands
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'elevenlabs' && styles.modeBtnActive]}
            onPress={() => setMode('elevenlabs')}
            activeOpacity={0.7}>
            <Text style={[styles.modeBtnText, mode === 'elevenlabs' && styles.modeBtnTextActive]}>
              Conversation
            </Text>
          </TouchableOpacity>
        </View>

        {/* Voice Section */}
        <View style={styles.voiceSection}>
          <View style={styles.voiceButtonContainer}>
            {(mode === 'groq' ? isListening : convState !== 'idle' && convState !== 'disconnected') && (
              <Animated.View
                style={[
                  styles.voiceRing,
                  {
                    opacity: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                    transform: [{ scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
                  },
                ]}
              />
            )}

            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.7}
                style={[
                  styles.voiceButton,
                  (mode === 'groq' ? isListening : ElevenLabs.isActive()) && styles.voiceButtonActive,
                ]}>
                <VoiceSvg
                  width={40}
                  height={40}
                  fill={(mode === 'groq' ? isListening : ElevenLabs.isActive()) ? '#FFFFFF' : '#8E95A2'}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Text style={styles.statusText}>
            {mode === 'elevenlabs'
              ? convState === 'connecting'    ? 'Connecting...'
              : convState === 'listening'     ? 'Listening...'
              : convState === 'user_speaking' ? 'You are speaking...'
              : convState === 'agent_speaking'? 'Agent speaking...'
              : convState === 'disconnected'  ? 'Tap to reconnect'
              :                                 'Tap to start conversation'
            : isListening ? 'Listening...'
            : processing  ? 'Processing...'
            :               'Tap to speak'}
          </Text>

          {mode === 'groq' && processing && <ActivityIndicator color="#3B82F6" style={styles.spinner} />}

          {mode === 'groq' && transcript ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>You said</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
          ) : null}

          {mode === 'groq' && intentResult ? (
            <View style={styles.intentBox}>
              <Text style={styles.intentLabel}>Parsed Intent</Text>
              <Text style={styles.intentText}>{intentResult}</Text>
            </View>
          ) : null}

          {mode === 'elevenlabs' && convMessages.length > 0 && (
            <View style={styles.convContainer}>
              {convMessages.slice(-4).map((msg, i) => (
                <View key={i} style={[styles.convBubble, msg.role === 'user' ? styles.convUserBubble : styles.convAgentBubble]}>
                  <Text style={[styles.convBubbleRole, msg.role === 'user' ? styles.convUserRole : styles.convAgentRole]}>
                    {msg.role === 'user' ? 'You' : 'Agent'}
                  </Text>
                  <Text style={styles.convBubbleText}>{msg.text}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Vault Entries Section */}
        <View style={styles.vaultSection}>
          <View style={styles.vaultHeader}>
            <View style={styles.vaultTitleRow}>
              <Text style={styles.vaultTitle}>Vault</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{entries.length}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={loadEntries} style={styles.refreshButton} activeOpacity={0.7}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loadingEntries ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator color="#3B82F6" />
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>~</Text>
              <Text style={styles.emptyText}>No entries yet</Text>
              <Text style={styles.emptySubtext}>
                Use voice commands to save passwords
              </Text>
            </View>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={item => item.id}
              renderItem={renderEntry}
              style={styles.entryList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080D',
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  glowOrb1: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  glowOrb2: {
    position: 'absolute',
    bottom: 100,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
  },
  content: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0F0F5',
    letterSpacing: -0.3,
  },
  headerEmail: {
    fontSize: 13,
    color: '#5A5F6B',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: {
    color: '#8E95A2',
    fontSize: 13,
    fontWeight: '600',
  },

  // Voice Section
  voiceSection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  voiceButtonContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  voiceButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  statusText: {
    marginTop: 14,
    fontSize: 14,
    color: '#5A5F6B',
    letterSpacing: 0.3,
  },
  spinner: {
    marginTop: 10,
  },
  transcriptBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5A5F6B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 15,
    color: '#E8E8ED',
    lineHeight: 22,
  },
  intentBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  intentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  intentText: {
    fontSize: 14,
    color: '#E8E8ED',
    lineHeight: 22,
  },

  // Vault Section
  vaultSection: {
    flex: 1,
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  vaultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  vaultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F0F0F5',
    letterSpacing: -0.2,
  },
  countBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  refreshText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#2A2E38',
    marginBottom: 12,
  },
  emptyText: {
    color: '#5A5F6B',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#3A3F4B',
    fontSize: 13,
    marginTop: 4,
  },
  entryList: {
    flex: 1,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  entryBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 12,
  },
  entryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  entryInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryId: {
    flex: 1,
    color: '#E8E8ED',
    fontSize: 14,
    fontWeight: '500',
  },
  entryDate: {
    color: '#5A5F6B',
    fontSize: 12,
    marginLeft: 8,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5A5F6B',
  },
  modeBtnTextActive: {
    color: '#3B82F6',
  },

  // Conversation bubbles (ElevenLabs mode)
  convContainer: {
    alignSelf: 'stretch',
    marginTop: 14,
    gap: 8,
  },
  convBubble: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  convUserBubble: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.07)',
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  convAgentBubble: {
    backgroundColor: 'rgba(59,130,246,0.07)',
    borderColor: 'rgba(59,130,246,0.15)',
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  convBubbleRole: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  convUserRole: {
    color: '#5A5F6B',
  },
  convAgentRole: {
    color: '#3B82F6',
  },
  convBubbleText: {
    fontSize: 14,
    color: '#E8E8ED',
    lineHeight: 20,
  },
});
