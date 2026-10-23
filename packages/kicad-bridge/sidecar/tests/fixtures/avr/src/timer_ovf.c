/* Timer0 normal mode, clk/8: overflow every 2.048 ms at 1 MHz; the ISR counts, main mirrors bit 2 of the count on PB1. */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint16_t overflows;
ISR(TIM0_OVF_vect) { overflows++; }
int main(void) {
    DDRB |= (1 << PB1);
    TCCR0B = (1 << CS01);
    TIMSK |= (1 << TOIE0);
    sei();
    for (;;) { if (overflows & 4) PORTB |= (1 << PB1); else PORTB &= ~(1 << PB1); }
}
