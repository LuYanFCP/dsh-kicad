#!/bin/sh
# Rebuild the test firmware (needs avr-gcc, avr-libc and avr-binutils). The .hex files and symbols.json are committed,
# so the tests do not need the toolchain: run this only after changing a source file.
set -e
cd "$(dirname "$0")"
out=..
for f in contention button_poll button_nopull blink_delay timer_ctc timer_ovf pcint_sleep int0_powerdown adc_threshold adc_read10 adc_irq adc_bandgap pwm_fast pwm_pc pwm_ctc_toggle pwm_fade millis_blink wdt_reset wdt_fed wdt_interrupt eeprom_counter timer1_pwm timer1_complementary timer1_ctc timer1_ovf comparator_irq comparator_poll adc_diff adc_temp usi_spi_master usi_strobe reset_boots didr_pullup uses_acme uses_adc_trigger uses_usi_twowire uses_timer1_foc uses_mode5; do
    avr-gcc -mmcu=attiny85 -Os -Wall -o /tmp/$f.elf $f.c
    avr-objcopy -O ihex -R .eeprom /tmp/$f.elf $out/$f.hex
done
avr-gcc -mmcu=attiny25 -Os -Wall -o /tmp/button_poll_t25.elf button_poll.c
avr-objcopy -O ihex -R .eeprom /tmp/button_poll_t25.elf $out/button_poll_t25.hex
avr-gcc -mmcu=attiny85 -Os -Wall -o /tmp/eeprom_initial.elf eeprom_initial.c
cp /tmp/eeprom_initial.elf $out/eeprom_initial.elf
for opt in O0 O1 Os O2; do
    avr-gcc -mmcu=attiny85 -$opt -Wall -o /tmp/selftest_$opt.elf selftest.c
    avr-objcopy -O ihex -R .eeprom /tmp/selftest_$opt.elf $out/selftest_$opt.hex
done
# data addresses of the variables the tests read
python3 - <<'PY'
import json, subprocess
syms = {}
for elf, names in (("/tmp/selftest_O0.elf", ["results"]), ("/tmp/selftest_O1.elf", ["results"]), ("/tmp/selftest_Os.elf", ["results"]), ("/tmp/selftest_O2.elf", ["results"]), ("/tmp/timer_ctc.elf", ["ticks"]), ("/tmp/timer_ovf.elf", ["overflows"]),
                   ("/tmp/pcint_sleep.elf", ["presses"]), ("/tmp/int0_powerdown.elf", ["wakes"]),
                   ("/tmp/adc_threshold.elf", ["last"]), ("/tmp/adc_read10.elf", ["reading"]), ("/tmp/adc_irq.elf", ["reading", "count"]),
                   ("/tmp/adc_bandgap.elf", ["vs_vcc", "vs_internal"]),
                   ("/tmp/pwm_fade.elf", ["n"]), ("/tmp/millis_blink.elf", ["ticks"]),
                   ("/tmp/wdt_reset.elf", ["boots"]), ("/tmp/wdt_interrupt.elf", ["wakes"]), ("/tmp/eeprom_counter.elf", ["last"]), ("/tmp/eeprom_initial.elf", ["seen"]),
                   ("/tmp/timer1_ctc.elf", ["compares", "overflows"]), ("/tmp/timer1_ovf.elf", ["overflows"]), ("/tmp/comparator_irq.elf", ["events"]),
                   ("/tmp/adc_diff.elf", ["gain1", "gain20"]), ("/tmp/adc_temp.elf", ["reading"]), ("/tmp/usi_spi_master.elf", ["rx"]), ("/tmp/usi_strobe.elf", ["rx"]),
                   ("/tmp/reset_boots.elf", ["boots"])):
    table = {line.split()[2]: int(line.split()[0], 16) for line in subprocess.check_output(["avr-nm", elf], text=True).splitlines() if len(line.split()) == 3}
    for name in names:
        syms.setdefault(elf.rsplit("/", 1)[1][:-4], {})[name] = table[name] & 0xFFFF
json.dump(syms, open("../symbols.json", "w"), indent=1)
PY
