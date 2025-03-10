import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, PanResponder, GestureResponderEvent, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { ViewEngine } from '../engine/ViewEngine';
import { PlantData } from '../engine/types';
import { AppText } from './AppText';
import { LoadingScreen } from './LoadingScreen';
import { sendMessageToPlant, Message, loadChatHistory, saveChatHistory } from '../services/api';
import * as THREE from 'three';
import { Renderer } from 'expo-three';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PlantViewProps {
  plant?: PlantData;
  plotIndex?: number;
}

export function PlantView({ plant, plotIndex = 0 }: PlantViewProps) {
  const engineRef = useRef<ViewEngine | null>(null);
  const lastTouchesRef = useRef<{ [key: string]: { x: number, y: number } }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstRenderComplete, setIsFirstRenderComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const window = Dimensions.get('window');
  const [hasEngine, setHasEngine] = useState(false);
  
  // Chat state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Log when component mounts and unmounts
  useEffect(() => {
    console.log('PlantView mounted', { hasPlant: !!plant, dimensions: window });
    return () => console.log('PlantView unmounted');
  }, []);

  // Log when plant prop changes
  useEffect(() => {
    console.log('Plant prop changed:', { 
      hasPlant: !!plant,
      roots: plant?.roots.size,
      parts: plant?.parts.size
    });
  }, [plant]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (e: GestureResponderEvent) => {
      // Store initial touch positions
      const touches = e.nativeEvent.touches;
      lastTouchesRef.current = {};
      touches.forEach(touch => {
        lastTouchesRef.current[touch.identifier] = {
          x: touch.pageX,
          y: touch.pageY
        };
      });
    },

    onPanResponderMove: (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;
      
      // Handle pinch gesture
      if (touches.length === 2) {
        const touch1 = touches[0];
        const touch2 = touches[1];
        const lastTouch1 = lastTouchesRef.current[touch1.identifier];
        const lastTouch2 = lastTouchesRef.current[touch2.identifier];
        
        if (lastTouch1 && lastTouch2) {
          // Calculate current and previous distances
          const currentDist = Math.hypot(
            touch1.pageX - touch2.pageX,
            touch1.pageY - touch2.pageY
          );
          const prevDist = Math.hypot(
            lastTouch1.x - lastTouch2.x,
            lastTouch1.y - lastTouch2.y
          );
          
          // Calculate scale factor
          const scale = currentDist / prevDist;
          engineRef.current?.onPinch(scale);
        }
      }
      // Handle rotation gesture
      else if (touches.length === 1) {
        const touch = touches[0];
        const lastTouch = lastTouchesRef.current[touch.identifier];
        
        if (lastTouch) {
          const dx = touch.pageX - lastTouch.x;
          const dy = touch.pageY - lastTouch.y;
          engineRef.current?.onTouchMove(dx, dy);
        }
      }

      // Update last touches
      lastTouchesRef.current = {};
      touches.forEach(touch => {
        lastTouchesRef.current[touch.identifier] = {
          x: touch.pageX,
          y: touch.pageY
        };
      });
    },

    onPanResponderRelease: () => {
      lastTouchesRef.current = {};
    }
  });

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    console.log('GL context create starting...');
    setError(null);
    
    try {
      // Configure GL context
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      console.log('GL context configured');

      // Wait for next frame to ensure GL context is ready
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      console.log('Initializing ViewEngine...');
      engineRef.current = new ViewEngine(gl);
      setHasEngine(true);
      console.log('ViewEngine initialized');
      
      if (plant) {
        console.log('Setting initial plant data in ViewEngine');
        engineRef.current.setPlantData(plant);
        console.log('Plant data set in ViewEngine');
        setIsFirstRenderComplete(true);
      }
      
      setIsLoading(!plant || isFirstRenderComplete);
    } catch (error) {
      console.error('Error in PlantView initialization:', error);
      setError('Failed to initialize plant view');
      setIsLoading(false);
    }
  };

  // Update plant data when it changes
  useEffect(() => {
    console.log('Plant update effect running:', {
      hasEngine: !!engineRef.current,
      hasPlant: !!plant
    });
    
    if (engineRef.current && plant) {
      try {
        console.log('Updating plant data in engine');
        engineRef.current.setPlantData(plant);
        console.log('Plant data updated in engine');
        setIsFirstRenderComplete(true);
        setIsLoading(false); // Complete loading after plant is fully loaded
      } catch (error) {
        console.error('Error updating plant data:', error);
        setError('Failed to update plant');
      }
    }
  }, [plant, hasEngine]);

  // Log state changes
  useEffect(() => {
    console.log('PlantView state:', { isLoading, error });
  }, [isLoading, error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current && !engineRef.current.isDisposed()) {
        console.log('Disposing engine');
        engineRef.current.dispose();
        engineRef.current = null;
        setHasEngine(false);
      }
    };
  }, []);

  // Always render GL view with overlays
  console.log('Rendering GL view with overlays', {
    isLoading,
    isFirstRenderComplete,
    hasPlant: !!plant,
    error
  });

  const handleSend = async () => {
    if (!input.trim() || !plant || isMessageLoading) return;
    
    setIsMessageLoading(true);
    
    // Create user message
    const userMessage: Message = {
      id: Math.random().toString(),
      plantId: plant.plantId || '0',
      content: input,
      sender: 'user',
      timestamp: Date.now()
    };
    
    // Clear input
    setInput('');
    
    try {
      // Add user message to messages
      setMessages(prev => [...prev, userMessage]);
      
      // Get plant's response using plotIndex
      const plantResponse = await sendMessageToPlant(plotIndex.toString(), input, plant);
      
      // Create plant message
      const plantMessage: Message = {
        id: Math.random().toString(),
        plantId: plant.plantId || '0',
        content: plantResponse,
        sender: 'plant',
        timestamp: Date.now()
      };
      
      // Add plant message to messages
      setMessages(prev => [...prev, plantMessage]);
      
      // Scroll to bottom
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('Error getting plant response:', error);
      // Add fallback message if API fails
      const fallbackMessage: Message = {
        id: Math.random().toString(),
        plantId: plant.plantId || '0',
        content: "I'm having trouble understanding right now.",
        sender: 'plant',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsMessageLoading(false);
    }
  };

  const handleKeyPress = ({ nativeEvent: { key, shiftKey } }: any) => {
    if (key === 'Enter' && !shiftKey) {
      handleSend();
    }
  };

  // Load chat history when component mounts
  useEffect(() => {
    const loadHistory = async () => {
      if (!plant) return;
      
      try {
        console.log('Loading chat history for plot:', plotIndex);
        const history = await loadChatHistory(plotIndex.toString());
        console.log('Loaded chat history:', history.length, 'messages');
        setMessages(history);
      } catch (error) {
        console.error('Error loading chat history:', error);
      }
    };
    
    loadHistory();
  }, [plant, plotIndex]);

  // Save messages whenever they change
  useEffect(() => {
    const saveHistory = async () => {
      if (!plant || messages.length === 0) return;
      
      try {
        console.log('Saving chat history:', messages.length, 'messages');
        await saveChatHistory(plotIndex.toString(), messages);
        console.log('Chat history saved');
      } catch (error) {
        console.error('Error saving chat history:', error);
      }
    };
    
    saveHistory();
  }, [messages, plant, plotIndex]);

  return (
    <View style={[styles.container, { width: window.width }]}>
      <View {...panResponder.panHandlers} style={styles.fullSize}>
        <GLView
          style={[styles.fullSize, { width: window.width }]}
          onContextCreate={onContextCreate}
        />
        
        {/* History button */}
        <SafeAreaView style={styles.historyButtonContainer} edges={['top', 'right']}>
          <TouchableOpacity 
            style={styles.historyButton}
            onPress={() => setShowHistory(true)}
          >
            <AppText style={styles.historyButtonText}>history</AppText>
          </TouchableOpacity>
        </SafeAreaView>

        {/* Chat input overlay - hide when history is shown */}
        {!showHistory && (
          <SafeAreaView 
            style={styles.chatOverlay}
            edges={['bottom']}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={isMessageLoading ? "plant is thinking..." : "type a message..."}
                placeholderTextColor="#666666"
                onKeyPress={handleKeyPress}
                editable={!isMessageLoading}
                returnKeyType="send"
                blurOnSubmit={false}
                multiline
                autoCapitalize="none"
              />
            </View>
          </SafeAreaView>
        )}

        {/* History overlay */}
        {showHistory && (
          <SafeAreaView style={styles.historyOverlay} edges={['top', 'bottom']}>
            <View style={styles.historyContent}>
              <View style={styles.historyHeader}>
                <AppText style={styles.historyTitle}>history</AppText>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setShowHistory(false)}
                >
                  <AppText style={styles.closeButtonText}>×</AppText>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.historyMessages}>
                {messages.map(msg => (
                  <View key={msg.id} style={[styles.messageRow, msg.sender === 'plant' && styles.plantMessage]}>
                    <AppText style={styles.messageText}>{msg.content}</AppText>
                  </View>
                ))}
              </ScrollView>
            </View>
          </SafeAreaView>
        )}

        {/* Loading and error overlays */}
        {isLoading && (
          <View style={[styles.fullSize, styles.overlay]}>
            <LoadingScreen />
          </View>
        )}
        {!isLoading && !plant && (
          <View style={[styles.fullSize, styles.overlay]}>
            <View style={styles.messageContainer}>
              <AppText style={styles.title}>no bud to carry!</AppText>
              <AppText style={styles.message}>
                create a bud in the web app first,{'\n'}
                then you can carry it with you
              </AppText>
            </View>
          </View>
        )}
        {error && (
          <View style={[styles.fullSize, styles.overlay]}>
            <View style={styles.messageContainer}>
              <AppText style={styles.title}>oops!</AppText>
              <AppText style={styles.message}>{error}</AppText>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111419',
    alignSelf: 'flex-start',
  },
  fullSize: {
    flex: 1,
    position: 'relative',
  },
  messageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#111419',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  inputContainer: {
    margin: 16,
  },
  input: {
    backgroundColor: '#ffffff',
    color: '#000000',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'SpaceMono',
    maxHeight: 100,
  },
  historyButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 16,
  },
  historyButton: {
    backgroundColor: '#ffffff20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  historyButtonText: {
    fontSize: 12,
    color: '#ffffff',
  },
  historyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111419ee',
    zIndex: 100,
  },
  historyContent: {
    flex: 1,
    margin: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitle: {
    fontSize: 18,
    color: '#ffffff',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#ffffff',
  },
  historyMessages: {
    flex: 1,
  },
  messageRow: {
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff20',
    borderRadius: 4,
  },
  plantMessage: {
    backgroundColor: '#ffffff10',
  },
  messageText: {
    fontSize: 14,
    color: '#ffffff',
  },
}); 