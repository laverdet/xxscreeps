/**
 * The pipeline operator is stuck in specification hell so this works as a replacement to unfold
 * sequential operations.
 * https://github.com/tc39/proposal-pipeline-operator/blob/main/HISTORY.md
 */

// If you want to add more overloads then here's the golf:
// console.log(Array(12).fill().map((_, ii) => Array(ii + 1).fill().map((_, ii) => ii)).map(tt =>
// `export function pipe<T0, ${tt.map(ii => `T${ii + 1}`).join(', ')}>(vv: T0, ${tt.map(ii => `fn${ii}: (vv: T${ii}) => T${ii + 1}`).join(', ')}): T${tt.length};`
// ).join('\n'));
export function pipe<T0, T1>(vv: T0, fn0: (vv: T0) => T1): T1;
export function pipe<T0, T1, T2>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2): T2;
export function pipe<T0, T1, T2, T3>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3): T3;
export function pipe<T0, T1, T2, T3, T4>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4): T4;
export function pipe<T0, T1, T2, T3, T4, T5>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5): T5;
export function pipe<T0, T1, T2, T3, T4, T5, T6>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6): T6;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7): T7;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7, T8>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7, fn7: (vv: T7) => T8): T8;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7, T8, T9>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7, fn7: (vv: T7) => T8, fn8: (vv: T8) => T9): T9;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7, fn7: (vv: T7) => T8, fn8: (vv: T8) => T9, fn9: (vv: T9) => T10): T10;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7, fn7: (vv: T7) => T8, fn8: (vv: T8) => T9, fn9: (vv: T9) => T10, fn10: (vv: T10) => T11): T11;
export function pipe<T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12>(vv: T0, fn0: (vv: T0) => T1, fn1: (vv: T1) => T2, fn2: (vv: T2) => T3, fn3: (vv: T3) => T4, fn4: (vv: T4) => T5, fn5: (vv: T5) => T6, fn6: (vv: T6) => T7, fn7: (vv: T7) => T8, fn8: (vv: T8) => T9, fn9: (vv: T9) => T10, fn10: (vv: T10) => T11, fn11: (vv: T11) => T12): T12;
export function pipe(vv: unknown, ...fns: ((vv: unknown) => unknown)[]) {
	return fns.reduce((vv, fn) => fn(vv), vv);
}
