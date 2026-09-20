"""Local stdlib JSON-lines bridge for the Raster Engine.

Electron starts this process with stdin/stdout pipes. Each request is one JSON
object and each response is one JSON object. The bridge never opens a network
port and never uploads source imagery.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import traceback
from dataclasses import asdict
from pathlib import Path

from engine import GCPInput, configure_logging, georeference_raster, inspect_raster, preview_raster, read_window, reproject_raster


def response(request_id, *, result=None, error=None):
    body = {"id": request_id, "ok": error is None}
    if error is None:
        body["result"] = result
    else:
        body["error"] = error
    sys.stdout.write(json.dumps(body, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle(command: str, args: dict):
    if command == "inspect":
        return asdict(inspect_raster(args["path"], args.get("crs")))
    if command == "window":
        return read_window(args["path"], int(args["x"]), int(args["y"]), int(args["width"]), int(args["height"]), int(args.get("band", 1)))
    if command == "preview":
        return preview_raster(args["path"], int(args.get("max_size", 1600)))
    if command == "georeference":
        gcps = [GCPInput(float(g["pixel"]), float(g["line"]), float(g["easting"]), float(g["northing"])) for g in args["gcps"]]
        return georeference_raster(args["input"], args["output"], gcps, args["crs"], rms_warning=float(args.get("rms_warning", 2.0)))
    if command == "reproject":
        return reproject_raster(args["input"], args["output"], args["crs"])
    if command == "health":
        return {"engine": "agon-raster", "version": "1.0", "offline": True}
    raise ValueError(f"Unsupported Raster Engine command: {command}")


def main() -> int:
    configure_logging(os.environ.get("AGON_RASTER_LOG"))
    logging.info("Raster Engine started")
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        request_id = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            result = handle(request["command"], request.get("args", {}))
            response(request_id, result=result)
        except Exception as exc:
            logging.error("Raster request failed: %s\n%s", exc, traceback.format_exc())
            response(request_id, error={"message": str(exc), "type": type(exc).__name__})
    logging.info("Raster Engine stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
