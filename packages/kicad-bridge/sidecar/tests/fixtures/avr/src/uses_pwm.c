/* analogWrite-style PWM on OC0A (PB0): not simulated. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB0);
    TCCR0A = (1 << COM0A1) | (1 << WGM01) | (1 << WGM00);
    TCCR0B = (1 << CS00);
    OCR0A = 128;
    for (;;) { }
}
