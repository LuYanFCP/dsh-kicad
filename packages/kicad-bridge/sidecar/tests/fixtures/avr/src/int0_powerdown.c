/* Power-down sleep, woken by INT0 (PB2, falling edge, internal pull-up): the ISR lights PB4 and counts. */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
volatile uint8_t wakes;
ISR(INT0_vect) { PORTB |= (1 << PB4); wakes++; }
int main(void) {
    DDRB |= (1 << PB4);
    PORTB |= (1 << PB2);
    MCUCR = (1 << ISC01);
    GIMSK |= (1 << INT0);
    set_sleep_mode(SLEEP_MODE_PWR_DOWN);
    sei();
    for (;;) sleep_mode();
}
