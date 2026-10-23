/* ACME multiplexes the ADC inputs into the comparator: not simulated. */
#include <avr/io.h>
int main(void) {
    ADCSRB |= (1 << ACME);
    for (;;) { }
}
