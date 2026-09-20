# Raster Engine Architecture

## Overview

Agon Surveyor now contains a local Python Raster Engine that is started by the Electron desktop process on demand. The engine communicates through stdin/stdout JSON Lines; it does not open a network port and it never uploads raster files, control points, or coordinates.

## Processing capabilities

The engine uses Rasterio/GDAL-backed operations for raster inspection, World File parsing, windowed reads, bounded previews, affine GCP fitting, RMS error calculation, GeoTIFF creation, and CRS reprojection through `pyproj`. Georeferencing always writes a new output file and leaves the source unchanged.

## Electron integration

The secure preload exposes only the following operations to the renderer: opening a local raster file, inspecting metadata, generating a bounded preview, georeferencing, and reprojection. The main process validates and proxies these calls to the local Python process. In packaged Windows builds, PyInstaller produces `agon-raster-engine.exe`; development falls back to the configured Python interpreter.

## Current UI integration

The map screen includes the **Raster & Aerial Imagery Manager**. It imports a local raster, displays CRS and dimensions, previews georeferenced data on the Leaflet map, enables visibility and opacity controls, and supports layer ordering. Project persistence stores raster layer metadata and local source paths.

## Next implementation phase

The next phase should add the full GCP editor with map-assisted control-point placement, CRS/zone selection for unreferenced files, Swipe Comparison, WMS/WMTS source management, offline raster/tile cache controls, and a dedicated GeoTIFF export workflow in the same IPC contract.
