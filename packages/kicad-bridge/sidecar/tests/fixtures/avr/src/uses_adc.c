/* Reads the ADC: not simulated, so the run must stop with a clear reason. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB4);
    ADMUX = (1 << MUX1);
    ADCSRA = (1 << ADEN) | (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) { }
    if (ADCH > 100) PORTB |= (1 << PB4);
    for (;;) { }
}
