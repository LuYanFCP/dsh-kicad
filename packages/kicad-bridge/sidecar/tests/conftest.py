import os
import shutil

import pytest

from dsh_kicad_sidecar.kicad_cli import find_kicad_cli
from dsh_kicad_sidecar.symbols import default_symbol_dirs

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")

needs_kicad_cli = pytest.mark.skipif(find_kicad_cli() is None, reason="kicad-cli not installed")
needs_symbols = pytest.mark.skipif(not default_symbol_dirs(), reason="KiCad symbol libraries not installed")


@pytest.fixture
def project(tmp_path):
    """Copy a fixture project into tmp and return the path of its schematic."""

    def make(name):
        dst = tmp_path / name
        shutil.copytree(os.path.join(FIXTURES, name), dst)
        return str(dst / f"{name}.kicad_sch")

    return make
