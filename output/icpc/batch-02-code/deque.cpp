#include <deque>
#include <algorithm>
#include <cassert>
using namespace std;
int main() {
    deque<int> d{2, 4};
    d.push_front(1); d.push_back(5);
    d[1] = 3;
    d.pop_front(); d.pop_back();
    sort(d.begin(), d.end());
    int first = d.front(), last = d.back();
    // d == {3,4}

    assert(d.size()==2 && first==3 && last==4);
    assert(d.at(0)==3 && !d.empty());
}
