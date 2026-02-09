import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import VoiceSvg from '../../assets/icons/voice-recorder.svg';
import { useAuth } from '../context/AuthContext';
import { processTranscript } from '../services/voice';
import { getEntries, createEntry } from '../services/vault';
import { toBase64 } from '../services/api';

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

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [intentResult, setIntentResult] = useState<string>('');
  const [entries, setEntries] = useState<VaultItem[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

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

        // If it's a save action, store the encrypted entry
        // In a real app, the client would encrypt before sending.
        // For now we store a placeholder encrypted blob.
        if (intent.action === 'save' && intent.service) {
          const placeholder = toBase64(
            JSON.stringify({
              service: intent.service,
              username: intent.username,
              password: intent.password,
            }),
          );
          await createEntry({
            encryptedData: placeholder,
            iv: toBase64('placeholder-iv'),
            tag: toBase64('placeholder-tag'),
            category: intent.category || 'password',
          });
          await loadEntries();
        }

        if (intent.action === 'list') {
          await loadEntries();
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
    } catch (error) {
      console.error('Error starting voice:', error);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (error) {
      console.error('Error stopping voice:', error);
    }
  };

  const handlePress = async () => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission Denied',
        'Microphone permission is required for voice recording.',
      );
      return;
    }

    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const renderEntry = ({ item }: { item: VaultItem }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryBadge}>
        <Text style={styles.entryBadgeText}>{item.category}</Text>
      </View>
      <Text style={styles.entryId} numberOfLines={1}>
        {item.id.slice(0, 8)}...
      </Text>
      <Text style={styles.entryDate}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Voice</Text>
          <Text style={styles.headerEmail}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Voice Section */}
      <View style={styles.voiceSection}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
          <VoiceSvg
            width={100}
            height={100}
            fill={isListening ? '#FF4444' : undefined}
          />
        </TouchableOpacity>

        <Text style={styles.statusText}>
          {isListening
            ? 'Listening...'
            : processing
            ? 'Processing...'
            : 'Tap to speak'}
        </Text>

        {processing && <ActivityIndicator color="#007AFF" style={styles.spinner} />}

        {transcript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>You said:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}

        {intentResult ? (
          <View style={styles.intentBox}>
            <Text style={styles.intentLabel}>Parsed Intent:</Text>
            <Text style={styles.intentText}>{intentResult}</Text>
          </View>
        ) : null}
      </View>

      {/* Vault Entries Section */}
      <View style={styles.vaultSection}>
        <View style={styles.vaultHeader}>
          <Text style={styles.vaultTitle}>Vault ({entries.length})</Text>
          <TouchableOpacity onPress={loadEntries}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loadingEntries ? (
          <ActivityIndicator color="#fff" />
        ) : entries.length === 0 ? (
          <Text style={styles.emptyText}>
            No entries yet. Use voice to save passwords.
          </Text>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={item => item.id}
            renderItem={renderEntry}
            style={styles.entryList}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e1f6c',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerEmail: {
    fontSize: 13,
    color: '#a0aee6',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  statusText: {
    marginTop: 12,
    fontSize: 16,
    color: '#a0aee6',
  },
  spinner: {
    marginTop: 8,
  },
  transcriptBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    marginHorizontal: 20,
    alignSelf: 'stretch',
  },
  transcriptLabel: {
    fontSize: 12,
    color: '#a0aee6',
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 16,
    color: '#fff',
  },
  intentBox: {
    backgroundColor: 'rgba(0,122,255,0.2)',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    marginHorizontal: 20,
    alignSelf: 'stretch',
  },
  intentLabel: {
    fontSize: 12,
    color: '#7ab8ff',
    marginBottom: 4,
  },
  intentText: {
    fontSize: 14,
    color: '#fff',
  },
  vaultSection: {
    flex: 1,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  vaultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  vaultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  refreshText: {
    fontSize: 14,
    color: '#007AFF',
  },
  emptyText: {
    color: '#a0aee6',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  entryList: {
    flex: 1,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  entryBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
  },
  entryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  entryId: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  entryDate: {
    color: '#a0aee6',
    fontSize: 12,
  },
});
