/* Phase-correct PWM with TOP = OCR0A (WGM02): not simulated. */
#include <avr/io.h>
int main(void) {
    TCCR0A = (1 << WGM00);
    TCCR0B = (1 << WGM02) | (1 << CS00);
    OCR0A = 100;
    for (;;) { }
}
