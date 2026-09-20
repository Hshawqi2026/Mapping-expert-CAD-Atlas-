"""Local raster/GIS engine for Agon Surveyor.

All processing is local. Heavy raster work is windowed through Rasterio/GDAL;
no image or coordinate is sent to a remote service.
"""
from __future__ import annotations

import json
import base64
import io
import logging
import math
import os
import re
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

try:
    import numpy as np
    import rasterio
    from rasterio.transform import Affine, from_gcps
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.warp import transform_bounds
    from rasterio.control import GroundControlPoint
    from pyproj import CRS
except ImportError as exc:  # pragma: no cover - clear message for desktop setup
    raise RuntimeError("Raster Engine requires rasterio, numpy and pyproj") from exc

LOGGER = logging.getLogger("agon.raster")
WORLD_FILE_EXTENSIONS = {".jgw", ".tfw", ".pgw", ".wld", ".gfw", ".tifw", ".tiffw"}


@dataclass(frozen=True)
class RasterInfo:
    path: str
    name: str
    width: int
    height: int
    bands: int
    dtype: str
    crs: str | None
    transform: tuple[float, float, float, float, float, float] | None
    bounds: tuple[float, float, float, float] | None
    resolution: tuple[float, float] | None
    has_world_file: bool
    georeferenced: bool


@dataclass(frozen=True)
class GCPInput:
    pixel: float
    line: float
    easting: float
    northing: float


def _affine_tuple(transform: Affine | None) -> tuple[float, float, float, float, float, float] | None:
    if transform is None:
        return None
    return (transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)


