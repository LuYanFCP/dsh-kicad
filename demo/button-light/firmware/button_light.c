/* The demo's firmware for an ATtiny85 at its factory 1 MHz: a push button from PB3 to ground (the internal pull-up holds it
 * high) toggles the LED on PB4 (through a resistor to ground). A press counts once the button has read low for 20 ms, and the
 * next one only after it has read high for 20 ms again, so contact bounce does not toggle twice. */
#define F_CPU 1000000UL
#include <avr/io.h>
#include <stdint.h>
#include <util/delay.h>

#define DEBOUNCE_MS 20

int main(void)
{
    uint8_t low = 0, high = 0, armed = 1;

    DDRB |= 1 << PB4;   /* the LED: an output, off */
    PORTB |= 1 << PB3;  /* the button: an input with the internal pull-up */
    for (;;) {
        _delay_ms(1);
        if (PINB & (1 << PB3)) {          /* released */
            low = 0;
            if (high < DEBOUNCE_MS && ++high == DEBOUNCE_MS)
                armed = 1;
        } else {                          /* pressed */
            high = 0;
            if (low < DEBOUNCE_MS && ++low == DEBOUNCE_MS && armed) {
                PORTB ^= 1 << PB4;
                armed = 0;
            }
        }
    }
}
