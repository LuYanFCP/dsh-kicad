/* Polls ACO and mirrors it on PB4, with the 1.1 V bandgap as the positive input (ACBG): PB4 is high while AIN1 (PB1) is below 1.1 V. */
#include <avr/io.h>
int main(void) {
    DDRB |= (1 << PB4);
    ACSR = (1 << ACBG);
    for (;;) {
        if (ACSR & (1 << ACO)) PORTB |= (1 << PB4); else PORTB &= ~(1 << PB4);
    }
}
