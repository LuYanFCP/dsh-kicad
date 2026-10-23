/* Timer0 CTC: clk/64, OCR0A = 124 -> 8 ms; the compare interrupt toggles PB0 and counts in `ticks`. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t ticks;
ISR(TIM0_COMPA_vect) { PORTB ^= (1 << PB0); ticks++; }
int main(void) {
    DDRB |= (1 << PB0);
    TCCR0A = (1 << WGM01);
    TCCR0B = (1 << CS01) | (1 << CS00);
    OCR0A = 124;
    TIMSK |= (1 << OCIE0A);
    sei();
    for (;;) { }
}
