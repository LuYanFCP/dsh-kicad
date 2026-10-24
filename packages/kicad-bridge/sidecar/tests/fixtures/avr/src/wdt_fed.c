/* The watchdog (32 ms) is fed every ~5 ms: no reset. PB0 toggles each time. */
#define F_CPU 1000000UL
#include <avr/io.h>
#include <avr/wdt.h>
#include <util/delay.h>
int main(void) {
    DDRB |= (1 << PB0);
    wdt_enable(WDTO_30MS);
    for (;;) { wdt_reset(); PORTB ^= (1 << PB0); _delay_ms(5); }
}
