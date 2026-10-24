/* The temperature sensor (ADC4) against the 1.1 V reference: `reading` is the raw ADC value. */
#include <avr/io.h>
volatile uint16_t reading;
int main(void) {
    ADMUX = (1 << REFS1) | (1 << MUX3) | (1 << MUX2) | (1 << MUX1) | (1 << MUX0);
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1);
    ADCSRA |= (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) { }
    ADCSRA |= (1 << ADSC);   /* the first conversion after a reference change is for initialisation */
    while (ADCSRA & (1 << ADSC)) { }
    reading = ADC;
    for (;;) { }
}
