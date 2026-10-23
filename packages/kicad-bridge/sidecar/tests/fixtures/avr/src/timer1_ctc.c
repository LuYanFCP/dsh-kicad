/* Timer1 in CTC mode at CK/64: OCR1C = 124 (8 ms period); the compare-A interrupt (OCR1A = 60) toggles PB0, the overflow interrupt PB2
   (it never fires: the counter is cleared before it can overflow). */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t compares, overflows;
ISR(TIMER1_COMPA_vect) { PORTB ^= (1 << PB0); compares++; }
ISR(TIMER1_OVF_vect) { PORTB ^= (1 << PB2); overflows++; }
int main(void) {
    DDRB |= (1 << PB0) | (1 << PB2);
    OCR1C = 124;
    OCR1A = 60;
    TCCR1 = (1 << CTC1) | (1 << CS12) | (1 << CS11) | (1 << CS10);   /* CK/64 */
    TIMSK |= (1 << OCIE1A) | (1 << TOIE1);
    sei();
    for (;;) { }
}
