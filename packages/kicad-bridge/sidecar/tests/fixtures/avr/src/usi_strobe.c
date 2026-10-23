/* The USI as a shift register with the software strobe (USICLK): the counter is preset to 8 so eight strobes overflow it; they clock out 0x96
   and clock in DI; USCK is not touched. */
#include <avr/io.h>
volatile uint8_t rx;
int main(void) {
    DDRB |= (1 << PB1);
    USIDR = 0x96;
    USISR = (1 << USIOIF) | 8;
    while (!(USISR & (1 << USIOIF))) {
        USICR = (1 << USIWM0) | (1 << USICLK);
    }
    rx = USIDR;
    for (;;) { }
}
