/* A fade: fast PWM on OC0A (PB0), clk/8; the overflow interrupt raises OCR0A by 4 every fourth overflow (every 8.192 ms) up to 252. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t n;
ISR(TIM0_OVF_vect) {
    n++;
    if ((n & 3) == 0 && OCR0A < 252) OCR0A += 4;
}
int main(void) {
    DDRB |= (1 << PB0);
    TCCR0A = (1 << COM0A1) | (1 << WGM01) | (1 << WGM00);
    TCCR0B = (1 << CS01);
    OCR0A = 0;
    TIMSK |= (1 << TOIE0);
    sei();
    for (;;) { }
}
