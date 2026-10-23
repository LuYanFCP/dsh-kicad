/* A bug: PB3 is driven high, but a button on that net pulls it to ground. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB3);
    PORTB |= (1 << PB3);
    for (;;) { }
}
