/* The Arduino way to keep time: Timer0 in fast PWM mode (no output) with the overflow interrupt counting; PB2 toggles every 6 overflows at clk/64 (98.3 ms). */
#include <avr/io.h>
#include <avr/interrupt.h>
volatile uint8_t ticks;
ISR(TIM0_OVF_vect) { ticks++; }
int main(void) {
    DDRB |= (1 << PB2);
    TCCR0A = (1 << WGM01) | (1 << WGM00);
    TCCR0B = (1 << CS01) | (1 << CS00);
    TIMSK |= (1 << TOIE0);
    sei();
    for (;;) {
        if (ticks >= 6) { ticks = 0; PORTB ^= (1 << PB2); }
    }
}
