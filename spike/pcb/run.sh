#!/usr/bin/env bash
# Reproduce the PCB-0 (#9) evidence in docs/pcb-architecture.md.
#   spike/pcb/run.sh [work dir]      (default: a fresh mktemp dir; needs kicad-cli, and pcbnew for option B)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
fixture="$here/../../packages/kicad-bridge/sidecar/tests/fixtures/usb_attiny"
work=${1:-$(mktemp -d -t pcb-spike-XXXX)}
py=${PYTHON:-python3}
quiet() { grep -v assert || true; }   # KiCad builds print wx debug asserts on stderr

fresh() { rm -rf "$work/$1"; cp -r "$fixture" "$work/$1"; }
judge() { "$py" "$here/judge.py" "$@"; }

echo "== input: ERC and footprints"
fresh in
kicad-cli sch erc --severity-all --format json -o "$work/in/erc.json" "$work/in/usb_attiny.kicad_sch" 2>&1 | quiet

echo "== option A: the sidecar writes the board"
fresh a
(cd "$here" && "$py" option_a.py "$work/a/usb_attiny.kicad_sch" "$work/a/usb_attiny.kicad_pcb")
judge "$work/a/usb_attiny.kicad_pcb"

echo "== option A is what KiCad itself would write: re-save with kicad-cli pcb upgrade --force"
cp "$work/a/usb_attiny.kicad_pcb" "$work/a/resaved.kicad_pcb"
kicad-cli pcb upgrade --force "$work/a/resaved.kicad_pcb" 2>&1 | quiet
cmp "$work/a/usb_attiny.kicad_pcb" "$work/a/resaved.kicad_pcb" && echo "byte-identical"

echo "== option A, KiCad 8/9 net syntax (numbered nets), read by this KiCad"
fresh a9
(cd "$here" && "$py" option_a.py --kicad9 --zone "$work/a9/usb_attiny.kicad_sch" "$work/a9/usb_attiny.kicad_pcb")
judge "$work/a9/usb_attiny.kicad_pcb" --refill-zones

if "$py" -c 'import pcbnew' 2>/dev/null; then
  echo "== option B: pcbnew SWIG"
  fresh b
  (cd "$here" && "$py" option_b.py "$work/b/usb_attiny.kicad_sch" "$work/b/usb_attiny.kicad_pcb" 2>&1 | quiet)
  judge "$work/b/usb_attiny.kicad_pcb"
  echo "== A vs B: footprints, symbol paths and pad nets"
  "$py" "$here/compare.py" "$work/a/usb_attiny.kicad_pcb" "$work/b/usb_attiny.kicad_pcb"
else
  echo "== option B skipped: $py cannot import pcbnew"
fi

echo "== headless zone fill: kicad-cli pcb drc --refill-zones --save-board"
fresh z
(cd "$here" && "$py" option_a.py --zone "$work/z/usb_attiny.kicad_sch" "$work/z/usb_attiny.kicad_pcb")
cp "$work/z/usb_attiny.kicad_pcb" "$work/z/before.kicad_pcb"
echo "filled_polygon before: $(grep -c filled_polygon "$work/z/usb_attiny.kicad_pcb" || true)"
judge "$work/z/usb_attiny.kicad_pcb" --refill-zones
cmp -s "$work/z/before.kicad_pcb" "$work/z/usb_attiny.kicad_pcb" && echo "--refill-zones alone: file untouched"
judge "$work/z/usb_attiny.kicad_pcb" --refill-zones --save-board
echo "filled_polygon after --save-board: $(grep -c filled_polygon "$work/z/usb_attiny.kicad_pcb")"
"$py" "$here/compare.py" --sections "$work/z/before.kicad_pcb" "$work/z/usb_attiny.kicad_pcb"

echo "== incremental sync on the KiCad-saved board"
rm -rf "$work/s"; cp -r "$work/z" "$work/s"; rm -f "$work/s/before.kicad_pcb"
(cd "$here" && "$py" sync_scenario.py "$work/s")
judge "$work/s/usb_attiny.kicad_pcb"

echo "work dir: $work"
