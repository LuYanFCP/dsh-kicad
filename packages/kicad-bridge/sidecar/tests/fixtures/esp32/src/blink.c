/* GPIO2 blinks: 250 ms high, 250 ms low, timed by the CPU cycle counter. */
#include "common.h"

void main(void)
{
    wdt_off();
    led_setup();
    for (;;) {
        led(1);
        delay_ms(250);
        led(0);
        delay_ms(250);
    }
}
