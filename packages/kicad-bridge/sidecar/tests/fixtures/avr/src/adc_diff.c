/* Differential ADC: ADC2 (PB4) minus ADC3 (PB3), bipolar mode, Vcc reference, 1x then 20x (the 1.1 V reference would saturate first):
   gain1 and gain20 hold the 10-bit two's complement results. */
#include <avr/io.h>
volatile uint16_t gain1, gain20;
static uint16_t convert(uint8_t mux) {
    ADMUX = mux;
    ADCSRA |= (1 << ADSC);
    while (ADCSRA & (1 << ADSC)) { }
    return ADC;
}
int main(void) {
    ADCSRB = (1 << BIN);
    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1);
    gain1 = convert((1 << MUX2) | (1 << MUX1));
    gain20 = convert((1 << MUX2) | (1 << MUX1) | (1 << MUX0));
    for (;;) { }
}
