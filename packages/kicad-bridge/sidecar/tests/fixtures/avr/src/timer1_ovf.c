/* Timer1 in normal mode at CK/64: the overflow interrupt every 256 ticks (16.384 ms) counts and toggles PB2; OC1A (PB1) toggles on compare
   match with OCR1A = 100 (COM1A = 01). */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t overflows;
ISR(TIMER1_OVF_vect) { PORTB ^= (1 << PB2); overflows++; }
int main(void) {
    DDRB |= (1 << PB1) | (1 << PB2);
    OCR1A = 100;
    TCCR1 = (1 << COM1A0) | (1 << CS12) | (1 << CS11) | (1 << CS10);   /* toggle OC1A on compare match, CK/64 */
    TIMSK |= (1 << TOIE1);
    sei();
    for (;;) { }
}
