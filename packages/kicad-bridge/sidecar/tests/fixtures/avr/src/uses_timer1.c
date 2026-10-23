/* Timer1 as a free-running counter: not simulated. */
#include <avr/io.h>
int main(void) {
    TCCR1 = (1 << CS12);
    for (;;) { }
}
