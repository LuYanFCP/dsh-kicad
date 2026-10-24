/* The GPIO interrupt: each falling edge on GPIO0 (the button) raises it on the PRO CPU as CPU interrupt 12; the handler in
 * vectors.S counts it and clears the pin's status. main() sleeps in WAITI between interrupts and shows the count's lowest
 * bit on the LED, so each press toggles it. With GPIO35 pulled high the watchdog stays armed 60 s away: a timer pending
 * while the CPU sleeps, as FreeRTOS's tick always is; without, nothing is timed and QEMU's clock stands still in WAITI. */
#include "common.h"

extern char _vectors[];
volatile uint32_t irq_count;
volatile uint32_t isr_save[2];

void main(void)
{
    uint32_t seen = 0;

    REG(IO_MUX_GPIO35) |= FUN_IE;
    if (REG(GPIO_IN1) >> (35 - 32) & 1)
        wdt_arm(60000);
    else
        wdt_off();
    button_setup();
    led_setup();
    REG(GPIO_PIN(0)) = (2u << 7) | (1u << 15);     /* falling edge, the PRO CPU's interrupt */
    REG(DPORT_PRO_GPIO_INTERRUPT_MAP) = 12;         /* the GPIO source to CPU interrupt 12 (level 1, level-triggered) */
    __asm__ volatile("wsr.vecbase %0\n rsync" :: "r"(_vectors));
    __asm__ volatile("wsr.intenable %0\n rsync" :: "r"(1u << 12));
    __asm__ volatile("movi a2, 0x20\n wsr.ps a2\n rsync" ::: "a2");  /* user vector mode, out of exception mode, level 0 */
    for (;;) {
        __asm__ volatile("waiti 0");
        if (irq_count != seen) {
            seen = irq_count;
            led(seen & 1);
        }
    }
}
