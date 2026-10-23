/* A differential ADC channel (ADC2 - ADC3, 1x): not simulated. */
#include <avr/io.h>
int main(void) {
    ADMUX = (1 << MUX2) | (1 << MUX1);
    ADCSRA = (1 << ADEN) | (1 << ADSC);
    for (;;) { }
}
