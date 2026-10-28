#include <iostream>
#include <string>
#include <iomanip>
using namespace std; int main() {
    string field;
    cout << fixed << setprecision(2);
    while (cin >> field) {
        auto k = field.find(':');
        string name = field.substr(0, k);
        double value = stod(field.substr(k + 1));
        cout << setw(6) << name << ':'
             << setw(7) << value << '\n';
    }
}
