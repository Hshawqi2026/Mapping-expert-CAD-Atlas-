import { BASE_LAYERS, SATELLITE_LABELS_OVERLAY } from "./mapLayers";
import type { RasterLayer, RasterService } from "../types";

// Builds a fully self-contained HTML document embedding Leaflet + all free
// base layers + a small messaging protocol used to talk to React Native
// (native via WebView postMessage, web via window.postMessage/iframe).
export function buildMapHtml(
  centerLat: number,
  centerLon: number,
  zoom: number,
  rasterLayers: RasterLayer[] = [],
  rasterServices: RasterService[] = [],
): string {
  const layersJSON = JSON.stringify(BASE_LAYERS);
  const labelsJSON = JSON.stringify(SATELLITE_LABELS_OVERLAY);
  const rastersJSON = JSON.stringify(rasterLayers);
  const servicesJSON = JSON.stringify(rasterServices);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #0b1512; }
  .leaflet-control-attribution { font-size: 8px; opacity: 0.8; }
  .leaflet-control-scale-line { font-size: 10px; }
  .gs-tooltip { background: rgba(15,27,20,0.85); color: #fff; border: none; box-shadow: 0 1px 4px rgba(0,0,0,0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-family: -apple-system, Roboto, sans-serif; }
  .gs-tooltip::before { display: none; }
  .gs-vertex-icon { background: #ffffff; border: 2px solid #0E7C66; border-radius: 50%; width: 10px; height: 10px; }
  .crosshair { cursor: crosshair; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var LAYERS = ${layersJSON};
  var LABELS_OVERLAY = ${labelsJSON};
  var RASTER_LAYERS = ${rastersJSON};
  var RASTER_SERVICES = ${servicesJSON};

  var map = L.map('map', { zoomControl: false, attributionControl: true, tap: true })
    .setView([${centerLat}, ${centerLon}], ${zoom});

  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  var tileLayers = {};
  var desktopTiles = window.location.hostname === '127.0.0.1';
  var DesktopTileLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
      var remoteUrl = L.TileLayer.prototype.getTileUrl.call(this, coords);
      return '/tile-proxy?url=' + encodeURIComponent(remoteUrl);
    }
  });
  LAYERS.forEach(function(l){
    tileLayers[l.id] = desktopTiles ? new DesktopTileLayer(l.url, {
      subdomains: l.subdomains || 'abc',
      maxZoom: l.maxZoom || 19,
      attribution: l.attribution,
      crossOrigin: true
    }) : L.tileLayer(l.url, {
      subdomains: l.subdomains || 'abc',
      maxZoom: l.maxZoom || 19,
      attribution: l.attribution,
      crossOrigin: true
    });
  });
  var currentLayerId = 'osm-standard';
  tileLayers[currentLayerId].addTo(map);

  var labelsLayer = L.tileLayer(LABELS_OVERLAY.url, { attribution: LABELS_OVERLAY.attribution, maxZoom: 19 });
  var labelsOn = false;

  var featureLayerGroup = L.layerGroup().addTo(map);
  var drawLayerGroup = L.layerGroup().addTo(map);
  var locationLayerGroup = L.layerGroup().addTo(map);
  var rasterLayerGroup = L.layerGroup().addTo(map);
  var serviceLayerGroup = L.layerGroup().addTo(map);
  var swipeActive = false, swipeRatio = 0.5;
  map.createPane('swipePane');
  map.getPane('swipePane').style.zIndex = 420;

  var drawMode = 'none';
  var drawPoints = [];

  function renderRasters(layers) {
    rasterLayerGroup.clearLayers();
    (layers || []).filter(function(r){ return r.visible !== false && r.previewUrl && r.bounds; })
      .sort(function(a,b){ return (a.zIndex || 0) - (b.zIndex || 0); })
      .forEach(function(r){
        var bounds = [[r.bounds.south, r.bounds.west], [r.bounds.north, r.bounds.east]];
        L.imageOverlay(r.previewUrl, bounds, { opacity: Math.max(0, Math.min(1, r.opacity ?? 1)), interactive: false }).addTo(rasterLayerGroup);
      });
  }

  function renderServices(services) {
    serviceLayerGroup.clearLayers();
    (services || []).filter(function(s){ return s.enabled !== false && s.url; }).forEach(function(s){
      var layer = s.type === 'WMS'
        ? L.tileLayer.wms(s.url, { layers: s.layers || '', format: 'image/png', transparent: true, opacity: s.opacity ?? 0.8, maxZoom: 22, attribution: s.attribution || 'WMS' })
        : L.tileLayer(s.url, { opacity: s.opacity ?? 0.8, maxZoom: 22, attribution: s.attribution || s.type });
      layer.addTo(serviceLayerGroup);
    });
  }
  function applySwipe() {
    map.getPane('swipePane').style.clipPath = swipeActive ? 'inset(0 ' + ((1 - swipeRatio) * 100) + '% 0 0)' : 'none';
  }

  function sendToRN(obj){
    var msg = JSON.stringify(obj);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  function styleFor(f){
    var color = f.color || '#0E7C66';
    return { color: color, weight: f.lineWidth || (f.type === 'point' ? 2 : 2.5), fillColor: color,
      fillOpacity: f.fillOpacity ?? (f.type === 'polygon' || f.type === 'building' ? 0.22 : 0.9),
      dashArray: f.source === 'osm' ? '4,3' : null };
  }

  function renderFeatures(features){
    featureLayerGroup.clearLayers();
    (features || []).filter(function(f){ return f.visible !== false; }).forEach(function(f){
      var st = styleFor(f);
      var layer;
      if (f.type === 'point') {
        layer = L.circleMarker([f.coords[0][0], f.coords[0][1]], {
          radius: 7, color: '#ffffff', weight: 2, fillColor: st.color, fillOpacity: 1
        });
      } else if (f.type === 'line') {
        layer = L.polyline(f.coords, st);
      } else {
        layer = L.polygon(f.coords, st);
        if (f.model3d && f.elevation) {
          var lift = Math.min(0.0008, Math.max(0.00008, f.elevation / 100000));
          var roof = f.coords.map(function(p){ return [p[0] + lift, p[1] - lift]; });
          L.polygon(roof, { color: st.color, weight: 1, fillColor: st.color, fillOpacity: 0.4 }).addTo(featureLayerGroup);
          for (var wi = 0; wi < f.coords.length; wi++) {
            var next = f.coords[(wi + 1) % f.coords.length];
            L.polygon([f.coords[wi], next, roof[(wi + 1) % roof.length], roof[wi]], { color: st.color, weight: 1, fillColor: st.color, fillOpacity: 0.32 }).addTo(featureLayerGroup);
          }
        }
      }
      var pointDetails = f.pointCode ? ' · الرمز: ' + f.pointCode : '';
      var elevationDetails = (f.elevation !== undefined && f.elevation !== null) ? ' · المنسوب: ' + f.elevation : '';
      layer.bindTooltip(f.name + pointDetails + elevationDetails, { className: 'gs-tooltip', direction: 'top', sticky: true });
      layer.on('click', function(event) {
        if (event && event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        sendToRN({ type: 'FEATURE_CLICK', payload: { id: f.id } });
      });
      layer.addTo(featureLayerGroup);
    });
  }

  function redrawTemp(){
    drawLayerGroup.clearLayers();
    if (drawPoints.length === 0) return;
    drawPoints.forEach(function(p){
      L.circleMarker(p, { radius: 5, color: '#0E7C66', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).addTo(drawLayerGroup);
    });
    if (drawPoints.length > 1) {
      if (drawMode === 'polygon' || drawMode === 'building' || drawMode === 'measure-area') {
        L.polygon(drawPoints, { color: '#F59E0B', weight: 2, dashArray: '6,4', fillOpacity: 0.15 }).addTo(drawLayerGroup);
      } else if (drawMode === 'rectangle' && drawPoints.length === 2) {
        L.rectangle([drawPoints[0], drawPoints[1]], { color: '#2563EB', weight: 2, dashArray: '6,4', fillOpacity: 0.12 }).addTo(drawLayerGroup);
      } else {
        L.polyline(drawPoints, { color: '#F59E0B', weight: 3, dashArray: '6,4' }).addTo(drawLayerGroup);
      }
    }
  }

  var userMarker = null, accuracyCircle = null;

  function handleCommand(cmd){
    if (!cmd || !cmd.type) return;
    switch (cmd.type) {
      case 'SET_LAYER': {
        var id = cmd.payload && cmd.payload.id;
        if (tileLayers[id]) {
          if (tileLayers[currentLayerId]) map.removeLayer(tileLayers[currentLayerId]);
          tileLayers[id].addTo(map);
          currentLayerId = id;
          if (tileLayers[currentLayerId]) tileLayers[currentLayerId].bringToBack();
        }
        break;
      }
      case 'SET_OVERLAY': {
        labelsOn = !!(cmd.payload && cmd.payload.show);
        if (labelsOn) labelsLayer.addTo(map); else map.removeLayer(labelsLayer);
        break;
      }
      case 'LOCATE': {
        var lat = cmd.payload.lat, lon = cmd.payload.lon, acc = cmd.payload.accuracy || 15;
        locationLayerGroup.clearLayers();
        L.circle([lat, lon], { radius: acc, color: '#22C79A', weight: 1, fillColor: '#22C79A', fillOpacity: 0.15 }).addTo(locationLayerGroup);
        L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#0E7C66', fillOpacity: 1 }).addTo(locationLayerGroup);
        map.setView([lat, lon], Math.max(map.getZoom(), 17), { animate: true });
        break;
      }
      case 'SET_FEATURES': {
        renderFeatures(cmd.payload && cmd.payload.features);
        break;
      }
      case 'SET_RASTERS': {
        RASTER_LAYERS = (cmd.payload && cmd.payload.layers) || [];
        renderRasters(RASTER_LAYERS);
        break;
      }
      case 'SET_RASTER_SERVICES': {
        RASTER_SERVICES = (cmd.payload && cmd.payload.services) || [];
        renderServices(RASTER_SERVICES);
        break;
      }
      case 'SET_SWIPE': {
        swipeActive = !!(cmd.payload && cmd.payload.enabled);
        swipeRatio = Math.max(0.05, Math.min(0.95, Number(cmd.payload && cmd.payload.ratio) || 0.5));
        applySwipe();
        break;
      }
      case 'SET_DRAW_MODE': {
        drawMode = (cmd.payload && cmd.payload.mode) || 'none';
        drawPoints = [];
        redrawTemp();
        var el = document.getElementById('map');
        if (drawMode !== 'none') el.classList.add('crosshair'); else el.classList.remove('crosshair');
        break;
      }
      case 'FINISH_DRAWING': {
        if (drawPoints.length >= ((drawMode === 'polygon' || drawMode === 'building' || drawMode === 'measure-area') ? 3 : 2)) {
          sendToRN({ type: 'DRAW_COMPLETE', payload: { coords: drawPoints.slice(), mode: drawMode } });
        }
        drawPoints = [];
        redrawTemp();
        break;
      }
      case 'CANCEL_DRAWING': {
        drawPoints = [];
        redrawTemp();
        break;
      }
      case 'UNDO_POINT': {
        drawPoints.pop();
        redrawTemp();
        sendToRN({ type: 'DRAW_UPDATE', payload: { count: drawPoints.length } });
        break;
      }
      case 'FIT_BOUNDS': {
        var b = cmd.payload;
        if (b) map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40] });
        break;
      }
      case 'ZOOM_IN': map.zoomIn(); break;
      case 'ZOOM_OUT': map.zoomOut(); break;
      case 'FOCUS_FEATURE': {
        var coords = cmd.payload && cmd.payload.coords;
        if (coords && coords.length === 1) map.setView(coords[0], 18, { animate: true });
        else if (coords && coords.length > 1) map.fitBounds(coords, { padding: [50, 50] });
        break;
      }
    }
  }

  function onRNMessage(raw){
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      handleCommand(data);
    } catch (err) {}
  }

  document.addEventListener('message', function(e){ onRNMessage(e.data); });
  window.addEventListener('message', function(e){ onRNMessage(e.data); });

  map.on('click', function(e){
    if (drawMode === 'point') {
      sendToRN({ type: 'DRAW_COMPLETE', payload: { coords: [[e.latlng.lat, e.latlng.lng]], mode: 'point' } });
      } else if (drawMode === 'line' || drawMode === 'polygon' || drawMode === 'building' || drawMode === 'rectangle' || drawMode === 'measure-line' || drawMode === 'measure-area') {
        if ((drawMode === 'polygon' || drawMode === 'building') && drawPoints.length >= 3) {
          var first = drawPoints[0];
          var startPoint = map.latLngToContainerPoint(L.latLng(first[0], first[1]));
          var closePoint = map.containerPointToLatLng(startPoint.add([16, 0]));
          var closeDistance = map.distance(L.latLng(first[0], first[1]), closePoint);
          var distance = map.distance(e.latlng, L.latLng(first[0], first[1]));
          if (distance <= Math.max(8, closeDistance)) {
            sendToRN({ type: 'DRAW_COMPLETE', payload: { coords: drawPoints.slice(), mode: drawMode } });
            drawPoints = [];
            redrawTemp();
            return;
          }
        }
        drawPoints.push([e.latlng.lat, e.latlng.lng]);
      redrawTemp();
      sendToRN({ type: 'DRAW_UPDATE', payload: { count: drawPoints.length } });
    } else {
      sendToRN({ type: 'MAP_CLICK', payload: { lat: e.latlng.lat, lon: e.latlng.lng } });
    }
  });

  var moveTimer = null;
  map.on('moveend', function(){
    clearTimeout(moveTimer);
    moveTimer = setTimeout(function(){
      var b = map.getBounds();
      var c = map.getCenter();
      sendToRN({
        type: 'MAP_MOVED',
        payload: {
          bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
          zoom: map.getZoom(),
          center: [c.lat, c.lng]
        }
      });
    }, 150);
  });

  window.addEventListener('load', function(){
    renderRasters(RASTER_LAYERS);
    renderServices(RASTER_SERVICES);
    sendToRN({ type: 'READY' });
  });
  setTimeout(function(){ renderRasters(RASTER_LAYERS); sendToRN({ type: 'READY' }); }, 400);
})();
</script>
</body>
</html>`;
}
