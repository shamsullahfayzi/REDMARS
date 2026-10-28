#include <iostream>
#include <vector>
#include <string>
using namespace std; int main() {
    int R, C;
    if (!(cin >> R >> C)) return 0;
    vector<string> g(R, string(C, '.'));
    int walls = 0;
    for (int r = 0; r < R; ++r)
        for (int c = 0; c < C; ++c) {
            cin >> g[r][c];
            walls += (g[r][c] == '#');
        }
    cout << walls << '\n';
}
