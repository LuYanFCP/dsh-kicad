/* DIDR0 disables the digital input buffer of PB3: the pin then reads 0 whatever is on it. PB4 mirrors PB3 as read. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB4);
    PORTB |= (1 << PB3);
    DIDR0 = (1 << ADC3D);
    for (;;) { if (PINB & (1 << PB3)) PORTB |= (1 << PB4); else PORTB &= ~(1 << PB4); }
}
