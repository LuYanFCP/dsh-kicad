/* CTC with OC0A toggling on compare match: a square wave on PB0, clk/64, OCR0A = 124. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB0);
    TCCR0A = (1 << COM0A0) | (1 << WGM01);
    TCCR0B = (1 << CS01) | (1 << CS00);
    OCR0A = 124;
    for (;;) { }
}
