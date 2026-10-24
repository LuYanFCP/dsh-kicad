/* Says hello on UART0, then lights the LED on GPIO2. */
#include "common.h"

static void put(char c)
{
    while (((REG(UART0_STATUS) >> 16) & 0xFF) >= 126) { /* TX FIFO full */
    }
    REG(UART0_FIFO) = (uint8_t)c;
}

void main(void)
{
    static const char text[] = "hello from the test firmware\r\n";

    wdt_off();
    for (const char *p = text; *p; p++)
        put(*p);
    led_setup();
    led(1);
    for (;;)
        delay_ms(100);
}
