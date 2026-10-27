"""Check the demo's result with KiCad only: the schematic with the beginner eval's checks (evals/novice-button-led) and, once there is
one, the board and its fab zip (evals/board_check.py).

    python demo/button-light/check.py packages/kicad-bridge/sidecar/src <the demo's workspace folder>

Exit code 0 only when every check holds.
"""
import glob
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EVALS = os.path.join(os.path.dirname(os.path.dirname(HERE)), "evals")
src, workspace = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])

print("== the schematic", flush=True)
ok = subprocess.run([sys.executable, os.path.join(EVALS, "novice-button-led", "verify.py"), src, workspace]).returncode == 0
boards = sorted(glob.glob(os.path.join(workspace, "*.kicad_pcb")))
print("\n== the board", flush=True)
if boards:
    sys.path.insert(0, EVALS)
    import board_check  # noqa: E402

    ok = board_check.report(board_check.check_board(src, boards[0])) and ok
else:
    print("no board yet (step 5 makes it)")
    ok = False
print("\nThe demo's result holds." if ok else "\nSomething above does not hold yet.")
sys.exit(0 if ok else 1)
