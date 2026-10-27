#!/bin/sh
# Rebuild button_light.hex (needs avr-gcc, avr-libc and avr-binutils). The .hex is committed, so the demo needs no toolchain.
set -e
cd "$(dirname "$0")"
CC=${CC:-avr-gcc}
OBJCOPY=${OBJCOPY:-avr-objcopy}
"$CC" -mmcu=attiny85 -Os -Wall -o /tmp/button_light.elf button_light.c
"$OBJCOPY" -O ihex -R .eeprom /tmp/button_light.elf button_light.hex
