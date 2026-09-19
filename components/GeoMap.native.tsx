import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMapHtml } from '../lib/mapHtml';
import { RNToWebMessage, WebToRNMessage } from '../types';

export interface GeoMapHandle {
  send: (msg: RNToWebMessage) => void;
}

interface GeoMapProps {
  initialCenter: [number, number];
  initialZoom: number;
  onMessage: (msg: WebToRNMessage) => void;
}

const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ initialCenter, initialZoom, onMessage }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const html = useRef(buildMapHtml(initialCenter[0], initialCenter[1], initialZoom)).current;

  useImperativeHandle(ref, () => ({
    send: (msg: RNToWebMessage) => {
      webviewRef.current?.postMessage(JSON.stringify(msg));
    },
  }));

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            onMessage(data);
          } catch {
            // ignore malformed messages
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mixedContentMode="always"
      />
    </View>
  );
});

GeoMap.displayName = 'GeoMap';

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});

export default GeoMap;
