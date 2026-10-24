/* Enables a falling-edge GPIO interrupt on GPIO0 (the button) for the PRO CPU, then idles: QEMU cannot deliver it, so pressing the
 * button must stop the simulation. */
#include "common.h"

void main(void)
{
    wdt_off();
    button_setup();
    REG(GPIO_PIN(0)) = (2u << 7) | (1u << 15); /* INT_TYPE falling edge, PRO CPU interrupt enable */
    for (;;)
        delay_ms(10);
}
