/* Free-running ADC on ADC3 with the conversion-complete interrupt; main sleeps in idle mode. */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
volatile uint16_t reading;
volatile uint8_t count;
ISR(ADC_vect) { reading = ADC; count++; }
int main(void) {
    ADMUX = (1 << MUX1) | (1 << MUX0);
    ADCSRA = (1 << ADEN) | (1 << ADATE) | (1 << ADIE) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADSC);
    set_sleep_mode(SLEEP_MODE_IDLE);
    sei();
    for (;;) sleep_mode();
}
