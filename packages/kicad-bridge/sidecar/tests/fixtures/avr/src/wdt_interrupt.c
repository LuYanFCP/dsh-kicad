/* The watchdog as a wake-up timer: interrupt mode, 0.25 s, power-down sleep in between; PB0 toggles in the interrupt. */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
volatile uint8_t wakes;
ISR(WDT_vect) { PORTB ^= (1 << PB0); wakes++; }
int main(void) {
    DDRB |= (1 << PB0);
    wdt_reset();
    WDTCR = (1 << WDCE) | (1 << WDE);
    WDTCR = (1 << WDIE) | (1 << WDP2);   /* interrupt only, 0.25 s */
    set_sleep_mode(SLEEP_MODE_PWR_DOWN);
    sei();
    for (;;) sleep_mode();
}
