/* Lights the LED, arms the timer group 0 watchdog for 100 ms (stage 0 resets the system) and never feeds it: the chip resets
 * about every 100 ms plus its boot. Meanwhile the CPU sleeps in WAITI, as an idle ESP-IDF firmware does (QEMU passes idle
 * time in real time, busy time by instruction count: blink.c spins). */
#include "common.h"

void main(void)
{
    led_setup();
    led(1);
    wdt_arm(100);
    for (;;) {
        __asm__ volatile("waiti 15");                   /* no interrupt can wake it: only the reset ends this */
    }
}
