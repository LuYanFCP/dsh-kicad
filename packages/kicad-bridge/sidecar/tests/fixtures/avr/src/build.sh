#!/bin/sh
# Rebuild the test firmware (needs avr-gcc, avr-libc and avr-binutils). The .hex files and symbols.json are committed,
# so the tests do not need the toolchain: run this only after changing a source file.
set -e
cd "$(dirname "$0")"
out=..
for f in contention button_poll button_nopull blink_delay timer_ctc timer_ovf pcint_sleep int0_powerdown uses_adc uses_pwm; do
    avr-gcc -mmcu=attiny85 -Os -Wall -o /tmp/$f.elf $f.c
    avr-objcopy -O ihex -R .eeprom /tmp/$f.elf $out/$f.hex
done
for opt in O0 O1 Os O2; do
    avr-gcc -mmcu=attiny85 -$opt -Wall -o /tmp/selftest_$opt.elf selftest.c
    avr-objcopy -O ihex -R .eeprom /tmp/selftest_$opt.elf $out/selftest_$opt.hex
done
# data addresses of the variables the tests read
python3 - <<'PY'
import json, subprocess
syms = {}
for elf, names in (("/tmp/selftest_O0.elf", ["results"]), ("/tmp/selftest_O1.elf", ["results"]), ("/tmp/selftest_Os.elf", ["results"]), ("/tmp/selftest_O2.elf", ["results"]), ("/tmp/timer_ctc.elf", ["ticks"]), ("/tmp/timer_ovf.elf", ["overflows"]),
                   ("/tmp/pcint_sleep.elf", ["presses"]), ("/tmp/int0_powerdown.elf", ["wakes"])):
    table = {line.split()[2]: int(line.split()[0], 16) for line in subprocess.check_output(["avr-nm", elf], text=True).splitlines() if len(line.split()) == 3}
    for name in names:
        syms.setdefault(elf.rsplit("/", 1)[1][:-4], {})[name] = table[name] & 0xFFFF
json.dump(syms, open("../symbols.json", "w"), indent=1)
PY
