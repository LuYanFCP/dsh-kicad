/* Reads the 1.1 V bandgap against the 1.1 V internal reference (full scale) and against Vcc. */
#include <avr/io.h>
volatile uint16_t vs_vcc, vs_internal;
static uint16_t convert(uint8_t admux) {
    ADMUX = admux;
    ADCSRA |= (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) { }
    return ADC;
}
int main(void) {
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1);
    vs_vcc = convert((1 << MUX3) | (1 << MUX2));
    vs_internal = convert((1 << REFS1) | (1 << MUX3) | (1 << MUX2));
    for (;;) { }
}
