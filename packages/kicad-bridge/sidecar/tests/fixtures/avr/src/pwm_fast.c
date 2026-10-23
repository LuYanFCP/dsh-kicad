/* Fast PWM on both Timer0 outputs, clk/64: OC0A (PB0) non-inverting with OCR0A = 64, OC0B (PB1) inverting with OCR0B = 191. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB0) | (1 << PB1);
    TCCR0A = (1 << COM0A1) | (1 << COM0B1) | (1 << COM0B0) | (1 << WGM01) | (1 << WGM00);
    TCCR0B = (1 << CS01) | (1 << CS00);
    OCR0A = 64;
    OCR0B = 191;
    for (;;) { }
}
