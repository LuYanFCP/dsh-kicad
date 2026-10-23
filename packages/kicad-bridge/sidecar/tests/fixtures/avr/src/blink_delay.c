/* PB0 toggles every 10 ms with the busy-wait delay (F_CPU 1 MHz: the default 8 MHz RC with CKDIV8). */
#define F_CPU 1000000UL
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
    DDRB |= (1 << PB0);
    for (;;) { PORTB ^= (1 << PB0); _delay_ms(10); }
}
