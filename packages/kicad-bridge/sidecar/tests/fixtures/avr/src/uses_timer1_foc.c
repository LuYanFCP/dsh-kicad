/* Force output compare on Timer1: not simulated. */
#include <avr/io.h>
int main(void) {
    TCCR1 = (1 << COM1A0) | (1 << CS10);
    GTCCR |= (1 << FOC1A);
    for (;;) { }
}
