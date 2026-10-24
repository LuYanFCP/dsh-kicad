/* ADC auto trigger from the analog comparator: not simulated (only free running is). */
#include <avr/io.h>
int main(void) {
    ADCSRB = (1 << ADTS0);
    ADCSRA = (1 << ADEN) | (1 << ADATE) | (1 << ADSC);
    for (;;) { }
}
