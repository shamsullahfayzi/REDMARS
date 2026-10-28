#include <unordered_set>
#include <cassert>
using namespace std;
int main() {
    unordered_set<int> seen{3, 3, 8};
    seen.reserve(100);
    seen.insert(5);
    bool found = seen.find(8) != seen.end();
    auto erased = seen.erase(3);
    // {5,8}, in an unspecified iteration order

    assert(found && erased==1 && seen.size()==2);
    assert(seen.count(5)==1 && seen.count(3)==0);
}
