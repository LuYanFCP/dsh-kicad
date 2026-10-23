/* PB4 follows PB3: PB3 is an input with the internal pull-up (a button to ground), PB4 drives an LED. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB4);
    PORTB |= (1 << PB3);
    for (;;) {
        if (PINB & (1 << PB3)) PORTB &= ~(1 << PB4); else PORTB |= (1 << PB4);
    }
}
