/* Phase-correct PWM on OC0A (PB0), clk/8, OCR0A = 128. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB0);
    TCCR0A = (1 << COM0A1) | (1 << WGM00);
    TCCR0B = (1 << CS01);
    OCR0A = 128;
    for (;;) { }
}
