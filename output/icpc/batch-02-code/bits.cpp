#include <bitset>
#include <string>
#include <cstdint>
#include <cassert>
using namespace std;
int main() {
    bitset<8> b(string("00101100"));
    b.set(0); b.reset(2); b.flip(7);
    bool on = b.test(3); auto ones = b.count();
    uint64_t x = 0b101100;
    int k = 1; x |= uint64_t{1} << k; // set
    x &= ~(uint64_t{1} << k);        // clear
    x ^= uint64_t{1} << k;           // toggle
    bool present = (x >> k) & 1;
    uint64_t lowbit = x & (~x + 1);  // unsigned

    assert(b.to_ulong()==169 && on && ones==4);
    assert(x==46 && present && lowbit==2);
    assert(b.any() && !b.none() && !b.all());
    assert(b.to_string()=="10101001");
}
