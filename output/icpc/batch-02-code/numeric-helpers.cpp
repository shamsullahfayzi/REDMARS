#include <vector>
#include <numeric>
#include <limits>
#include <cassert>
using namespace std;
int main() {
    vector<int> id(4);
    iota(id.begin(), id.end(), 0);  // 0,1,2,3
    long long g = gcd(12LL, 18LL);  // 6
    long long l = lcm(12LL, 18LL);  // 36
    auto hi = numeric_limits<long long>::max();
    auto low = numeric_limits<double>::lowest();

    assert((id==vector<int>{0,1,2,3}));
    assert(g==6 && l==36 && hi>=2147483647LL);
    assert(low<0 && numeric_limits<double>::min()>0);
}
