/* The LED on GPIO2 is on while the button on GPIO0 (to ground, internal pull-up) is pressed; GPIO0 is read every 5 ms. */
#include "common.h"

void main(void)
{
    int lit = 0;

    wdt_off();
    button_setup();
    led_setup();
    for (;;) {
        int pressed = !(REG(GPIO_IN) & 1u);
        if (pressed != lit) {
            lit = pressed;
            led(lit);
        }
        delay_ms(5);
    }
}