def _find_world_file(path: Path) -> Path | None:
    candidates = [path.with_suffix(ext) for ext in WORLD_FILE_EXTENSIONS]
    stem = path.with_suffix("")
    candidates.extend(stem.with_suffix(ext) for ext in WORLD_FILE_EXTENSIONS)
    # Standard names: image.jpg -> image.jgw, image.tif -> image.tfw, image.png -> image.pgw
    mapping = {".jpg": ".jgw", ".jpeg": ".jgw", ".tif": ".tfw", ".tiff": ".tfw", ".png": ".pgw"}
    if path.suffix.lower() in mapping:
        candidates.insert(0, path.with_suffix(mapping[path.suffix.lower()]))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def read_world_file(path: str | Path) -> Affine:
    """Read six-line world-file values in the standard A,D,B,E,C,F order."""
    world_path = Path(path)
    values = [float(line.strip()) for line in world_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(values) < 6:
        raise ValueError("World File must contain six numeric values")
    pixel_x, rotate_y, rotate_x, pixel_y, center_x, center_y = values[:6]
    # World file stores the center of the upper-left pixel; raster transform stores its corner.
    return Affine(pixel_x, rotate_x, center_x - pixel_x / 2 - rotate_x / 2,
                  rotate_y, pixel_y, center_y - rotate_y / 2 - pixel_y / 2)


def _crs_text(crs: CRS | None) -> str | None:
    if crs is None:
        return None
    try:
        return crs.to_string()
    except Exception:
        return str(crs)


def inspect_raster(path: str, crs_override: str | None = None) -> RasterInfo:
    source = Path(path).expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(str(source))
    world_file = _find_world_file(source)
    with rasterio.open(source) as dataset:
        transform = dataset.transform
        crs = CRS.from_user_input(crs_override) if crs_override else dataset.crs
        if (transform is None or transform == Affine.identity()) and world_file:
            transform = read_world_file(world_file)
        bounds = tuple(float(v) for v in rasterio.transform.array_bounds(dataset.height, dataset.width, transform)) if transform else None
        return RasterInfo(
            path=str(source), name=source.name, width=dataset.width, height=dataset.height,
            bands=dataset.count, dtype=str(dataset.dtypes[0]), crs=_crs_text(crs),
            transform=_affine_tuple(transform), bounds=bounds,
            resolution=(abs(float(transform.a)), abs(float(transform.e))) if transform else None,
            has_world_file=world_file is not None,
            georeferenced=bool(crs and transform and transform != Affine.identity()),
        )


def _solve_affine(gcps: Sequence[GCPInput]) -> Affine:
    if len(gcps) < 3:
        raise ValueError("Affine transformation requires at least three GCPs")
    design = np.array([[g.pixel, g.line, 1.0] for g in gcps], dtype=float)
    east = np.array([g.easting for g in gcps], dtype=float)
    north = np.array([g.northing for g in gcps], dtype=float)
    if np.linalg.matrix_rank(design) < 3:
        raise ValueError("GCPs are collinear; choose points covering the image")
    x, *_ = np.linalg.lstsq(design, east, rcond=None)
    y, *_ = np.linalg.lstsq(design, north, rcond=None)
    return Affine(float(x[0]), float(x[1]), float(x[2]), float(y[0]), float(y[1]), float(y[2]))


def affine_rms(gcps: Sequence[GCPInput], transform: Affine) -> float:
    if not gcps:
        return 0.0
    errors = []
    for gcp in gcps:
        estimated_x, estimated_y = transform * (gcp.pixel, gcp.line)
        errors.append((estimated_x - gcp.easting) ** 2 + (estimated_y - gcp.northing) ** 2)
    return float(math.sqrt(sum(errors) / len(errors)))


def georeference_raster(input_path: str, output_path: str, gcps: Sequence[GCPInput], crs: str, *, rms_warning: float = 2.0) -> dict:
    """Create a new GeoTIFF using GCP-derived affine transform; source remains untouched."""
    if len(gcps) < 3:
        raise ValueError("Add at least three GCPs for affine georeferencing")
    target_crs = CRS.from_user_input(crs)
    transform = _solve_affine(gcps)
    rms = affine_rms(gcps, transform)
    source_path = Path(input_path).expanduser().resolve()
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(source_path) as source:
        profile = source.profile.copy()
        profile.update(driver="GTiff", crs=target_crs, transform=transform,
                       width=source.width, height=source.height, count=source.count,
                       compress="deflate", tiled=True)
        with rasterio.open(destination, "w", **profile) as target:
            for band in range(1, source.count + 1):
                # Windowed block iteration avoids loading a large aerial image into RAM.
                for _, window in source.block_windows(band):
                    target.write(source.read(band, window=window), band, window=window)
    LOGGER.info("Georeferenced %s -> %s; GCPs=%d RMS=%.6f", source_path, destination, len(gcps), rms)
    return {"output": str(destination), "crs": target_crs.to_string(), "transform": _affine_tuple(transform),
            "rms_error": rms, "warning": rms > rms_warning, "gcp_count": len(gcps)}


def reproject_raster(input_path: str, output_path: str, target_crs: str) -> dict:
    """Reproject a raster to the selected CRS using GDAL-backed Rasterio."""
    destination_crs = CRS.from_user_input(target_crs)
    with rasterio.open(input_path) as source:
        if not source.crs:
            raise ValueError("Input raster has no CRS; georeference it before reprojection")
        transform, width, height = calculate_default_transform(source.crs, destination_crs, source.width, source.height, *source.bounds)
        profile = source.profile.copy()
        profile.update(crs=destination_crs, transform=transform, width=width, height=height, driver="GTiff", tiled=True, compress="deflate")
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(output_path, "w", **profile) as target:
            for band in range(1, source.count + 1):
                reproject(source=rasterio.band(source, band), destination=rasterio.band(target, band), src_transform=source.transform,
                          src_crs=source.crs, dst_transform=transform, dst_crs=destination_crs, resampling=Resampling.bilinear)
    LOGGER.info("Reprojected %s -> %s (%s)", input_path, output_path, destination_crs)
    return asdict(inspect_raster(output_path))


def read_window(path: str, x: int, y: int, width: int, height: int, band: int = 1) -> dict:
    """Read a bounded raster window for previews/tiles rather than the full source."""
    with rasterio.open(path) as dataset:
        window = rasterio.windows.Window(x, y, width, height)
        data = dataset.read(band, window=window, boundless=True, fill_value=0)
        return {"shape": list(data.shape), "dtype": str(data.dtype), "min": float(data.min()), "max": float(data.max())}


def preview_raster(path: str, max_size: int = 1600) -> dict:
    """Create a bounded local PNG preview and WGS84 bounds without uploading the source."""
    from PIL import Image
    with rasterio.open(path) as dataset:
        scale = min(1.0, max_size / max(dataset.width, dataset.height))
        width, height = max(1, int(dataset.width * scale)), max(1, int(dataset.height * scale))
        data = dataset.read(out_shape=(min(dataset.count, 4), height, width), resampling=Resampling.bilinear)
        if data.shape[0] == 1:
            values = data[0]
            if values.dtype != np.uint8:
                low, high = np.percentile(values, (2, 98))
                values = np.clip((values - low) * 255 / max(high - low, 1), 0, 255).astype(np.uint8)
            image = Image.fromarray(values, mode="L").convert("RGBA")
        else:
            values = data[:3]
            if values.dtype != np.uint8:
                values = np.clip(values, 0, 255).astype(np.uint8)
            image = Image.fromarray(np.moveaxis(values, 0, -1), mode="RGB").convert("RGBA")
            if data.shape[0] == 4:
                image.putalpha(Image.fromarray(data[3], mode="L"))
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        bounds = tuple(float(v) for v in rasterio.transform.array_bounds(dataset.height, dataset.width, dataset.transform))
        if dataset.crs:
            west, south, east, north = transform_bounds(dataset.crs, "EPSG:4326", *bounds, densify_pts=21)
        else:
            raise ValueError("Raster has no CRS or World File; add GCPs before previewing it on the map")
        return {"data_url": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii"),
                "bounds": {"west": west, "south": south, "east": east, "north": north},
                "width": dataset.width, "height": dataset.height, "crs": _crs_text(dataset.crs)}


def json_info(path: str, crs_override: str | None = None) -> str:
    return json.dumps(asdict(inspect_raster(path, crs_override)), ensure_ascii=False)


def configure_logging(log_path: str | None = None) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if log_path:
        Path(log_path).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_path, encoding="utf-8"))
    logging.basicConfig(level=logging.INFO, handlers=handlers, format="%(asctime)s %(levelname)s %(name)s %(message)s")
