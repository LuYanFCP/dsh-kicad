/* Same as button_poll, but forgets the pull-up: a button to ground then leaves PB3 floating while it is released. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB4);
    for (;;) {
        if (PINB & (1 << PB3)) PORTB &= ~(1 << PB4); else PORTB |= (1 << PB4);
    }
}
