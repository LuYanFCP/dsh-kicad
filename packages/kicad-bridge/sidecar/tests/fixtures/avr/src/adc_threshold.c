/* Battery monitor: PB0 lights while the voltage on ADC3 (PB3, Vcc reference, left-adjusted 8-bit result) is above half of Vcc. */
#include <avr/io.h>
volatile uint8_t last;
int main(void) {
    DDRB |= (1 << PB0);
    ADMUX = (1 << ADLAR) | (1 << MUX1) | (1 << MUX0);
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1);
    for (;;) {
        ADCSRA |= (1 << ADSC);
        while (ADCSRA & (1 << ADSC)) { }
        last = ADCH;
        if (last > 128) PORTB |= (1 << PB0); else PORTB &= ~(1 << PB0);
    }
}
