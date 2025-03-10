import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, PanResponder, GestureResponderEvent, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { ViewEngine } from '../engine/ViewEngine';
import { PlantData } from '../engine/types';
import { AppText } from './AppText';
import { LoadingScreen } from './LoadingScreen';
import { sendMessageToPlant } from '../services/api';
import * as THREE from 'three';
import { Renderer } from 'expo-three';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
  id: string;
  plantId: string;
  content: string;
  sender: 'user' | 'plant';
  timestamp: number;
}

interface PlantViewProps {
  plant?: PlantData;
}

export function PlantView({ plant }: PlantViewProps) {
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
    if (!input.trim() || !plant?.plantId || isMessageLoading) return;
    
    setIsMessageLoading(true);
    
    // Create user message
    const userMessage: Message = {
      id: Math.random().toString(),
      plantId: plant.plantId,
      content: input,
      sender: 'user',
      timestamp: Date.now()
    };
    
    // Clear input
    setInput('');
    
    try {
      // Add user message to messages
      setMessages(prev => [...prev, userMessage]);
      
      // Get plant's response
      const plantResponse = await sendMessageToPlant(plant.plantId, input, plant);
      
      // Create plant message
      const plantMessage: Message = {
        id: Math.random().toString(),
        plantId: plant.plantId,
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
        plantId: plant.plantId,
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

  return (
    <View style={[styles.container, { width: window.width }]}>
      <View {...panResponder.panHandlers} style={styles.fullSize}>
        <GLView
          style={[styles.fullSize, { width: window.width }]}
          onContextCreate={onContextCreate}
        />
        
        {/* Chat overlay */}
        <SafeAreaView 
          style={styles.chatOverlay}
          edges={['bottom']}
        >
          {/* Input only - no messages area */}
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
}); 