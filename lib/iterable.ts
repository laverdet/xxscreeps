export function map<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result) {
  return function *() {
    for (const value of iterable) {
      yield callback(value);
    }
  }();
}
