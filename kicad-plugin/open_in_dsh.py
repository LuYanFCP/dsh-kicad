"""KiCad IPC action: open the current project in DeepSeek Harness.

KiCad runs this with KICAD_API_SOCKET / KICAD_API_TOKEN set. We ask KiCad which
project is open, copy its directory to the clipboard (dsh web has no workspace
flag; use "Add workspace" and paste), and start `dsh web` from that directory.
If a dsh web server is already running, starting another one simply opens a
second instance on a free port.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


def project_dir() -> str | None:
    try:
        from kipy import KiCad
        from kipy.proto.common.types import DocumentType
    except ImportError:
        return None
    try:
        kicad = KiCad()
        for kind in (DocumentType.DOCTYPE_SCHEMATIC, DocumentType.DOCTYPE_PCB):
            for doc in kicad.get_open_documents(kind):
                path = getattr(getattr(doc, "project", None), "path", "")
                if path:
                    return path
    except Exception as exc:  # KiCad not reachable or API mismatch
        print(f"dsh-kicad: could not query KiCad: {exc}", file=sys.stderr)
    return None


def copy_to_clipboard(text: str) -> bool:
    candidates = [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"], ["pbcopy"], ["clip"]]
    for argv in candidates:
        if shutil.which(argv[0]):
            try:
                subprocess.run(argv, input=text.encode(), check=True, timeout=5)
                return True
            except (subprocess.SubprocessError, OSError):
                continue
    return False


def main() -> int:
    directory = project_dir() or os.environ.get("KIPRJMOD") or os.getcwd()
    copied = copy_to_clipboard(directory)
    dsh = shutil.which("dsh") or shutil.which("dsh.cmd")
    if dsh is None:
        print("dsh-kicad: 'dsh' is not on PATH. Install it with: npm i -g @deepseek-ai/dsh", file=sys.stderr)
        return 1
    kwargs = {"cwd": directory, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        kwargs["creationflags"] = 0x00000008  # DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen([dsh, "web"], **kwargs)
    print(f"dsh-kicad: opened DeepSeek Harness for {directory}" + (" (path copied to clipboard)" if copied else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
