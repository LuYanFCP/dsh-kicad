#!/bin/sh
# Rebuild the ESP32 test programs (needs Espressif's Xtensa GCC, xtensa-esp32-elf-gcc, and esptool). The merged flash images
# ../<name>.bin (the program at 0x1000, where the ROM looks for the bootloader) are committed, so the tests do not need the
# toolchain: run this only after changing a source file.
set -e
cd "$(dirname "$0")"
CC=${CC:-$(command -v xtensa-esp32-elf-gcc || echo xtensa-esp32-elf-gcc)}  # the ESP32 driver of Espressif's xtensa-esp-elf toolchain
ESPTOOL=${ESPTOOL:-esptool.py}
CFLAGS=${CFLAGS:-"-mabi=call0 -Os -ffreestanding -fno-builtin -nostdlib -Wall"}
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
for prog in blink button hello interrupt wdt; do
    $CC $CFLAGS -T link.ld -Wl,--gc-sections -o "$out/$prog.elf" start.S "$prog.c"
    $ESPTOOL --chip esp32 elf2image --flash_mode dio --flash_freq 40m --flash_size 4MB -o "$out/$prog.app.bin" "$out/$prog.elf"
    $ESPTOOL --chip esp32 merge_bin -o "../$prog.bin" 0x1000 "$out/$prog.app.bin"
done
