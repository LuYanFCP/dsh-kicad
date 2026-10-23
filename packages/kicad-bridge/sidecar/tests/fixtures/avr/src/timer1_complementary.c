/* Timer1 PWM with the complementary output pair: COM1A = 01 drives OC1A (PB1) and /OC1A (PB0). Synchronous clock CK/8 at 8 MHz, OCR1C = 249,
   OCR1A = 62 (62/250 = 24.8 %). */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB0) | (1 << PB1);
    OCR1C = 249;
    OCR1A = 62;
    TCCR1 = (1 << PWM1A) | (1 << COM1A0) | (1 << CS12);   /* CS1[3:0] = 0100: CK/8 */
    for (;;) { }
}
