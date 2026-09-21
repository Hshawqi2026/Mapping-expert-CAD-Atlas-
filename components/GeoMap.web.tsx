import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildMapHtml } from '../lib/mapHtml';
import { RNToWebMessage, WebToRNMessage, RasterLayer, RasterService } from '../types';

export interface GeoMapHandle {
  send: (msg: RNToWebMessage) => void;
}

interface GeoMapProps {
  initialCenter: [number, number];
  initialZoom: number;
  onMessage: (msg: WebToRNMessage) => void;
  rasterLayers?: RasterLayer[];
  rasterServices?: RasterService[];
}

const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ initialCenter, initialZoom, onMessage, rasterLayers = [], rasterServices = [] }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const html = useRef(buildMapHtml(initialCenter[0], initialCenter[1], initialZoom, rasterLayers, rasterServices)).current;

  useImperativeHandle(ref, () => ({
    send: (msg: RNToWebMessage) => {
      const win = iframeRef.current?.contentWindow as Window | null | undefined;
      win?.postMessage(JSON.stringify(msg), '*');
    },
  }));

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        ref: iframeRef,
        srcDoc: html,
        title: 'geosurvey-map',
        style: { width: '100%', height: '100%', border: 'none', display: 'block' },
        sandbox: 'allow-scripts allow-same-origin allow-popups',
      })}
    </View>
  );
});

GeoMap.displayName = 'GeoMap';

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' as any },
});

export default GeoMap;
