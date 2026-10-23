/* The analog comparator (AIN0 = PB0 against AIN1 = PB1) with the interrupt on a rising output: PB4 toggles and `events` counts. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t events;
ISR(ANA_COMP_vect) { PORTB ^= (1 << PB4); events++; }
int main(void) {
    DDRB |= (1 << PB4);
    ACSR = (1 << ACIE) | (1 << ACIS1) | (1 << ACIS0);   /* rising edge */
    sei();
    for (;;) { }
}
