/* Lights the LED, arms the timer group 0 watchdog for 100 ms (stage 0 resets the system) and never feeds it: the chip resets
 * about every 100 ms plus its boot. Meanwhile the CPU sleeps in WAITI, as an idle ESP-IDF firmware does (QEMU passes idle
 * time in real time, busy time by instruction count: blink.c spins). */
#include "common.h"

void main(void)
{
    led_setup();
    led(1);
    REG(TIMG0_WDTWPROTECT) = WDT_KEY;
    REG(TIMG0_WDTCONFIG1) = 40000u << 16;               /* 40 MHz APB / 40000: 1 kHz watchdog ticks */
    REG(TIMG0_WDTCONFIG2) = 100;                        /* stage 0: 100 ticks */
    REG(TIMG0_WDTCONFIG0) = (1u << 31) | (3u << 29);    /* enabled; stage 0 resets the system */
    REG(TIMG0_WDTWPROTECT) = 0;
    for (;;) {
        __asm__ volatile("waiti 15");                   /* no interrupt can wake it: only the reset ends this */
    }
}
