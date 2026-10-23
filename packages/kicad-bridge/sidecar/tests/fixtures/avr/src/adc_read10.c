/* Stores the 10-bit reading of ADC2 (PB4, Vcc reference) in `reading` once, then sits still. */
#include <avr/io.h>
volatile uint16_t reading;
int main(void) {
    ADMUX = (1 << MUX1);
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) { }
    reading = ADC;
    for (;;) { }
}
