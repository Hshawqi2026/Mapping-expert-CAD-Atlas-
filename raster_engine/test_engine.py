from pathlib import Path
from tempfile import TemporaryDirectory

from affine import Affine
from engine import GCPInput, affine_rms, read_world_file, _solve_affine


def test_world_file_to_corner_transform():
    with TemporaryDirectory() as directory:
        path = Path(directory) / "sample.jgw"
        path.write_text("2\n0\n0\n-2\n101\n199\n", encoding="utf-8")
        transform = read_world_file(path)
        assert transform == Affine(2, 0, 100, 0, -2, 200)


def test_affine_gcp_fit_and_rms():
    gcps = [
        GCPInput(0, 0, 500000, 2700000),
        GCPInput(100, 0, 500100, 2700000),
        GCPInput(0, 100, 500000, 2699900),
        GCPInput(100, 100, 500100, 2699900),
    ]
    transform = _solve_affine(gcps)
    assert abs(transform.a - 1) < 1e-9
    assert abs(transform.e + 1) < 1e-9
    assert affine_rms(gcps, transform) < 1e-6
