/* Wake on a pin change: PB3 (button to ground, internal pull-up) toggles the LED on PB4; main sleeps in idle mode. */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
volatile uint8_t presses;
ISR(PCINT0_vect) { if (!(PINB & (1 << PB3))) { PORTB ^= (1 << PB4); presses++; } }
int main(void) {
    DDRB |= (1 << PB4);
    PORTB |= (1 << PB3);
    GIMSK |= (1 << PCIE);
    PCMSK |= (1 << PCINT3);
    set_sleep_mode(SLEEP_MODE_IDLE);
    sei();
    for (;;) sleep_mode();
}
