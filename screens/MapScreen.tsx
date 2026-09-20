import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import GeoMap, { GeoMapHandle } from '../components/GeoMap';
import FAB from '../components/FAB';
import LayerPickerModal from '../components/LayerPickerModal';
import FeatureFormModal from '../components/FeatureFormModal';
import ProjectSwitcherModal from '../components/ProjectSwitcherModal';
import DeveloperFooter from '../components/DeveloperFooter';
import BuildingModelModal from '../components/BuildingModelModal';
import { useTheme } from '../context/ThemeContext';
import { useProjects } from '../context/ProjectsContext';
import { DrawMode, FeatureType, GeoFeature, MapBounds, WebToRNMessage } from '../types';
import { fetchOSMFeatures, MIN_ZOOM_FOR_FETCH } from '../lib/overpass';
import { uid, formatDistance, formatArea, pathLength, polygonAreaSqMeters } from '../lib/geo';
import { loadLastLayer, saveLastLayer } from '../lib/storage';
import { subscribeFocus } from '../lib/mapBus';
import { buildLocalBuildingModels, LocalModelConfig } from '../lib/buildingModel';

export default function MapScreen() {
  const { palette } = useTheme();
  const { activeProject, addFeature, addFeatures, updateFeature, updateFeatures, removeFeature, updateProjectView } = useProjects();
  const mapRef = useRef<GeoMapHandle>(null);

  const [ready, setReady] = useState(false);
  const [layerId, setLayerId] = useState('osm-standard');
  const [labelsOn, setLabelsOn] = useState(false);
  const [layerModalVisible, setLayerModalVisible] = useState(false);
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [drawCount, setDrawCount] = useState(0);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [pendingFeature, setPendingFeature] = useState<{ type: FeatureType; coords: [number, number][] } | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [zoom, setZoom] = useState(15);
  const [fetchingOSM, setFetchingOSM] = useState(false);
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [regionFeatures, setRegionFeatures] = useState<GeoFeature[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<GeoFeature | null>(null);

  const initialCenter = activeProject?.center ?? [24.7136, 46.6753];
  const initialZoom = activeProject?.zoom ?? 15;

  useEffect(() => {
    loadLastLayer().then((id) => {
      if (id) setLayerId(id);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const syncFeatures = useCallback(() => {
    if (!ready) return;
    mapRef.current?.send({ type: 'SET_FEATURES', payload: { features: activeProject?.features ?? [] } });
  }, [ready, activeProject?.features]);

  useEffect(() => {
    syncFeatures();
  }, [syncFeatures]);

  useEffect(() => {
    const unsub = subscribeFocus((coords) => {
      setTimeout(() => mapRef.current?.send({ type: 'FOCUS_FEATURE', payload: { coords } }), 200);
    });
    return unsub;
  }, []);

  const handleWebMessage = useCallback(
    (msg: WebToRNMessage) => {
      switch (msg.type) {
        case 'READY':
          setReady(true);
          mapRef.current?.send({ type: 'SET_LAYER', payload: { id: layerId } });
          syncFeatures();
          break;
        case 'MAP_MOVED':
          setBounds(msg.payload.bounds);
          setZoom(msg.payload.zoom);
          if (activeProject) updateProjectView(msg.payload.center, msg.payload.zoom);
          break;
        case 'FEATURE_CLICK': {
          const feature = activeProject?.features.find((item) => item.id === msg.payload?.id);
          if (feature) setSelectedFeature(feature);
          break;
        }
        case 'DRAW_UPDATE':
          setDrawCount(msg.payload.count);
          break;
        case 'DRAW_COMPLETE': {
          const coords = msg.payload.coords as [number, number][];
          const mode = msg.payload.mode as DrawMode;
          if (mode === 'measure-line' || mode === 'measure-area') {
            const value = mode === 'measure-line' ? formatDistance(pathLength(coords)) : formatArea(polygonAreaSqMeters(coords));
            Alert.alert(mode === 'measure-line' ? 'قياس المسافة' : 'قياس المساحة', value);
            setDrawMode('none'); setDrawCount(0);
            break;
          }
          if (mode === 'rectangle') {
            const latitudes = coords.map((p) => p[0]);
            const longitudes = coords.map((p) => p[1]);
            const selectedBounds: MapBounds = { north: Math.max(...latitudes), south: Math.min(...latitudes), east: Math.max(...longitudes), west: Math.min(...longitudes) };
            fetchRegionAndPrepareModel(selectedBounds);
            setDrawMode('none'); setDrawCount(0);
            break;
          }
          const type: FeatureType = mode === 'point' ? 'point' : mode === 'polygon' ? 'polygon' : mode === 'building' ? 'building' : 'line';
          if (type === 'polygon' || type === 'building') {
            const label = type === 'building' ? 'مبنى مرسوم' : 'مضلع مرسوم';
            addFeature({
              id: uid(), type, name: `${label} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
              category: type === 'building' ? 'مبنى سكني' : 'قطعة أرض', coords,
              source: 'manual', color: type === 'building' ? '#7C3AED' : '#0E7C66',
              createdAt: Date.now(), modelSource: type === 'building' ? 'manual' : undefined,
              layerId: `manual-${type}`, visible: true,
            });
            showToast(type === 'building' ? 'تم حفظ المبنى تلقائياً' : 'تم حفظ المضلع تلقائياً');
          } else {
            setPendingFeature({ type, coords });
          }
          setDrawMode('none');
          setDrawCount(0);
          break;
        }
        default:
          break;
      }
    },
    [layerId, syncFeatures, activeProject, updateProjectView, addFeature, showToast]
  );

  const selectLayer = (id: string) => {
    setLayerId(id);
    saveLastLayer(id);
    mapRef.current?.send({ type: 'SET_LAYER', payload: { id } });
    setLayerModalVisible(false);
  };

  const toggleLabels = (v: boolean) => {
    setLabelsOn(v);
    mapRef.current?.send({ type: 'SET_OVERLAY', payload: { show: v } });
  };

  const startDraw = (mode: DrawMode) => {
    setDrawMode(mode);
    setDrawCount(0);
    setSpeedDialOpen(false);
    mapRef.current?.send({ type: 'SET_DRAW_MODE', payload: { mode } });
  };

  const finishDraw = () => mapRef.current?.send({ type: 'FINISH_DRAWING' });
  const cancelDraw = () => {
    setDrawMode('none');
    setDrawCount(0);
    mapRef.current?.send({ type: 'CANCEL_DRAWING' });
    mapRef.current?.send({ type: 'SET_DRAW_MODE', payload: { mode: 'none' } });
  };
  const undoPoint = () => mapRef.current?.send({ type: 'UNDO_POINT' });

  const saveFeature = (name: string, category: string, color: string, notes: string) => {
    if (selectedFeature) {
      updateFeature(selectedFeature.id, { name, category, color, notes: notes || undefined });
      setSelectedFeature(null);
      showToast('تم تحديث العنصر بنجاح');
      return;
    }
    if (!pendingFeature) return;
    const feature: GeoFeature = {
      id: uid(),
      type: pendingFeature.type,
      name,
      category,
      coords: pendingFeature.coords,
      source: 'manual',
      color,
      createdAt: Date.now(),
      notes: notes || undefined,
      layerId: `manual-${pendingFeature.type}`,
      visible: true,
    };
    addFeature(feature);
    setPendingFeature(null);
    showToast('تم حفظ العنصر بنجاح');
  };

  const deleteSelectedFeature = () => {
    if (!selectedFeature) return;
    Alert.alert('حذف العنصر', `هل تريد حذف «${selectedFeature.name}»؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => { removeFeature(selectedFeature.id); setSelectedFeature(null); showToast('تم حذف العنصر'); } },
    ]);
  };

  const locateMe = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('الإذن مطلوب', 'يرجى السماح بالوصول للموقع لتحديد موقعك على الخريطة.');
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      mapRef.current?.send({
        type: 'LOCATE',
        payload: { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 15 },
      });
    } catch (e) {
      Alert.alert('تعذر تحديد الموقع', 'حدث خطأ أثناء الحصول على موقعك الحالي.');
    } finally {
      setLocating(false);
    }
  };

  const fetchBuildings = async () => {
    if (!bounds) {
      showToast('انتظر حتى تحميل الخريطة');
      return;
    }
    if (zoom < MIN_ZOOM_FOR_FETCH) {
      Alert.alert('قرّب أكثر', 'قم بتكبير الخريطة أكثر (تكبير 15 فأعلى) لجلب المباني والمعالم بدقة عالية من OpenStreetMap.');
      return;
    }
    try {
      setFetchingOSM(true);
      setSpeedDialOpen(false);
      const result = await fetchOSMFeatures(bounds);
      addFeatures(result.features);
      showToast(
        `تم رصد ${result.counts.buildings} مبنى، ${result.counts.poi} معلم، ${result.counts.roads} طريق من OpenStreetMap`
      );
    } catch (e: any) {
      Alert.alert('تعذر الجلب', e?.message ?? 'حدث خطأ أثناء الاتصال بخدمة الخرائط.');
    } finally {
      setFetchingOSM(false);
    }
  };

  const fetchRegionAndPrepareModel = async (selectedBounds: MapBounds) => {
    try {
      setFetchingOSM(true);
      const result = await fetchOSMFeatures(selectedBounds, undefined, { buildingsOnly: true });
      setRegionFeatures(result.features);
      addFeatures(result.features);
      setModelModalVisible(true);
      showToast(`تم جلب ${result.features.length} عنصراً من المنطقة المحددة`);
    } catch (e: any) {
      Alert.alert('تعذر جلب المنطقة', e?.message ?? 'تحقق من اتصال الإنترنت ثم حاول مرة أخرى.');
    } finally { setFetchingOSM(false); }
  };

  const create3DModel = (config: LocalModelConfig) => {
    const result = buildLocalBuildingModels(regionFeatures, config, activeProject ?? undefined);
    if (!result.updates.length) {
      Alert.alert('لا توجد مبانٍ', 'لم يتم العثور على بصمات مبانٍ صالحة داخل المنطقة المحددة.');
      return;
    }
    const ids = result.updates.map((item) => item.id);
    updateFeatures(ids, result.updates[0].patch);
    setModelModalVisible(false);
    Alert.alert(
      'اكتمل المعالج المحلي',
      `تم بثق ${result.summary.buildingCount} مبنى بارتفاع ${result.summary.averageHeightM.toFixed(2)} م.\nالمساحة المبنية: ${formatArea(result.summary.footprintAreaSqMeters)}\nالحجم التقريبي: ${result.summary.totalVolumeM3.toFixed(1)} م³`,
    );
    showToast(`تم إنشاء نموذج محلي لـ ${result.summary.buildingCount} مبنى`);
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top']}>
      <View style={styles.flex}>
        <GeoMap ref={mapRef} initialCenter={initialCenter as [number, number]} initialZoom={initialZoom} onMessage={handleWebMessage} />

        {!ready && (
          <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { backgroundColor: palette.bg }]}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={{ color: palette.textMuted, marginTop: 10 }}>جاري تحميل الخريطة...</Text>
          </View>
        )}

        {/* Top bar */}
        <View style={[styles.topBar, { backgroundColor: palette.bgElevated, borderColor: palette.border }]}>
          <Pressable style={styles.topBarContent} onPress={() => setProjectModalVisible(true)}>
            <Ionicons name="chevron-down" size={16} color={palette.textMuted} />
            <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
              <Text style={[styles.projectName, { color: palette.text }]} numberOfLines={1}>
                {activeProject?.name ?? 'مشروع'}
              </Text>
              <Text style={{ color: palette.textMuted, fontSize: 11 }}>
                {activeProject?.features.length ?? 0} عنصر محفوظ
              </Text>
            </View>
          </Pressable>
          <View style={[styles.iconCircle, { backgroundColor: palette.primary + '22' }]}>
            <Ionicons name="map" size={18} color={palette.primary} />
          </View>
        </View>

        {/* Right vertical toolbar */}
        <View style={styles.rightToolbar}>
          <FAB icon="layers" onPress={() => setLayerModalVisible(true)} />
          <FAB icon="locate" onPress={locateMe} disabled={locating} />
          <FAB icon="add" onPress={() => mapRef.current?.send({ type: 'ZOOM_IN' })} />
          <FAB icon="remove" onPress={() => mapRef.current?.send({ type: 'ZOOM_OUT' })} />
        </View>

        {/* OSM fetch status badge */}
        {zoom < MIN_ZOOM_FOR_FETCH && drawMode === 'none' && (
          <View style={[styles.zoomHint, { backgroundColor: palette.bgElevated, borderColor: palette.border }]}>
            <Ionicons name="search" size={13} color={palette.textMuted} />
            <Text style={{ color: palette.textMuted, fontSize: 11, marginRight: 6 }}>
              كبّر الخريطة لتفعيل التعرف الدقيق على المباني
            </Text>
          </View>
        )}

        {toast && (
          <View style={[styles.toast, { backgroundColor: palette.primaryDark }]}> 
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        <DeveloperFooter overlay />

        {/* Draw mode bottom bar */}
        {drawMode !== 'none' ? (
          <View style={[styles.drawBar, { backgroundColor: palette.bgElevated, borderColor: palette.border }]}>
            <Text style={[styles.drawText, { color: palette.text }]}>
              {drawMode === 'point' ? 'انقر على الخريطة لتحديد نقطة' : drawMode === 'measure-line' ? `قياس مسافة: ${drawCount} نقطة` : drawMode === 'measure-area' ? `قياس مساحة: ${drawCount} نقطة` : drawMode === 'building' ? `رسم مبنى: ${drawCount} نقطة — انقر على البداية للإغلاق` : `رسم مضلع: ${drawCount} نقطة — انقر على البداية للإغلاق`}
            </Text>
            <View style={styles.drawActions}>
              <Pressable onPress={cancelDraw} style={[styles.drawBtn, { backgroundColor: palette.card }]}>
                <Ionicons name="close" size={18} color={palette.danger} />
              </Pressable>
              {drawMode !== 'point' && (
                <Pressable onPress={undoPoint} style={[styles.drawBtn, { backgroundColor: palette.card }]}>
                  <Ionicons name="arrow-undo" size={18} color={palette.text} />
                </Pressable>
              )}
              {drawMode !== 'point' && (
                <Pressable
                  onPress={finishDraw}
                  disabled={drawCount < ((drawMode === 'polygon' || drawMode === 'building' || drawMode === 'measure-area') ? 3 : 2)}
                  style={[styles.drawBtnWide, { backgroundColor: palette.primary, opacity: drawCount < ((drawMode === 'polygon' || drawMode === 'building' || drawMode === 'measure-area') ? 3 : 2) ? 0.5 : 1 }]}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.finishText}>إنهاء</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.speedDialWrap}>
            {speedDialOpen && (
              <View style={styles.speedDialOptions}>
                <SpeedOption icon="location" label="نقطة" color={palette.primary} onPress={() => startDraw('point')} />
                <SpeedOption icon="trail-sign" label="خط" color={palette.accent} onPress={() => startDraw('line')} />
                <SpeedOption icon="shapes" label="رسم مضلع" color="#7C3AED" onPress={() => startDraw('polygon')} />
                <SpeedOption icon="business" label="رسم مبنى" color="#9333EA" onPress={() => startDraw('building')} />
                <SpeedOption
                  icon="business"
                  label={fetchingOSM ? 'جارٍ الجلب...' : 'جلب مباني OSM'}
                  color="#2563EB"
                  onPress={fetchBuildings}
                  loading={fetchingOSM}
                />
                <SpeedOption icon="cube-outline" label="تحديد منطقة / نموذج 3D" color="#9333EA" onPress={() => startDraw('rectangle')} />
                <SpeedOption icon="resize-outline" label="قياس مسافة" color="#D97706" onPress={() => startDraw('measure-line')} />
                <SpeedOption icon="scan-outline" label="قياس مساحة" color="#DC2626" onPress={() => startDraw('measure-area')} />
              </View>
            )}
            <FAB
              icon={speedDialOpen ? 'close' : 'add'}
              onPress={() => setSpeedDialOpen((v) => !v)}
              active
              size={26}
              style={styles.mainFab}
            />
          </View>
        )}

        <LayerPickerModal
          visible={layerModalVisible}
          onClose={() => setLayerModalVisible(false)}
          currentLayerId={layerId}
          onSelect={selectLayer}
          labelsOn={labelsOn}
          onToggleLabels={toggleLabels}
        />
        <ProjectSwitcherModal visible={projectModalVisible} onClose={() => setProjectModalVisible(false)} />
        <FeatureFormModal
          visible={!!pendingFeature || !!selectedFeature}
          type={selectedFeature?.type ?? pendingFeature?.type ?? null}
          pointCount={selectedFeature?.coords.length ?? pendingFeature?.coords.length ?? 0}
          feature={selectedFeature}
          onCancel={() => { setPendingFeature(null); setSelectedFeature(null); }}
          onDelete={selectedFeature ? deleteSelectedFeature : undefined}
          onSave={saveFeature}
        />
        <BuildingModelModal
          visible={modelModalVisible}
          buildingCount={regionFeatures.filter((feature) => feature.type === 'building').length}
          onClose={() => setModelModalVisible(false)}
          onCreate={create3DModel}
        />
      </View>
    </SafeAreaView>
  );
}

function SpeedOption({
  icon,
  label,
  color,
  onPress,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.speedOptionRow} disabled={loading}>
      <View style={[styles.speedLabel, { backgroundColor: palette.bgElevated, borderColor: palette.border }]}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
      <View style={[styles.speedIcon, { backgroundColor: color }]}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={icon} size={20} color="#fff" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingOverlay: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 14 : 6,
    left: 14,
    right: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  topBarContent: { flexDirection: 'row-reverse', alignItems: 'center', flex: 1 },
  projectName: { fontSize: 14, fontWeight: '800', maxWidth: 220 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rightToolbar: { position: 'absolute', top: 78, right: 14, gap: 10 },
  zoomHint: {
    position: 'absolute',
    top: 78,
    left: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 190,
  },
  toast: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  drawBar: {
    position: 'absolute',
    bottom: 24,
    left: 14,
    right: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  drawText: { fontSize: 13, fontWeight: '700', textAlign: 'right', marginBottom: 10 },
  drawActions: { flexDirection: 'row-reverse', gap: 10 },
  drawBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drawBtnWide: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 6,
  },
  finishText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  speedDialWrap: { position: 'absolute', bottom: 30, right: 14, alignItems: 'flex-end' },
  speedDialOptions: { marginBottom: 12, alignItems: 'flex-end', gap: 12 },
  speedOptionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  speedLabel: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  speedIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  mainFab: { width: 58, height: 58, borderRadius: 29 },
});
