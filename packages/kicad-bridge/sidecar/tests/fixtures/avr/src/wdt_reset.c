/* A watchdog that is never fed: reset every 16 ms. `boots` (kept across resets) counts the starts; PB0 goes high at each start. */
#include <avr/io.h>
#include <avr/wdt.h>
uint8_t boots __attribute__((section(".noinit")));
uint8_t mcusr_copy __attribute__((section(".noinit")));
void get_mcusr(void) __attribute__((naked)) __attribute__((section(".init3")));
void get_mcusr(void) { mcusr_copy = MCUSR; MCUSR = 0; wdt_disable(); }
int main(void) {
    if (mcusr_copy & (1 << PORF)) boots = 0;
    boots++;
    DDRB |= (1 << PB0);
    PORTB |= (1 << PB0);
    wdt_enable(WDTO_15MS);
    for (;;) { }
}
