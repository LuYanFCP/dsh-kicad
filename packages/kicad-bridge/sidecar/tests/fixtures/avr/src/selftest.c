/* CPU self-test: every result goes to `results` in SRAM; tests/test_avr.py computes the same values in Python and compares.
   Built at -O0, -O1, -Os and -O2 so the compiler emits different instruction mixes. */
#include <stdint.h>
#include <avr/pgmspace.h>

volatile uint8_t results[160];
static uint8_t k;

static void put8(uint8_t v) { results[k++] = v; }
static void put16(uint16_t v) { put8(v & 0xFF); put8(v >> 8); }
static void put32(uint32_t v) { put16(v & 0xFFFF); put16(v >> 16); }

static uint16_t crc16(const uint8_t *d, uint8_t n) {
    uint16_t crc = 0xFFFF;
    while (n--) {
        crc ^= (uint16_t)(*d++) << 8;
        for (uint8_t i = 0; i < 8; i++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc;
}

static uint8_t popcount(uint8_t v) { uint8_t n = 0; while (v) { n += v & 1; v >>= 1; } return n; }
static uint8_t dispatch(uint8_t i) {
    switch (i) { case 0: return 11; case 1: return 22; case 2: return 33; case 3: return 44; case 4: return 55; case 5: return 66; case 6: return 77; default: return 99; }
}
static uint8_t twice(uint8_t x) { return x * 2; }
static uint8_t plus3(uint8_t x) { return x + 3; }
static const char msg[] PROGMEM = "ATtiny85 flash";

int main(void) {
    volatile uint8_t a = 200, b = 100, c = 7;
    volatile uint16_t w1 = 40000, w2 = 30000, w3 = 123;
    volatile uint32_t l1 = 0x12345678UL, l2 = 0x9ABCDEF0UL, l3 = 1000003UL;
    volatile int8_t s1 = -100, s2 = 27;
    volatile int16_t i1 = -3000, i2 = 77;
    volatile int32_t m1 = -123456789L, m2 = 1234L;

    put8(a + b); put8((uint8_t)(a - b)); put8((uint8_t)(b - a)); put8(a * b); put16((uint16_t)a * b); put8(a / c); put8(a % c);
    put8(a & b); put8(a | b); put8(a ^ b); put8(~a); put8(a << 3); put8(a >> 3); put8((uint8_t)(a << c)); put8(a >> (c - 4));
    put16(w1 + w2); put16(w1 - w2); put16(w2 - w1); put16(w1 * w3); put16(w1 / w3); put16(w1 % w3); put16(w1 << 5); put16(w1 >> 5);
    put32(l1 + l2); put32(l1 - l2); put32(l1 * l3); put32(l2 / l3); put32(l2 % l3); put32(l1 << 7); put32(l2 >> 9); put32(l1 ^ l2);
    put8((int8_t)(s1 + s2)); put8((int8_t)(s1 * s2)); put8((int8_t)(s1 / s2)); put8((int8_t)(s1 % s2)); put8((int8_t)(s1 >> 2));
    put16((uint16_t)(i1 * i2)); put16((uint16_t)(i1 / i2)); put16((uint16_t)(i1 % i2)); put16((uint16_t)(i1 >> 3));
    put32((uint32_t)(m1 * m2)); put32((uint32_t)(m1 / m2)); put32((uint32_t)(m1 % m2)); put32((uint32_t)(m1 >> 11));
    put8(a < b); put8(a > b); put8(s1 < s2); put8(s1 > s2); put8(w1 < w2); put8(i1 < i2); put8(l1 < l2); put8(m1 < m2); put8(a == 200); put8(w3 != 123);
    put8((uint8_t)(a + 1)); put8((uint8_t)(c - 8)); put8(-a); put8((uint8_t)(-s1));

    uint8_t arr[10] = {9, 3, 250, 1, 77, 0, 128, 42, 5, 200};
    for (uint8_t i = 0; i < 10; i++) for (uint8_t j = 0; j + 1 < 10 - i; j++) if (arr[j] > arr[j + 1]) { uint8_t t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t; }
    for (uint8_t i = 0; i < 10; i++) put8(arr[i]);
    uint16_t sum = 0; for (uint8_t i = 0; i < 10; i++) sum += arr[i]; put16(sum);
    put16(crc16(arr, 10));
    put8(popcount(a)); put8(popcount(0xFF)); put8(popcount(0));
    for (uint8_t i = 0; i < 8; i++) put8(dispatch(i));
    uint8_t (*fp)(uint8_t) = (c > 3) ? twice : plus3; put8(fp(21));
    for (uint8_t i = 0; i < 6; i++) put8(pgm_read_byte(&msg[i]));
    struct { uint8_t x; uint16_t y; uint8_t z[4]; } s = {1, 0x1234, {5, 6, 7, 8}}, t2; t2 = s; put8(t2.x); put16(t2.y); put8(t2.z[3]);
    volatile float f1 = 1.5f, f2 = 2.25f; put16((uint16_t)(f1 * f2 * 100.0f)); put16((uint16_t)((f1 + f2) * 8.0f));
    put8(k);
    for (;;) { }
}
