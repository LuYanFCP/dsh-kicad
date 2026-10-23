/* Timer1 PWM from the PLL clock: PCK/16 = 4 MHz, OCR1C = 199 (20 kHz). OC1A (PB1) non-inverting with OCR1A = 50 (25 %);
   OC1B (PB4) with OCR1B = 100 (50 %). */
#define F_CPU 1000000UL
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
    DDRB |= (1 << PB1) | (1 << PB4);
    PLLCSR = (1 << PLLE);
    _delay_us(120);
    while (!(PLLCSR & (1 << PLOCK))) { }
    PLLCSR |= (1 << PCKE);
    OCR1C = 199;
    OCR1A = 50;
    OCR1B = 100;
    GTCCR = (1 << PWM1B) | (1 << COM1B1);
    TCCR1 = (1 << PWM1A) | (1 << COM1A1) | (1 << CS12) | (1 << CS10);   /* CS1[3:0] = 0101: PCK/16 */
    for (;;) { }
}
