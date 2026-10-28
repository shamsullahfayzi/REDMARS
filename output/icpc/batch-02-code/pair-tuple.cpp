#include <utility>
#include <tuple>
#include <string>
#include <cassert>
using namespace std;
int main() {
    pair<int, string> p{2, "Ali"};
    auto [score, name] = p;     // copies
    auto& [refScore, refName] = p;
    refScore = 4;              // modifies p.first
    tuple<int, int, string> t{2, 7, "K"};
    get<1>(t) = 9;
    int a, b; string label;
    tie(a, b, label) = t;
    // score==2; p.first==4; b==9

    assert(score==2 && name=="Ali" && p.first==4);
    assert(a==2 && b==9 && label=="K");
    assert(get<0>(t)==2);
}
