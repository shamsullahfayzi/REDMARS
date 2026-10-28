#include <unordered_map>
#include <string>
#include <cassert>
using namespace std;
int main() {
    unordered_map<string, int> freq;
    freq.reserve(100);          // plan capacity first
    ++freq["a"]; ++freq["a"];
    auto it = freq.find("b");
    bool missing = (it == freq.end());
    freq.insert_or_assign("a", 7);
    freq.erase("b");
    // one entry: a -> 7; iteration order unspecified

    assert(missing && freq.size()==1 && freq.at("a")==7);
    assert(freq.count("b")==0);
}
