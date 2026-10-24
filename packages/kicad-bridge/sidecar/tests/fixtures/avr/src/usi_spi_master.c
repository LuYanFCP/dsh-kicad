/* SPI master on the USI: two transfers with the external-clock / USITC strobe (the datasheet's example). rx holds the bytes received. */
#include <avr/io.h>
volatile uint8_t rx[2];
static uint8_t transfer(uint8_t data) {
    USIDR = data;
    USISR = (1 << USIOIF);
    while (!(USISR & (1 << USIOIF))) {
        USICR = (1 << USIWM0) | (1 << USICS1) | (1 << USICLK) | (1 << USITC);
    }
    return USIDR;
}
int main(void) {
    DDRB |= (1 << PB1) | (1 << PB2);   /* DO and USCK are outputs, DI an input */
    rx[0] = transfer(0xA5);
    rx[1] = transfer(0x3C);
    for (;;) { }
}
