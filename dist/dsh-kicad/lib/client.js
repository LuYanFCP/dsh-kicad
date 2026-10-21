window.__ModuleLoader__.load({
	id: "dsh-kicad",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn2, res) => function __init() {
  return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to2, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to2, key) && key !== except)
        __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to2;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vendor/kicanvas/kicanvas.js
var kicanvas_exports = {};
async function Zs(r40, e) {
  return new Promise((t) => {
    r40.dispatchEvent(new I2(e, (i) => {
      t(i);
    }));
  });
}
function Ss(r40, e, t) {
  r40.addEventListener(I2.type, (i) => {
    let s = i;
    s.context_name == e && s.callback(t);
  });
}
async function yn(r40, e) {
  return (await Zs(r40, e))();
}
async function Ln(r40, e, t) {
  Ss(r40, e, t);
}
function Ts(r40) {
  return class extends r40 {
    static {
      l(this, "WithContext");
    }
    constructor(...t) {
      super(...t);
    }
    async requestContext(t) {
      return await Zs(this, t);
    }
    provideContext(t, i) {
      Ss(this, t, i);
    }
    async requestLazyContext(t) {
      return await yn(this, t);
    }
    provideLazyContext(t, i) {
      Ln(this, t, i);
    }
  };
}
function ii(r40) {
  return r40 === null || typeof r40 != "object" && typeof r40 != "function";
}
function G(r40) {
  return typeof r40 == "string";
}
function le(r40) {
  return typeof r40 == "number" && !isNaN(r40);
}
function It(r40) {
  return Array.isArray(r40) || typeof r40?.[Symbol.iterator] == "function";
}
function ri(r40) {
  return Array.isArray(r40);
}
function ys(r40) {
  return typeof r40 == "object" && r40 !== null && !Array.isArray(r40) && !(r40 instanceof RegExp) && !(r40 instanceof Date);
}
function y(r40, ...e) {
  let t = "";
  for (let i = 0; i < r40.length - 1; i++) {
    t += r40[i];
    let s = e[i];
    if (s instanceof nt) t += s.css_string;
    else if (le(s)) t += String(s);
    else throw new Error("Only CSS or number variables allowed in css template literal");
  }
  return t += r40.at(-1), new nt(t);
}
function Xs(r40, e) {
  r40.adoptedStyleSheets = r40.adoptedStyleSheets.concat(e.map((t) => t instanceof CSSStyleSheet ? t : t.stylesheet));
}
function A2(r40) {
  return ri(r40) ? r40 : [r40];
}
function Os(r40) {
  return ri(r40) ? r40 : It(r40) ? Array.from(r40) : [r40];
}
function Re(r40, e) {
  return r40.slice().sort((t, i) => Xn.compare(e(t), e(i)));
}
function Fe(r40) {
  window.setTimeout(() => {
    r40();
  }, 0);
}
function On(r40) {
  return typeof HTMLElement == "object" && r40 instanceof HTMLElement;
}
function M(r40, ...e) {
  let t = document.createElement("template");
  t.innerHTML = Fn(r40, e);
  let i = t.content;
  return i = document.importNode(i, true), Un(i, e), i.childElementCount == 1 ? i.firstElementChild : i;
}
function oi(r40, ...e) {
  let t = "";
  return r40.forEach((i, s) => {
    t += i + (e[s] ?? "");
  }), new C2(t);
}
function Fn(r40, e) {
  let t = [];
  for (let s = 0; s < r40.length - 1; s++) t.push(r40[s]), e[s] instanceof C2 ? t.push(e[s].text) : t.push(`$$:${s}:$$`);
  return t.push(r40[r40.length - 1]), t.join("");
}
function Un(r40, e) {
  let t = document.createTreeWalker(r40, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), i;
  for (; (i = t.nextNode()) !== null; ) if (i.nodeType == Node.TEXT_NODE) vn(i.parentNode, i, e);
  else if (i.nodeType == Node.ELEMENT_NODE) {
    let s = i;
    for (let n of s.getAttributeNames()) {
      let a = s.getAttributeNode(n);
      xn(s, a, e);
    }
  }
}
function vn(r40, e, t) {
  if (!r40) return;
  let i = e.data.split(si);
  if (!(!i || i.length == 1)) {
    if (On(r40) && ["script", "style"].includes(r40.localName)) throw new Error("Cannot bind values inside of <script> or <style> tags");
    for (let s = 0; s < i.length; s++) {
      let n = i[s];
      if (n) if (s % 2 == 0) r40.insertBefore(new Text(n), e);
      else for (let a of Fs(t[parseInt(n, 10)])) a != null && r40.insertBefore(a, e);
    }
    e.data = "";
  }
}
function xn(r40, e, t) {
  let i = e.value.split(si);
  if (!(!i || i.length == 1)) {
    if (e.localName.startsWith("on")) throw new Error(`Cannot bind to event handler ${e.localName}.`);
    if (i.length == 3 && i[0] == "" && i[2] == "") {
      let s = t[parseInt(i[1], 10)];
      s === true ? e.value = "" : s === false || s === null || s === void 0 ? r40.removeAttribute(e.name) : e.value = ni(s, e.name);
      return;
    }
    e.value = e.value.replaceAll(si, (s, n) => {
      let a = t[parseInt(n, 10)];
      return ni(a, e.localName);
    });
  }
}
function* Fs(r40) {
  if (!(r40 == null || r40 == null)) {
    if (ii(r40)) {
      yield new Text(r40.toString());
      return;
    }
    if (r40 instanceof Node || r40 instanceof DocumentFragment) {
      yield r40;
      return;
    }
    if (It(r40)) {
      for (let e of r40) yield* Fs(e);
      return;
    }
    throw new Error(`Invalid value ${r40}`);
  }
}
function ni(r40, e) {
  if (r40 == null || r40 == null) return "";
  if (ii(r40)) return r40.toString();
  if (It(r40)) return Array.from(r40).map((t) => ni(t, e)).join("");
  throw new Error(`Invalid value ${r40}`);
}
function L(r40) {
  let e = r40.converter?.to_attribute ?? Us.to_attribute, t = r40.converter?.from_attribute ?? Us.from_attribute;
  return (i, s) => {
    let n = s.replace("_", "-"), a = false;
    Object.defineProperty(i, s, { enumerable: true, configurable: true, get() {
      return t(this.getAttribute(n), r40.type);
    }, set(c) {
      let u = this[s], h = e(c, r40.type);
      h === null ? this.removeAttribute(n) : this.setAttribute(n, h), a || (a = true, r40.on_change?.(u, c), a = false);
    } });
  };
}
function Q(r40, e) {
  return (t, i) => {
    let s = typeof i == "symbol" ? Symbol() : `__${i}`;
    Object.defineProperty(t, i, { enumerable: true, configurable: true, get() {
      let n = this;
      if (e && n[s] !== void 0) return n[s];
      let a = this.renderRoot?.querySelector(r40) ?? null;
      return e && a && (n[s] = a), a;
    } });
  };
}
function vs(r40) {
  return (e, t) => {
    Object.defineProperty(e, t, { enumerable: true, configurable: true, get() {
      return this.renderRoot?.querySelectorAll(r40) ?? [];
    } });
  };
}
function I(r40, e, t, i) {
  return r40.addEventListener(e, t, i), { dispose: l(() => {
    r40.removeEventListener(e, t, i);
  }, "dispose") };
}
function ue(r40, e, t, i, s) {
  return I(r40, t, (n) => {
    let a = n.target.closest(e);
    a && i(n, a);
  }, s);
}
function Ct(r40) {
  return r40[Symbol.iterator]().next().value;
}
function* Ks(r40, e) {
  let t = 0;
  for (let i of r40) yield e(i, t), t++;
}
function Dt(r40) {
  let e = 0;
  for (let t of r40) e++;
  return e;
}
function Ys(r40, e) {
  let t = (r40 ?? "").split(" "), i = {}, s = Object.getOwnPropertyNames(e);
  for (let a of s) i[a] = false, i[`no${a}`] = false;
  for (let a of t) i[a] = true;
  let n = e;
  for (let a of s) n[a] = ((i[a] || n[a]) && !i[`no${a}`]) ?? false;
  return e;
}
function lt(r40, e, t) {
  let i = t.value, s = false;
  t.value = function(...n) {
    if (!s) {
      s = true;
      try {
        i.apply(this, n);
      } finally {
        s = false;
      }
    }
  };
}
function $n(r40, e, t) {
  let i = Math.SQRT1_2, s = new d(0, 0), n = e.y - r40.y, a = e.x - r40.x, c = t.y - e.y, u = t.x - e.x;
  if (a == 0 && c == 0 || n == 0 && u == 0) return s.x = (r40.x + t.x) / 2, s.y = (r40.y + t.y) / 2, s;
  a == 0 && (a = Number.EPSILON), u == 0 && (u = -Number.EPSILON);
  let h = n / a, m = c / u, _ = h * new d(0.5 / n, 0.5 / a).magnitude, b = m * new d(0.5 / c, 0.5 / u).magnitude;
  if (h == m) {
    if (r40 == t) return s.x = (r40.x + e.x) / 2, s.y = (r40.y + e.y) / 2, s;
    h += Number.EPSILON, m -= Number.EPSILON;
  }
  h == 0 && (h = Number.EPSILON);
  let f = h * m * (r40.y - t.y), N = f * Math.sqrt(_ / h * _ / h + b / m * b / m + i / (r40.y - t.y) * (i / (r40.y - t.y))), Z = m * (r40.x + e.x), T = Z * Math.sqrt(b / m * b / m + i / (r40.x + e.x) * i / (r40.x + e.x)), x = h * (e.x + t.x), C = x * Math.sqrt(_ / h * _ / h + i / (e.x + t.x) * i / (e.x + t.x)), X = 2 * (m - h), U = 2 * Math.sqrt(b * b + _ * _), st = f + Z - x, Oe = Math.sqrt(N * N + T * T + C * C), j = (f + Z - x) / X, se = j * Math.sqrt(Oe / st * Oe / st + U / X * U / X), ti = (r40.x + e.x) / 2 - j, _s = Math.sqrt(1 / 8 + se * se), bs = ti / h, fs = bs * Math.sqrt(_s / ti * _s / ti + _ / h * _ / h), kt = bs + (r40.y + e.y) / 2, Ms = Math.sqrt(fs * fs + 1 / 8), Ns = Math.floor((j + 50) / 100) * 100, gs = Math.floor((kt + 50) / 100) * 100, Vs = Math.floor((j + 5) / 10) * 10, Ps = Math.floor((kt + 5) / 10) * 10;
  return Math.abs(Ns - j) < se && Math.abs(gs - kt) < Ms ? (s.x = Ns, s.y = gs) : Math.abs(Vs - j) < se && Math.abs(Ps - kt) < Ms ? (s.x = Vs, s.y = Ps) : (s.x = j, s.y = kt), s;
}
function jn(r40, e, t) {
  let i = Math.max(r40, e, t), s = Math.min(r40, e, t), n = (s + i) / 2, a = i - s, [c, u] = [NaN, 0];
  if (a !== 0) {
    switch (u = n === 0 || n === 1 ? 0 : (i - n) / Math.min(n, 1 - n), i) {
      case r40:
        c = (e - t) / a + (e < t ? 6 : 0);
        break;
      case e:
        c = (t - r40) / a + 2;
        break;
      case t:
        c = (r40 - e) / a + 4;
    }
    c = c * 60;
  }
  return [c, u * 100, n * 100];
}
function zn(r40, e, t) {
  r40 = r40 % 360, r40 < 0 && (r40 += 360), e /= 100, t /= 100;
  function i(s) {
    let n = (s + r40 / 30) % 12, a = e * Math.min(t, 1 - t);
    return t - a * Math.max(-1, Math.min(n - 3, 9 - n, 1));
  }
  return l(i, "f"), [i(0), i(8), i(4)];
}
function r22(r40, e, t) {
  t = t || 2;
  var i = e && e.length, s = i ? e[0] * t : r40.length, n = Is(r40, 0, s, t, true), a = [];
  if (!n || n.next === n.prev) return a;
  var c, u, h, m, _, b, f;
  if (i && (n = so(r40, e, n, t)), r40.length > 80 * t) {
    c = h = r40[0], u = m = r40[1];
    for (var N = t; N < s; N += t) _ = r40[N], b = r40[N + 1], _ < c && (c = _), b < u && (u = b), _ > h && (h = _), b > m && (m = b);
    f = Math.max(h - c, m - u), f = f !== 0 ? 32767 / f : 0;
  }
  return e2(n, a, t, c, u, f, 0), a;
}
function Is(r40, e, t, i, s) {
  var n, a;
  if (s === Si(r40, e, t, i) > 0) for (n = e; n < t; n += i) a = ks(n, r40[n], r40[n + 1], a);
  else for (n = t - i; n >= e; n -= i) a = ks(n, r40[n], r40[n + 1], a);
  return a && e3(a, a.next) && (i2(a), a = a.next), a;
}
function Ae(r40, e) {
  if (!r40) return r40;
  e || (e = r40);
  var t = r40, i;
  do
    if (i = false, !t.steiner && (e3(t, t.next) || Y(t.prev, t, t.next) === 0)) {
      if (i2(t), t = e = t.prev, t === t.next) break;
      i = true;
    } else t = t.next;
  while (i || t !== e);
  return e;
}
function e2(r40, e, t, i, s, n, a) {
  if (r40) {
    !a && n && co(r40, i, s, n);
    for (var c = r40, u, h; r40.prev !== r40.next; ) {
      if (u = r40.prev, h = r40.next, n ? to(r40, i, s, n) : eo(r40)) {
        e.push(u.i / t | 0), e.push(r40.i / t | 0), e.push(h.i / t | 0), i2(r40), r40 = h.next, c = h.next;
        continue;
      }
      if (r40 = h, r40 === c) {
        a ? a === 1 ? (r40 = io(Ae(r40), e, t), e2(r40, e, t, i, s, n, 2)) : a === 2 && ro(r40, e, t, i, s, n) : e2(Ae(r40), e, t, i, s, n, 1);
        break;
      }
    }
  }
}
function eo(r40) {
  var e = r40.prev, t = r40, i = r40.next;
  if (Y(e, t, i) >= 0) return false;
  for (var s = e.x, n = t.x, a = i.x, c = e.y, u = t.y, h = i.y, m = s < n ? s < a ? s : a : n < a ? n : a, _ = c < u ? c < h ? c : h : u < h ? u : h, b = s > n ? s > a ? s : a : n > a ? n : a, f = c > u ? c > h ? c : h : u > h ? u : h, N = i.next; N !== e; ) {
    if (N.x >= m && N.x <= b && N.y >= _ && N.y <= f && Rt(s, c, n, u, a, h, N.x, N.y) && Y(N.prev, N, N.next) >= 0) return false;
    N = N.next;
  }
  return true;
}
function to(r40, e, t, i) {
  var s = r40.prev, n = r40, a = r40.next;
  if (Y(s, n, a) >= 0) return false;
  for (var c = s.x, u = n.x, h = a.x, m = s.y, _ = n.y, b = a.y, f = c < u ? c < h ? c : h : u < h ? u : h, N = m < _ ? m < b ? m : b : _ < b ? _ : b, Z = c > u ? c > h ? c : h : u > h ? u : h, T = m > _ ? m > b ? m : b : _ > b ? _ : b, x = Wi(f, N, e, t, i), C = Wi(Z, T, e, t, i), X = r40.prevZ, U = r40.nextZ; X && X.z >= x && U && U.z <= C; ) {
    if (X.x >= f && X.x <= Z && X.y >= N && X.y <= T && X !== s && X !== a && Rt(c, m, u, _, h, b, X.x, X.y) && Y(X.prev, X, X.next) >= 0 || (X = X.prevZ, U.x >= f && U.x <= Z && U.y >= N && U.y <= T && U !== s && U !== a && Rt(c, m, u, _, h, b, U.x, U.y) && Y(U.prev, U, U.next) >= 0)) return false;
    U = U.nextZ;
  }
  for (; X && X.z >= x; ) {
    if (X.x >= f && X.x <= Z && X.y >= N && X.y <= T && X !== s && X !== a && Rt(c, m, u, _, h, b, X.x, X.y) && Y(X.prev, X, X.next) >= 0) return false;
    X = X.prevZ;
  }
  for (; U && U.z <= C; ) {
    if (U.x >= f && U.x <= Z && U.y >= N && U.y <= T && U !== s && U !== a && Rt(c, m, u, _, h, b, U.x, U.y) && Y(U.prev, U, U.next) >= 0) return false;
    U = U.nextZ;
  }
  return true;
}
function io(r40, e, t) {
  var i = r40;
  do {
    var s = i.prev, n = i.next.next;
    !e3(s, n) && As(s, i, i.next, n) && t2(s, n) && t2(n, s) && (e.push(s.i / t | 0), e.push(i.i / t | 0), e.push(n.i / t | 0), i2(i), i2(i.next), i = r40 = n), i = i.next;
  } while (i !== r40);
  return Ae(i);
}
function ro(r40, e, t, i, s, n) {
  var a = r40;
  do {
    for (var c = a.next.next; c !== a.prev; ) {
      if (a.i !== c.i && po(a, c)) {
        var u = Cs(a, c);
        a = Ae(a, a.next), u = Ae(u, u.next), e2(a, e, t, i, s, n, 0), e2(u, e, t, i, s, n, 0);
        return;
      }
      c = c.next;
    }
    a = a.next;
  } while (a !== r40);
}
function so(r40, e, t, i) {
  var s = [], n, a, c, u, h;
  for (n = 0, a = e.length; n < a; n++) c = e[n] * i, u = n < a - 1 ? e[n + 1] * i : r40.length, h = Is(r40, c, u, i, false), h === h.next && (h.steiner = true), s.push(uo(h));
  for (s.sort(no), n = 0; n < s.length; n++) t = oo(s[n], t);
  return t;
}
function no(r40, e) {
  return r40.x - e.x;
}
function oo(r40, e) {
  var t = ao(r40, e);
  if (!t) return e;
  var i = Cs(t, r40);
  return Ae(i, i.next), Ae(t, t.next);
}
function ao(r40, e) {
  var t = e, i = r40.x, s = r40.y, n = -1 / 0, a;
  do {
    if (s <= t.y && s >= t.next.y && t.next.y !== t.y) {
      var c = t.x + (s - t.y) * (t.next.x - t.x) / (t.next.y - t.y);
      if (c <= i && c > n && (n = c, a = t.x < t.next.x ? t : t.next, c === i)) return a;
    }
    t = t.next;
  } while (t !== e);
  if (!a) return null;
  var u = a, h = a.x, m = a.y, _ = 1 / 0, b;
  t = a;
  do
    i >= t.x && t.x >= h && i !== t.x && Rt(s < m ? i : n, s, h, m, s < m ? n : i, s, t.x, t.y) && (b = Math.abs(s - t.y) / (i - t.x), t2(t, r40) && (b < _ || b === _ && (t.x > a.x || t.x === a.x && lo(a, t))) && (a = t, _ = b)), t = t.next;
  while (t !== u);
  return a;
}
function lo(r40, e) {
  return Y(r40.prev, r40, e.prev) < 0 && Y(e.next, r40, r40.next) < 0;
}
function co(r40, e, t, i) {
  var s = r40;
  do
    s.z === 0 && (s.z = Wi(s.x, s.y, e, t, i)), s.prevZ = s.prev, s.nextZ = s.next, s = s.next;
  while (s !== r40);
  s.prevZ.nextZ = null, s.prevZ = null, Ro(s);
}
function Ro(r40) {
  var e, t, i, s, n, a, c, u, h = 1;
  do {
    for (t = r40, r40 = null, n = null, a = 0; t; ) {
      for (a++, i = t, c = 0, e = 0; e < h && (c++, i = i.nextZ, !!i); e++) ;
      for (u = h; c > 0 || u > 0 && i; ) c !== 0 && (u === 0 || !i || t.z <= i.z) ? (s = t, t = t.nextZ, c--) : (s = i, i = i.nextZ, u--), n ? n.nextZ = s : r40 = s, s.prevZ = n, n = s;
      t = i;
    }
    n.nextZ = null, h *= 2;
  } while (a > 1);
  return r40;
}
function Wi(r40, e, t, i, s) {
  return r40 = (r40 - t) * s | 0, e = (e - i) * s | 0, r40 = (r40 | r40 << 8) & 16711935, r40 = (r40 | r40 << 4) & 252645135, r40 = (r40 | r40 << 2) & 858993459, r40 = (r40 | r40 << 1) & 1431655765, e = (e | e << 8) & 16711935, e = (e | e << 4) & 252645135, e = (e | e << 2) & 858993459, e = (e | e << 1) & 1431655765, r40 | e << 1;
}
function uo(r40) {
  var e = r40, t = r40;
  do
    (e.x < t.x || e.x === t.x && e.y < t.y) && (t = e), e = e.next;
  while (e !== r40);
  return t;
}
function Rt(r40, e, t, i, s, n, a, c) {
  return (s - a) * (e - c) >= (r40 - a) * (n - c) && (r40 - a) * (i - c) >= (t - a) * (e - c) && (t - a) * (n - c) >= (s - a) * (i - c);
}
function po(r40, e) {
  return r40.next.i !== e.i && r40.prev.i !== e.i && !ho(r40, e) && (t2(r40, e) && t2(e, r40) && mo(r40, e) && (Y(r40.prev, r40, e.prev) || Y(r40, e.prev, e)) || e3(r40, e) && Y(r40.prev, r40, r40.next) > 0 && Y(e.prev, e, e.next) > 0);
}
function Y(r40, e, t) {
  return (e.y - r40.y) * (t.x - e.x) - (e.x - r40.x) * (t.y - e.y);
}
function e3(r40, e) {
  return r40.x === e.x && r40.y === e.y;
}
function As(r40, e, t, i) {
  var s = q2(Y(r40, e, t)), n = q2(Y(r40, e, i)), a = q2(Y(t, i, r40)), c = q2(Y(t, i, e));
  return !!(s !== n && a !== c || s === 0 && z2(r40, t, e) || n === 0 && z2(r40, i, e) || a === 0 && z2(t, r40, i) || c === 0 && z2(t, e, i));
}
function z2(r40, e, t) {
  return e.x <= Math.max(r40.x, t.x) && e.x >= Math.min(r40.x, t.x) && e.y <= Math.max(r40.y, t.y) && e.y >= Math.min(r40.y, t.y);
}
function q2(r40) {
  return r40 > 0 ? 1 : r40 < 0 ? -1 : 0;
}
function ho(r40, e) {
  var t = r40;
  do {
    if (t.i !== r40.i && t.next.i !== r40.i && t.i !== e.i && t.next.i !== e.i && As(t, t.next, r40, e)) return true;
    t = t.next;
  } while (t !== r40);
  return false;
}
function t2(r40, e) {
  return Y(r40.prev, r40, r40.next) < 0 ? Y(r40, e, r40.next) >= 0 && Y(r40, r40.prev, e) >= 0 : Y(r40, e, r40.prev) < 0 || Y(r40, r40.next, e) < 0;
}
function mo(r40, e) {
  var t = r40, i = false, s = (r40.x + e.x) / 2, n = (r40.y + e.y) / 2;
  do
    t.y > n != t.next.y > n && t.next.y !== t.y && s < (t.next.x - t.x) * (n - t.y) / (t.next.y - t.y) + t.x && (i = !i), t = t.next;
  while (t !== r40);
  return i;
}
function Cs(r40, e) {
  var t = new Zi(r40.i, r40.x, r40.y), i = new Zi(e.i, e.x, e.y), s = r40.next, n = e.prev;
  return r40.next = e, e.prev = r40, t.next = s, s.prev = t, i.next = t, t.prev = i, n.next = i, i.prev = n, i;
}
function ks(r40, e, t, i) {
  var s = new Zi(r40, e, t);
  return i ? (s.next = i.next, s.prev = i, i.next.prev = s, i.next = s) : (s.prev = s, s.next = s), s;
}
function i2(r40) {
  r40.next.prev = r40.prev, r40.prev.next = r40.next, r40.prevZ && (r40.prevZ.nextZ = r40.nextZ), r40.nextZ && (r40.nextZ.prevZ = r40.prevZ);
}
function Zi(r40, e, t) {
  this.i = r40, this.x = e, this.y = t, this.prev = null, this.next = null, this.z = 0, this.prevZ = null, this.nextZ = null, this.steiner = false;
}
function Si(r40, e, t, i) {
  for (var s = 0, n = e, a = t - i; n < t; n += i) s += (r40[a] - r40[n]) * (r40[n + 1] + r40[a + 1]), a = n;
  return s;
}
function n2(...r40) {
  No.warn(...r40);
}
function o3(r40) {
  return r40 >= "0" && r40 <= "9";
}
function zs(r40) {
  return r40 >= "A" && r40 <= "Z" || r40 >= "a" && r40 <= "z";
}
function n3(r40) {
  return r40 === js || r40 === " " || r40 === `
` || r40 === "\r" || r40 === "	";
}
function Fi(r40) {
  return zs(r40) || o3(r40) || ["_", "-", ":", "!", ".", "[", "]", "{", "}", "@", "*", "/", "&", "#", "%", "+", "=", "~", "$", "|"].includes(r40);
}
function o2(r40, e) {
  let t = r40.slice(0, e).lastIndexOf(`
`);
  t < 0 && (t = 0);
  let i = r40.slice(e).indexOf(`
`);
  return i < 0 && (i = 20), r40.slice(t, e + i);
}
function* go(r40) {
  let e = new k(k.OPEN), t = new k(k.CLOSE), i = 0, s = 0, n = false;
  for (let a = 0; a < r40.length + 1; a++) {
    let c = a < r40.length ? r40[a] : js;
    if (i == 0) if (c === "(") {
      yield e;
      continue;
    } else if (c === ")") {
      yield t;
      continue;
    } else if (c === '"') {
      i = 1, s = a;
      continue;
    } else if (c === "-" || c == "+" || o3(c)) {
      i = 2, s = a;
      continue;
    } else if (zs(c) || ["*", "&", "$", "/", "%", "|"].includes(c)) {
      i = 3, s = a;
      continue;
    } else {
      if (n3(c)) continue;
      throw new Error(`Unexpected character at index ${a}: ${c}
Context: ${o2(r40, a)}`);
    }
    else if (i == 3) {
      if (Fi(c)) continue;
      if (c === ")" || n3(c)) yield new k(k.ATOM, r40.substring(s, a)), i = 0, c === ")" && (yield t);
      else throw new Error(`Unexpected character while tokenizing atom at index ${a}: ${c}
Context: ${o2(r40, a)}`);
    } else if (i == 2) {
      if (c === "." || o3(c)) continue;
      if (c.toLowerCase() === "x") {
        i = 4;
        continue;
      } else if (["+", "-", "a", "b", "c", "d", "e", "f"].includes(c.toLowerCase())) {
        i = 3;
        continue;
      } else if (Fi(c)) {
        i = 3;
        continue;
      } else if (c === ")" || n3(c)) {
        yield new k(k.NUMBER, parseFloat(r40.substring(s, a))), i = 0, c === ")" && (yield t);
        continue;
      } else throw new Error(`Unexpected character at index ${a}: ${c}, expected numeric.
Context: ${o2(r40, a)}`);
    } else if (i == 4) {
      if (o3(c) || ["a", "b", "c", "d", "e", "f", "_"].includes(c.toLowerCase())) continue;
      if (c === ")" || n3(c)) {
        let u = r40.substring(s, a).replace("_", "");
        yield new k(k.NUMBER, Number.parseInt(u, 16)), i = 0, c === ")" && (yield t);
        continue;
      } else if (Fi(c)) {
        i = 3;
        continue;
      } else throw new Error(`Unexpected character at index ${a}: ${c}, expected hexadecimal.
Context: ${o2(r40, a)}`);
    } else if (i == 1) if (!n && c === '"') {
      yield new k(k.STRING, r40.substring((s ?? 0) + 1, a).replaceAll("\\n", `
`).replaceAll("\\\\", "\\")), i = 0, n = false;
      continue;
    } else if (!n && c === "\\") {
      n = true;
      continue;
    } else {
      n = false;
      continue;
    }
    else throw new Error(`Unknown tokenizer state ${i}
Context: ${o2(r40, a)}`);
  }
}
function* qs(r40) {
  let e, t;
  for (; ; ) switch (t = r40.next(), e = t.value, e?.type) {
    case k.ATOM:
    case k.STRING:
    case k.NUMBER:
      yield e.value;
      break;
    case k.OPEN:
      yield Array.from(qs(r40));
      break;
    case k.CLOSE:
    case void 0:
      return;
  }
}
function en2(r40) {
  let e = go(r40);
  return Array.from(qs(e));
}
function V(r40, ...e) {
  G(r40) && (a2.info(`Parsing expression with ${r40.length} chars`), r40 = en2(r40), r40.length == 1 && Array.isArray(r40[0]) && (r40 = r40[0]));
  let t = /* @__PURE__ */ new Map(), i, s = 0;
  for (let a of e) if (a.kind == 0) i = a;
  else if (a.kind == 1) t.set(s, a), s++;
  else for (let c of a.accepts) t.set(c, a);
  if (i) {
    let a = A2(i.name), c = r40.at(0);
    if (!a.includes(c)) throw new Error(`Expression must start with ${i.name}, but found ${c} in ${r40}`);
    r40 = r40.slice(1);
  }
  let n = {};
  s = 0;
  for (let a of r40) {
    let c = null;
    if (G(a) && (c = t.get(a)), !c && (G(a) || le(a))) {
      if (c = t.get(s), !c) {
        a2.warn(`Bare element ${a} is undefined at position ${s} in expression ${r40}`);
        continue;
      }
      s++;
    }
    if (!c && Array.isArray(a) && (c = t.get(a[0])), !c) {
      a2.warn(`No definition found for element ${a} in expression ${r40}`);
      continue;
    }
    let u = c.fn(n, c.name, a);
    n[c.name] = u;
  }
  return n;
}
function Ui(r40) {
  let e = { dblquote: '"', quote: "'", lt: "<", gt: ">", backslash: "\\", slash: "/", bar: "|", comma: ",", colon: ":", space: " ", dollar: "$", tab: "	", return: `
`, brace: "{" };
  for (let [t, i] of Object.entries(e)) r40 = r40.replaceAll("{" + t + "}", i);
  return r40;
}
function Ye(r40, e) {
  if (r40 = Ui(r40), e === void 0) return r40;
  let t, i = 8, s = [];
  do
    t = s.length, i -= 1, r40 = r40.replaceAll(/(\$\{(.+?)\})/g, (n, a, c) => {
      if (s.includes(c)) return a2.warn(`Cycle reference "${c}" in text "${r40}"`), a;
      let u = e.resolve_text_var(c);
      return u === void 0 ? a : (s.push(c), u);
    });
  while (t !== s.length || i === 0);
  return r40;
}
function vi(r40) {
  return "net" in r40 && r40.__lookupGetter__("netname") !== void 0;
}
function rn(r40) {
  return typeof r40.net == "number" ? r40.net : r40.net.number;
}
function dr(r40, e) {
  if (!(e == null || e == null)) for (let t of Object.keys(e)) ys(r40[t]) ? dr(r40[t], e[t]) : r40[t] = e[t];
}
function* Zo(r40) {
  let t = 0, i = null, s = 0;
  for (let n = 0; n < r40.length + 1; n++) {
    let a = n < r40.length ? r40[n] : "";
    switch (a) {
      case "_":
      case "^":
      case "~":
        i = a;
        break;
      case "{":
        i && (s++, yield { text: r40.slice(t, n - 1) }, yield { open: s, control: i }, i = null, t = n + 1);
        break;
      case "}":
        s && (yield { text: r40.slice(t, n) }, yield { close: s }, t = n + 1, s--);
        break;
      case "":
        yield { text: r40.slice(t, n) };
        break;
      default:
        i = null;
        break;
    }
  }
}
function on(r40) {
  let e, t = new b3();
  for (; e = r40.next().value; ) {
    if (e.text) {
      let i = new b3();
      i.text = e.text, t.children.push(i);
      continue;
    }
    if (e.open) {
      let i = on(r40);
      switch (e.control) {
        case "^":
          i.superscript = true;
          break;
        case "_":
          i.subscript = true;
          break;
        case "~":
          i.overbar = true;
          break;
      }
      t.children.push(i);
      continue;
    }
    if (e.close) return t;
  }
  return t;
}
function M3(r40) {
  return r40.charCodeAt(0);
}
function ln(r40) {
  return M3(r40) - M3("R");
}
function To(r40) {
  return [ln(r40[0]), ln(r40[1])];
}
function cn(r40) {
  let e = 0, t = 0, i = 0, s = 0, n = 0, a = [], c = null;
  for (let m = 0; m < r40.length; m += 2) {
    let _ = [r40[m], r40[m + 1]], b = To(_);
    if (m < 2) e = b[0] * w.font_scale, t = b[1] * w.font_scale, i = t - e;
    else if (_[0] == " " && _[1] == "R") c = null;
    else {
      let f = new d(b[0] * w.font_scale - e, (b[1] + w.font_offset) * w.font_scale);
      c == null && (c = [], a.push(c)), s = Math.min(s, f.y), n = Math.max(n, f.y), c.push(f);
    }
  }
  let u = new O(0, s, i, n - s);
  return new U2(a, u);
}
function yo(r40) {
  return Math.round(r40 / 5);
}
function Lo(r40) {
  return Math.round(r40 / 8);
}
function Xo(r40, e, t) {
  let i = Math.round(e * (t ? 0.25 : 0.18));
  return Math.min(r40, i);
}
function Ft(r40, e, t) {
  return r40 == e ? t : r40 == t ? e : r40;
}
function Rn(r40, e = 0) {
  return -(r40 - e) + e;
}
function Q2(r40, e, t, i = true) {
  let s = r40.top_left, n = r40.top_right, a = r40.bottom_left, c = r40.bottom_right, u = r40.margin_bbox;
  switch (t) {
    case "ltcorner":
      e = s.add(e);
      break;
    case "rbcorner":
      e = c.sub(e);
      break;
    case "lbcorner":
      e = a.add(new d(e.x, -e.y));
      break;
    case "rtcorner":
      e = n.add(new d(-e.x, e.y));
      break;
  }
  if (!(i && !u.contains_point(e))) return e;
}
function hn(r40) {
  return class extends r40 {
    static {
      l(this, "WithPreferences");
    }
    constructor(...t) {
      super(...t), this.addDisposable(I(ce.INSTANCE, T3.type, () => {
        this.preferenceChangeCallback(this.preferences);
      }));
    }
    get preferences() {
      return ce.INSTANCE;
    }
    async preferenceChangeCallback(t) {
    }
  };
}
function ye(r40, e) {
  return `:${r40}:${e}`;
}
function bn(r40) {
  return r40.startsWith(":");
}
function Qo(r40, e) {
  return bn(e) && e.startsWith(`:${r40}:`);
}
function wo(r40, e) {
  let t = ":invaild";
  r40 === "F.Cu" ? t = ":Pads:Front" : r40 === "B.Cu" && (t = ":Pads:Back");
  let i = e === ":Pad:Holes:NetName" || e === ":Pad:Holes" || e === ":NonPlatedHoles", s = e.startsWith(t), n = i && fn(r40);
  return s || n;
}
function fn(r40) {
  return r40.endsWith(".Cu");
}
function Mn(r40) {
  return r40 === "Edge.Cuts" || r40 === "Margin" || r40.startsWith("F.") || r40.startsWith("B.") || r40.endsWith(".Cu");
}
function* Nn(r40, e) {
  let t = false;
  for (let i of et) if (i == r40 && (t = true), t && (yield i), i == e) return;
}
function ko(r40) {
  switch (r40) {
    case 0:
      return "right";
    case 90:
      return "up";
    case 180:
      return "left";
    case 270:
      return "down";
    default:
      throw new Error(`Unexpected pin angle ${r40}`);
  }
}
function Io(r40) {
  let e = new F([1, 0, 0, 0, -1, 0, 0, 0, 1]), t = new F([0, -1, 0, -1, 0, 0, 0, 0, 1]), i = new F([-1, 0, 0, 0, 1, 0, 0, 0, 1]), s = new F([0, 1, 0, 1, 0, 0, 0, 0, 1]), n = 0, a = e;
  if (r40.at.rotation != 0) if (r40.at.rotation == 90) n = 1, a = t;
  else if (r40.at.rotation == 180) n = 2, a = i;
  else if (r40.at.rotation == 270) n = 3, a = s;
  else throw new Error(`unexpected rotation ${r40.at.rotation}`);
  if (r40.mirror == "y") {
    let c = a.elements[0] * -1, u = a.elements[3] * -1, h = a.elements[1], m = a.elements[4];
    a.elements[0] = c, a.elements[1] = h, a.elements[3] = u, a.elements[4] = m;
  } else if (r40.mirror == "x") {
    let c = a.elements[0], u = a.elements[3], h = a.elements[1] * -1, m = a.elements[4] * -1;
    a.elements[0] = c, a.elements[1] = h, a.elements[3] = u, a.elements[4] = m;
  }
  return { matrix: a, position: r40.at.position, rotations: n, mirror_x: r40.mirror == "x", mirror_y: r40.mirror == "y" };
}
function Ao(r40, e) {
  let t = new k3(), i = new wt(r40), s = new Yt(t, i, r40), n = [":Symbol:Foreground", ":Symbol:Background", ":Symbol:Pin"], a = [];
  for (let c of n) {
    let u = i.by_name(c);
    u.items.push(e), s.paint_layer(u), a.push(u.bbox);
  }
  return O.combine(a);
}
function D3(r40) {
  return r40 instanceof URL && (r40 = r40.pathname), r40.split("/").slice(0, -1).join("/");
}
function B3(r40) {
  return r40 instanceof URL && (r40 = r40.pathname), r40.split("/").at(-1);
}
function Wn(r40) {
  let e = r40.split(".");
  return e.length <= 1 ? "" : e.at(-1);
}
function hs(...r40) {
  return r40.flatMap((e) => e.split("/")).filter((e) => e !== "").join("/");
}
function Zn(r40) {
  let e, t;
  r40 instanceof File ? (e = URL.createObjectURL(r40), t = r40.name) : (e = r40.href, t = B3(e));
  let i = document.createElement("a");
  i.href = e, i.download = t, i.target = "_blank", console.log(i), i.click(), r40 instanceof File && URL.revokeObjectURL(e);
}
var Ws, Tn, l, W, I2, Ls, nt, Xn, ge, Ve, ot, C2, si, Ue, Us, Qn, g, wn, xs, At, Qs, ws, Yn, pe, En, at, Hn, ai, Es, li, ci, ui, D2, ve, Ri, Gn, Bt, Jn, pi, kn, hi, In, di, B2, mi, _i, bi, fi, Hs, Mi, $2, An, Pe, Cn, Ni, Gs, Js, gi, Vi, Dn, $t, Bn, jt, zt, te, z, ct, F, d, P, O, q, j2, p, A, he, v, J, xe, Qe, Pi, qt, Ti, ut, pt, yi, Ds, Bs, Li, Xi, Ce, t3, i3, r32, s2, s3, Oi, ie, No, js, k, a2, R, o, E, tn, ht, we, H, a3, l3, D, Ke, dt, l2, de, xi, c2, R2, u2, mt, Qi, wi, Ki, Yi, Ei, Hi, Gi, p2, Ji, ki, me, _t, Ee, c3, bt, h2, R3, ft, d2, u3, Mt, m2, Ii, We, Ai, Nt, _2, p3, gt, b2, Ci, Vt, De, Pt, f2, Di, Bi, $i, ji, B, _e, h3, ee, M2, N2, g2, zi, V2, P2, Wt, qi, Zt, Be, St, er, Tt, W2, tr, be, Z2, S2, $e, T2, ir, yt, Ze, rr, sr, y2, re, nr, L2, or, ar, lr, cr, ne, Rr, d3, nn, X2, _3, Se, oe, O2, Lt, ur, pr, F2, hr, je, mr, _r, br, fr, Mr, Nr, U2, v2, b3, Xt, He, Ot, an, f3, w, $, N3, g3, ze, ae, Ut, x2, fe, Ge, qe, gr, Vr, Pr, V3, W3, Z3, S3, Oo, Wr, Fo, un, pn, Uo, Te, ce, T3, dn, y3, vo, mn, _n, L3, X3, O3, w2, Je, vt, tt, xo, et, F3, Me, it, xt, Zr, Sr, Tr, yr, Lr, Xr, Or, Fr, Ur, vr, xr, Qr, wr, Kr, Yr, U3, v3, Le, Ko, Er, Yo, K2, Eo, Hr, Ho, Y2, x3, Go, Q3, Jo, Gr, Xe, w3, Qt, Jr, ke, wt, K3, K, E2, Y3, E3, H3, G3, J3, gn, Kt, kr, k3, I3, A3, Ir, Ar, Cr, Dr, Br, $r, jr, zr, qr, es, ts, is, rs, ss, Yt, C3, Co, ns, Do, os, Bo, as, $o, Et, jo, ls, zo, Ht, qo, cs, Vn, H2, Ie, G2, ea, J2, ta, Rs, ia, us, ra, ps, Pn, Gt, $3, Jt, j3, z3, ds, q3, ei, Sn, k2, Ne, rt, ms;
var init_kicanvas = __esm({
  "vendor/kicanvas/kicanvas.js"() {
    "use strict";
    Ws = Object.defineProperty;
    Tn = Object.getOwnPropertyDescriptor;
    l = (r40, e) => Ws(r40, "name", { value: e, configurable: true });
    W = (r40, e, t, i) => {
      for (var s = i > 1 ? void 0 : i ? Tn(e, t) : e, n = r40.length - 1, a; n >= 0; n--) (a = r40[n]) && (s = (i ? a(e, t, s) : a(s)) || s);
      return i && s && Ws(e, t, s), s;
    };
    I2 = class r extends Event {
      constructor(t, i) {
        super(r.type, { bubbles: true, cancelable: true, composed: true });
        this.context_name = t;
        this._callback = i;
      }
      static {
        l(this, "ContextRequestEvent");
      }
      static {
        this.type = "context-request";
      }
      callback(t) {
        this.stopPropagation(), this._callback(t);
      }
    };
    l(Zs, "requestContext");
    l(Ss, "provideContext");
    l(yn, "requestLazyContext");
    l(Ln, "provideLazyContext");
    l(Ts, "WithContext");
    l(ii, "is_primitive");
    l(G, "is_string");
    l(le, "is_number");
    l(It, "is_iterable");
    l(ri, "is_array");
    l(ys, "is_object");
    Ls = /* @__PURE__ */ new Map();
    nt = class {
      constructor(e) {
        this.css_string = e;
      }
      static {
        l(this, "CSS");
      }
      get stylesheet() {
        let e = Ls.get(this.css_string);
        return e == null && (e = new CSSStyleSheet(), e.replaceSync(this.css_string), Ls.set(this.css_string, e)), e;
      }
    };
    l(y, "css");
    l(Xs, "adopt_styles");
    l(A2, "as_array");
    l(Os, "iterable_as_array");
    Xn = new Intl.Collator(void 0, { numeric: true });
    l(Re, "sorted_by_numeric_strings");
    l(Fe, "later");
    ge = class {
      static {
        l(this, "DeferredPromise");
      }
      #e;
      #t;
      #i;
      #r;
      #s;
      constructor() {
        this.#e = new Promise((e, t) => {
          this.#t = e, this.#i = t;
        });
      }
      get rejected() {
        return this.#r === 1;
      }
      get resolved() {
        return this.#r === 0;
      }
      get settled() {
        return !!this.#r;
      }
      get value() {
        return this.#s;
      }
      then(e, t) {
        return this.#e.then(e, t);
      }
      resolve(e) {
        this.#r = 0, this.#s = e, this.#t(e);
      }
      reject(e) {
        this.#r = 1, this.#s = e, this.#i(e);
      }
    };
    Ve = class extends ge {
      static {
        l(this, "Barrier");
      }
      get isOpen() {
        return this.resolved && this.value === true;
      }
      open() {
        this.resolve(true);
      }
    };
    ot = class {
      constructor() {
        this._disposables = /* @__PURE__ */ new Set();
        this._is_disposed = false;
      }
      static {
        l(this, "Disposables");
      }
      add(e) {
        if (this._is_disposed) throw new Error("Tried to add item to a DisposableStack that's already been disposed");
        return this._disposables.add(e), e;
      }
      disposeAndRemove(e) {
        e && (e.dispose(), this._disposables.delete(e));
      }
      get isDisposed() {
        return this._is_disposed;
      }
      dispose() {
        if (this._is_disposed) {
          console.trace("dispose() called on an already disposed resource");
          return;
        }
        for (let e of this._disposables.values()) e.dispose();
        this._disposables.clear(), this._is_disposed = true;
      }
    };
    l(On, "is_HTMLElement");
    l(M, "html");
    l(oi, "literal");
    C2 = class {
      constructor(e) {
        this.text = e;
      }
      static {
        l(this, "Literal");
      }
    };
    si = /\$\$:(\d+):\$\$/g;
    l(Fn, "prepare_template_html");
    l(Un, "apply_values_to_tree");
    l(vn, "apply_content_value");
    l(xn, "apply_attribute_value");
    l(Fs, "convert_value_for_content");
    l(ni, "convert_value_for_attr");
    Ue = class extends HTMLElement {
      constructor() {
        super();
        this.updateComplete = new ge();
        this.disposables = new ot();
        let t = this.constructor;
        t.exportparts.length && this.setAttribute("exportparts", t.exportparts.join(","));
      }
      static {
        l(this, "CustomElement");
      }
      static {
        this.useShadowRoot = true;
      }
      static {
        this.exportparts = [];
      }
      addDisposable(t) {
        return this.disposables.add(t);
      }
      get renderRoot() {
        return this.shadowRoot ?? this;
      }
      connectedCallback() {
        this.#e();
      }
      disconnectedCallback() {
        this.disposables.dispose();
      }
      initialContentCallback() {
      }
      render() {
        return M``;
      }
      renderedCallback() {
      }
      async update() {
        for (this.updateComplete = new ge(); this.renderRoot.firstChild; ) this.renderRoot.firstChild.remove();
        return this.renderRoot.appendChild(await this.render()), this.renderedCallback(), window.requestAnimationFrame(() => {
          this.updateComplete.resolve(true);
        }), this.updateComplete;
      }
      #e() {
        let t = this.constructor;
        return this.updateComplete = new ge(), this.constructor.useShadowRoot && this.attachShadow({ mode: "open" }), t.styles && Xs(this.shadowRoot ?? document, A2(t.styles)), (async () => {
          let i = this.render();
          this.renderRoot.appendChild(i), this.renderedCallback(), this.initialContentCallback(), window.requestAnimationFrame(() => {
            this.updateComplete.resolve(true);
          });
        })(), this.updateComplete;
      }
      queryAssignedElements(t, i) {
        let n = this.renderRoot.querySelector(`slot${t ? `[name=${t}]` : ":not([name])"}`)?.assignedElements() ?? [];
        return i ? n.filter((a) => a.matches(i)) : n;
      }
    };
    l(L, "attribute");
    Us = { to_attribute(r40, e) {
      if (r40 === null) return r40;
      switch (e) {
        case Boolean:
          return r40 ? "" : null;
        case String:
          return r40;
        case Number:
          return `${r40}`;
        default:
          throw new Error(`Cannot convert type "${e}" and value "${r40} to attribute`);
      }
    }, from_attribute(r40, e) {
      switch (e) {
        case Boolean:
          return r40 !== null;
        case String:
          return r40;
        case Number:
          return r40 === null ? null : Number(r40);
        default:
          throw new Error(`Cannot convert type "${e}" and value "${r40} to attribute`);
      }
    } };
    l(Q, "query");
    l(vs, "query_all");
    Qn = y`
    :host {
        box-sizing: border-box;
    }

    :host *,
    :host *::before,
    :host *::after {
        box-sizing: inherit;
    }

    [hidden] {
        display: none !important;
    }

    :host {
        scrollbar-width: thin;
        scrollbar-color: #ae81ff #282634;
    }

    ::-webkit-scrollbar {
        position: absolute;
        width: 6px;
        height: 6px;
        margin-left: -6px;
        background: var(--scrollbar-bg);
    }

    ::-webkit-scrollbar-thumb {
        position: absolute;
        background: var(--scrollbar-fg);
    }

    ::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-hover-fg);
    }

    ::-webkit-scrollbar-thumb:active {
        background: var(--scrollbar-active-fg);
    }

    .invert-scrollbar::-webkit-scrollbar {
        position: absolute;
        width: 6px;
        height: 6px;
        margin-left: -6px;
        background: var(--scrollbar-fg);
    }

    .invert-scrollbar::-webkit-scrollbar-thumb {
        position: absolute;
        background: var(--scrollbar-bg);
    }

    .invert-scrollbar::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-hover-bg);
    }

    .invert-scrollbar::-webkit-scrollbar-thumb:active {
        background: var(--scrollbar-active-bg);
    }
`;
    g = class extends Ts(Ue) {
      static {
        l(this, "KCUIElement");
      }
      static {
        this.styles = [Qn];
      }
    };
    wn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    xs = { category: ["m261-526 220-354 220 354H261ZM706-80q-74 0-124-50t-50-124q0-74 50-124t124-50q74 0 124 50t50 124q0 74-50 124T706-80Zm-586-25v-304h304v304H120Zm586.08-35Q754-140 787-173.08q33-33.09 33-81Q820-302 786.92-335q-33.09-33-81-33Q658-368 625-334.92q-33 33.09-33 81Q592-206 625.08-173q33.09 33 81 33ZM180-165h184v-184H180v184Zm189-421h224L481-767 369-586Zm112 0ZM364-349Zm342 95Z"], check: ["M378-246 154-470l43-43 181 181 384-384 43 43-427 427Z"], close: ["m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z"], download: ["M480-313 287-506l43-43 120 120v-371h60v371l120-120 43 43-193 193ZM220-160q-24 0-42-18t-18-42v-143h60v143h520v-143h60v143q0 24-18 42t-42 18H220Z"], flip: ["M349-120H180q-24.75 0-42.37-17.63Q120-155.25 120-180v-600q0-24.75 17.63-42.38Q155.25-840 180-840h169v60H180v600h169v60Zm103 80v-880h60v880h-60Zm163-80v-60h60v60h-60Zm0-660v-60h60v60h-60Zm165 660v-60h60q0 25-17.62 42.5Q804.75-120 780-120Zm0-165v-60h60v60h-60Zm0-165v-60h60v60h-60Zm0-165v-60h60v60h-60Zm0-165v-60q24.75 0 42.38 17.62Q840-804.75 840-780h-60Z"], folder: ["M140-160q-24 0-42-18.5T80-220v-520q0-23 18-41.5t42-18.5h281l60 60h339q23 0 41.5 18.5T880-680v460q0 23-18.5 41.5T820-160H140Zm0-60h680v-460H456l-60-60H140v520Zm0 0v-520 520Z"], help: ["M511-258q11-11 11-27t-11-27q-11-11-27-11t-27 11q-11 11-11 27t11 27q11 11 27 11t27-11Zm-62-135h59q0-26 6.5-47.5T555-490q31-26 44-51t13-55q0-53-34.5-85T486-713q-49 0-86.5 24.5T345-621l53 20q11-28 33-43.5t52-15.5q34 0 55 18.5t21 47.5q0 22-13 41.5T508-512q-30 26-44.5 51.5T449-393Zm31 313q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z"], hub: ["M153-73q-33-33-33-81t33.25-81q33.25-33 80.75-33 14 0 24.5 2.5T280-258l85-106q-19-23-29-52.5t-5-61.5l-121-41q-15 25-39.5 39T114-466q-47.5 0-80.75-33.25T0-580q0-47.5 33.25-80.75T114-694q47.5 0 80.75 33.25T228-580v4l122 42q18-32 43.5-49t56.5-24v-129q-39-11-61.5-43T366-846q0-47.5 33-80.75T480-960q48 0 81 33.25T594-846q0 35-23 67t-61 43v129q31 7 57 24t44 49l121-42v-4q0-47.5 33.25-80.75T846-694q47.5 0 80.75 33T960-580q0 48-33.25 81T846-466q-32 0-57-14t-39-39l-121 41q5 32-4.5 61.5T595-364l85 106q11-5 21.5-7.5t24.06-2.5Q774-268 807-235t33 81q0 48-33 81t-81 33q-48 0-81-33.25T612-154q0-20 5.5-36t15.5-31l-85-106q-32.13 17-68.56 17Q443-310 411-327l-84 107q10 15 15.5 30.5T348-154q0 47.5-33 80.75T234-40q-48 0-81-33Zm-38.96-453q22.96 0 38.46-15.54 15.5-15.53 15.5-38.5 0-22.96-15.54-38.46-15.53-15.5-38.5-15.5Q91-634 75.5-618.46 60-602.93 60-579.96 60-557 75.54-541.5q15.53 15.5 38.5 15.5ZM272.5-115.54q15.5-15.53 15.5-38.5 0-22.96-15.54-38.46-15.53-15.5-38.5-15.5-22.96 0-38.46 15.54-15.5 15.53-15.5 38.5 0 22.96 15.54 38.46 15.53 15.5 38.5 15.5 22.96 0 38.46-15.54Zm246-692q15.5-15.53 15.5-38.5 0-22.96-15.54-38.46-15.53-15.5-38.5-15.5-22.96 0-38.46 15.54-15.5 15.53-15.5 38.5 0 22.96 15.54 38.46 15.53 15.5 38.5 15.5 22.96 0 38.46-15.54ZM480.5-370q37.5 0 63.5-26.5t26-64q0-37.5-26.1-63.5T480-550q-37 0-63.5 26.1T390-460q0 37 26.5 63.5t64 26.5Zm284 254.46q15.5-15.53 15.5-38.5 0-22.96-15.54-38.46-15.53-15.5-38.5-15.5-22.96 0-38.46 15.54-15.5 15.53-15.5 38.5 0 22.96 15.54 38.46 15.53 15.5 38.5 15.5 22.96 0 38.46-15.54Zm120-426q15.5-15.53 15.5-38.5 0-22.96-15.54-38.46-15.53-15.5-38.5-15.5-22.96 0-38.46 15.54-15.5 15.53-15.5 38.5 0 22.96 15.54 38.46 15.53 15.5 38.5 15.5 22.96 0 38.46-15.54ZM480-846ZM114-580Zm366 120Zm366-120ZM234-154Zm492 0Z"], info: ["M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z"], interests: ["m80-520 200-360 200 360H80Zm88 353q-47-47-47-113 0-67 47-113.5T281-440q66 0 113 47t47 113q0 66-47 113t-113 47q-66 0-113-47Zm184-42q29-29 29-71t-29-71q-29-29-71-29t-71 29q-29 29-29 71t29 71q29 29 71 29t71-29ZM182-580h196l-98-176-98 176Zm338 460v-320h320v320H520Zm60-60h200v-200H580v200Zm100-340q-57-48-95.5-81T523-659q-23-25-33-47t-10-47q0-45 31.5-76t78.5-31q26 0 50 12t40 35q16-23 40-35t50-12q47 0 78.5 31t31.5 76q0 25-10 47t-33 47q-23 25-61.5 58T680-520Zm0-79q85-70 112.5-100t27.5-52q0-21.97-12.86-35.48Q794.29-800 772-800q-13.1 0-25.55 7Q734-786 715-769l-35 33-35-33q-18.67-17.36-31.33-24.18Q601-800 588-800q-22.29 0-35.14 13.52Q540-772.97 540-751q0 22 27.5 52T680-599Zm0-101Zm-400 32Zm1 388Zm399 0Z"], layers: ["M480-130 120-410l50-37 310 241 310-241 50 37-360 280Zm0-152L120-562l360-280 360 280-360 280Zm0-301Zm0 225 262-204-262-204-262 204 262 204Z"], list: ["M290-620v-60h550v60H290Zm0 170v-60h550v60H290Zm0 170v-60h550v60H290ZM150-620q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Z"], memory: ["M377-377v-205h205v205H377Zm60-60h85v-85h-85v85Zm-77 317v-80H260q-24 0-42-18t-18-42v-100h-80v-60h80v-124h-80v-60h80v-100q0-24 18-42t42-18h100v-76h60v76h124v-76h60v76h100q24 0 42 18t18 42v100h76v60h-76v124h76v60h-76v100q0 24-18 42t-42 18H604v80h-60v-80H420v80h-60Zm344-140v-444H260v444h444ZM480-480Z"], settings: ["m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z"], visibility: ["M600.5-379.5Q650-429 650-500t-49.5-120.5Q551-670 480-670t-120.5 49.5Q310-571 310-500t49.5 120.5Q409-330 480-330t120.5-49.5Zm-200-41Q368-453 368-500t32.5-79.5Q433-612 480-612t79.5 32.5Q592-547 592-500t-32.5 79.5Q527-388 480-388t-79.5-32.5ZM216-283Q98-366 40-500q58-134 176-217t264-83q146 0 264 83t176 217q-58 134-176 217t-264 83q-146 0-264-83Zm264-217Zm222.5 174.5Q804-391 857-500q-53-109-154.5-174.5T480-740q-121 0-222.5 65.5T102-500q54 109 155.5 174.5T480-260q121 0 222.5-65.5Z"] };
    At = class r2 extends g {
      static {
        l(this, "KCUIIconElement");
      }
      static {
        this.sprites_url = "";
      }
      static {
        this.styles = [y`
            :host {
                box-sizing: border-box;
                font-family: "Material Symbols Outlined";
                font-weight: normal;
                font-style: normal;
                font-size: inherit;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr;
                -webkit-font-feature-settings: "liga";
                -moz-font-feature-settings: "liga";
                font-feature-settings: "liga";
                -webkit-font-smoothing: antialiased;
                user-select: none;
            }

            svg {
                width: 1.2em;
                height: auto;
                fill: currentColor;
            }
        `];
      }
      render() {
        let e = this.textContent ?? "";
        if (e.startsWith("svg:")) {
          let t = e.slice(4), i = `${r2.sprites_url}#${t}`;
          return M`<svg viewBox="0 0 48 48" width="48">
                <use xlink:href="${i}" />
            </svg>`;
        } else return xs[e.trim()] ? M`${oi`<svg viewBox="0 -960 960 960" width="48">${xs[e.trim()].map((t) => `<path d="${t}"></path>`).join("")}</svg>`}` : M`<slot></slot>`;
      }
    };
    wn("kc-ui-icon", At);
    Qs = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs/><symbol id="pcb_file" viewBox="0 0 48 48">
    <path d="M11,44C10.2,44 9.5,43.7 8.9,43.1C8.3,42.5 8,41.8 8,41L8,7C8,6.2 8.3,5.5 8.9,4.9C9.5,4.3 10.2,4 11,4L29.05,4L40,14.95L40,41C40,41.8 39.7,42.5 39.1,43.1C38.5,43.7 37.8,44 37,44L11,44ZM27.55,16.3L27.55,7L11,7L11,41L37,41L37,16.3L27.55,16.3ZM11,7L11,16.3L11,7L11,41L11,7Z"/>
    <path d="M20.231,37.681C20.231,37.681 20.231,36.001 20.231,36.001L18.007,36.001C17.437,36.001 16.936,35.792 16.509,35.365C16.081,34.937 15.872,34.437 15.872,33.867L15.872,31.643L13.693,31.643L13.693,29.008C13.693,29.008 15.872,29.008 15.872,29.008L15.872,26.63L13.693,26.63L13.693,23.995C13.693,23.995 15.872,23.995 15.872,23.995L15.872,21.771C15.872,21.201 16.081,20.701 16.509,20.273C16.936,19.846 17.437,19.636 18.007,19.636C18.007,19.636 20.231,19.636 20.231,19.636L20.231,17.566L22.865,17.566C22.865,17.566 22.865,19.636 22.865,19.636C22.865,19.636 25.244,19.636 25.244,19.636L25.244,17.566L27.878,17.566C27.878,17.566 27.878,19.636 27.878,19.636L30.102,19.636C30.672,19.636 31.173,19.846 31.6,20.273C32.028,20.701 32.237,21.201 32.237,21.771C32.237,21.771 32.237,23.995 32.237,23.995L34.307,23.995L34.307,26.63C34.307,26.63 32.237,26.63 32.237,26.63C32.237,26.63 32.237,29.008 32.237,29.008L34.307,29.008L34.307,31.643C34.307,31.643 32.237,31.643 32.237,31.643L32.237,33.867C32.237,34.437 32.028,34.937 31.6,35.365C31.173,35.792 30.672,36.001 30.102,36.001L27.878,36.001L27.878,38.181L25.244,38.181C25.244,38.181 25.244,36.001 25.244,36.001L22.865,36.001L22.865,38.181L20.231,38.181L20.231,37.681ZM29.602,33.367L29.602,22.271L18.507,22.271L18.507,33.367L29.602,33.367ZM20.694,24.595L27.279,24.595L27.279,31.179L20.694,31.179L20.694,24.595ZM23.329,28.545C23.329,28.545 24.644,28.545 24.644,28.545C24.644,28.545 24.644,27.229 24.644,27.229C24.644,27.229 23.329,27.229 23.329,27.229L23.329,28.545Z"/>
</symbol><symbol id="schematic_file" viewBox="0 0 48 48">
    <path d="M11,44C10.2,44 9.5,43.7 8.9,43.1C8.3,42.5 8,41.8 8,41L8,7C8,6.2 8.3,5.5 8.9,4.9C9.5,4.3 10.2,4 11,4L29.05,4L40,14.95L40,41C40,41.8 39.7,42.5 39.1,43.1C38.5,43.7 37.8,44 37,44L11,44ZM27.55,16.3L27.55,7L11,7L11,41L37,41L37,16.3L27.55,16.3ZM11,7L11,16.3L11,7L11,41L11,7Z"/>
    <path d="M18.256,26.367L15.377,26.367L15.377,23.367L18.256,23.367L18.256,23.184C18.256,22.155 18.784,21.198 19.654,20.648C20.524,20.098 21.615,20.033 22.544,20.475L24.69,21.494L24.69,19.353L27.69,19.353L27.69,22.92L32.411,25.164C33.457,25.661 34.123,26.715 34.123,27.873C34.123,29.031 33.457,30.086 32.411,30.583L27.69,32.827L27.69,36.394L24.69,36.394L24.69,34.252L22.544,35.272C21.615,35.714 20.524,35.648 19.654,35.099C18.784,34.549 18.256,33.592 18.256,32.563L18.256,32.38L15.377,32.38L15.377,29.38L18.256,29.38L18.256,26.367ZM21.256,32.563L31.123,27.873L21.256,23.184L21.256,32.563Z"/>
</symbol><symbol id="zoom_footprint" viewBox="0 0 48 48">
    <g>
        <path d="M33,38.5C34.567,38.5 35.875,37.975 36.925,36.925C37.975,35.875 38.5,34.567 38.5,33C38.5,31.433 37.975,30.125 36.925,29.075C35.875,28.025 34.567,27.5 33,27.5C31.433,27.5 30.125,28.025 29.075,29.075C28.025,30.125 27.5,31.433 27.5,33C27.5,34.567 28.025,35.875 29.075,36.925C30.125,37.975 31.433,38.5 33,38.5ZM43.2,45.3L37.842,39.95C37.147,40.417 36.392,40.792 35.575,41.075C34.758,41.358 33.9,41.5 33,41.5C30.639,41.5 28.632,40.673 26.979,39.019C25.326,37.365 24.5,35.357 24.5,32.994C24.5,30.631 25.327,28.625 26.981,26.975C28.635,25.325 30.643,24.5 33.006,24.5C35.369,24.5 37.375,25.326 39.025,26.979C40.675,28.632 41.5,30.639 41.5,33C41.5,33.9 41.358,34.758 41.075,35.575C40.792,36.392 40.417,37.147 39.95,37.842L45.3,43.2L43.2,45.3Z"/>
        <path d="M22.597,38L21,38L21,42L18,42L18,38L13,38C12.2,38 11.5,37.7 10.9,37.1C10.3,36.5 10,35.8 10,35L10,30L6,30L6,27L10,27L10,20.8L6,20.8L6,17.8L10,17.8L10,12.8C10,12 10.3,11.3 10.9,10.7C11.5,10.1 12.2,9.8 13,9.8L18,9.8L18,6L21,6L21,9.8L27.2,9.8L27.2,6L30.2,6L30.2,9.8L35.2,9.8C36,9.8 36.7,10.1 37.3,10.7C37.9,11.3 38.2,12 38.2,12.8L38.2,17.8L42,17.8L42,20.8L38.2,20.8L38.2,22.691C37.262,22.214 36.262,21.88 35.2,21.69L35.2,12.8L13,12.8L13,35L21.657,35C21.83,36.06 22.143,37.06 22.597,38ZM22.119,29.15L18.85,29.15L18.85,18.9L29.1,18.9L29.1,22.139C28.029,22.515 27.029,23.058 26.1,23.767L26.1,21.9L21.85,21.9L21.85,26.15L23.727,26.15C23.025,27.079 22.489,28.079 22.119,29.15Z"/>
    </g>
</symbol><symbol id="zoom_page" viewBox="0 0 48 48">
    <g>
        <path d="M9,41L24.75,41C25.417,41.7 26.158,42.3 26.975,42.8C27.792,43.3 28.683,43.7 29.65,44L9,44C8.2,44 7.5,43.7 6.9,43.1C6.3,42.5 6,41.8 6,41L6.02,9.006C6.02,8.206 6.32,7.506 6.92,6.906C7.52,6.306 8.22,6.006 9.02,6.006L27.07,6.006L38,14.95L38,22.65C37.533,22.417 37.05,22.217 36.55,22.05C36.05,21.883 35.533,21.75 35,21.65L35,16.3L25.55,16.3L25.57,9.006L9.02,9.006L9,16.3L9,41Z"/>
        <path d="M43.2,45.3L37.842,39.95C37.147,40.417 36.392,40.792 35.575,41.075C34.758,41.358 33.9,41.5 33,41.5C30.639,41.5 28.632,40.673 26.979,39.019C25.326,37.365 24.5,35.357 24.5,32.994C24.5,30.631 25.327,28.625 26.981,26.975C28.635,25.325 30.643,24.5 33.006,24.5C35.369,24.5 37.375,25.326 39.025,26.979C40.675,28.632 41.5,30.639 41.5,33C41.5,33.9 41.358,34.758 41.075,35.575C40.792,36.392 40.417,37.147 39.95,37.842L45.3,43.2L43.2,45.3ZM33,38.5C34.567,38.5 35.875,37.975 36.925,36.925C37.975,35.875 38.5,34.567 38.5,33C38.5,31.433 37.975,30.125 36.925,29.075C35.875,28.025 34.567,27.5 33,27.5C31.433,27.5 30.125,28.025 29.075,29.075C28.025,30.125 27.5,31.433 27.5,33C27.5,34.567 28.025,35.875 29.075,36.925C30.125,37.975 31.433,38.5 33,38.5Z"/>
    </g>
</symbol></svg>`;
    ws = URL.createObjectURL(new Blob([Qs], { type: "image/svg+xml" }));
    l(I, "listen");
    l(ue, "delegate");
    l(Ct, "first");
    l(Ks, "map");
    l(Dt, "length");
    l(Ys, "parseFlagAttribute");
    Yn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    pe = class extends g {
      static {
        l(this, "KCUIButtonElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: inline-flex;
                position: relative;
                width: auto;
                cursor: pointer;
                user-select: none;
                align-items: center;
                justify-content: center;
            }

            button {
                all: unset;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.5em;
                border: 1px solid transparent;
                border-radius: 0.25em;
                font-weight: medium;
                font-size: 1em;
                background: var(--button-bg);
                color: var(--button-fg);
                transition:
                    color var(--transition-time-short) ease,
                    border var(--transition-time-short) ease,
                    background var(--transition-time-short) ease;
            }

            :host {
                fill: var(--button-fg);
            }

            button:hover {
                background: var(--button-hover-bg);
                color: var(--button-hover-fg);
            }

            button:disabled {
                background: var(--button-disabled-bg);
                color: var(--button-disabled-fg);
            }

            button:focus {
                outline: var(--button-focus-outline);
            }

            :host([selected]) button {
                background: var(--button-selected-bg);
                color: var(--button-selected-fg);
            }

            /* variants */

            button.outline {
                background: var(--button-outline-bg);
                color: var(--button-outline-fg);
            }

            button.outline:hover {
                background: var(--button-outline-hover-bg);
                color: var(--button-outline-hover-fg);
            }

            button.outline:disabled {
                background: var(--button-outline-disabled-bg);
                color: var(--button-outline-disabled-fg);
            }

            :host([selected]) button.outline {
                background: var(--button-outline-disabled-bg);
                color: var(--button--outline-disabled-fg);
            }

            button.toolbar {
                background: var(--button-toolbar-bg);
                color: var(--button-toolbar-fg);
            }

            button.toolbar:hover {
                background: var(--button-toolbar-hover-bg);
                color: var(--button-toolbar-hover-fg);
            }

            button.toolbar:disabled {
                background: var(--button-toolbar-disabled-bg);
                color: var(--button-toolbar-disabled-fg);
            }

            :host([selected]) button.toolbar {
                background: var(--button-toolbar-disabled-bg);
                color: var(--button--toolbar-disabled-fg);
            }

            button.toolbar-alt {
                background: var(--button-toolbar-alt-bg);
                color: var(--button-toolbar-alt-fg);
            }

            button.toolbar-alt:hover {
                background: var(--button-toolbar-alt-hover-bg);
                color: var(--button-toolbar-alt-hover-fg);
            }

            button.toolbar-alt:disabled {
                background: var(--button-toolbar-alt-disabled-bg);
                color: var(--button-toolbar-alt-disabled-fg);
            }

            :host([selected]) button.toolbar-alt {
                background: var(--button-toolbar-alt-disabled-bg);
                color: var(--button--toolbar-alt-disabled-fg);
            }

            button.menu {
                background: var(--button-menu-bg);
                color: var(--button-menu-fg);
                padding: 0;
            }

            button.menu:hover {
                background: var(--button-menu-hover-bg);
                color: var(--button-menu-hover-fg);
                outline: none;
            }

            button.menu:focus {
                outline: none;
            }

            button.menu:disabled {
                background: var(--button-menu-disabled-bg);
                color: var(--button-menu-disabled-fg);
            }

            :host([selected]) button.menu {
                background: var(--button-menu-disabled-bg);
                color: var(--button--menu-disabled-fg);
                outline: none;
            }
        `];
      }
      static get observedAttributes() {
        return ["disabled", "icon"];
      }
      attributeChangedCallback(e, t, i) {
        if (this.button) switch (e) {
          case "disabled":
            this.button.disabled = i != null;
            break;
          case "icon":
            this.button_icon.innerText = i ?? "";
            break;
        }
      }
      initialContentCallback() {
        this.variant && this.button.classList.add(this.variant), this.button.disabled = this.disabled;
      }
      render() {
        let e = this.icon ? M`<kc-ui-icon part="icon">${this.icon}</kc-ui-icon>` : void 0;
        return M`<button part="base">
            ${e}
            <slot part="contents"></slot>
        </button>`;
      }
    };
    W([Q("button", true)], pe.prototype, "button", 2), W([Q("button_icon", true)], pe.prototype, "button_icon", 2), W([L({ type: String })], pe.prototype, "name", 2), W([L({ type: String })], pe.prototype, "icon", 2), W([L({ type: String })], pe.prototype, "variant", 2), W([L({ type: Boolean })], pe.prototype, "disabled", 2), W([L({ type: Boolean })], pe.prototype, "selected", 2);
    Yn("kc-ui-button", pe);
    En = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    at = class extends g {
      static {
        l(this, "KCUIActivitySideBarElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                flex-shrink: 0;
                display: flex;
                flex-direction: row;
                height: 100%;
                overflow: hidden;
                min-width: calc(max(20%, 200px));
                max-width: calc(max(20%, 200px));
            }

            div {
                display: flex;
                overflow: hidden;
                flex-direction: column;
            }

            div.bar {
                flex-grow: 0;
                flex-shrink: 0;
                height: 100%;
                z-index: 1;
                display: flex;
                flex-direction: column;
                background: var(--activity-bar-bg);
                color: var(--activity-bar-fg);
                padding: 0.2em;
                user-select: none;
            }

            div.start {
                flex: 1;
            }

            div.activities {
                flex-grow: 1;
            }

            kc-ui-button {
                --button-bg: transparent;
                --button-fg: var(--activity-bar-fg);
                --button-hover-bg: var(--activity-bar-active-bg);
                --button-hover-fg: var(--activity-bar-active-fg);
                --button-selected-bg: var(--activity-bar-active-bg);
                --button-selected-fg: var(--activity-bar-active-fg);
                --button-focus-outline: none;
                margin-bottom: 0.25em;
            }

            kc-ui-button:last-child {
                margin-bottom: 0;
            }

            ::slotted(kc-ui-activity) {
                display: none;
                height: 100%;
            }

            ::slotted(kc-ui-activity[active]) {
                display: block;
            }
        `];
      }
      #e;
      get #t() {
        return this.querySelectorAll("kc-ui-activity");
      }
      get #i() {
        return Array.from(this.#t).map((e) => (e.getAttribute("name") ?? "").toLowerCase());
      }
      get #r() {
        return (this.#t[0]?.getAttribute("name") ?? "").toLowerCase();
      }
      render() {
        let e = [], t = [];
        for (let i of this.#t) {
          let s = i.getAttribute("name"), n = i.getAttribute("icon");
          (i.getAttribute("button-location") == "bottom" ? t : e).push(M`
                    <kc-ui-button
                        type="button"
                        tooltip-left="${s}"
                        name="${s?.toLowerCase()}"
                        title="${s}"
                        icon=${n}>
                    </kc-ui-button>
                `);
        }
        return M`<div class="bar">
                <div class="start">${e}</div>
                <div class="end">${t}</div>
            </div>
            <div class="activities">
                <slot name="activities"></slot>
            </div>`;
      }
      initialContentCallback() {
        this.collapsed ? this.change_activity(null) : this.change_activity(this.#r), ue(this.renderRoot, "kc-ui-button", "click", (t, i) => {
          this.change_activity(i.name, true);
        }), new MutationObserver(async (t) => {
          await this.update(), this.#e && !this.#i.includes(this.#e) && this.change_activity(this.#r);
        }).observe(this, { childList: true });
      }
      static get observedAttributes() {
        return ["collapsed"];
      }
      attributeChangedCallback(e, t, i) {
        switch (e) {
          case "collapsed":
            i == null ? this.show_activities() : this.hide_activities();
            break;
          default:
            break;
        }
      }
      get activity() {
        return this.#e;
      }
      set activity(e) {
        this.change_activity(e, false);
      }
      hide_activities() {
        this.activities_container && (this.style.width = "unset", this.style.minWidth = "unset", this.style.maxWidth = "", this.activities_container.style.width = "0px");
      }
      show_activities() {
        this.activities_container && (this.#e || this.change_activity(this.#r), this.style.minWidth = "", this.activities_container.style.width = "");
      }
      change_activity(e, t = false) {
        e = e?.toLowerCase(), this.#e == e && t ? this.#e = null : this.#e = e, this.#e ? this.collapsed = false : this.collapsed = true, this.update_state();
      }
      update_state() {
        for (let e of this.buttons) e.selected = e.name == this.#e;
        for (let e of this.#t) e.getAttribute("name")?.toLowerCase() == this.#e ? e.setAttribute("active", "") : e.removeAttribute("active");
      }
    };
    W([Q(".activities", true)], at.prototype, "activities_container", 2), W([vs("kc-ui-button")], at.prototype, "buttons", 2), W([L({ type: Boolean })], at.prototype, "collapsed", 2);
    En("kc-ui-activity-side-bar", at);
    Hn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    ai = class extends Ue {
      static {
        l(this, "KCUIAppElement");
      }
      static {
        this.useShadowRoot = false;
      }
    };
    Hn("kc-ui-app", ai);
    Es = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    li = class extends g {
      static {
        l(this, "KCUIControlListElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: flex;
                flex-direction: column;
                flex-wrap: nowrap;
                background: var(--list-item-bg);
                color: var(--list-item-fg);
                padding-top: 0.2em;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    Es("kc-ui-control-list", li);
    ci = class extends g {
      static {
        l(this, "KCUIControlListItemElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                margin-top: 0.2em;
                display: flex;
                flex-direction: column;
                flex-wrap: nowrap;
                user-select: none;
                background-color: transparent;
                transition:
                    color var(--transition-time-short) ease,
                    background-color var(--transition-time-short) ease;
            }

            ::slotted(label) {
                flex: 1 1 100%;
                display: block;
                margin: 0;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
            }

            ::slotted(input),
            ::slotted(select) {
                margin: 0;
                padding-left: 0;
                padding-right: 0;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    Es("kc-ui-control-list-item", ci);
    l(lt, "no_self_recursion");
    ui = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    D2 = class extends g {
      static {
        l(this, "KCUIMenuElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                width 100%;
                display: flex;
                flex-direction: column;
                flex-wrap: nowrap;
                background: var(--list-item-bg);
                color: var(--list-item-fg);
            }

            :host(.outline) ::slotted(kc-ui-menu-item) {
                border-bottom: 1px solid var(--grid-outline);
            }

            :host(.dropdown) {
                --list-item-padding: 0.3em 0.6em;
                --list-item-bg: var(--dropdown-bg);
                --list-item-fg: var(--dropdown-fg);
                --list-item-hover-bg: var(--dropdown-hover-bg);
                --list-item-hover-fg: var(--dropdown-hover-fg);
                --list-item-active-bg: var(--dropdown-active-bg);
                --list-item-active-fg: var(--dropdown-active-fg);
                max-height: 50vh;
                overflow-y: auto;
            }
        `];
      }
      constructor() {
        super(), this.role = "menu";
      }
      items() {
        return this.querySelectorAll("kc-ui-menu-item");
      }
      item_by_name(e) {
        for (let t of this.items()) if (t.name == e) return t;
        return null;
      }
      deselect() {
        for (let e of this.items()) e.selected = false;
      }
      get selected() {
        for (let e of this.items()) if (e.selected) return e;
        return null;
      }
      set selected(e) {
        let t;
        G(e) ? t = this.item_by_name(e) : t = e, this.deselect(), !(!t || !(t instanceof ve)) && (t.selected = true, this.send_selected_event(t));
      }
      send_selected_event(e) {
        this.dispatchEvent(new CustomEvent("kc-ui-menu:select", { detail: e, bubbles: true, composed: true }));
      }
      initialContentCallback() {
        super.initialContentCallback(), ue(this, "kc-ui-menu-item", "click", (e, t) => {
          e.target.tagName != "KC-UI-BUTTON" && (e.stopPropagation(), this.selected = t);
        });
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    W([lt], D2.prototype, "send_selected_event", 1);
    ui("kc-ui-menu", D2);
    ve = class extends g {
      static {
        l(this, "KCUIMenuItemElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: flex;
                align-items: center;
                flex-wrap: nowrap;
                padding: var(--list-item-padding, 0.2em 0.3em);
                user-select: none;
                background: transparent;
                transition:
                    color var(--transition-time-short) ease,
                    background-color var(--transition-time-short) ease;
                cursor: pointer;
            }

            :host(:hover) {
                background: var(--list-item-hover-bg);
                color: var(--list-item-hover-fg);
            }

            :host([selected]) {
                background: var(--list-item-active-bg);
                color: var(--list-item-active-fg);
            }

            :host([disabled]) {
                background: var(--list-item-disabled-bg);
                color: var(--list-item-disabled-fg);
            }

            ::slotted(*) {
                flex: 1 1 100%;
                display: block;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
            }

            ::slotted(.narrow) {
                max-width: 100px;
            }

            ::slotted(.very-narrow) {
                max-width: 50px;
            }

            kc-ui-icon {
                margin-right: 0.5em;
                margin-left: -0.1em;
            }
        `];
      }
      constructor() {
        super(), this.role = "menuitem";
      }
      render() {
        let e = this.icon ? M`<kc-ui-icon>${this.icon}</kc-ui-icon>` : void 0;
        return M`${e}<slot></slot>`;
      }
    };
    W([L({ type: String })], ve.prototype, "name", 2), W([L({ type: String })], ve.prototype, "icon", 2), W([L({ type: Boolean })], ve.prototype, "selected", 2), W([L({ type: Boolean })], ve.prototype, "disabled", 2);
    ui("kc-ui-menu-item", ve);
    Ri = class extends g {
      static {
        l(this, "KCUIMenuLabelElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                width: 100%;
                display: flex;
                flex-wrap: nowrap;
                padding: 0.2em 0.3em;
                background: var(--panel-subtitle-bg);
                color: var(--panel-subtitle-fg);
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    ui("kc-ui-menu-label", Ri);
    Gn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Bt = class extends g {
      static {
        l(this, "KCUIDropdownElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                border-radius: 5px;
                border: 1px solid transparent;
                display: none;
                flex-direction: column;
                overflow: hidden;
                user-select: none;
                background: var(--dropdown-bg);
                color: var(--dropdown-fg);
                font-weight: 300;
            }

            :host([visible]) {
                display: flex;
            }
        `];
      }
      constructor() {
        super(), this.mouseout_padding ??= 50;
      }
      show() {
        this.visible || (this.visible = true, this.dispatchEvent(new CustomEvent("kc-ui-dropdown:show", { bubbles: true, composed: true })));
      }
      hide() {
        this.visible && (this.visible = false, this.dispatchEvent(new CustomEvent("kc-ui-dropdown:hide", { bubbles: true, composed: true })));
      }
      toggle() {
        this.visible ? this.hide() : this.show();
      }
      get menu() {
        return this.querySelector("kc-ui-menu");
      }
      initialContentCallback() {
        super.initialContentCallback(), this.hasAttribute("auto-hide") && this.setup_leave_event(), this.menu.classList.add("invert-scrollbar");
      }
      setup_leave_event() {
        this.addEventListener("mouseleave", (e) => {
          if (!this.visible) return;
          let t = this.mouseout_padding, i = this.getBoundingClientRect(), s = I(window, "mousemove", (n) => {
            this.visible || s.dispose(), n.clientX > i.left - t && n.clientX < i.right + t && n.clientY > i.top - t && n.clientY < i.bottom + t || (this.hide(), s.dispose());
          });
        });
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    W([L({ type: Boolean })], Bt.prototype, "visible", 2), W([L({ type: Number })], Bt.prototype, "mouseout_padding", 2);
    Gn("kc-ui-dropdown", Bt);
    Jn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    pi = class extends g {
      static {
        l(this, "KCUIFilteredListElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: contents;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
      #e;
      set filter_text(e) {
        this.#e = e?.toLowerCase() ?? null, this.apply_filter();
      }
      get filter_text() {
        return this.#e;
      }
      get item_selector() {
        return this.getAttribute("item-selector") ?? "[data-match-text]";
      }
      *items() {
        for (let e of this.queryAssignedElements()) yield* e.querySelectorAll(this.item_selector);
      }
      apply_filter() {
        Fe(() => {
          for (let e of this.items()) this.#e == null || e.dataset.matchText?.toLowerCase().includes(this.#e) ? e.style.removeProperty("display") : e.style.display = "none";
        });
      }
    };
    Jn("kc-ui-filtered-list", pi);
    kn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    hi = class extends g {
      static {
        l(this, "KCUIFloatingToolbarElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                z-index: 10;
                user-select: none;
                pointer-events: none;
                position: absolute;
                left: 0;
                width: 100%;
                padding: 0.5em;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
            }

            :host([location="top"]) {
                top: 0;
            }

            :host([location="bottom"]) {
                bottom: 0;
            }

            ::slotted(*) {
                user-select: initial;
                pointer-events: initial;
            }

            slot[name="left"] {
                flex-grow: 999;
                display: flex;
            }

            slot[name="right"] {
                display: flex;
            }

            ::slotted(kc-ui-button) {
                margin-left: 0.25em;
            }
        `];
      }
      render() {
        return M`<slot name="left"></slot><slot name="right"></slot>`;
      }
    };
    kn("kc-ui-floating-toolbar", hi);
    In = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    di = class extends g {
      static {
        l(this, "KCUIFocusOverlay");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                z-index: 10;
                user-select: none;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: initial;
                background: transparent;
                contain: paint;
            }

            :host(.has-focus) {
                z-index: -10;
                pointer-events: none;
            }

            .bg {
                background: var(--focus-overlay-bg);
                opacity: 0;
                transition: opacity var(--transition-time-short);
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            }

            :host(:hover) .bg {
                opacity: var(--focus-overlay-opacity);
            }

            :host(.has-focus) .bg {
                opacity: 0;
            }

            .fg {
                position: absolute;
                font-size: 1.5rem;
                color: var(--focus-overlay-fg);
                text-shadow: rgba(0, 0, 0, 0.5) 0px 0px 15px;
                opacity: 0;
                pointer-events: none;
            }

            :host(:hover) .fg {
                opacity: 1;
            }

            :host(.has-focus) .fg {
                opacity: 0;
            }
        `];
      }
      #e;
      initialContentCallback() {
        this.addEventListener("click", () => {
          this.classList.add("has-focus");
        }), this.addDisposable(I(document, "click", (e) => {
          !e.composedPath().includes(this.parentElement) && this.classList.remove("has-focus");
        })), this.#e = new IntersectionObserver((e) => {
          for (let t of e) t.isIntersecting || this.classList.remove("has-focus");
        }), this.#e.observe(this), this.addDisposable({ dispose: l(() => {
          this.#e.disconnect();
        }, "dispose") });
      }
      render() {
        return M`
            <div class="bg"></div>
            <div class="fg">Click or tap to interact</div>
        `;
      }
    };
    In("kc-ui-focus-overlay", di);
    B2 = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    mi = class extends g {
      static {
        l(this, "KCUIPanelElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                width: 100%;
                height: 100%;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                background: var(--panel-bg);
                color: var(--panel-fg);
                --bg: var(--panel-bg);
            }

            :host(:last-child) {
                flex-grow: 1;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    B2("kc-ui-panel", mi);
    _i = class extends g {
      static {
        l(this, "KCUIPanelTitleElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                flex: 0;
                width: 100%;
                text-align: left;
                padding: 0.2em 0.8em 0.2em 0.4em;
                display: flex;
                align-items: center;
                background: var(--panel-title-bg);
                color: var(--panel-title-fg);
                border-top: var(--panel-title-border);
                user-select: none;
            }

            div.title {
                flex: 1;
            }

            div.actions {
                flex: 0 1;
                display: flex;
                flex-direction: row;
                /* cheeky hack to work around scrollbar causing placement to be off. */
                padding-right: 6px;
            }
        `];
      }
      render() {
        return M`<div class="title">${this.title}</div>
            <div class="actions">
                <slot name="actions"></slot>
            </div>`;
      }
    };
    B2("kc-ui-panel-title", _i);
    bi = class extends g {
      static {
        l(this, "KCUIPanelBodyElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                width: 100%;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                flex: 1 0;
                font-weight: 300;
                font-size: 1em;
            }

            :host([padded]) {
                padding: 0.1em 0.8em 0.1em 0.4em;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    B2("kc-ui-panel-body", bi);
    fi = class extends g {
      static {
        l(this, "KCUIPanelLabelElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                width: 100%;
                display: flex;
                flex-wrap: nowrap;
                padding: 0.2em 0.3em;
                background: var(--panel-subtitle-bg);
                color: var(--panel-subtitle-fg);
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    B2("kc-ui-panel-label", fi);
    Hs = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Mi = class extends g {
      static {
        l(this, "KCUIPropertyList");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: grid;
                gap: 1px;
                grid-template-columns: fit-content(50%) 1fr;
                background: var(--grid-outline);
                border-bottom: 1px solid var(--grid-outline);
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    Hs("kc-ui-property-list", Mi);
    $2 = class extends g {
      static {
        l(this, "KCUIPropertyListItemElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: contents;
            }

            span {
                padding: 0.2em;
                background: var(--bg);
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                user-select: all;
            }

            :host(.label) span:first-child {
                user-select: none;
                grid-column-end: span 2;
                background: var(--panel-subtitle-bg);
                color: var(--panel-subtitle-fg);
            }

            :host(.label) span:last-child {
                display: none;
            }

            ::slotted(*) {
                vertical-align: middle;
            }
        `];
      }
      render() {
        return M`<span title="${this.name}">${this.name}</span
            ><span><slot></slot></span>`;
      }
    };
    W([L({ type: String })], $2.prototype, "name", 2);
    Hs("kc-ui-property-list-item", $2);
    An = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Pe = class extends g {
      static {
        l(this, "KCUIRangeElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: block;
                width: 100%;
                user-select: none;
            }

            input[type="range"] {
                all: unset;
                box-sizing: border-box;
                display: block;
                width: 100%;
                max-width: 100%;
                padding-top: 0.25em;
                padding-bottom: 0.25em;
                -webkit-appearance: none;
                appearance: none;
                font: inherit;
                cursor: grab;
                background: transparent;
                transition:
                    color var(--transition-time-medium) ease,
                    box-shadow var(--transition-time-medium) ease,
                    outline var(--transition-time-medium) ease,
                    background var(--transition-time-medium) ease,
                    border var(--transition-time-medium) ease;
            }

            input[type="range"]:hover {
                z-index: 10;
                box-shadow: var(--input-range-hover-shadow);
            }

            input[type="range"]:focus {
                box-shadow: none;
                outline: none;
            }

            input[type="range"]:disabled:hover {
                cursor: unset;
            }

            input[type="range"]::-webkit-slider-runnable-track {
                box-sizing: border-box;
                height: 0.5em;
                border: 1px solid transparent;
                border-radius: 0.5em;
                background: var(--input-range-bg);
            }
            input[type="range"]::-moz-range-track {
                box-sizing: border-box;
                height: 0.5em;
                border: 1px solid transparent;
                border-radius: 0.5em;
                background: var(--input-range-bg);
            }

            input[type="range"]:hover::-webkit-slider-runnable-track,
            input[type="range"]:focus::-webkit-slider-runnable-track {
                border: 1px solid var(--input-range-hover-bg);
            }
            input[type="range"]:hover::-moz-range-track,
            input[type="range"]:focus::-moz-range-track {
                border: 1px solid var(--input-range-hover-bg);
            }

            input[type="range"]:disabled::-webkit-slider-runnable-track {
                background: var(--input-range-disabled-bg);
            }
            input[type="range"]:disabled::-moz-range-track {
                background: var(--input-range-disabled-bg);
            }

            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                height: 1em;
                width: 1em;
                border-radius: 0.5em;
                margin-top: -0.3em;
                background: var(--input-range-fg);
            }
            input[type="range"]::-moz-range-thumb {
                border: none;
                height: 1em;
                width: 1em;
                border-radius: 100%;
                margin-top: -0.3em;
                background: var(--input-range-fg);
            }

            input[type="range"]:focus::-webkit-slider-thumb {
                box-shadow: var(--input-range-handle-shadow);
            }
            input[type="range"]:focus::-moz-range-thumb {
                box-shadow: var(--input-range-handle-shadow);
            }
        `];
      }
      static get observedAttributes() {
        return ["disabled", "min", "max", "step", "value"];
      }
      get value() {
        return this.input.value;
      }
      set value(e) {
        this.input.value = e;
      }
      get valueAsNumber() {
        return this.input.valueAsNumber;
      }
      attributeChangedCallback(e, t, i) {
        if (this.input) switch (e) {
          case "disabled":
            this.input.disabled = i != null;
            break;
          case "min":
            this.input.min = i ?? "";
            break;
          case "max":
            this.input.max = i ?? "";
            break;
          case "step":
            this.input.step = i ?? "";
            break;
          case "value":
            this.value = i ?? "";
            break;
        }
      }
      initialContentCallback() {
        this.input.disabled = this.disabled, this.input.addEventListener("input", (e) => {
          e.stopPropagation(), this.dispatchEvent(new CustomEvent("kc-ui-range:input", { composed: true, bubbles: true }));
        });
      }
      render() {
        return M`<input
            type="range"
            min="${this.min}"
            max="${this.max}"
            step="${this.step}"
            value="${this.getAttribute("value")}">
        </input>`;
      }
    };
    W([L({ type: String })], Pe.prototype, "name", 2), W([L({ type: String })], Pe.prototype, "min", 2), W([L({ type: String })], Pe.prototype, "max", 2), W([L({ type: String })], Pe.prototype, "step", 2), W([L({ type: Boolean })], Pe.prototype, "disabled", 2), W([Q("input", true)], Pe.prototype, "input", 2);
    An("kc-ui-range", Pe);
    Cn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Ni = class extends g {
      static {
        l(this, "KCUIResizerElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                z-index: 999;
                user-select: none;
                display: block;
                width: 6px;
                margin-left: -6px;
                cursor: col-resize;
                background: transparent;
                opacity: 0;
                transition: opacity var(--transition-time-medium, 500) ease;
            }

            :host(:hover) {
                background: var(--resizer-bg, rebeccapurple);
                opacity: 1;
                transition: opacity var(--transition-time-short) ease;
            }

            :host(:hover.active),
            :host(.active) {
                background: var(--resizer-active-bg, rebeccapurple);
            }
        `];
      }
      initialContentCallback() {
        let e = this.previousElementSibling, t = this.nextElementSibling;
        this.addEventListener("mousedown", (i) => {
          let s = i.clientX, n = t.getBoundingClientRect().width;
          document.body.style.cursor = "col-resize", e.style.pointerEvents = "none", e.style.userSelect = "none", t.style.pointerEvents = "none", t.style.userSelect = "none", t.style.width = `${n}px`, t.style.maxWidth = "unset", this.classList.add("active"), t.hasAttribute("collapsed") && (console.log("removing collapsed"), t.removeAttribute("collapsed"));
          let a = l((h) => {
            let m = s - h.clientX, _ = (n + m) * 100 / this.parentElement.getBoundingClientRect().width;
            t.style.width = `${_}%`;
          }, "mouse_move"), c = this.addDisposable(I(window, "mousemove", a)), u = l((h) => {
            document.body.style.cursor = "", e.style.pointerEvents = "", e.style.userSelect = "", t.style.pointerEvents = "", t.style.userSelect = "", this.classList.remove("active"), c.dispose();
          }, "mouse_up");
          window.addEventListener("mouseup", u, { once: true });
        });
      }
    };
    Cn("kc-ui-resizer", Ni);
    Gs = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Js = y`
    :host(.grow) {
        flex-basis: unset;
        flex-grow: 999;
    }

    :host(.shrink) {
        flex-grow: 0;
        flex-shrink: 1;
        width: unset;
    }

    :host:(.fixed) {
        flex-grow: 0;
        flex-shrink: 0;
    }
`;
    gi = class extends g {
      static {
        l(this, "KCUIView");
      }
      static {
        this.styles = [...g.styles, Js, y`
            :host {
                flex-grow: 1;
                display: flex;
                overflow: hidden;
                flex-direction: column;
                position: relative;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    Gs("kc-ui-view", gi);
    Vi = class extends g {
      static {
        l(this, "KCUISplitView");
      }
      static {
        this.styles = [...g.styles, Js, y`
            :host {
                display: flex;
                height: 100%;
                overflow: hidden;
            }

            :host([horizontal]) {
                flex-direction: column;
                max-height: 100%;
            }

            :host([vertical]) {
                flex-direction: row;
                max-width: 100%;
            }
        `];
      }
      render() {
        return M`<slot></slot>`;
      }
    };
    Gs("kc-ui-split-view", Vi);
    Dn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    $t = class extends g {
      static {
        l(this, "KCUITextFilterInputElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: flex;
                align-items: center;
                align-content: center;
                position: relative;
                border-bottom: 1px solid var(--grid-outline);
            }

            kc-ui-icon.before {
                pointer-events: none;
                position: absolute;
                left: 0;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding-left: 0.25em;
            }

            input {
                all: unset;
                display: block;
                width: 100%;
                max-width: 100%;
                border-radius: 0;
                padding: 0.4em;
                padding-left: 1.5em;
                text-align: left;
                font: inherit;
                background: var(--input-bg);
                color: var(--input-fg);
            }

            input:placeholder-shown + button {
                display: none;
            }

            button {
                all: unset;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                color: var(--input-fg);
                padding: 0.25em;
            }

            button:hover {
                cursor: pointer;
                color: var(--input-accent);
            }
        `];
      }
      get value() {
        return this.input.value;
      }
      set value(e) {
        this.input.value = e, this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
      initialContentCallback() {
        super.initialContentCallback(), this.button.addEventListener("click", (e) => {
          e.preventDefault(), e.stopPropagation(), this.value = "";
        });
      }
      render() {
        return M`<kc-ui-icon class="flex before">search</kc-ui-icon>
            <input style="" type="text" placeholder="search" name="search" />
            <button type="button">
                <kc-ui-icon>close</kc-ui-icon>
            </button>`;
      }
    };
    W([Q("input", true)], $t.prototype, "input", 2), W([Q("button", true)], $t.prototype, "button", 2);
    Dn("kc-ui-text-filter-input", $t);
    Bn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    jt = class extends g {
      static {
        l(this, "KCUIToggleMenuElement");
      }
      static {
        this.styles = [...g.styles, y`
            * {
                box-sizing: border-box;
            }

            button {
                all: unset;
                box-sizing: border-box;
                user-select: none;
                width: 100%;
                max-width: 100%;
                margin: unset;
                font: inherit;
                padding: 0.3em 0.6em 0.3em 0.6em;
                display: flex;
                align-items: flex-end;
                justify-content: left;
                border: 1px solid transparent;
                border-radius: 0.25em;
                font-weight: 300;
                font-size: 1em;
                background: var(--dropdown-bg);
                color: var(--dropdown-fg);
                transition:
                    color var(--transition-time-medium, 500) ease,
                    background var(--transition-time-medium, 500) ease;
            }

            button:hover {
                background: var(--dropdown-hover-bg);
                color: var(--dropdown-hover-fg);
                box-shadow: none;
                outline: none;
            }

            button kc-ui-icon {
                font-size: 1em;
                margin-top: 0.1em;
                margin-bottom: 0.1em;
            }

            button span {
                display: none;
                margin-left: 0.5em;
            }

            :host([visible]) button {
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;
            }

            :host([visible]) button span {
                display: revert;
            }

            ::slotted(kc-ui-dropdown) {
                border-top-left-radius: 0;
                border-top-right-radius: 0;
            }
        `];
      }
      get dropdown() {
        return this.queryAssignedElements("dropdown", "kc-ui-dropdown")[0];
      }
      get button() {
        return this.renderRoot.querySelector("button");
      }
      initialContentCallback() {
        this.button.addEventListener("click", (e) => {
          this.dropdown.toggle();
        }), this.addEventListener("kc-ui-dropdown:show", () => {
          this.visible = true;
        }), this.addEventListener("kc-ui-dropdown:hide", () => {
          this.visible = false;
        });
      }
      render() {
        return M`<button name="toggle" type="button" title="${this.title}">
                <kc-ui-icon>${this.icon ?? "question-mark"}</kc-ui-icon>
                <span>${this.title}</span>
            </button>
            <slot name="dropdown"></slot>`;
      }
    };
    W([L({ type: String })], jt.prototype, "icon", 2), W([L({ type: Boolean })], jt.prototype, "visible", 2);
    Bn("kc-ui-toggle-menu", jt);
    zt = class extends CustomEvent {
      static {
        l(this, "KiCanvasEvent");
      }
      constructor(e, t, i = false) {
        super(e, { detail: t, composed: true, bubbles: i });
      }
    };
    te = class r3 extends zt {
      static {
        l(this, "KiCanvasLoadEvent");
      }
      static {
        this.type = "kicanvas:load";
      }
      constructor() {
        super(r3.type, null);
      }
    };
    z = class r4 extends zt {
      static {
        l(this, "KiCanvasSelectEvent");
      }
      static {
        this.type = "kicanvas:select";
      }
      constructor(e) {
        super(r4.type, e, true);
      }
    };
    ct = class r5 extends zt {
      static {
        l(this, "KiCanvasMouseMoveEvent");
      }
      static {
        this.type = "kicanvas:mousemove";
      }
      constructor(e) {
        super(r5.type, e, true);
      }
    };
    F = class r6 {
      static {
        l(this, "Matrix3");
      }
      constructor(e) {
        if (e.length != 9) throw new Error(`Matrix3 requires 9 elements, got ${e}`);
        this.elements = new Float32Array(e);
      }
      static from_DOMMatrix(e) {
        return new r6([e.m11, e.m12, e.m14, e.m21, e.m22, e.m24, e.m41, e.m42, e.m44]);
      }
      to_DOMMatrix() {
        let e = this.elements;
        return new DOMMatrix([e[0], e[3], e[1], e[4], e[6], e[7]]);
      }
      to_4x4_DOMMatrix() {
        let e = this.elements;
        return new DOMMatrix([e[0], e[1], 0, e[2], e[3], e[4], 0, e[5], 0, 0, 1, 0, e[6], e[7], 0, 1]);
      }
      static identity() {
        return new r6([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      }
      static orthographic(e, t) {
        return new r6([2 / e, 0, 0, 0, -2 / t, 0, -1, 1, 1]);
      }
      copy() {
        return new r6(this.elements);
      }
      set(e) {
        if (e.length != 9) throw new Error(`Matrix3 requires 9 elements, got ${e}`);
        this.elements.set(e);
      }
      transform(e) {
        let t = this.elements[0], i = this.elements[1], s = this.elements[3], n = this.elements[4], a = this.elements[6], c = this.elements[7], u = e.x, h = e.y, m = u * t + h * s + a, _ = u * i + h * n + c;
        return new d(m, _);
      }
      *transform_all(e) {
        for (let t of e) yield this.transform(t);
      }
      static transform_all(e, t) {
        return e ? Array.from(e.transform_all(t)) : t;
      }
      multiply_self(e) {
        let t = this.elements[0], i = this.elements[1], s = this.elements[2], n = this.elements[3], a = this.elements[4], c = this.elements[5], u = this.elements[6], h = this.elements[7], m = this.elements[8], _ = e.elements[0], b = e.elements[1], f = e.elements[2], N = e.elements[3], Z = e.elements[4], T = e.elements[5], x = e.elements[6], C = e.elements[7], X = e.elements[8];
        return this.elements[0] = _ * t + b * n + f * u, this.elements[1] = _ * i + b * a + f * h, this.elements[2] = _ * s + b * c + f * m, this.elements[3] = N * t + Z * n + T * u, this.elements[4] = N * i + Z * a + T * h, this.elements[5] = N * s + Z * c + T * m, this.elements[6] = x * t + C * n + X * u, this.elements[7] = x * i + C * a + X * h, this.elements[8] = x * s + C * c + X * m, this;
      }
      multiply(e) {
        return this.copy().multiply_self(e);
      }
      inverse() {
        let e = this.elements[0], t = this.elements[1], i = this.elements[2], s = this.elements[3], n = this.elements[4], a = this.elements[5], c = this.elements[6], u = this.elements[7], h = this.elements[8], m = h * n - a * u, _ = -h * s + a * c, b = u * s - n * c, N = 1 / (e * m + t * _ + i * b);
        return new r6([m * N, (-h * t + i * u) * N, (a * t - i * n) * N, _ * N, (h * e - i * c) * N, (-a * e + i * s) * N, b * N, (-u * e + t * c) * N, (n * e - t * s) * N]);
      }
      static translation(e, t) {
        return new r6([1, 0, 0, 0, 1, 0, e, t, 1]);
      }
      translate_self(e, t) {
        return this.multiply_self(r6.translation(e, t));
      }
      translate(e, t) {
        return this.copy().translate_self(e, t);
      }
      static scaling(e, t) {
        return new r6([e, 0, 0, 0, t, 0, 0, 0, 1]);
      }
      scale_self(e, t) {
        return this.multiply_self(r6.scaling(e, t));
      }
      scale(e, t) {
        return this.copy().scale_self(e, t);
      }
      static rotation(e) {
        let t = new P(e).radians, i = Math.cos(t), s = Math.sin(t);
        return new r6([i, -s, 0, s, i, 0, 0, 0, 1]);
      }
      rotate_self(e) {
        return this.multiply_self(r6.rotation(e));
      }
      rotate(e) {
        return this.copy().rotate_self(e);
      }
      get absolute_translation() {
        return this.transform(new d(0, 0));
      }
      get absolute_rotation() {
        let e = this.transform(new d(0, 0));
        return this.transform(new d(1, 0)).sub(e).angle.normalize();
      }
    };
    d = class r7 {
      static {
        l(this, "Vec2");
      }
      constructor(e = 0, t) {
        this.set(e, t);
      }
      copy() {
        return new r7(...this);
      }
      set(e, t) {
        let i = null;
        if (le(e) && le(t) ? i = e : e instanceof r7 ? (i = e.x, t = e.y) : e instanceof Array ? (i = e[0], t = e[1]) : e instanceof Object && Object.hasOwn(e, "x") ? (i = e.x, t = e.y) : e == 0 && t == null && (i = 0, t = 0), i == null || t == null) throw new Error(`Invalid parameters x: ${e}, y: ${t}.`);
        this.x = i, this.y = t;
      }
      *[Symbol.iterator]() {
        yield this.x, yield this.y;
      }
      get magnitude() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
      }
      get squared_magnitude() {
        return this.x ** 2 + this.y ** 2;
      }
      get normal() {
        return new r7(-this.y, this.x);
      }
      get angle() {
        return new P(Math.atan2(this.y, this.x));
      }
      get kicad_angle() {
        return this.x == 0 && this.y == 0 ? new P(0) : this.y == 0 ? this.x >= 0 ? new P(0) : P.from_degrees(-180) : this.x == 0 ? this.y >= 0 ? P.from_degrees(90) : P.from_degrees(-90) : this.x == this.y ? this.x >= 0 ? P.from_degrees(45) : P.from_degrees(-135) : this.x == -this.y ? this.x >= 0 ? P.from_degrees(-45) : P.from_degrees(135) : this.angle;
      }
      normalize() {
        if (this.x == 0 && this.y == 0) return new r7(0, 0);
        let e = this.magnitude, t = this.x /= e, i = this.y /= e;
        return new r7(t, i);
      }
      equals(e) {
        return this.x == e?.x && this.y == e?.y;
      }
      add(e) {
        return new r7(this.x + e.x, this.y + e.y);
      }
      sub(e) {
        return new r7(this.x - e.x, this.y - e.y);
      }
      scale(e) {
        return new r7(this.x * e.x, this.y * e.y);
      }
      rotate(e) {
        return F.rotation(e).transform(this);
      }
      multiply(e) {
        return le(e) ? new r7(this.x * e, this.y * e) : new r7(this.x * e.x, this.y * e.y);
      }
      resize(e) {
        return this.normalize().multiply(e);
      }
      cross(e) {
        return this.x * e.y - this.y * e.x;
      }
      static segment_intersect(e, t, i, s) {
        let n = t.sub(e), a = s.sub(i), c = i.sub(e), u = a.cross(n), h = a.cross(c), m = n.cross(c);
        return u == 0 || u > 0 && (m < 0 || m > u || h < 0 || h > u) || u < 0 && (m < u || h < u || h > 0 || m > 0) ? null : new r7(i.x + m / u * a.x, i.y + m / u * a.y);
      }
    };
    P = class r8 {
      static {
        l(this, "Angle");
      }
      #e;
      #t;
      static rad_to_deg(e) {
        return e / Math.PI * 180;
      }
      static deg_to_rad(e) {
        return e / 180 * Math.PI;
      }
      static round(e) {
        return Math.round((e + Number.EPSILON) * 100) / 100;
      }
      constructor(e) {
        if (e instanceof r8) return e;
        this.radians = e;
      }
      copy() {
        return new r8(this.radians);
      }
      get radians() {
        return this.#e;
      }
      set radians(e) {
        this.#e = e, this.#t = r8.round(r8.rad_to_deg(e));
      }
      get degrees() {
        return this.#t;
      }
      set degrees(e) {
        this.#t = e, this.#e = r8.deg_to_rad(e);
      }
      static from_degrees(e) {
        return new r8(r8.deg_to_rad(e));
      }
      add(e) {
        let t = this.radians + new r8(e).radians;
        return new r8(t);
      }
      sub(e) {
        let t = this.radians - new r8(e).radians;
        return new r8(t);
      }
      normalize() {
        let e = r8.round(this.degrees);
        for (; e < 0; ) e += 360;
        for (; e >= 360; ) e -= 360;
        return r8.from_degrees(e);
      }
      normalize180() {
        let e = r8.round(this.degrees);
        for (; e <= -180; ) e += 360;
        for (; e > 180; ) e -= 360;
        return r8.from_degrees(e);
      }
      normalize720() {
        let e = r8.round(this.degrees);
        for (; e < -360; ) e += 360;
        for (; e >= 360; ) e -= 360;
        return r8.from_degrees(e);
      }
      negative() {
        return new r8(-this.radians);
      }
      get is_vertical() {
        return this.degrees == 90 || this.degrees == 270;
      }
      get is_horizontal() {
        return this.degrees == 0 || this.degrees == 180;
      }
      rotate_point(e, t = new d(0, 0)) {
        let i = e.x - t.x, s = e.y - t.y, n = this.normalize();
        if (n.degrees != 0) if (n.degrees == 90) [i, s] = [s, -i];
        else if (n.degrees == 180) [i, s] = [-i, -s];
        else if (n.degrees == 270) [i, s] = [-s, i];
        else {
          let a = Math.sin(n.radians), c = Math.cos(n.radians), [u, h] = [i, s];
          i = h * a + u * c, s = h * c - u * a;
        }
        return i += t.x, s += t.y, new d(i, s);
      }
    };
    O = class r9 {
      constructor(e = 0, t = 0, i = 0, s = 0, n) {
        this.x = e;
        this.y = t;
        this.w = i;
        this.h = s;
        this.context = n;
        this.w < 0 && (this.w *= -1, this.x -= this.w), this.h < 0 && (this.h *= -1, this.y -= this.h);
      }
      static {
        l(this, "BBox");
      }
      copy() {
        return new r9(this.x, this.y, this.w, this.h, this.context);
      }
      static from_corners(e, t, i, s, n) {
        return i < e && ([e, i] = [i, e]), s < t && ([t, s] = [s, t]), new r9(e, t, i - e, s - t, n);
      }
      static from_points(e, t) {
        if (e.length == 0) return new r9(0, 0, 0, 0);
        let i = e[0], s = i.copy(), n = i.copy();
        for (let a of e) s.x = Math.min(s.x, a.x), s.y = Math.min(s.y, a.y), n.x = Math.max(n.x, a.x), n.y = Math.max(n.y, a.y);
        return r9.from_corners(s.x, s.y, n.x, n.y, t);
      }
      static combine(e, t) {
        let i = Number.POSITIVE_INFINITY, s = Number.POSITIVE_INFINITY, n = Number.NEGATIVE_INFINITY, a = Number.NEGATIVE_INFINITY;
        for (let c of e) c.valid && (i = Math.min(i, c.x), s = Math.min(s, c.y), n = Math.max(n, c.x2), a = Math.max(a, c.y2));
        return i == Number.POSITIVE_INFINITY || s == Number.POSITIVE_INFINITY || n == Number.NEGATIVE_INFINITY || a == Number.NEGATIVE_INFINITY ? new r9(0, 0, 0, 0, t) : r9.from_corners(i, s, n, a, t);
      }
      get valid() {
        return (this.w !== 0 || this.h !== 0) && this.w !== void 0 && this.h !== void 0;
      }
      get start() {
        return new d(this.x, this.y);
      }
      set start(e) {
        this.x = e.x, this.y = e.y;
      }
      get end() {
        return new d(this.x + this.w, this.y + this.h);
      }
      set end(e) {
        this.x2 = e.x, this.y2 = e.y;
      }
      get top_left() {
        return this.start;
      }
      get top_right() {
        return new d(this.x + this.w, this.y);
      }
      get bottom_left() {
        return new d(this.x, this.y + this.h);
      }
      get bottom_right() {
        return this.end;
      }
      get x2() {
        return this.x + this.w;
      }
      set x2(e) {
        this.w = e - this.x, this.w < 0 && (this.w *= -1, this.x -= this.w);
      }
      get y2() {
        return this.y + this.h;
      }
      set y2(e) {
        this.h = e - this.y, this.h < 0 && (this.h *= -1, this.y -= this.h);
      }
      get center() {
        return new d(this.x + this.w / 2, this.y + this.h / 2);
      }
      transform(e) {
        let t = e.transform(this.start), i = e.transform(this.end);
        return r9.from_corners(t.x, t.y, i.x, i.y, this.context);
      }
      grow(e, t) {
        return t ??= e, new r9(this.x - e, this.y - t, this.w + e * 2, this.h + t * 2, this.context);
      }
      scale(e) {
        return r9.from_points([this.start.multiply(e), this.end.multiply(e)], this.context);
      }
      mirror_vertical() {
        return new r9(this.x, -this.y, this.w, -this.h);
      }
      contains(e) {
        return this.contains_point(e.start) && this.contains_point(e.end);
      }
      contains_point(e) {
        return e.x >= this.x && e.x <= this.x2 && e.y >= this.y && e.y <= this.y2;
      }
      constrain_point(e) {
        let t = Math.min(Math.max(e.x, this.x), this.x2), i = Math.min(Math.max(e.y, this.y), this.y2);
        return new d(t, i);
      }
      intersect_segment(e, t) {
        if (this.contains_point(e)) return null;
        let i = [this.top_left, this.bottom_left], s = [this.top_right, this.bottom_right], n = [this.top_left, this.top_right], a = [this.bottom_left, this.bottom_right], c = e, u = t;
        for (let h of [i, s, n, a]) {
          let m = d.segment_intersect(e, t, ...h);
          m && m.sub(c).squared_magnitude < u.sub(c).squared_magnitude && u.set(m);
        }
        return c.equals(u) ? null : u;
      }
    };
    q = class r10 {
      constructor(e, t, i, s, n, a = "clockwise") {
        this.center = e;
        this.radius = t;
        this.start_angle = i;
        this.end_angle = s;
        this.width = n;
        this.direction = a;
      }
      static {
        l(this, "Arc");
      }
      static from_three_points(e, t, i, s = 1) {
        let a = $n(new d(e.x * 1e6, e.y * 1e6), new d(t.x * 1e6, t.y * 1e6), new d(i.x * 1e6, i.y * 1e6));
        a.x /= 1e6, a.y /= 1e6;
        let c = a.sub(t).magnitude, u = e.sub(a).angle, h = t.sub(a).angle, m = i.sub(a).angle, _, b = h.sub(u).normalize(), f = m.sub(u).normalize();
        b.degrees < f.degrees ? _ = f : _ = P.from_degrees(360).sub(f);
        let N, Z, T = t.sub(e), x = i.sub(t);
        T.cross(x) < 0 ? (N = m.normalize(), Z = "counter-clockwise") : (N = u.normalize(), Z = "clockwise");
        let C = N.add(_);
        return new r10(a, c, N, C, s, Z);
      }
      static from_center_start_end(e, t, i, s) {
        let n = t.sub(e).magnitude, a = t.sub(e), c = i.sub(e), u = a.kicad_angle, h = c.kicad_angle;
        return h.degrees == u.degrees && (h.degrees = u.degrees + 360), u.degrees > h.degrees && (h.degrees < 0 ? h = h.normalize() : u = u.normalize().sub(P.from_degrees(-360))), new r10(e, n, u, h, s);
      }
      get start_radial() {
        return this.start_angle.rotate_point(new d(this.radius, 0));
      }
      get start_point() {
        return this.center.add(this.start_radial);
      }
      get end_radial() {
        return this.end_angle.rotate_point(new d(this.radius, 0));
      }
      get end_point() {
        return this.center.add(this.end_radial);
      }
      get mid_angle() {
        return new P((this.start_angle.radians + this.end_angle.radians) / 2);
      }
      get mid_radial() {
        return this.mid_angle.rotate_point(new d(this.radius, 0));
      }
      get mid_point() {
        return this.center.add(this.mid_radial);
      }
      get arc_angle() {
        return this.end_angle.sub(this.start_angle);
      }
      to_polyline() {
        let e = [], t = this.start_angle.radians, i = this.end_angle.radians;
        t > i && ([i, t] = [t, i]);
        for (let a = t; a < i; a += Math.PI / 32) e.push(new d(this.center.x + Math.cos(a) * this.radius, this.center.y + Math.sin(a) * this.radius));
        let s;
        this.direction === "counter-clockwise" ? (e.reverse(), s = t) : s = i;
        let n = new d(this.center.x + Math.cos(s) * this.radius, this.center.y + Math.sin(s) * this.radius);
        return n.equals(e[e.length - 1]) || e.push(n), e;
      }
      to_polygon() {
        let e = this.to_polyline();
        return e.push(this.center), e;
      }
      get bbox() {
        let e = [this.start_point, this.mid_point, this.end_point];
        return this.start_angle.degrees < 0 && this.end_angle.degrees >= 0 && e.push(this.center.add(new d(this.radius, 0))), this.start_angle.degrees < 90 && this.end_angle.degrees >= 90 && e.push(this.center.add(new d(0, this.radius))), this.start_angle.degrees < 180 && this.end_angle.degrees >= 180 && e.push(this.center.add(new d(-this.radius, 0))), this.start_angle.degrees < 270 && this.end_angle.degrees >= 270 && e.push(this.center.add(new d(0, this.radius))), this.start_angle.degrees < 360 && this.end_angle.degrees >= 360 && e.push(this.center.add(new d(0, this.radius))), O.from_points(e);
      }
    };
    l($n, "arc_center_from_three_points");
    j2 = class {
      constructor(e = new d(0, 0), t = new d(0, 0), i = 1, s = new P(0), n = false) {
        this.viewport_size = e;
        this.center = t;
        this.zoom = i;
        this.rotation = s;
        this.flipped = n;
      }
      static {
        l(this, "Camera2");
      }
      translate(e, t) {
        let i = this.center.add(new d(this.flipped ? -e.x : e.x, e.y));
        t && i.set(t.constrain_point(i)), this.center.set(i);
      }
      rotate(e) {
        this.rotation = this.rotation.add(e);
      }
      get matrix() {
        let e = this.viewport_size.x / 2, t = this.viewport_size.y / 2, i = this.center.x - this.center.x * this.zoom, s = this.center.y - this.center.y * this.zoom, n = this.flipped ? -(this.center.x + e) + i : -(this.center.x - e) + i, a = -(this.center.y - t) + s, c = this.flipped ? -1 : 1;
        return F.identity().scale_self(c, 1).translate_self(n, a).rotate_self(this.rotation).scale_self(this.zoom, this.zoom);
      }
      get bbox() {
        let e = this.matrix.inverse(), t = e.transform(new d(0, 0)), i = e.transform(new d(this.viewport_size.x, this.viewport_size.y));
        return new O(t.x, t.y, i.x - t.x, i.y - t.y);
      }
      set bbox(e) {
        let t = this.viewport_size.x / e.w, i = this.viewport_size.y / e.h, s = e.x + e.w / 2, n = e.y + e.h / 2;
        this.zoom = Math.min(t, i), this.center.set(s, n);
      }
      get top() {
        return this.bbox.y;
      }
      get bottom() {
        return this.bbox.y2;
      }
      get left() {
        return this.bbox.x;
      }
      get right() {
        return this.bbox.x2;
      }
      apply_to_canvas(e) {
        this.viewport_size.set(e.canvas.clientWidth, e.canvas.clientHeight);
        let t = F.from_DOMMatrix(e.getTransform());
        t.multiply_self(this.matrix), e.setTransform(t.to_DOMMatrix());
      }
      screen_to_world(e) {
        return this.matrix.inverse().transform(e);
      }
      world_to_screen(e) {
        return this.matrix.transform(e);
      }
    };
    p = class r11 {
      constructor(e, t, i, s = 1) {
        this.r = e;
        this.g = t;
        this.b = i;
        this.a = s;
      }
      static {
        l(this, "Color");
      }
      copy() {
        return new r11(this.r, this.g, this.b, this.a);
      }
      static get transparent_black() {
        return new r11(0, 0, 0, 0);
      }
      static get black() {
        return new r11(0, 0, 0, 1);
      }
      static get white() {
        return new r11(1, 1, 1, 1);
      }
      static from_css(e) {
        let t, i, s, n;
        if (e[0] == "#") e = e.slice(1), e.length == 3 && (e = `${e[0]}${e[0]}${e[1]}${e[1]}${e[2]}${e[2]}`), e.length == 6 && (e = `${e}FF`), [t, i, s, n] = [parseInt(e.slice(0, 2), 16) / 255, parseInt(e.slice(2, 4), 16) / 255, parseInt(e.slice(4, 6), 16) / 255, parseInt(e.slice(6, 8), 16) / 255];
        else if (e.startsWith("rgb")) {
          e.startsWith("rgba") || (e = `rgba(${e.slice(4, -1)}, 1)`), e = e.trim().slice(5, -1);
          let a = e.split(",");
          if (a.length != 4) throw new Error(`Invalid color ${e}`);
          [t, i, s, n] = [parseFloat(a[0]) / 255, parseFloat(a[1]) / 255, parseFloat(a[2]) / 255, parseFloat(a[3])];
        } else throw new Error(`Unable to parse CSS color string ${e}`);
        return new r11(t, i, s, n);
      }
      to_css() {
        return `rgba(${this.r_255}, ${this.g_255}, ${this.b_255}, ${this.a})`;
      }
      to_array() {
        return [this.r, this.g, this.b, this.a];
      }
      get r_255() {
        return Math.round(this.r * 255);
      }
      set r_255(e) {
        this.r = e / 255;
      }
      get g_255() {
        return Math.round(this.g * 255);
      }
      set g_255(e) {
        this.g = e / 255;
      }
      get b_255() {
        return Math.round(this.b * 255);
      }
      set b_255(e) {
        this.b = e / 255;
      }
      get is_transparent_black() {
        return this.r == 0 && this.g == 0 && this.b == 0 && this.a == 0;
      }
      with_alpha(e) {
        let t = this.copy();
        return t.a = e, t;
      }
      desaturate() {
        if (this.r == this.g && this.r == this.b) return this;
        let [e, t, i] = jn(this.r, this.g, this.b);
        return new r11(...zn(e, 0, i));
      }
      mix(e, t) {
        return new r11(e.r * (1 - t) + this.r * t, e.g * (1 - t) + this.g * t, e.b * (1 - t) + this.b * t, this.a);
      }
    };
    l(jn, "rgb_to_hsl");
    l(zn, "hsl_to_rgb");
    A = class {
      constructor(e, t, i) {
        this.center = e;
        this.radius = t;
        this.color = i;
      }
      static {
        l(this, "Circle");
      }
    };
    he = class {
      constructor(e, t, i, s, n, a) {
        this.center = e;
        this.radius = t;
        this.start_angle = i;
        this.end_angle = s;
        this.width = n;
        this.color = a;
      }
      static {
        l(this, "Arc");
      }
    };
    v = class r12 {
      constructor(e, t, i) {
        this.points = e;
        this.width = t;
        this.color = i;
      }
      static {
        l(this, "Polyline");
      }
      static from_BBox(e, t, i) {
        return new r12([e.top_left, e.top_right, e.bottom_right, e.bottom_left, e.top_left], t, i);
      }
    };
    J = class r13 {
      constructor(e, t) {
        this.points = e;
        this.color = t;
      }
      static {
        l(this, "Polygon");
      }
      static from_BBox(e, t) {
        return new r13([e.top_left, e.top_right, e.bottom_right, e.bottom_left], t);
      }
    };
    xe = class {
      constructor(e) {
        this.canvas_size = new d(0, 0);
        this.state = new qt();
        this.#t = p.black.copy();
        this.canvas = e, this.background_color = this.#t;
      }
      static {
        l(this, "Renderer");
      }
      #e;
      #t;
      get background_color() {
        return this.#t;
      }
      set background_color(e) {
        this.#t = e, this.canvas.style.backgroundColor = this.background_color.to_css();
      }
      start_bbox() {
        this.#e = new O(0, 0, 0, 0);
      }
      add_bbox(e) {
        this.#e && (this.#e = O.combine([this.#e, e], e.context));
      }
      end_bbox(e) {
        let t = this.#e;
        if (t == null) throw new Error("No current bbox");
        return t.context = e, this.#e = null, t;
      }
      prep_circle(e, t, i) {
        let s;
        e instanceof A ? s = e : s = new A(e, t, i ?? this.state.fill), (!s.color || s.color.is_transparent_black) && (s.color = this.state.fill ?? p.transparent_black), s.center = this.state.matrix.transform(s.center);
        let n = new d(s.radius, s.radius);
        return this.add_bbox(O.from_points([s.center.add(n), s.center.sub(n)])), s;
      }
      prep_arc(e, t, i, s, n, a) {
        let c;
        e instanceof he ? c = e : c = new he(e, t, i ?? new P(0), s ?? new P(Math.PI * 2), n ?? this.state.stroke_width, a ?? this.state.stroke), (!c.color || c.color.is_transparent_black) && (c.color = this.state.stroke ?? p.transparent_black);
        let h = new q(c.center, c.radius, c.start_angle, c.end_angle, c.width).to_polyline();
        return this.line(new v(h, c.width, c.color)), c;
      }
      prep_line(e, t, i) {
        let s;
        e instanceof v ? s = e : s = new v(e, t ?? this.state.stroke_width, i ?? this.state.stroke), (!s.color || s.color.is_transparent_black) && (s.color = this.state.stroke ?? p.transparent_black), s.points = Array.from(this.state.matrix.transform_all(s.points));
        let n = O.from_points(s.points);
        return n = n.grow(s.width), this.add_bbox(n), s;
      }
      prep_polygon(e, t) {
        let i;
        return e instanceof J ? i = e : i = new J(e, t ?? this.state.fill), (!i.color || i.color.is_transparent_black) && (i.color = this.state.fill ?? p.transparent_black), i.points = Array.from(this.state.matrix.transform_all(i.points)), this.add_bbox(O.from_points(i.points)), i;
      }
      glyphs(e) {
      }
    };
    Qe = class {
      constructor(e, t) {
        this.renderer = e;
        this.name = t;
        this.composite_operation = "source-over";
      }
      static {
        l(this, "RenderLayer");
      }
      dispose() {
        this.renderer.remove_layer(this);
      }
    };
    Pi = class r14 {
      constructor(e = F.identity(), t = p.black, i = p.black, s = 0, n = false) {
        this.matrix = e;
        this.fill = t;
        this.stroke = i;
        this.stroke_width = s;
        this.flipped = n;
      }
      static {
        l(this, "RenderState");
      }
      copy() {
        return new r14(this.matrix.copy(), this.fill?.copy(), this.stroke?.copy(), this.stroke_width, this.flipped);
      }
    };
    qt = class {
      static {
        l(this, "RenderStateStack");
      }
      #e;
      constructor() {
        this.#e = [new Pi()];
      }
      get top() {
        return this.#e.at(-1);
      }
      get matrix() {
        return this.top.matrix;
      }
      set matrix(e) {
        this.top.matrix = e;
      }
      get stroke() {
        return this.top.stroke;
      }
      set stroke(e) {
        this.top.stroke = e;
      }
      get fill() {
        return this.top.fill;
      }
      set fill(e) {
        this.top.fill = e;
      }
      get stroke_width() {
        return this.top.stroke_width;
      }
      set stroke_width(e) {
        this.top.stroke_width = e;
      }
      get flipped() {
        return this.top.flipped;
      }
      set flipped(e) {
        this.top.flipped = e;
      }
      multiply(e) {
        this.top.matrix.multiply_self(e);
      }
      push() {
        this.#e.push(this.top.copy());
      }
      pop() {
        this.#e.pop();
      }
    };
    l(r22, "earcut");
    l(Is, "linkedList");
    l(Ae, "filterPoints");
    l(e2, "earcutLinked");
    l(eo, "isEar");
    l(to, "isEarHashed");
    l(io, "cureLocalIntersections");
    l(ro, "splitEarcut");
    l(so, "eliminateHoles");
    l(no, "compareX");
    l(oo, "eliminateHole");
    l(ao, "findHoleBridge");
    l(lo, "sectorContainsSector");
    l(co, "indexCurve");
    l(Ro, "sortLinked");
    l(Wi, "zOrder");
    l(uo, "getLeftmost");
    l(Rt, "pointInTriangle");
    l(po, "isValidDiagonal");
    l(Y, "area");
    l(e3, "equals");
    l(As, "intersects");
    l(z2, "onSegment");
    l(q2, "sign");
    l(ho, "intersectsPolygon");
    l(t2, "locallyInside");
    l(mo, "middleInside");
    l(Cs, "splitPolygon");
    l(ks, "insertNode");
    l(i2, "removeNode");
    l(Zi, "Node");
    r22.deviation = function(r40, e, t, i) {
      var s = e && e.length, n = s ? e[0] * t : r40.length, a = Math.abs(Si(r40, 0, n, t));
      if (s) for (var c = 0, u = e.length; c < u; c++) {
        var h = e[c] * t, m = c < u - 1 ? e[c + 1] * t : r40.length;
        a -= Math.abs(Si(r40, h, m, t));
      }
      var _ = 0;
      for (c = 0; c < i.length; c += 3) {
        var b = i[c] * t, f = i[c + 1] * t, N = i[c + 2] * t;
        _ += Math.abs((r40[b] - r40[N]) * (r40[f + 1] - r40[b + 1]) - (r40[b] - r40[f]) * (r40[N + 1] - r40[b + 1]));
      }
      return a === 0 && _ === 0 ? 0 : Math.abs((_ - a) / a);
    };
    l(Si, "signedArea");
    r22.flatten = function(r40) {
      for (var e = r40[0][0].length, t = { vertices: [], holes: [], dimensions: e }, i = 0, s = 0; s < r40.length; s++) {
        for (var n = 0; n < r40[s].length; n++) for (var a = 0; a < e; a++) t.vertices.push(r40[s][n][a]);
        s > 0 && (i += r40[s - 1].length, t.holes.push(i));
      }
      return t;
    };
    Ti = class {
      constructor(e, t, i, s) {
        this.gl = e;
        this.name = t;
        this.location = i;
        this.type = s;
      }
      static {
        l(this, "Uniform");
      }
      f1(e) {
        this.gl.uniform1f(this.location, e);
      }
      f1v(e, t, i) {
        this.gl.uniform1fv(this.location, e, t, i);
      }
      f2(...e) {
        this.gl.uniform2f(this.location, ...e);
      }
      f2v(...e) {
        this.gl.uniform2fv(this.location, ...e);
      }
      f3(...e) {
        this.gl.uniform3f(this.location, ...e);
      }
      f3v(...e) {
        this.gl.uniform3fv(this.location, ...e);
      }
      f4(...e) {
        this.gl.uniform4f(this.location, ...e);
      }
      f4v(...e) {
        this.gl.uniform4fv(this.location, ...e);
      }
      mat3f(...e) {
        this.gl.uniformMatrix3fv(this.location, ...e);
      }
      mat3fv(...e) {
        this.gl.uniformMatrix3fv(this.location, ...e);
      }
    };
    ut = class r15 {
      constructor(e, t, i, s) {
        this.gl = e;
        this.name = t;
        this.vertex = i;
        this.fragment = s;
        this.uniforms = {};
        this.attribs = {};
        G(i) && (i = r15.compile(e, e.VERTEX_SHADER, i)), this.vertex = i, G(s) && (s = r15.compile(e, e.FRAGMENT_SHADER, s)), this.fragment = s, this.program = r15.link(e, i, s), this.#t(), this.#i();
      }
      static {
        l(this, "ShaderProgram");
      }
      static #e = /* @__PURE__ */ new WeakMap();
      static async load(e, t, i, s) {
        let n = r15.#e.get(e);
        if (n || (n = /* @__PURE__ */ new Map(), r15.#e.set(e, n)), !n.has(t)) {
          i instanceof URL && (i = await (await fetch(i)).text()), s instanceof URL && (s = await (await fetch(s)).text());
          let a = new r15(e, t, i, s);
          n.set(t, a);
        }
        return n.get(t);
      }
      static compile(e, t, i) {
        let s = e.createShader(t);
        if (s == null) throw new Error("Could not create new shader");
        if (e.shaderSource(s, i), e.compileShader(s), e.getShaderParameter(s, e.COMPILE_STATUS)) return s;
        let n = e.getShaderInfoLog(s);
        throw e.deleteShader(s), new Error(`Error compiling ${t} shader: ${n}`);
      }
      static link(e, t, i) {
        let s = e.createProgram();
        if (s == null) throw new Error("Could not create new shader program");
        if (e.attachShader(s, t), e.attachShader(s, i), e.linkProgram(s), e.getProgramParameter(s, e.LINK_STATUS)) return s;
        let n = e.getProgramInfoLog(s);
        throw e.deleteProgram(s), new Error(`Error linking shader program: ${n}`);
      }
      #t() {
        this.uniforms = {};
        for (let e = 0; e < this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS); e++) {
          let t = this.gl.getActiveUniform(this.program, e);
          if (t == null) throw new Error(`Could not get uniform info for uniform number ${e} for program ${this.program}`);
          let i = this.gl.getUniformLocation(this.program, t.name);
          if (i == null) throw new Error(`Could not get uniform location for uniform number ${e} for program ${this.program}`);
          this[t.name] = this.uniforms[t.name] = new Ti(this.gl, t.name, i, t.type);
        }
      }
      #i() {
        this.attribs = {};
        for (let e = 0; e < this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES); e++) {
          let t = this.gl.getActiveAttrib(this.program, e);
          if (t == null) throw new Error(`Could not get attribute info for attribute number ${e} for program ${this.program}`);
          this.attribs[t.name] = t, this[t.name] = this.gl.getAttribLocation(this.program, t.name);
        }
      }
      bind() {
        this.gl.useProgram(this.program);
      }
    };
    pt = class {
      constructor(e) {
        this.gl = e;
        this.buffers = [];
        this.gl = e;
        let t = this.gl.createVertexArray();
        if (!t) throw new Error("Could not create new VertexArray");
        this.vao = t, this.bind();
      }
      static {
        l(this, "VertexArray");
      }
      dispose(e = true) {
        if (this.gl.deleteVertexArray(this.vao ?? null), this.vao = void 0, e) for (let t of this.buffers) t.dispose();
      }
      bind() {
        this.gl.bindVertexArray(this.vao);
      }
      buffer(e, t, i, s = false, n = 0, a = 0, c) {
        i ??= this.gl.FLOAT;
        let u = new yi(this.gl, c);
        return u.bind(), this.gl.vertexAttribPointer(e, t, i, s, n, a), this.gl.enableVertexAttribArray(e), this.buffers.push(u), u;
      }
    };
    yi = class {
      constructor(e, t) {
        this.gl = e;
        this.gl = e, this.target = t ?? e.ARRAY_BUFFER;
        let i = e.createBuffer();
        if (!i) throw new Error("Unable to create new Buffer");
        this.#e = i;
      }
      static {
        l(this, "Buffer");
      }
      #e;
      dispose() {
        this.#e && this.gl.deleteBuffer(this.#e), this.#e = void 0;
      }
      bind() {
        this.gl.bindBuffer(this.target, this.#e);
      }
      set(e, t) {
        this.bind(), t ??= this.gl.STATIC_DRAW, this.gl.bufferData(this.target, e, t);
      }
      get length() {
        return this.bind(), this.gl.getBufferParameter(this.target, this.gl.BUFFER_SIZE);
      }
    };
    Ds = `#version 300 es

precision highp float;

uniform float u_depth;
uniform float u_alpha;

in vec4 v_color;

out vec4 o_color;

void main() {
    vec4 i_color = v_color;
    i_color.a *= u_alpha;
    o_color = i_color;
    gl_FragDepth = u_depth;
}
`;
    Bs = `#version 300 es

uniform mat3 u_matrix;
in vec2 a_position;
in vec4 a_color;
out vec4 v_color;

void main() {
    v_color = a_color;
    gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);;
}
`;
    Li = `#version 300 es

precision highp float;

uniform float u_depth;
uniform float u_alpha;

in vec2 v_linespace;
in float v_cap_region;
in vec4 v_color;

out vec4 outColor;

void main() {
    vec4 i_color = v_color;
    i_color.a *= u_alpha;

    float v = abs(v_linespace.x);
    float x = v_linespace.x;
    float y = v_linespace.y;

    if(x < (-1.0 + v_cap_region)) {
        float a = (1.0 + x) / v_cap_region;
        x = mix(-1.0, 0.0, a);
        if(x * x + y * y < 1.0) {
            outColor = i_color;
        } else {
            discard;
        }
    } else if (x > (1.0 - v_cap_region)) {
        float a = (x - (1.0 - v_cap_region)) / v_cap_region;
        x = mix(0.0, 1.0, a);
        if(x * x + y * y < 1.0) {
            outColor = i_color;
        } else {
            discard;
        }
    } else {
        outColor = i_color;
    }

    gl_FragDepth = u_depth;
}
`;
    Xi = `#version 300 es

uniform mat3 u_matrix;

in vec2 a_position;
in vec4 a_color;
in float a_cap_region;

out vec2 v_linespace;
out float v_cap_region;
out vec4 v_color;

vec2 c_linespace[6] = vec2[](
    // first triangle
    vec2(-1, -1),
    vec2( 1, -1),
    vec2(-1,  1),
    // second triangle
    vec2(-1,  1),
    vec2( 1, -1),
    vec2( 1,  1)
);

void main() {
    int triangle_vertex_num = int(gl_VertexID % 6);

    v_linespace = c_linespace[triangle_vertex_num];
    v_cap_region = a_cap_region;

    gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);

    v_color = a_color;
}
`;
    Ce = class {
      static {
        l(this, "Tesselator");
      }
      static {
        this.vertices_per_quad = 6;
      }
      static quad_to_triangles(e) {
        let t = [...e[0], ...e[2], ...e[1], ...e[1], ...e[2], ...e[3]];
        if (t.filter((i) => Number.isNaN(i)).length) throw new Error("Degenerate quad");
        return t;
      }
      static populate_color_data(e, t, i, s) {
        t || (t = new p(1, 0, 0, 1));
        let n = t.to_array();
        for (let a = 0; a < s; a++) e[i + a] = n[a % n.length];
      }
      static tesselate_segment(e, t, i) {
        let a = t.sub(e).normal.normalize().multiply(i / 2), c = a.normal, u = e.add(a).add(c), h = e.sub(a).add(c), m = t.add(a).sub(c), _ = t.sub(a).sub(c);
        return [u, h, m, _];
      }
      static tesselate_polyline(e) {
        let t = e.width || 0, i = e.points, s = e.color, a = (i.length - 1) * this.vertices_per_quad, c = new Float32Array(a * 2), u = new Float32Array(a * 4), h = new Float32Array(a), m = 0;
        for (let _ = 1; _ < i.length; _++) {
          let b = i[_ - 1], f = i[_], N = f.sub(b).magnitude;
          if (N == 0) continue;
          let Z = this.tesselate_segment(b, f, t), T = t / (N + t);
          c.set(this.quad_to_triangles(Z), m * 2), h.set(Array(this.vertices_per_quad).fill(T), m), this.populate_color_data(u, s, m * 4, this.vertices_per_quad * 4), m += this.vertices_per_quad;
        }
        return { position_array: c.slice(0, m * 2), cap_array: h.slice(0, m), color_array: u.slice(0, m * 4) };
      }
      static tesselate_circle(e) {
        let t = new d(e.radius, 0), i = t.normal, s = e.center.add(t).add(i), n = e.center.sub(t).add(i), a = e.center.add(t).sub(i), c = e.center.sub(t).sub(i);
        return [s, n, a, c];
      }
      static tesselate_circles(e) {
        let t = e.length * this.vertices_per_quad, i = new Float32Array(t * 2), s = new Float32Array(t), n = new Float32Array(t * 4), a = 0;
        for (let c = 0; c < e.length; c++) {
          let u = e[c], h = 1, m = this.tesselate_circle(u);
          i.set(this.quad_to_triangles(m), a * 2), s.set(Array(this.vertices_per_quad).fill(h), a), this.populate_color_data(n, u.color, a * 4, this.vertices_per_quad * 4), a += this.vertices_per_quad;
        }
        return { position_array: i.slice(0, a * 2), cap_array: s.slice(0, a), color_array: n.slice(0, a * 4) };
      }
      static triangulate_polygon(e) {
        if (e.vertices) return e;
        let t = e.points, i = new Array(t.length * 2);
        for (let a = 0; a < t.length; a++) {
          let c = t[a];
          i[a * 2] = c.x, i[a * 2 + 1] = c.y;
        }
        if (t.length == 3) return e.points = [], e.vertices = new Float32Array(i), e;
        let s = r22(i), n = new Float32Array(s.length * 2);
        for (let a = 0; a < s.length; a++) {
          let c = s[a];
          n[a * 2] = i[c * 2], n[a * 2 + 1] = i[c * 2 + 1];
        }
        return e.points = [], e.vertices = n, e;
      }
    };
    t3 = class r16 {
      constructor(e, t) {
        this.gl = e;
        this.shader = t ?? r16.shader, this.vao = new pt(e), this.position_buf = this.vao.buffer(this.shader.a_position, 2), this.cap_region_buf = this.vao.buffer(this.shader.a_cap_region, 1), this.color_buf = this.vao.buffer(this.shader.a_color, 4), this.vertex_count = 0;
      }
      static {
        l(this, "CircleSet");
      }
      static async load_shader(e) {
        this.shader = await ut.load(e, "polyline", Xi, Li);
      }
      dispose() {
        this.vao.dispose(), this.position_buf.dispose(), this.cap_region_buf.dispose(), this.color_buf.dispose();
      }
      set(e) {
        let { position_array: t, cap_array: i, color_array: s } = Ce.tesselate_circles(e);
        this.position_buf.set(t), this.cap_region_buf.set(i), this.color_buf.set(s), this.vertex_count = t.length / 2;
      }
      render() {
        this.vertex_count && (this.vao.bind(), this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertex_count));
      }
    };
    i3 = class r17 {
      constructor(e, t) {
        this.gl = e;
        this.shader = t ?? r17.shader, this.vao = new pt(e), this.position_buf = this.vao.buffer(this.shader.a_position, 2), this.cap_region_buf = this.vao.buffer(this.shader.a_cap_region, 1), this.color_buf = this.vao.buffer(this.shader.a_color, 4), this.vertex_count = 0;
      }
      static {
        l(this, "PolylineSet");
      }
      static async load_shader(e) {
        this.shader = await ut.load(e, "polyline", Xi, Li);
      }
      dispose() {
        this.vao.dispose(), this.position_buf.dispose(), this.cap_region_buf.dispose(), this.color_buf.dispose();
      }
      set(e) {
        if (!e.length) return;
        let t = e.reduce((h, m) => h + (m.points.length - 1) * Ce.vertices_per_quad, 0), i = new Float32Array(t * 2), s = new Float32Array(t), n = new Float32Array(t * 4), a = 0, c = 0, u = 0;
        for (let h of e) {
          let { position_array: m, cap_array: _, color_array: b } = Ce.tesselate_polyline(h);
          i.set(m, a), a += m.length, s.set(_, c), c += _.length, n.set(b, u), u += b.length;
        }
        this.position_buf.set(i), this.cap_region_buf.set(s), this.color_buf.set(n), this.vertex_count = a / 2;
      }
      render() {
        this.vertex_count && (this.vao.bind(), this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertex_count));
      }
    };
    r32 = class r18 {
      constructor(e, t) {
        this.gl = e;
        this.shader = t ?? r18.shader, this.vao = new pt(e), this.position_buf = this.vao.buffer(this.shader.a_position, 2), this.color_buf = this.vao.buffer(this.shader.a_color, 4), this.vertex_count = 0;
      }
      static {
        l(this, "PolygonSet");
      }
      static async load_shader(e) {
        this.shader = await ut.load(e, "polygon", Bs, Ds);
      }
      dispose() {
        this.vao.dispose(), this.position_buf.dispose(), this.color_buf.dispose();
      }
      static polyline_from_triangles(e, t, i) {
        let s = [];
        for (let n = 0; n < e.length; n += 6) {
          let a = new d(e[n], e[n + 1]), c = new d(e[n + 2], e[n + 3]), u = new d(e[n + 4], e[n + 5]);
          s.push(new v([a, c, u, a], t, i));
        }
        return s;
      }
      set(e) {
        let t = 0;
        for (let u of e) Ce.triangulate_polygon(u), t += u.vertices?.length ?? 0;
        let i = t / 2, s = new Float32Array(t), n = new Float32Array(i * 4), a = 0, c = 0;
        for (let u of e) {
          if (u.vertices == null) continue;
          let h = u.vertices.length / 2;
          s.set(u.vertices, a), a += u.vertices.length, Ce.populate_color_data(n, u.color, c, h * 4), c += h * 4;
        }
        this.position_buf.set(s), this.color_buf.set(n), this.vertex_count = a / 2;
      }
      render() {
        this.vertex_count && (this.vao.bind(), this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertex_count));
      }
    };
    s2 = class {
      constructor(e) {
        this.gl = e;
        this.gl = e;
      }
      static {
        l(this, "PrimitiveSet");
      }
      #e = [];
      #t = [];
      #i = [];
      #r;
      #s;
      #n;
      static async load_shaders(e) {
        await Promise.all([r32.load_shader(e), i3.load_shader(e), t3.load_shader(e)]);
      }
      dispose() {
        this.#r?.dispose(), this.#s?.dispose(), this.#n?.dispose();
      }
      clear() {
        this.#r?.dispose(), this.#s?.dispose(), this.#n?.dispose(), this.#r = void 0, this.#s = void 0, this.#n = void 0, this.#e = [], this.#t = [], this.#i = [];
      }
      add_circle(e) {
        this.#t.push(e);
      }
      add_polygon(e) {
        this.#e.push(e);
      }
      add_line(e) {
        this.#i.push(e);
      }
      commit() {
        this.#e.length && (this.#r = new r32(this.gl), this.#r.set(this.#e), this.#e = void 0), this.#i.length && (this.#n = new i3(this.gl), this.#n.set(this.#i), this.#i = void 0), this.#t.length && (this.#s = new t3(this.gl), this.#s.set(this.#t), this.#t = void 0);
      }
      render(e, t = 0, i = 1) {
        this.#r && (this.#r.shader.bind(), this.#r.shader.u_matrix.mat3f(false, e.elements), this.#r.shader.u_depth.f1(t), this.#r.shader.u_alpha.f1(i), this.#r.render()), this.#s && (this.#s.shader.bind(), this.#s.shader.u_matrix.mat3f(false, e.elements), this.#s.shader.u_depth.f1(t), this.#s.shader.u_alpha.f1(i), this.#s.render()), this.#n && (this.#n.shader.bind(), this.#n.shader.u_matrix.mat3f(false, e.elements), this.#n.shader.u_depth.f1(t), this.#n.shader.u_alpha.f1(i), this.#n.render());
      }
    };
    s3 = class extends xe {
      constructor(t) {
        super(t);
        this.#e = [];
        this.projection_matrix = F.identity();
      }
      static {
        l(this, "WebGL2Renderer");
      }
      #e;
      #t;
      async setup() {
        let t = this.canvas.getContext("webgl2", { alpha: false });
        if (t == null) throw new Error("Unable to create WebGL2 context");
        this.gl = t, t.enable(t.BLEND), t.blendEquation(t.FUNC_ADD), t.blendFunc(t.SRC_ALPHA, t.ONE_MINUS_SRC_ALPHA), t.enable(t.DEPTH_TEST), t.depthFunc(t.GREATER), t.clearColor(...this.background_color.to_array()), t.clearDepth(0), t.clear(t.COLOR_BUFFER_BIT | t.DEPTH_BUFFER_BIT), this.update_canvas_size(), await s2.load_shaders(t);
      }
      dispose() {
        for (let t of this.layers) t.dispose();
        this.gl = void 0;
      }
      update_canvas_size() {
        if (!this.gl) return;
        let t = window.devicePixelRatio, i = this.canvas.getBoundingClientRect(), s = i.width, n = i.height, a = Math.round(i.width * t), c = Math.round(i.height * t);
        this.canvas_size.x == a && this.canvas_size.y == c || (this.canvas.width = a, this.canvas.height = c, this.gl.viewport(0, 0, a, c), this.projection_matrix = F.orthographic(s, n));
      }
      clear_canvas() {
        if (this.gl == null) throw new Error("Uninitialized");
        this.update_canvas_size(), this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
      }
      start_layer(t, i = 0) {
        if (this.gl == null) throw new Error("Uninitialized");
        this.#t = new Oi(this, t, new s2(this.gl));
      }
      end_layer() {
        if (this.#t == null) throw new Error("No active layer");
        return this.#t.geometry.commit(), this.#e.push(this.#t), this.#t = null, this.#e.at(-1);
      }
      arc(t, i, s, n, a, c) {
        super.prep_arc(t, i, s, n, a, c);
      }
      circle(t, i, s) {
        let n = super.prep_circle(t, i, s);
        n.color && this.#t.geometry.add_circle(n);
      }
      line(t, i, s) {
        let n = super.prep_line(t, i, s);
        n.color && this.#t.geometry.add_line(n);
      }
      polygon(t, i) {
        let s = super.prep_polygon(t, i);
        s.color && this.#t.geometry.add_polygon(s);
      }
      get layers() {
        let t = this.#e;
        return { *[Symbol.iterator]() {
          for (let i of t) yield i;
        } };
      }
      remove_layer(t) {
        let i = this.#e.indexOf(t);
        i != -1 && this.#e.splice(i, 1);
      }
    };
    Oi = class extends Qe {
      constructor(t, i, s) {
        super(t, i);
        this.renderer = t;
        this.name = i;
        this.geometry = s;
      }
      static {
        l(this, "WebGL2RenderLayer");
      }
      dispose() {
        this.clear();
      }
      clear() {
        this.geometry?.dispose();
      }
      render(t, i, s = 1) {
        let n = this.renderer.gl, a = this.renderer.projection_matrix.multiply(t);
        this.composite_operation != "source-over" && n.blendFunc(n.ONE_MINUS_DST_COLOR, n.ONE_MINUS_SRC_ALPHA), this.geometry.render(a, i, s), this.composite_operation != "source-over" && n.blendFunc(n.SRC_ALPHA, n.ONE_MINUS_SRC_ALPHA);
      }
    };
    ie = class {
      constructor(e, t = 1) {
        this.name = e;
        this.level = t;
      }
      static {
        l(this, "Logger");
      }
      #e(e, ...t) {
        e(`%c${this.name}:%c`, "color: ButtonText", "color: inherit", ...t);
      }
      debug(...e) {
        this.level >= 2 && this.#e(console.debug, ...e);
      }
      info(...e) {
        this.level >= 1 && this.#e(console.info.bind(window.console), ...e);
      }
      warn(...e) {
        this.level >= 0 && this.#e(console.warn, ...e);
      }
      error(...e) {
        this.level >= 0 && this.#e(console.error, ...e);
      }
    };
    No = new ie("kicanvas");
    l(n2, "warn");
    js = "";
    k = class {
      constructor(e, t = null) {
        this.type = e;
        this.value = t;
      }
      static {
        l(this, "Token");
      }
      static {
        this.OPEN = Symbol("opn");
      }
      static {
        this.CLOSE = Symbol("clo");
      }
      static {
        this.ATOM = Symbol("atm");
      }
      static {
        this.NUMBER = Symbol("num");
      }
      static {
        this.STRING = Symbol("str");
      }
    };
    l(o3, "is_digit");
    l(zs, "is_alpha");
    l(n3, "is_whitespace");
    l(Fi, "is_atom");
    l(o2, "error_context");
    l(go, "tokenize");
    l(qs, "listify_tokens");
    l(en2, "listify");
    a2 = new ie("kicanvas:parser");
    R = { any(r40, e, t) {
      return t;
    }, boolean(r40, e, t) {
      switch (t) {
        case "false":
        case "no":
          return false;
        case "true":
        case "yes":
          return true;
        default:
          return !!t;
      }
    }, string(r40, e, t) {
      if (G(t)) return t;
    }, number(r40, e, t) {
      if (le(t)) return t;
    }, item(r40, ...e) {
      return (t, i, s) => new r40(s, ...e);
    }, object(r40, ...e) {
      return (t, i, s) => {
        let n = {};
        return r40 !== null && (n = t[i] ?? r40 ?? {}), { ...n, ...V(s, o.start(i), ...e) };
      };
    }, vec2(r40, e, t) {
      let i = t;
      return new d(i[1], i[2]);
    }, color(r40, e, t) {
      let i = t;
      return new p(i[1] / 255, i[2] / 255, i[3] / 255, i[4]);
    }, choice(...r40) {
      return (e, t, i) => {
        let s = i;
        for (let [n, a] of r40) if (n === s[0]) return a(e, t, i);
        throw new Error(`No matched for ${i}`);
      };
    } };
    o = { start(r40) {
      return { kind: 0, name: r40, fn: R.string };
    }, positional(r40, e = R.any) {
      return { kind: 1, name: r40, fn: e };
    }, pair(r40, e = R.any) {
      return { kind: 2, name: r40, accepts: [r40], fn: l((t, i, s) => e(t, i, s[1]), "fn") };
    }, list(r40, e = R.any) {
      return { kind: 3, name: r40, accepts: [r40], fn: l((t, i, s) => s.slice(1).map((n) => e(t, i, n)), "fn") };
    }, collection(r40, e, t = R.any) {
      return { kind: 5, name: r40, accepts: [e], fn: l((i, s, n) => {
        let a = i[s] ?? [];
        return a.push(t(i, s, n)), a;
      }, "fn") };
    }, mapped_collection(r40, e, t, i = R.any) {
      return { kind: 5, name: r40, accepts: [e], fn: l((s, n, a) => {
        let c = s[n] ?? /* @__PURE__ */ new Map(), u = i(s, n, a), h = t(u);
        return c.set(h, u), c;
      }, "fn") };
    }, dict(r40, e, t = R.any) {
      return { kind: 5, name: r40, accepts: [e], fn: l((i, s, n) => {
        let a = n, c = i[s] ?? {};
        return c[a[1]] = t(i, s, a.slice(2)), c;
      }, "fn") };
    }, atom(r40, e) {
      let t;
      return e ? t = R.string : (t = R.boolean, e = [r40]), { kind: 4, name: r40, accepts: e, fn(i, s, n) {
        return Array.isArray(n) && n.length == 1 && (n = n[0]), t(i, s, n);
      } };
    }, expr(r40, e = R.any) {
      return { kind: 6, name: r40, accepts: [r40], fn: e };
    }, object(r40, e, ...t) {
      return o.expr(r40, R.object(e, ...t));
    }, item(r40, e, ...t) {
      return o.expr(r40, R.item(e, ...t));
    }, vec2(r40) {
      return o.expr(r40, R.vec2);
    }, color(r40 = "color") {
      return o.expr(r40, R.color);
    } };
    l(V, "parse_expr");
    l(Ui, "unescape_string");
    l(Ye, "expand_text_vars");
    E = class r19 {
      constructor(e) {
        this.position = new d(0, 0);
        this.rotation = 0;
        this.unlocked = false;
        if (e) {
          let t = V(e, o.start("at"), o.positional("x", R.number), o.positional("y", R.number), o.positional("rotation", R.number), o.atom("unlocked"));
          this.position.set(t.x, t.y), this.rotation = t.rotation ?? this.rotation, this.unlocked = t.unlocked ?? this.unlocked;
        }
      }
      static {
        l(this, "At");
      }
      copy() {
        let e = new r19();
        return e.position = this.position.copy(), e.rotation = this.rotation, e.unlocked = this.unlocked, e;
      }
    };
    tn = { User: [431.8, 279.4], A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210], A5: [210, 148], A: [279.4, 215.9], B: [431.8, 279.4], C: [558.8, 431.8], D: [863.6, 558.8], E: [1117.6, 863.6], USLetter: [279.4, 215.9], USLegal: [355.6, 215.9], USLedger: [431.8, 279.4] };
    ht = class {
      constructor(e) {
        this.portrait = false;
        Object.assign(this, V(e, o.start("paper"), o.atom("size", Object.keys(tn)), o.positional("width", R.number), o.positional("height", R.number), o.atom("portrait")));
        let t = tn[this.size];
        !this.width && t && (this.width = t[0]), !this.height && t && (this.height = t[1]), this.size != "User" && this.portrait && ([this.width, this.height] = [this.height, this.width]);
      }
      static {
        l(this, "Paper");
      }
    };
    we = class {
      constructor(e) {
        this.title = "";
        this.date = "";
        this.rev = "";
        this.company = "";
        this.comment = {};
        e && Object.assign(this, V(e, o.start("title_block"), o.pair("title", R.string), o.pair("date", R.string), o.pair("rev", R.string), o.pair("company", R.string), o.expr("comment", (t, i, s) => {
          let n = s, a = t[i] ?? {};
          return a[n[1]] = n[2], a;
        })));
      }
      static {
        l(this, "TitleBlock");
      }
      resolve_text_var(e) {
        return (/* @__PURE__ */ new Map([["ISSUE_DATE", this.date], ["REVISION", this.rev], ["TITLE", this.title], ["COMPANY", this.company], ["COMMENT1", this.comment[1] ?? ""], ["COMMENT2", this.comment[2] ?? ""], ["COMMENT3", this.comment[3] ?? ""], ["COMMENT4", this.comment[4] ?? ""], ["COMMENT5", this.comment[5] ?? ""], ["COMMENT6", this.comment[6] ?? ""], ["COMMENT7", this.comment[7] ?? ""], ["COMMENT8", this.comment[8] ?? ""], ["COMMENT9", this.comment[9] ?? ""]])).get(e);
      }
    };
    H = class r20 {
      constructor(e) {
        this.font = new a3();
        this.justify = new l3();
        this.hide = false;
        e && Object.assign(this, V(e, o.start("effects"), o.item("font", a3), o.item("justify", l3), o.atom("hide"), o.color()));
      }
      static {
        l(this, "Effects");
      }
      copy() {
        let e = new r20();
        return e.font = this.font.copy(), e.justify = this.justify.copy(), e.hide = this.hide, e;
      }
    };
    a3 = class r21 {
      constructor(e) {
        this.size = new d(1.27, 1.27);
        this.thickness = 0;
        this.bold = false;
        this.italic = false;
        this.color = p.transparent_black;
        e && (Object.assign(this, V(e, o.start("font"), o.pair("face", R.string), o.vec2("size"), o.pair("thickness", R.number), o.atom("bold"), o.atom("italic"), o.pair("line_spacing", R.number), o.color())), [this.size.x, this.size.y] = [this.size.y, this.size.x]);
      }
      static {
        l(this, "Font");
      }
      copy() {
        let e = new r21();
        return e.face = this.face, e.size = this.size.copy(), e.thickness = this.thickness, e.bold = this.bold, e.italic = this.italic, e;
      }
    };
    l3 = class r23 {
      constructor(e) {
        this.horizontal = "center";
        this.vertical = "center";
        this.mirror = false;
        e && Object.assign(this, V(e, o.start("justify"), o.atom("horizontal", ["left", "right"]), o.atom("vertical", ["top", "bottom"]), o.atom("mirror")));
      }
      static {
        l(this, "Justify");
      }
      copy() {
        let e = new r23();
        return e.horizontal = this.horizontal, e.vertical = this.vertical, e.mirror = this.mirror, e;
      }
    };
    D = class {
      constructor(e) {
        this.type = "default";
        Object.assign(this, V(e, o.start("stroke"), o.pair("width", R.number), o.pair("type", R.string), o.color()));
      }
      static {
        l(this, "Stroke");
      }
      static default_value() {
        return { width: 0, type: "default", color: p.transparent_black };
      }
    };
    Ke = class {
      static {
        l(this, "EmbeddedFile");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("file"), o.pair("name", R.string), o.pair("type", R.string), o.pair("data", R.string), o.pair("checksum", R.string)));
      }
      async decompress_file() {
        this.data;
      }
    };
    dt = class r24 {
      static {
        l(this, "StrokeParams");
      }
      static {
        this.line_correction = 1;
      }
      static dot_length(e) {
        return Math.max(1 - r24.line_correction, 0.2) * e;
      }
      static gap_length(e, t) {
        let i = t.dashed_line_gap_ratio;
        return Math.max(i + r24.line_correction, 1) * e;
      }
      static dash_length(e, t) {
        let i = t.dashed_line_dash_ratio;
        return Math.max(i - r24.line_correction, 1) * e;
      }
      static default_value() {
        return { stroke: D.default_value(), dashed_line_gap_ratio: 3, dashed_line_dash_ratio: 12 };
      }
    };
    l2 = class {
      static {
        l(this, "Net");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("net"), o.positional("number", R.number), o.positional("name", R.string)));
      }
    };
    l(vi, "isNetInfo");
    l(rn, "getNetNumber");
    de = class {
      constructor(e, t) {
        this.filename = e;
        this.general = { thickness: 1.6, legacy_teardrops: false };
        this.title_block = new we();
        this.properties = /* @__PURE__ */ new Map();
        this.layers = [];
        this.nets = [];
        this.footprints = [];
        this.zones = [];
        this.segments = [];
        this.vias = [];
        this.drawings = [];
        this.groups = [];
        this.embedded_fonts = false;
        this.embedded_files = [];
        Object.assign(this, V(t, o.start("kicad_pcb"), o.pair("version", R.number), o.pair("generator", R.string), o.pair("generator_version", R.string), o.object("general", {}, o.pair("thickness", R.number), o.pair("legacy_teardrops", R.boolean)), o.item("paper", ht), o.item("title_block", we), o.list("layers", R.item(Ki)), o.item("setup", Yi), o.mapped_collection("properties", "property", (i) => i.name, R.item(xi, this)), o.collection("nets", "net", R.item(l2)), o.collection("footprints", "footprint", R.item(me, this)), o.collection("zones", "zone", R.item(mt, this)), o.collection("segments", "segment", R.item(c2, this)), o.collection("segments", "arc", R.item(R2, this)), o.collection("vias", "via", R.item(u2, this)), o.collection("drawings", "dimension", R.item(p2, this)), o.collection("drawings", "gr_line", R.item(bt, this)), o.collection("drawings", "gr_circle", R.item(ft, this)), o.collection("drawings", "gr_arc", R.item(Mt, this)), o.collection("drawings", "gr_poly", R.item(Nt, this)), o.collection("drawings", "gr_rect", R.item(gt, this)), o.collection("drawings", "gr_text", R.item(Pt, this)), o.collection("groups", "group", R.item(ji)), o.pair("embedded_fonts", R.boolean), o.list("embedded_files", R.item(Ke)))), this.nets.sort((i, s) => i.number - s.number);
      }
      static {
        l(this, "KicadPCB");
      }
      *items() {
        yield* this.drawings, yield* this.vias, yield* this.segments, yield* this.zones, yield* this.footprints;
      }
      resolve_text_var(e) {
        return e == "FILENAME" ? this.filename : this.properties.has(e) ? this.properties.get(e).value : this.title_block.resolve_text_var(e);
      }
      get edge_cuts_bbox() {
        let e = new O(0, 0, 0, 0);
        for (let t of this.drawings) t.layer != "Edge.Cuts" || !(t instanceof Ee) || (e = O.combine([e, t.bbox]));
        return e;
      }
      find_footprint(e) {
        for (let t of this.footprints) if (t.unique_id == e || t.reference == e) return t;
        return null;
      }
      get_netname_by_number(e) {
        return this.nets[e]?.name;
      }
    };
    xi = class {
      static {
        l(this, "Property");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("property"), o.positional("name", R.string), o.positional("value", R.string)));
      }
    };
    c2 = class {
      constructor(e, t) {
        this.parent = t;
        this.locked = false;
        Object.assign(this, V(e, o.start("segment"), o.vec2("start"), o.vec2("end"), o.pair("width", R.number), o.pair("layer", R.string), o.pair("net", R.number), o.atom("locked"), o.pair("uuid", R.string), o.pair("tstamp", R.string)));
      }
      static {
        l(this, "LineSegment");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      get netname() {
        return this.parent.get_netname_by_number(this.net);
      }
    };
    R2 = class {
      constructor(e, t) {
        this.parent = t;
        this.locked = false;
        Object.assign(this, V(e, o.start("arc"), o.vec2("start"), o.vec2("mid"), o.vec2("end"), o.pair("width", R.number), o.pair("layer", R.string), o.pair("net", R.number), o.atom("locked"), o.pair("tstamp", R.string), o.pair("uuid", R.string)));
      }
      static {
        l(this, "ArcSegment");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      get netname() {
        return this.parent.get_netname_by_number(this.net);
      }
    };
    u2 = class {
      constructor(e, t) {
        this.parent = t;
        this.type = "through-hole";
        this.remove_unused_layers = false;
        this.keep_end_layers = false;
        this.locked = false;
        this.free = false;
        Object.assign(this, V(e, o.start("via"), o.atom("type", ["blind", "micro", "through-hole"]), o.item("at", E), o.pair("size", R.number), o.pair("drill", R.number), o.list("layers", R.string), o.pair("net", R.number), o.atom("locked"), o.atom("free"), o.atom("remove_unused_layers"), o.atom("keep_end_layers"), o.pair("tstamp", R.string), o.pair("uuid", R.string)));
      }
      static {
        l(this, "Via");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      get netname() {
        return this.parent.get_netname_by_number(this.net);
      }
    };
    mt = class {
      constructor(e, t) {
        this.parent = t;
        this.locked = false;
        Object.assign(this, V(e, o.start("zone"), o.atom("locked"), o.pair("net", R.number), o.pair("net_name", R.string), o.pair("net_name", R.string), o.pair("name", R.string), o.pair("layer", R.string), o.list("layers", R.string), o.object("hatch", {}, o.positional("style", R.string), o.positional("pitch", R.number)), o.pair("priority", R.number), o.object("connect_pads", {}, o.positional("type", R.string), o.pair("clearance", R.number)), o.pair("min_thickness", R.number), o.pair("filled_areas_thickness", R.boolean), o.item("keepout", Qi), o.item("fill", wi), o.collection("polygons", "polygon", R.item(We)), o.collection("filled_polygons", "filled_polygon", R.item(Ai)), o.pair("tstamp", R.string), o.pair("uuid", R.string)));
      }
      static {
        l(this, "Zone");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
    };
    Qi = class {
      static {
        l(this, "ZoneKeepout");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("keepout"), o.pair("tracks", R.string), o.pair("vias", R.string), o.pair("pads", R.string), o.pair("copperpour", R.string), o.pair("footprints", R.string)));
      }
    };
    wi = class {
      constructor(e) {
        this.fill = false;
        this.mode = "solid";
        Object.assign(this, V(e, o.start("fill"), o.positional("fill", R.boolean), o.pair("mode", R.string), o.pair("thermal_gap", R.number), o.pair("thermal_bridge_width", R.number), o.expr("smoothing", R.object({}, o.positional("style", R.string), o.pair("radius", R.number))), o.pair("radius", R.number), o.pair("island_removal_mode", R.number), o.pair("island_area_min", R.number), o.pair("hatch_thickness", R.number), o.pair("hatch_gap", R.number), o.pair("hatch_orientation", R.number), o.pair("hatch_smoothing_level", R.number), o.pair("hatch_smoothing_value", R.number), o.pair("hatch_border_algorithm", R.string), o.pair("hatch_min_hole_area", R.number)));
      }
      static {
        l(this, "ZoneFill");
      }
    };
    Ki = class {
      static {
        l(this, "Layer");
      }
      constructor(e) {
        Object.assign(this, V(e, o.positional("ordinal", R.number), o.positional("canonical_name", R.string), o.positional("type", R.string), o.positional("user_name", R.string)));
      }
    };
    Yi = class {
      constructor(e) {
        this.allow_soldermask_bridges_in_footprints = false;
        Object.assign(this, V(e, o.start("setup"), o.pair("pad_to_mask_clearance", R.number), o.pair("solder_mask_min_width", R.number), o.pair("pad_to_paste_clearance", R.number), o.pair("pad_to_paste_clearance_ratio", R.number), o.pair("allow_soldermask_bridges_in_footprints", R.boolean), o.vec2("aux_axis_origin"), o.vec2("grid_origin"), o.item("pcbplotparams", Ei), o.item("stackup", Hi)));
      }
      static {
        l(this, "Setup");
      }
    };
    Ei = class {
      constructor(e) {
        this.disableapertmacros = false;
        this.usegerberextensions = false;
        this.usegerberattributes = false;
        this.usegerberadvancedattributes = false;
        this.creategerberjobfile = false;
        this.svguseinch = false;
        this.excludeedgelayer = false;
        this.plotframeref = false;
        this.viasonmask = false;
        this.useauxorigin = false;
        this.pdf_front_fp_property_popups = true;
        this.pdf_back_fp_property_popups = true;
        this.pdf_metadata = true;
        this.pdf_single_document = false;
        this.dxfpolygonmode = false;
        this.dxfimperialunits = false;
        this.dxfusepcbnewfont = false;
        this.psnegative = false;
        this.psa4output = false;
        this.plotreference = false;
        this.plotvalue = false;
        this.plotinvisibletext = false;
        this.sketchpadsonfab = false;
        this.subtractmaskfromsilk = false;
        this.plot_black_and_white = true;
        this.plotpadnumbers = false;
        this.hidednponfab = false;
        this.sketchdnponfab = true;
        this.crossoutdnponfab = true;
        this.mirror = false;
        Object.assign(this, V(e, o.start("pcbplotparams"), o.pair("layerselection", R.number), o.pair("disableapertmacros", R.boolean), o.pair("usegerberextensions", R.boolean), o.pair("usegerberattributes", R.boolean), o.pair("usegerberadvancedattributes", R.boolean), o.pair("creategerberjobfile", R.boolean), o.pair("gerberprecision", R.number), o.pair("svguseinch", R.boolean), o.pair("svgprecision", R.number), o.pair("excludeedgelayer", R.boolean), o.pair("plotframeref", R.boolean), o.pair("viasonmask", R.boolean), o.pair("mode", R.number), o.pair("useauxorigin", R.boolean), o.pair("hpglpennumber", R.number), o.pair("hpglpenspeed", R.number), o.pair("hpglpendiameter", R.number), o.pair("pdf_front_fp_property_popups", R.boolean), o.pair("pdf_back_fp_property_popups", R.boolean), o.pair("pdf_metadata", R.boolean), o.pair("pdf_single_document", R.boolean), o.pair("dxfpolygonmode", R.boolean), o.pair("dxfimperialunits", R.boolean), o.pair("dxfusepcbnewfont", R.boolean), o.pair("psnegative", R.boolean), o.pair("psa4output", R.boolean), o.pair("plotreference", R.boolean), o.pair("plotvalue", R.boolean), o.pair("plotinvisibletext", R.boolean), o.pair("sketchpadsonfab", R.boolean), o.pair("subtractmaskfromsilk", R.boolean), o.pair("plotpadnumbers", R.boolean), o.pair("plot_black_and_white", R.boolean), o.pair("hidednponfab", R.boolean), o.pair("sketchdnponfab", R.boolean), o.pair("crossoutdnponfab", R.boolean), o.pair("outputformat", R.number), o.pair("mirror", R.boolean), o.pair("drillshape", R.number), o.pair("scaleselection", R.number), o.pair("outputdirectory", R.string), o.pair("plot_on_all_layers_selection", R.number), o.pair("dashed_line_dash_ratio", R.number), o.pair("dashed_line_gap_ratio", R.number)));
      }
      static {
        l(this, "PCBPlotParams");
      }
    };
    Hi = class {
      constructor(e) {
        this.dielectric_constraints = false;
        this.castellated_pads = false;
        this.edge_plating = false;
        Object.assign(this, V(e, o.start("stackup"), o.pair("copper_finish", R.string), o.pair("dielectric_constraints", R.boolean), o.pair("edge_connector", R.string), o.pair("castellated_pads", R.boolean), o.pair("edge_plating", R.boolean), o.collection("layers", "layer", R.item(Gi))));
      }
      static {
        l(this, "Stackup");
      }
    };
    Gi = class {
      static {
        l(this, "StackupLayer");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("layer"), o.positional("name", R.string), o.pair("type", R.string), o.pair("color", R.string), o.pair("thickness", R.number), o.pair("material", R.string), o.pair("epsilon_r", R.number), o.pair("loss_tangent", R.number)));
      }
    };
    p2 = class {
      constructor(e, t) {
        this.parent = t;
        this.locked = false;
        Object.assign(this, V(e, o.start("dimension"), o.atom("locked"), o.pair("type", R.string), o.pair("layer", R.string), o.pair("tstamp", R.string), o.pair("uuid", R.string), o.list("pts", R.vec2), o.pair("height", R.number), o.pair("orientation", R.number), o.pair("leader_length", R.number), o.item("gr_text", Pt, this), o.item("format", Ji), o.item("style", ki)));
      }
      static {
        l(this, "Dimension");
      }
      resolve_text_var(e) {
        return this.parent.resolve_text_var(e);
      }
      get start() {
        return this.pts.at(0) ?? new d(0, 0);
      }
      get end() {
        return this.pts.at(-1) ?? new d(0, 0);
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
    };
    Ji = class {
      constructor(e) {
        this.suppress_zeroes = false;
        Object.assign(this, V(e, o.start("format"), o.pair("prefix", R.string), o.pair("suffix", R.string), o.pair("units", R.number), o.pair("units_format", R.number), o.pair("precision", R.number), o.pair("override_value", R.string), o.atom("suppress_zeroes")));
      }
      static {
        l(this, "DimensionFormat");
      }
    };
    ki = class {
      static {
        l(this, "DimensionStyle");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("style"), o.pair("thickness", R.number), o.pair("arrow_length", R.number), o.pair("text_position_mode", R.number), o.pair("extension_height", R.number), o.pair("text_frame", R.number), o.pair("extension_offset", R.number), o.atom("keep_text_aligned")));
      }
    };
    me = class {
      constructor(e, t) {
        this.parent = t;
        this.locked = false;
        this.placed = false;
        this.attr = { through_hole: false, smd: false, virtual: false, board_only: false, exclude_from_pos_files: false, exclude_from_bom: false, allow_solder_mask_bridges: false, allow_missing_courtyard: false };
        this.properties = {};
        this.drawings = [];
        this.pads = [];
        this.#e = /* @__PURE__ */ new Map();
        this.zones = [];
        this.models = [];
        this.embedded_fonts = false;
        this.embedded_files = [];
        Object.assign(this, V(e, o.start("footprint"), o.positional("library_link", R.string), o.pair("version", R.number), o.pair("generator", R.string), o.atom("locked"), o.atom("placed"), o.pair("layer", R.string), o.pair("tedit", R.string), o.pair("tstamp", R.string), o.pair("uuid", R.string), o.pair("sheetname", R.string), o.pair("sheetfile", R.string), o.item("at", E), o.pair("descr", R.string), o.pair("tags", R.string), o.pair("path", R.string), o.pair("autoplace_cost90", R.number), o.pair("autoplace_cost180", R.number), o.pair("solder_mask_margin", R.number), o.pair("solder_paste_margin", R.number), o.pair("solder_paste_ratio", R.number), o.pair("clearance", R.number), o.pair("zone_connect", R.number), o.pair("thermal_width", R.number), o.pair("thermal_gap", R.number), o.pair("net_tie_pad_groups", R.string), o.object("attr", this.attr, o.atom("through_hole"), o.atom("smd"), o.atom("virtual"), o.atom("board_only"), o.atom("exclude_from_pos_files"), o.atom("exclude_from_bom"), o.atom("allow_solder_mask_bridges"), o.atom("allow_missing_courtyard")), o.dict("properties", "property", R.item(_t, this)), o.collection("drawings", "fp_line", R.item(h2, this)), o.collection("drawings", "fp_circle", R.item(d2, this)), o.collection("drawings", "fp_arc", R.item(m2, this)), o.collection("drawings", "fp_poly", R.item(_2, this)), o.collection("drawings", "fp_rect", R.item(b2, this)), o.collection("drawings", "fp_text", R.item(De, this)), o.collection("zones", "zone", R.item(mt, this)), o.collection("models", "model", R.item($i)), o.collection("pads", "pad", R.item(f2, this)), o.pair("embedded_fonts", R.boolean), o.list("embedded_files", R.item(Ke))));
        for (let i of this.pads) this.#e.set(i.number, i);
        for (let i of this.drawings) i instanceof De && (i.type == "reference" && (this.reference = i.text), i.type == "value" && (this.value = i.text));
        for (let [i, s] of Object.entries(this.properties)) this.reference === void 0 && i == "Reference" && (this.reference = s.value), this.value === void 0 && i == "Value" && (this.value = s.value);
      }
      static {
        l(this, "Footprint");
      }
      #e;
      #t;
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      *items() {
        yield* this.drawings ?? [], yield* this.zones ?? [], yield* this.pads.values() ?? [], yield* Object.values(this.properties).filter((e) => e.has_symbol_prop);
      }
      resolve_text_var(e) {
        switch (e) {
          case "REFERENCE":
            return this.reference;
          case "VALUE":
            return this.value;
          case "LAYER":
            return this.layer;
          case "FOOTPRINT_LIBRARY":
            return this.library_link.split(":").at(0);
          case "FOOTPRINT_NAME":
            return this.library_link.split(":").at(-1);
        }
        let t = /^(NET_NAME|NET_CLASS|PIN_NAME)\(.+?\)$/.exec(e);
        if (t?.length == 3) {
          let [i, s, n] = t;
          switch (s) {
            case "NET_NAME":
              return this.pad_by_number(n)?.net.number.toString();
            case "NET_CLASS":
              return this.pad_by_number(n)?.net.name;
            case "PIN_NAME":
              return this.pad_by_number(n)?.pinfunction;
          }
        }
        return this.properties[e] !== void 0 ? this.properties[e].value : this.parent.resolve_text_var(e);
      }
      pad_by_number(e) {
        return this.#e.get(e);
      }
      get bbox() {
        if (!this.#t) {
          let e = new O(this.at.position.x - 0.25, this.at.position.y - 0.25, 0.5, 0.5), t = F.translation(this.at.position.x, this.at.position.y).rotate_self(P.deg_to_rad(this.at.rotation));
          for (let i of this.drawings) i instanceof De || i instanceof _t || (e = O.combine([e, i.bbox.transform(t)]));
          e.context = this, this.#t = e;
        }
        return this.#t;
      }
    };
    _t = class {
      constructor(e, t) {
        this.parent = t;
        this.id = 0;
        this.unlocked = false;
        this.hide = false;
        this.at = new E();
        this.effects = new H();
        this.layer = "F.SilkS";
        e instanceof Array && e.length > 3 ? (this.has_symbol_prop = true, Object.assign(this, V(e, o.positional("value", R.string), o.pair("id", R.number), o.item("at", E), o.pair("layer", R.string), o.pair("uuid", R.string), o.atom("unlocked"), o.atom("hide"), o.item("effects", H)))) : (this.has_symbol_prop = false, Object.assign(this, V(e, o.positional("value", R.string))));
      }
      static {
        l(this, "SymbolProperty");
      }
      get shown_text() {
        return Ye(this.value, this.parent);
      }
      get unique_id() {
        return this.uuid;
      }
    };
    Ee = class {
      constructor() {
        this.locked = false;
        this.stroke = D.default_value();
      }
      static {
        l(this, "GraphicItem");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      get stroke_params() {
        let e;
        this.parent instanceof de ? e = this.parent : this.parent instanceof me && (e = this.parent.parent);
        let t = e?.setup?.pcbplotparams;
        return { stroke: this.stroke, dashed_line_gap_ratio: t?.dashed_line_gap_ratio ?? 3, dashed_line_dash_ratio: t?.dashed_line_dash_ratio ?? 12 };
      }
      get bbox() {
        return new O(0, 0, 0, 0);
      }
    };
    c3 = class extends Ee {
      constructor(t, i) {
        super();
        this.parent = i;
        let s = this.constructor;
        Object.assign(this, V(t, o.start(s.expr_start), o.atom("locked"), o.pair("layer", R.string), o.vec2("start"), o.vec2("end"), o.pair("width", R.number), o.pair("uuid", R.string), o.pair("tstamp", R.string), o.item("stroke", D))), this.width ??= this.stroke?.width || 0;
      }
      static {
        l(this, "Line");
      }
      static {
        this.expr_start = "unset";
      }
      get bbox() {
        return O.from_points([this.start, this.end]);
      }
    };
    bt = class extends c3 {
      static {
        l(this, "GrLine");
      }
      static {
        this.expr_start = "gr_line";
      }
    };
    h2 = class extends c3 {
      static {
        l(this, "FpLine");
      }
      static {
        this.expr_start = "fp_line";
      }
    };
    R3 = class extends Ee {
      constructor(t, i) {
        super();
        this.parent = i;
        let s = this.constructor;
        Object.assign(this, V(t, o.start(s.expr_start), o.atom("locked"), o.vec2("center"), o.vec2("end"), o.pair("width", R.number), o.pair("fill", R.string), o.pair("layer", R.string), o.pair("uuid", R.string), o.pair("tstamp", R.string), o.item("stroke", D))), this.width ??= this.stroke?.width || 0;
      }
      static {
        l(this, "Circle");
      }
      static {
        this.expr_start = "unset";
      }
      get bbox() {
        let t = this.center.sub(this.end).magnitude, i = new d(t, t);
        return O.from_points([this.center.sub(i), this.center.add(i)]);
      }
    };
    ft = class extends R3 {
      static {
        l(this, "GrCircle");
      }
      static {
        this.expr_start = "gr_circle";
      }
    };
    d2 = class extends R3 {
      static {
        l(this, "FpCircle");
      }
      static {
        this.expr_start = "fp_circle";
      }
    };
    u3 = class extends Ee {
      constructor(t, i) {
        super();
        this.parent = i;
        let s = this.constructor, n = V(t, o.start(s.expr_start), o.atom("locked"), o.pair("layer", R.string), o.vec2("start"), o.vec2("mid"), o.vec2("end"), o.pair("angle", R.number), o.pair("width", R.number), o.pair("uuid", R.string), o.pair("tstamp", R.string), o.item("stroke", D));
        if (n.angle !== void 0) {
          let a = P.from_degrees(n.angle).normalize720(), c = n.start, u = n.end, h = a.negative().rotate_point(u, c);
          a.degrees < 0 && ([u, h] = [h, u]), this.#e = q.from_center_start_end(c, u, h, n.width), n.start = this.#e.start_point, n.mid = this.#e.mid_point, n.end = this.#e.end_point, delete n.angle;
        } else this.#e = q.from_three_points(n.start, n.mid, n.end, n.width);
        Object.assign(this, n), this.width ??= this.stroke?.width ?? this.#e.width, this.#e.width = this.width;
      }
      static {
        l(this, "Arc");
      }
      static {
        this.expr_start = "unset";
      }
      #e;
      get arc() {
        return this.#e;
      }
      get bbox() {
        return this.arc.bbox;
      }
    };
    Mt = class extends u3 {
      static {
        l(this, "GrArc");
      }
      static {
        this.expr_start = "gr_arc";
      }
    };
    m2 = class extends u3 {
      static {
        l(this, "FpArc");
      }
      static {
        this.expr_start = "fp_arc";
      }
    };
    Ii = class {
      static {
        l(this, "PolyArc");
      }
      #e;
      constructor(e) {
        Object.assign(this, V(e, o.start("arc"), o.vec2("start"), o.vec2("mid"), o.vec2("end"))), this.#e = q.from_three_points(this.start, this.mid, this.end);
      }
      get arc() {
        return this.#e;
      }
      get bbox() {
        return this.#e.bbox;
      }
    };
    We = class extends Ee {
      constructor(t, i) {
        super();
        this.parent = i;
        let s = this.constructor;
        Object.assign(this, V(t, o.start(s.expr_start), o.atom("locked"), o.pair("layer", R.string), o.atom("island"), o.list("pts", R.choice(["xy", R.vec2], ["arc", R.item(Ii)])), o.pair("width", R.number), o.pair("fill", R.string), o.pair("uuid", R.string), o.pair("tstamp", R.string), o.item("stroke", D))), this.width ??= this.stroke?.width || 0, this.#e = this.pts.flatMap((n) => n instanceof d ? [n] : n.arc.to_polyline());
      }
      static {
        l(this, "Poly");
      }
      static {
        this.expr_start = "polygon";
      }
      #e;
      get polyline() {
        return this.#e;
      }
      get bbox() {
        return O.from_points(this.#e);
      }
    };
    Ai = class extends We {
      static {
        l(this, "FilledPolygon");
      }
      static {
        this.expr_start = "filled_polygon";
      }
    };
    Nt = class extends We {
      static {
        l(this, "GrPoly");
      }
      static {
        this.expr_start = "gr_poly";
      }
    };
    _2 = class extends We {
      static {
        l(this, "FpPoly");
      }
      static {
        this.expr_start = "fp_poly";
      }
    };
    p3 = class extends Ee {
      constructor(t, i) {
        super();
        this.parent = i;
        let s = this.constructor;
        Object.assign(this, V(t, o.start(s.expr_start), o.atom("locked"), o.vec2("start"), o.vec2("end"), o.pair("layer", R.string), o.pair("width", R.number), o.pair("fill", R.string), o.pair("uuid", R.string), o.pair("tstamp", R.string), o.item("stroke", D))), this.width ??= this.stroke?.width || 0;
      }
      static {
        l(this, "Rect");
      }
      static {
        this.expr_start = "rect";
      }
      get bbox() {
        return O.from_points([this.start, this.end]);
      }
    };
    gt = class extends p3 {
      static {
        l(this, "GrRect");
      }
      static {
        this.expr_start = "gr_rect";
      }
    };
    b2 = class extends p3 {
      static {
        l(this, "FpRect");
      }
      static {
        this.expr_start = "fp_rect";
      }
    };
    Ci = class {
      static {
        l(this, "TextRenderCache");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("render_cache"), o.positional("text", R.string), o.positional("angle", R.number), o.collection("polygons", "polygon", R.item(We))));
        for (let t of this.polygons) t.fill = "solid";
      }
    };
    Vt = class {
      constructor() {
        this.unlocked = false;
        this.hide = false;
        this.effects = new H();
      }
      static {
        l(this, "Text");
      }
      static {
        this.common_expr_defs = [o.item("at", E), o.atom("hide"), o.atom("unlocked"), o.object("layer", {}, o.positional("name", R.string), o.atom("knockout")), o.pair("tstamp", R.string), o.pair("uuid", R.string), o.item("effects", H), o.item("render_cache", Ci)];
      }
      get shown_text() {
        return Ye(this.text, this.parent);
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
    };
    De = class extends Vt {
      constructor(t, i) {
        super();
        this.parent = i;
        this.locked = false;
        Object.assign(this, V(t, o.start("fp_text"), o.atom("locked"), o.positional("type", R.string), o.positional("text", R.string), ...Vt.common_expr_defs));
      }
      static {
        l(this, "FpText");
      }
    };
    Pt = class extends Vt {
      constructor(t, i) {
        super();
        this.parent = i;
        this.locked = false;
        Object.assign(this, V(t, o.start("gr_text"), o.atom("locked"), o.positional("text", R.string), ...Vt.common_expr_defs));
      }
      static {
        l(this, "GrText");
      }
    };
    f2 = class {
      constructor(e, t) {
        this.parent = t;
        this.type = "thru_hole";
        this.locked = false;
        this.remove_unused_layers = false;
        let i = V(e, o.start("pad"), o.positional("number", R.string), o.positional("type", R.string), o.positional("shape", R.string), o.item("at", E), o.atom("locked"), o.vec2("size"), o.vec2("rect_delta"), o.list("layers", R.string), o.pair("roundrect_rratio", R.number), o.pair("chamfer_ratio", R.number), o.expr("chamfer", R.object({}, o.atom("top_right"), o.atom("top_left"), o.atom("bottom_right"), o.atom("bottom_left"))), o.pair("pinfunction", R.string), o.pair("pintype", R.string), o.pair("solder_mask_margin", R.number), o.pair("solder_paste_margin", R.number), o.pair("solder_paste_margin_ratio", R.number), o.pair("clearance", R.number), o.pair("thermal_width", R.number), o.pair("thermal_gap", R.number), o.pair("thermal_bridge_angle", R.number), o.pair("zone_connect", R.number), o.pair("tstamp", R.string), o.pair("uuid", R.string), o.pair("remove_unused_layers", R.boolean), o.item("drill", Di), o.item("net", l2), o.item("options", Bi), o.expr("primitives", (s, n, a) => V(a, o.start("primitives"), o.collection("items", "gr_line", R.item(bt, this)), o.collection("items", "gr_circle", R.item(ft, this)), o.collection("items", "gr_arc", R.item(Mt, this)), o.collection("items", "gr_rect", R.item(gt, this)), o.collection("items", "gr_poly", R.item(Nt, this)))?.items));
        Object.assign(this, i);
      }
      static {
        l(this, "Pad");
      }
      get unique_id() {
        return this.uuid ?? this.tstamp;
      }
      get netname() {
        return this.net?.name;
      }
    };
    Di = class {
      constructor(e) {
        this.oval = false;
        this.diameter = 0;
        this.width = 0;
        this.offset = new d(0, 0);
        Object.assign(this, V(e, o.start("drill"), o.atom("oval"), o.positional("diameter", R.number), o.positional("width", R.number), o.vec2("offset")));
      }
      static {
        l(this, "PadDrill");
      }
    };
    Bi = class {
      static {
        l(this, "PadOptions");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("options"), o.pair("clearance", R.string), o.pair("anchor", R.string)));
      }
    };
    $i = class {
      constructor(e) {
        this.hide = false;
        this.opacity = 1;
        Object.assign(this, V(e, o.start("model"), o.positional("filename", R.string), o.atom("hide"), o.pair("opacity", R.number), o.object("offset", {}, o.list("xyz", R.number)), o.object("scale", {}, o.list("xyz", R.number)), o.object("rotate", {}, o.list("xyz", R.number))));
      }
      static {
        l(this, "Model");
      }
    };
    ji = class {
      constructor(e) {
        this.locked = false;
        Object.assign(this, V(e, o.start("group"), o.positional("name", R.string), o.atom("locked"), o.pair("id", R.string), o.pair("uuid", R.string), o.list("members", R.string)));
      }
      static {
        l(this, "Group");
      }
      get unique_id() {
        return this.uuid ?? this.id;
      }
    };
    B = { dangling_symbol_size: 0.3048, unselected_end_size: 0.1016, pin_length: 2.54, pinsymbol_size: 0.635, pinnum_size: 1.27, pinname_size: 1.27, selection_thickness: 0.0762, line_width: 0.1524, wire_width: 0.1524, bus_width: 0.3048, noconnect_size: 1.2192, junction_diameter: 0.9144, target_pin_radius: 0.381, sch_entry_size: 2.54, text_size: 1.27, text_offset_ratio: 0.15, label_size_ratio: 0.375, pin_name_offset: 0.508 };
    _e = class {
      constructor(e, t) {
        this.filename = e;
        this.title_block = new we();
        this.wires = [];
        this.buses = [];
        this.bus_entries = [];
        this.bus_aliases = [];
        this.junctions = [];
        this.net_labels = [];
        this.global_labels = [];
        this.hierarchical_labels = [];
        this.symbols = /* @__PURE__ */ new Map();
        this.no_connects = [];
        this.drawings = [];
        this.rule_areas = [];
        this.netclass_flags = [];
        this.images = [];
        this.sheets = [];
        this.embedded_fonts = false;
        this.embedded_files = [];
        Object.assign(this, V(t, o.start("kicad_sch"), o.pair("version", R.number), o.pair("generator", R.string), o.pair("generator_version", R.string), o.pair("uuid", R.string), o.item("paper", ht), o.item("title_block", we), o.item("lib_symbols", ir, this), o.collection("wires", "wire", R.item(M2)), o.collection("buses", "bus", R.item(N2)), o.collection("bus_entries", "bus_entry", R.item(g2)), o.collection("bus_aliases", "bus_alias", R.item(zi)), o.collection("junctions", "junction", R.item(V2)), o.collection("no_connects", "no_connect", R.item(P2)), o.collection("net_labels", "label", R.item(Z2)), o.collection("global_labels", "global_label", R.item(S2, this)), o.collection("hierarchical_labels", "hierarchical_label", R.item($e, this)), o.mapped_collection("symbols", "symbol", (i) => i.uuid, R.item(re, this)), o.collection("drawings", "polyline", R.item(Be, this)), o.collection("drawings", "rectangle", R.item(St, this)), o.collection("drawings", "arc", R.item(Wt, this)), o.collection("drawings", "text", R.item(Tt, this)), o.collection("drawings", "circle", R.item(Zt, this)), o.collection("rule_areas", "rule_area", R.item(y2, this)), o.collection("netclass_flags", "netclass_flag", R.item(T2, this)), o.collection("images", "image", R.item(er)), o.item("sheet_instances", or), o.item("symbol_instances", lr), o.collection("sheets", "sheet", R.item(ne, this)), o.pair("embedded_fonts", R.boolean), o.list("embedded_files", R.item(Ke)))), this.update_hierarchical_data();
      }
      static {
        l(this, "KicadSch");
      }
      update_hierarchical_data(e) {
        e ??= "";
        let t = this.project?.root_schematic_page?.document?.symbol_instances, i = this.symbol_instances;
        for (let a of this.symbols.values()) {
          let c = `${e}/${a.uuid}`, u = t?.get(c) ?? i?.get(c) ?? a.instances.get(e);
          u && (a.reference = u.reference ?? a.reference, a.value = u.value ?? a.value, a.footprint = u.footprint ?? a.footprint, a.unit = u.unit ?? a.unit);
        }
        let s = this.project?.root_schematic_page?.document?.sheet_instances, n = this.sheet_instances;
        for (let a of this.sheets) {
          let c = `${e}/${a.uuid}`, u = s?.get(c) ?? n?.get(c) ?? a.instances.get(e);
          if (u && (a.page = u.page, a.path = u.path, !a.instances.size)) {
            let h = new d3();
            h.page = u.page, h.path = u.path, a.instances.set("", h);
          }
        }
      }
      *items() {
        yield* this.wires, yield* this.buses, yield* this.bus_entries, yield* this.junctions, yield* this.net_labels, yield* this.global_labels, yield* this.netclass_flags, yield* this.hierarchical_labels, yield* this.no_connects, yield* this.symbols.values(), yield* this.drawings, yield* this.rule_areas, yield* this.images, yield* this.sheets;
      }
      find_symbol(e) {
        if (this.symbols.has(e)) return this.symbols.get(e);
        for (let t of this.symbols.values()) if (t.uuid == e || t.reference == e) return t;
        return null;
      }
      find_sheet(e) {
        for (let t of this.sheets) if (t.uuid == e) return t;
        return null;
      }
      resolve_text_var(e) {
        if (e == "FILENAME") return this.filename;
        if (e.includes(":")) {
          let [t, i] = e.split(":"), s = this.symbols.get(t);
          if (s) return s.resolve_text_var(i);
        }
        return this.title_block.resolve_text_var(e);
      }
    };
    h3 = class {
      static {
        l(this, "Fill");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("fill"), o.pair("type", R.string), o.color()));
      }
    };
    ee = class {
      constructor(e) {
        this.private = false;
        this.parent = e;
      }
      static {
        l(this, "GraphicItem");
      }
      get stroke_params() {
        return { stroke: this.stroke ?? D.default_value(), dashed_line_gap_ratio: 3, dashed_line_dash_ratio: 12 };
      }
      static {
        this.common_expr_defs = [o.atom("private"), o.item("stroke", D), o.item("fill", h3), o.pair("uuid", R.string)];
      }
    };
    M2 = class {
      static {
        l(this, "Wire");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("wire"), o.list("pts", R.vec2), o.item("stroke", D), o.pair("uuid", R.string)));
      }
    };
    N2 = class {
      static {
        l(this, "Bus");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("bus"), o.list("pts", R.vec2), o.item("stroke", D), o.pair("uuid", R.string)));
      }
    };
    g2 = class {
      static {
        l(this, "BusEntry");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("bus_entry"), o.item("at", E), o.vec2("size"), o.item("stroke", D), o.pair("uuid", R.string)));
      }
    };
    zi = class {
      constructor(e) {
        this.members = [];
        Object.assign(this, V(e, o.start("bus_alias"), o.list("members", R.string)));
      }
      static {
        l(this, "BusAlias");
      }
    };
    V2 = class {
      static {
        l(this, "Junction");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("junction"), o.item("at", E), o.pair("diameter", R.number), o.color(), o.pair("uuid", R.string)));
      }
    };
    P2 = class {
      static {
        l(this, "NoConnect");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("no_connect"), o.item("at", E), o.pair("uuid", R.string)));
      }
    };
    Wt = class extends ee {
      static {
        l(this, "Arc");
      }
      constructor(e, t) {
        super(t);
        let i = V(e, o.start("arc"), o.vec2("start"), o.vec2("mid"), o.vec2("end"), o.object("radius", {}, o.start("radius"), o.vec2("at"), o.pair("length"), o.vec2("angles")), ...ee.common_expr_defs);
        if (i.radius?.length) {
          let s = q.from_center_start_end(i.radius.at, i.end, i.start, 1);
          s.arc_angle.degrees > 180 && ([s.start_angle, s.end_angle] = [s.end_angle, s.start_angle]), i.start = s.start_point, i.mid = s.mid_point, i.end = s.end_point;
        }
        delete i.radius, Object.assign(this, i);
      }
    };
    qi = class extends ee {
      static {
        l(this, "Bezier");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("bezier"), o.list("pts", R.vec2), ...ee.common_expr_defs));
      }
      get start() {
        return this.pts[0];
      }
      get c1() {
        return this.pts[1];
      }
      get c2() {
        return this.pts[2];
      }
      get end() {
        return this.pts[3];
      }
    };
    Zt = class extends ee {
      static {
        l(this, "Circle");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("circle"), o.vec2("center"), o.pair("radius", R.number), ...ee.common_expr_defs));
      }
    };
    Be = class extends ee {
      static {
        l(this, "Polyline");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("polyline"), o.list("pts", R.vec2), ...ee.common_expr_defs));
      }
    };
    St = class extends ee {
      static {
        l(this, "Rectangle");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("rectangle"), o.vec2("start"), o.vec2("end"), ...ee.common_expr_defs));
      }
    };
    er = class {
      static {
        l(this, "Image");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("image"), o.item("at", E), o.pair("data", R.string), o.pair("uuid", R.string)));
      }
    };
    Tt = class {
      constructor(e, t) {
        this.parent = t;
        this.private = false;
        this.effects = new H();
        Object.assign(this, V(e, o.start("text"), o.positional("text"), o.item("at", E), o.item("effects", H), o.pair("uuid", R.string))), this.text.endsWith(`
`) && (this.text = this.text.slice(0, this.text.length - 1));
      }
      static {
        l(this, "Text");
      }
      get shown_text() {
        return Ye(this.text, this.parent);
      }
    };
    W2 = class extends Tt {
      constructor(t, i) {
        super(t, i);
        this.parent = i;
        (i instanceof yt || i instanceof re) && (this.at.rotation /= 10);
      }
      static {
        l(this, "LibText");
      }
    };
    tr = class extends ee {
      constructor(t, i) {
        super(i);
        this.effects = new H();
        Object.assign(this, V(t, o.start("text"), o.positional("text"), o.item("at", E), o.vec2("size"), o.item("effects", H), ...ee.common_expr_defs));
      }
      static {
        l(this, "TextBox");
      }
    };
    be = class {
      constructor() {
        this.private = false;
        this.at = new E();
        this.effects = new H();
        this.fields_autoplaced = false;
      }
      static {
        l(this, "Label");
      }
      static {
        this.common_expr_defs = [o.positional("text"), o.item("at", E), o.item("effects", H), o.atom("fields_autoplaced"), o.pair("uuid", R.string)];
      }
      get shown_text() {
        return Ui(this.text);
      }
    };
    Z2 = class extends be {
      static {
        l(this, "NetLabel");
      }
      constructor(e) {
        super(), Object.assign(this, V(e, o.start("label"), ...be.common_expr_defs));
      }
    };
    S2 = class extends be {
      constructor(t) {
        super();
        this.shape = "input";
        this.properties = [];
        Object.assign(this, V(t, o.start("global_label"), ...be.common_expr_defs, o.pair("shape", R.string), o.collection("properties", "property", R.item(Ze))));
      }
      static {
        l(this, "GlobalLabel");
      }
    };
    $e = class extends be {
      constructor(t) {
        super();
        this.shape = "input";
        t && Object.assign(this, V(t, o.start("hierarchical_label"), ...be.common_expr_defs, o.pair("shape", R.string)));
      }
      static {
        l(this, "HierarchicalLabel");
      }
    };
    T2 = class extends be {
      constructor(t, i) {
        super();
        this.parent = i;
        this.properties = [];
        Object.assign(this, V(t, o.start("netclass_flag"), ...be.common_expr_defs, o.pair("shape", R.string), o.pair("length", R.number), o.collection("properties", "property", R.item(Ze, this))));
      }
      static {
        l(this, "DirectiveLabel");
      }
    };
    ir = class {
      constructor(e, t) {
        this.parent = t;
        this.symbols = [];
        this.#e = /* @__PURE__ */ new Map();
        Object.assign(this, V(e, o.start("lib_symbols"), o.collection("symbols", "symbol", R.item(yt, t))));
        for (let i of this.symbols) this.#e.set(i.name, i);
      }
      static {
        l(this, "LibSymbols");
      }
      #e;
      by_name(e) {
        return this.#e.get(e);
      }
    };
    yt = class r25 {
      constructor(e, t) {
        this.parent = t;
        this.power = false;
        this.pin_numbers = { hide: false };
        this.pin_names = { offset: B.pin_name_offset, hide: false };
        this.in_bom = false;
        this.on_board = false;
        this.in_pos_files = true;
        this.exclude_from_sim = false;
        this.duplicate_pin_numbers_are_jumpers = false;
        this.properties = /* @__PURE__ */ new Map();
        this.children = [];
        this.drawings = [];
        this.pins = [];
        this.units = /* @__PURE__ */ new Map();
        this.embedded_fonts = false;
        this.embedded_files = [];
        this.#e = /* @__PURE__ */ new Map();
        this.#t = /* @__PURE__ */ new Map();
        Object.assign(this, V(e, o.start("symbol"), o.positional("name"), o.atom("power"), o.object("pin_numbers", this.pin_numbers, o.atom("hide")), o.object("pin_names", this.pin_names, o.pair("offset", R.number), o.atom("hide")), o.pair("in_bom", R.boolean), o.pair("on_board", R.boolean), o.pair("in_pos_files", R.boolean), o.pair("duplicate_pin_numbers_are_jumpers", R.boolean), o.pair("exclude_from_sim", R.boolean), o.mapped_collection("properties", "property", (i) => i.name, R.item(Ze, this)), o.collection("pins", "pin", R.item(rr, this)), o.collection("children", "symbol", R.item(r25, this)), o.collection("drawings", "arc", R.item(Wt, this)), o.collection("drawings", "bezier", R.item(qi, this)), o.collection("drawings", "circle", R.item(Zt, this)), o.collection("drawings", "polyline", R.item(Be, this)), o.collection("drawings", "rectangle", R.item(St, this)), o.collection("drawings", "text", R.item(W2, this)), o.collection("drawings", "textbox", R.item(tr, this)), o.pair("embedded_fonts", R.boolean), o.collection("embedded_files", "file", R.item(Ke))));
        for (let i of this.pins) this.#e.set(i.number.text, i);
        for (let i of this.properties.values()) this.#t.set(i.id, i);
        for (let i of this.children) {
          let s = i.unit;
          if (s !== null) {
            let n = this.units.get(s) ?? [];
            n.push(i), this.units.set(s, n);
          }
        }
      }
      static {
        l(this, "LibSymbol");
      }
      #e;
      #t;
      get root() {
        return this.parent instanceof r25 ? this.parent.root : this;
      }
      has_pin(e) {
        return this.#e.has(e);
      }
      pin_by_number(e, t = 1) {
        if (this.has_pin(e)) return this.#e.get(e);
        for (let i of this.children) if ((i.style == 0 || i.style == t) && i.has_pin(e)) return i.pin_by_number(e);
        throw new Error(`No pin numbered ${e} on library symbol ${this.name}`);
      }
      has_property_with_id(e) {
        return this.#t.has(e);
      }
      property_by_id(e) {
        if (this.#t.has(e)) return this.#t.get(e);
        for (let t of this.children) if (t.has_property_with_id(e)) return t.property_by_id(e);
        return null;
      }
      get library_name() {
        return this.name.includes(":") ? this.name.split(":").at(0) : "";
      }
      get library_item_name() {
        return this.name.includes(":") ? this.name.split(":").at(1) : "";
      }
      get unit_count() {
        let e = this.units.size;
        return this.units.has(0) && (e -= 1), e;
      }
      get unit() {
        let e = this.name.split("_");
        return e.length < 3 ? 0 : parseInt(e.at(-2), 10);
      }
      get style() {
        let e = this.name.split("_");
        return e.length < 3 ? 0 : parseInt(e.at(-1), 10);
      }
      get description() {
        return this.properties.get("ki_description")?.text ?? "";
      }
      get keywords() {
        return this.properties.get("ki_keywords")?.text ?? "";
      }
      get footprint_filters() {
        return this.properties.get("ki_fp_filters")?.text ?? "";
      }
      get units_interchangable() {
        return !this.properties.get("ki_locked")?.text;
      }
      resolve_text_var(e) {
        return this.parent?.resolve_text_var(e);
      }
    };
    Ze = class {
      constructor(e, t) {
        this.parent = t;
        this.hide = false;
        this.show_name = false;
        this.do_not_autoplace = false;
        let i = V(e, o.start("property"), o.positional("name", R.string), o.positional("text", R.string), o.pair("id", R.number), o.pair("hide", R.boolean), o.item("at", E), o.item("effects", H), o.atom("show_name"), o.atom("do_not_autoplace"));
        this.#e = i.effects, delete i.effects, this.hide = this.hide || (this.#e?.hide ?? false), Object.assign(this, i);
      }
      static {
        l(this, "Property");
      }
      #e;
      get effects() {
        return this.#e ? this.#e : (this.parent instanceof re ? this.#e = new H() : n2(`Couldn't determine Effects for Property ${this.name}`), this.#e);
      }
      set effects(e) {
        this.#e = e;
      }
      get shown_text() {
        return Ye(this.text, this.parent);
      }
    };
    rr = class {
      constructor(e, t) {
        this.parent = t;
        this.hide = false;
        this.name = { text: "", effects: new H() };
        this.number = { text: "", effects: new H() };
        Object.assign(this, V(e, o.start("pin"), o.positional("type", R.string), o.positional("shape", R.string), o.atom("hide"), o.item("at", E), o.pair("length", R.number), o.object("name", this.name, o.positional("text", R.string), o.item("effects", H)), o.object("number", this.number, o.positional("text", R.string), o.item("effects", H)), o.collection("alternates", "alternate", R.item(sr))));
      }
      static {
        l(this, "PinDefinition");
      }
      get unit() {
        return this.parent.unit;
      }
    };
    sr = class {
      static {
        l(this, "PinAlternate");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("alternate"), o.positional("name"), o.positional("type", R.string), o.positional("shaped", R.string)));
      }
    };
    y2 = class {
      constructor(e, t) {
        this.parent = t;
        Object.assign(this, V(e, o.start("rule_area"), o.item("polyline", Be)));
      }
      static {
        l(this, "RuleArea");
      }
    };
    re = class {
      constructor(e, t) {
        this.parent = t;
        this.in_bom = false;
        this.on_board = false;
        this.exclude_from_sim = false;
        this.dnp = false;
        this.fields_autoplaced = false;
        this.properties = /* @__PURE__ */ new Map();
        this.pins = [];
        this.instances = /* @__PURE__ */ new Map();
        let i = V(e, o.start("symbol"), o.pair("lib_name", R.string), o.pair("lib_id", R.string), o.item("at", E), o.pair("mirror", R.string), o.pair("unit", R.number), o.pair("convert", R.number), o.pair("in_bom", R.boolean), o.pair("on_board", R.boolean), o.pair("exclude_from_sim", R.boolean), o.pair("dnp", R.boolean), o.atom("fields_autoplaced"), o.pair("uuid", R.string), o.mapped_collection("properties", "property", (n) => n.name, R.item(Ze, this)), o.collection("pins", "pin", R.item(L2, this)), o.object("default_instance", this.default_instance, o.pair("reference", R.string), o.pair("unit", R.string), o.pair("value", R.string), o.pair("footprint", R.string)), o.object("instances", {}, o.collection("projects", "project", R.object(null, o.start("project"), o.positional("name", R.string), o.collection("paths", "path", R.object(null, o.start("path"), o.positional("path"), o.pair("reference", R.string), o.pair("value", R.string), o.pair("unit", R.number), o.pair("footprint", R.string))))))), s = i.instances;
        delete i.instances, Object.assign(this, i);
        for (let n of s?.projects ?? []) for (let a of n?.paths ?? []) {
          let c = new nr();
          c.path = a.path, c.reference = a.reference, c.value = a.value, c.unit = a.unit, c.footprint = a.footprint, this.instances.set(c.path, c);
        }
        this.get_property_text("Value") == null && this.set_property_text("Value", this.default_instance.value), !this.get_property_text("Footprint") == null && this.set_property_text("Footprint", this.default_instance.footprint);
      }
      static {
        l(this, "SchematicSymbol");
      }
      get lib_symbol() {
        return this.parent.lib_symbols.by_name(this.lib_name ?? this.lib_id);
      }
      get_property_text(e) {
        return this.properties.get(e)?.text;
      }
      set_property_text(e, t) {
        let i = this.properties.get(e);
        i && (i.text = t);
      }
      get reference() {
        return this.get_property_text("Reference") ?? "?";
      }
      set reference(e) {
        this.set_property_text("Reference", e);
      }
      get value() {
        return this.get_property_text("Value") ?? "";
      }
      set value(e) {
        this.set_property_text("Value", e);
      }
      get footprint() {
        return this.get_property_text("Footprint") ?? "";
      }
      set footprint(e) {
        this.set_property_text("Footprint", e);
      }
      get unit_suffix() {
        if (!this.unit || this.lib_symbol.unit_count <= 1) return "";
        let e = 65, t = this.unit, i = "";
        do {
          let s = (t - 1) % 26;
          i = String.fromCharCode(e + s) + i, t = Math.trunc((t - s) / 26);
        } while (t > 0);
        return i;
      }
      get unit_pins() {
        return this.pins.filter((e) => !(this.unit && e.unit && this.unit != e.unit));
      }
      resolve_text_var(e) {
        if (this.properties.has(e)) return this.properties.get(e)?.shown_text;
        switch (e) {
          case "REFERENCE":
            return this.reference;
          case "VALUE":
            return this.value;
          case "FOOTPRINT":
            return this.footprint;
          case "DATASHEET":
            return this.properties.get("Datasheet")?.name;
          case "FOOTPRINT_LIBRARY":
            return this.footprint.split(":").at(0);
          case "FOOTPRINT_NAME":
            return this.footprint.split(":").at(-1);
          case "UNIT":
            return this.unit_suffix;
          case "SYMBOL_LIBRARY":
            return this.lib_symbol.library_name;
          case "SYMBOL_NAME":
            return this.lib_symbol.library_item_name;
          case "SYMBOL_DESCRIPTION":
            return this.lib_symbol.description;
          case "SYMBOL_KEYWORDS":
            return this.lib_symbol.keywords;
          case "EXCLUDE_FROM_BOM":
            return this.in_bom ? "" : "Excluded from BOM";
          case "EXCLUDE_FROM_BOARD":
            return this.on_board ? "" : "Excluded from board";
          case "DNP":
            return this.dnp ? "DNP" : "";
        }
        return this.parent.resolve_text_var(e);
      }
    };
    nr = class {
      static {
        l(this, "SchematicSymbolInstance");
      }
      constructor() {
      }
    };
    L2 = class {
      constructor(e, t) {
        this.parent = t;
        Object.assign(this, V(e, o.start("pin"), o.positional("number", R.string), o.pair("uuid", R.string), o.pair("alternate", R.string)));
      }
      static {
        l(this, "PinInstance");
      }
      get definition() {
        return this.parent.lib_symbol.pin_by_number(this.number, this.parent.convert);
      }
      get unit() {
        return this.definition.unit;
      }
    };
    or = class {
      constructor(e) {
        this.sheet_instances = /* @__PURE__ */ new Map();
        Object.assign(this, V(e, o.start("sheet_instances"), o.mapped_collection("sheet_instances", "path", (t) => t.path, R.item(ar))));
      }
      static {
        l(this, "SheetInstances");
      }
      get(e) {
        return this.sheet_instances.get(e);
      }
    };
    ar = class {
      static {
        l(this, "SheetInstance");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("path"), o.positional("path", R.string), o.pair("page", R.string)));
      }
    };
    lr = class {
      constructor(e) {
        this.symbol_instances = /* @__PURE__ */ new Map();
        Object.assign(this, V(e, o.start("symbol_instances"), o.mapped_collection("symbol_instances", "path", (t) => t.path, R.item(cr))));
      }
      static {
        l(this, "SymbolInstances");
      }
      get(e) {
        return this.symbol_instances.get(e);
      }
    };
    cr = class {
      static {
        l(this, "SymbolInstance");
      }
      constructor(e) {
        Object.assign(this, V(e, o.start("path"), o.positional("path", R.string), o.pair("reference", R.string), o.pair("unit", R.number), o.pair("value", R.string), o.pair("footprint", R.string)));
      }
    };
    ne = class {
      constructor(e, t) {
        this.parent = t;
        this.properties = /* @__PURE__ */ new Map();
        this.pins = [];
        this.instances = /* @__PURE__ */ new Map();
        let i = V(e, o.start("sheet"), o.item("at", E), o.vec2("size"), o.item("stroke", D), o.item("fill", h3), o.pair("fields_autoplaced", R.boolean), o.pair("uuid", R.string), o.mapped_collection("properties", "property", (n) => n.name, R.item(Ze, this)), o.collection("pins", "pin", R.item(Rr, this)), o.object("instances", {}, o.collection("projects", "project", R.object(null, o.start("project"), o.positional("name", R.string), o.collection("paths", "path", R.object(null, o.start("path"), o.positional("path"), o.pair("page", R.string))))))), s = i.instances;
        delete i.instances, Object.assign(this, i);
        for (let n of s?.projects ?? []) for (let a of n?.paths ?? []) {
          let c = new d3();
          c.path = a.path, c.page = a.page, this.instances.set(c.path, c);
        }
      }
      static {
        l(this, "SchematicSheet");
      }
      get_property_text(e) {
        return this.properties.get(e)?.text;
      }
      get sheetname() {
        return this.get_property_text("Sheetname") ?? this.get_property_text("Sheet name");
      }
      get sheetfile() {
        return this.get_property_text("Sheetfile") ?? this.get_property_text("Sheet file");
      }
      resolve_text_var(e) {
        return this.parent?.resolve_text_var(e);
      }
    };
    Rr = class {
      constructor(e, t) {
        this.parent = t;
        Object.assign(this, V(e, o.start("pin"), o.positional("name", R.string), o.positional("shape", R.string), o.item("at", E), o.item("effects", H), o.pair("uuid", R.string)));
      }
      static {
        l(this, "SchematicSheetPin");
      }
    };
    d3 = class {
      static {
        l(this, "SchematicSheetInstance");
      }
    };
    nn = `(kicad_wks (version 20210606) (generator pl_editor)
  (setup
    (textsize 1.5 1.5) (linewidth 0.15) (textlinewidth 0.15)
    (left_margin 10) (right_margin 10) (top_margin 10) (bottom_margin 10))
  (rect (name "") (start 110 34) (end 2 2) (comment "rect around the title block"))
  (rect (name "") (start 0 0 ltcorner) (end 0 0) (repeat 2) (incrx 2) (incry 2))
  (line (name "") (start 50 2 ltcorner) (end 50 0 ltcorner) (repeat 30) (incrx 50))
  (tbtext "1" (name "") (pos 25 1 ltcorner) (font (size 1.3 1.3)) (repeat 100) (incrx 50))
  (line (name "") (start 50 2 lbcorner) (end 50 0 lbcorner) (repeat 30) (incrx 50))
  (tbtext "1" (name "") (pos 25 1 lbcorner) (font (size 1.3 1.3)) (repeat 100) (incrx 50))
  (line (name "") (start 0 50 ltcorner) (end 2 50 ltcorner) (repeat 30) (incry 50))
  (tbtext "A" (name "") (pos 1 25 ltcorner) (font (size 1.3 1.3)) (justify center) (repeat 100) (incry 50))
  (line (name "") (start 0 50 rtcorner) (end 2 50 rtcorner) (repeat 30) (incry 50))
  (tbtext "A" (name "") (pos 1 25 rtcorner) (font (size 1.3 1.3)) (justify center) (repeat 100) (incry 50))
  (tbtext "Date: \${ISSUE_DATE}" (name "") (pos 87 6.9))
  (line (name "") (start 110 5.5) (end 2 5.5))
  (tbtext "\${KICAD_VERSION}" (name "") (pos 109 4.1) (comment "KiCad version"))
  (line (name "") (start 110 8.5) (end 2 8.5))
  (tbtext "Rev: \${REVISION}" (name "") (pos 24 6.9) (font bold))
  (tbtext "Size: \${PAPER}" (name "") (pos 109 6.9) (comment "Paper format name"))
  (tbtext "Id: \${#}/\${##}" (name "") (pos 24 4.1) (comment "Sheet id"))
  (line (name "") (start 110 12.5) (end 2 12.5))
  (tbtext "Title: \${TITLE}" (name "") (pos 109 10.7) (font (size 2 2) bold italic))
  (tbtext "File: \${FILENAME}" (name "") (pos 109 14.3))
  (line (name "") (start 110 18.5) (end 2 18.5))
  (tbtext "Sheet: \${SHEETPATH}" (name "") (pos 109 17))
  (tbtext "\${COMPANY}" (name "") (pos 109 20) (font bold) (comment "Company name"))
  (tbtext "\${COMMENT1}" (name "") (pos 109 23) (comment "Comment 0"))
  (tbtext "\${COMMENT2}" (name "") (pos 109 26) (comment "Comment 1"))
  (tbtext "\${COMMENT3}" (name "") (pos 109 29) (comment "Comment 2"))
  (tbtext "\${COMMENT4}" (name "") (pos 109 32) (comment "Comment 3"))
  (line (name "") (start 90 8.5) (end 90 5.5))
  (line (name "") (start 26 8.5) (end 26 2))
)
`;
    X2 = class r26 {
      constructor(e) {
        this.setup = new _3();
        this.drawings = [];
        Object.assign(this, V(e, o.start("kicad_wks"), o.pair("version", R.number), o.pair("generator", R.string), o.item("setup", _3), o.collection("drawings", "line", R.item(O2, this)), o.collection("drawings", "rect", R.item(Lt, this)), o.collection("drawings", "polygon", R.item(ur, this)), o.collection("drawings", "bitmap", R.item(pr, this)), o.collection("drawings", "tbtext", R.item(F2, this))));
      }
      static {
        l(this, "DrawingSheet");
      }
      static default() {
        return new r26(nn);
      }
      *items() {
        yield new Lt(`(rect (name "") (start ${-this.setup.left_margin} ${-this.setup.right_margin} ltcorner) (end ${-this.setup.right_margin} ${-this.setup.bottom_margin} rbcorner) (comment "page outline"))`, this), yield* this.drawings;
      }
      get paper() {
        return this.document?.paper;
      }
      get width() {
        return this.paper?.width ?? 297;
      }
      get height() {
        return this.paper?.height ?? 210;
      }
      get size() {
        return new d(this.width, this.height);
      }
      get top_left() {
        return new d(this.setup.left_margin, this.setup.top_margin);
      }
      get top_right() {
        return new d(this.width - this.setup.right_margin, this.setup?.top_margin);
      }
      get bottom_right() {
        return new d(this.width - this.setup.right_margin, this.height - this.setup.bottom_margin);
      }
      get bottom_left() {
        return new d(this.setup.left_margin, this.height - this.setup.bottom_margin);
      }
      get margin_bbox() {
        return O.from_points([this.top_left, this.bottom_right]);
      }
      get page_bbox() {
        return O.from_corners(0, 0, this.width, this.height);
      }
      resolve_text_var(e) {
        switch (e) {
          case "PAPER":
            return this.paper?.size || "";
          case "#":
            return "1";
          case "##":
            return "1";
          case "SHEETPATH":
            return "/";
          case "KICAD_VERSION":
            return "KiCanvas Alpha";
        }
        return this.document?.resolve_text_var(e);
      }
    };
    _3 = class {
      constructor(e) {
        this.linewidth = 0.15;
        this.textsize = new d(1.5, 1.5);
        this.textlinewidth = 0.15;
        this.top_margin = 10;
        this.left_margin = 10;
        this.bottom_margin = 10;
        this.right_margin = 10;
        e && Object.assign(this, V(e, o.start("setup"), o.pair("linewidth", R.number), o.vec2("textsize"), o.pair("textlinewidth", R.number), o.pair("top_margin", R.number), o.pair("left_margin", R.number), o.pair("bottom_margin", R.number), o.pair("right_margin", R.number)));
      }
      static {
        l(this, "Setup");
      }
    };
    Se = class {
      constructor(e) {
        this.position = new d(0, 0);
        this.anchor = "rbcorner";
        let t = V(e, o.positional("start_token"), o.positional("x", R.number), o.positional("y", R.number), o.positional("anchor", R.string));
        this.position.x = t.x, this.position.y = t.y, this.anchor = t.anchor ?? this.anchor;
      }
      static {
        l(this, "Coordinate");
      }
    };
    oe = class {
      constructor(e) {
        this.repeat = 1;
        this.incry = 0;
        this.incrx = 0;
        this.parent = e;
      }
      static {
        l(this, "DrawingSheetItem");
      }
      static {
        this.common_expr_defs = [o.pair("name", R.string), o.pair("comment", R.string), o.pair("option", R.string), o.pair("repeat", R.number), o.pair("incrx", R.number), o.pair("incry", R.number), o.pair("linewidth", R.number)];
      }
    };
    O2 = class extends oe {
      static {
        l(this, "Line");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("line"), o.item("start", Se), o.item("end", Se), ...oe.common_expr_defs));
      }
    };
    Lt = class extends oe {
      static {
        l(this, "Rect");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("rect"), o.item("start", Se), o.item("end", Se), ...oe.common_expr_defs));
      }
    };
    ur = class extends oe {
      static {
        l(this, "Polygon");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("polygon"), o.item("pos", Se), o.pair("rotate", R.number), o.list("pts", R.vec2), ...oe.common_expr_defs));
      }
    };
    pr = class extends oe {
      static {
        l(this, "Bitmap");
      }
      constructor(e, t) {
        super(t), Object.assign(this, V(e, o.start("bitmap"), o.item("pos", Se), o.pair("scale", R.number), o.pair("pngdata", R.string), ...oe.common_expr_defs));
      }
    };
    F2 = class extends oe {
      constructor(t, i) {
        super(i);
        this.incrlabel = 1;
        this.rotate = 0;
        Object.assign(this, V(t, o.start("tbtext"), o.positional("text"), o.item("pos", Se), o.pair("incrlabel", R.number), o.pair("maxlen", R.number), o.pair("maxheight", R.number), o.item("font", hr), o.pair("rotate", R.number), o.pair("justify", R.string), ...oe.common_expr_defs));
      }
      static {
        l(this, "TbText");
      }
      get shown_text() {
        return Ye(this.text, this.parent);
      }
    };
    hr = class {
      constructor(e) {
        this.color = p.transparent_black;
        this.size = new d(1.27, 1.27);
        Object.assign(this, V(e, o.start("font"), o.pair("face", R.string), o.atom("bold"), o.atom("italic"), o.vec2("size"), o.pair("linewidth", R.number)));
      }
      static {
        l(this, "Font");
      }
    };
    l(dr, "merge");
    je = class r27 {
      constructor() {
        this.board = new mr();
        this.boards = [];
        this.libraries = { pinned_footprint_libs: [], pinned_symbol_libs: [] };
        this.meta = { filename: "unknown.kicad_pro", version: 1 };
        this.pcbnew = { page_layout_descr_file: "" };
        this.schematic = new fr();
        this.sheets = [];
        this.text_variables = {};
      }
      static {
        l(this, "ProjectSettings");
      }
      static load(e) {
        let t = new r27();
        return dr(t, e), t;
      }
    };
    mr = class {
      constructor() {
        this.design_settings = new _r();
      }
      static {
        l(this, "BoardSettings");
      }
    };
    _r = class {
      constructor() {
        this.defaults = new br();
      }
      static {
        l(this, "BoardDesignSettings");
      }
    };
    br = class {
      constructor() {
        this.board_outline_line_width = 0.1;
        this.copper_line_width = 0.2;
        this.copper_text_size_h = 1.5;
        this.copper_text_size_v = 1.5;
        this.copper_text_thickness = 0.3;
        this.other_line_width = 0.15;
        this.silk_line_width = 0.15;
        this.silk_text_size_h = 1;
        this.silk_text_size_v = 1;
        this.silk_text_thickness = 0.15;
      }
      static {
        l(this, "BoardDesignSettingsDefaults");
      }
    };
    fr = class {
      constructor() {
        this.drawing = new Mr();
        this.meta = { version: 1 };
      }
      static {
        l(this, "SchematicSettings");
      }
    };
    Mr = class {
      constructor() {
        this.dashed_lines_dash_length_ratio = 12;
        this.dashed_lines_gap_length_ratio = 3;
        this.default_line_thickness = 6;
        this.default_text_size = 50;
        this.intersheets_ref_own_page = false;
        this.intersheets_ref_prefix = "";
        this.intersheets_ref_short = false;
        this.intersheets_ref_show = false;
        this.intersheets_ref_suffix = "";
        this.junction_size_choice = 3;
        this.label_size_ratio = 0.375;
        this.pin_symbol_size = 25;
        this.text_offset_ratio = 0.15;
      }
      static {
        l(this, "SchematicDrawingSettings");
      }
    };
    Nr = class {
      static {
        l(this, "Glyph");
      }
    };
    U2 = class r28 extends Nr {
      constructor(t, i) {
        super();
        this.strokes = t;
        this.bbox = i;
      }
      static {
        l(this, "StrokeGlyph");
      }
      transform(t, i, s, n, a, c) {
        let u = this.bbox.copy();
        u.x = i.x + u.x * t.x, u.y = i.y + u.y * t.y, u.w = u.w * t.x, u.h = u.h * t.y, s && (u.w += u.h * s);
        let h = [];
        for (let m of this.strokes) {
          let _ = [];
          for (let b of m) {
            let f = b.multiply(t);
            s > 0 && (f.x -= f.y * s), f = f.add(i), a && (f.x = c.x - (f.x - c.x)), n.degrees != 0 && (f = n.rotate_point(f, c)), _.push(f);
          }
          h.push(_);
        }
        return new r28(h, u);
      }
    };
    v2 = class {
      constructor(e) {
        this.text = e;
        this.root = on(Zo(e)), this.root.is_root = true;
      }
      static {
        l(this, "Markup");
      }
    };
    b3 = class {
      constructor() {
        this.is_root = false;
        this.subscript = false;
        this.superscript = false;
        this.overbar = false;
        this.text = "";
        this.children = [];
      }
      static {
        l(this, "MarkupNode");
      }
    };
    l(Zo, "tokenize");
    l(on, "parse");
    Xt = class {
      constructor(e) {
        this.name = e;
      }
      static {
        l(this, "Font");
      }
      static {
        this.italic_tilt = 1 / 8;
      }
      static {
        this.interline_pitch_ratio = 1.62;
      }
      draw(e, t, i, s) {
        if (!e || !t) return;
        let n = this.get_line_positions(t, i, s);
        e.state.stroke_width = s.stroke_width;
        for (let a of n) this.draw_line(e, a.text, a.position, i, s);
      }
      get_line_extents(e, t, i, s, n) {
        let a = new He();
        a.bold = s, a.italic = n;
        let { bbox: c } = this.get_markup_as_glyphs(e, new d(0, 0), t, new P(0), false, new d(0, 0), a);
        return new d(c.w, c.h);
      }
      break_lines(e, t, i, s, n, a) {
        let c = new He();
        c.bold = n, c.italic = a;
        let u = this.get_text_as_glyphs(" ", i, new d(0, 0), new P(0), false, new d(0, 0), c).cursor.x, h = e.split(`
`), m = "";
        for (let _ = 0; _ < h.length; _++) {
          let b = h[_], f = true, N = 0, Z = this.wordbreak_markup(b, i, c);
          for (let { word: T, width: x } of Z) f ? (m += T, N += x, f = false) : N + u + x < t - s ? (m += " " + T, N += u + x) : (m += `
`, N = 0, f = true);
          _ != h.length - 1 && (m += `
`);
        }
        return m;
      }
      draw_line(e, t, i, s, n) {
        if (!e) return new O(0, 0, 0, 0);
        let a = new He();
        a.italic = n.italic, a.underline = n.underlined;
        let { glyphs: c, bbox: u } = this.get_markup_as_glyphs(t, i, n.size, n.angle, n.mirrored, s, a), h = F.scaling(1e-4, 1e-4);
        for (let m of c) for (let _ of m.strokes) {
          let b = Array.from(h.transform_all(_));
          e.line(new v(b, n.stroke_width / 1e4, n.color));
        }
        return u;
      }
      get_line_bbox(e, t, i, s) {
        let n = new He();
        n.italic = s;
        let { bbox: a, next_position: c } = this.get_markup_as_glyphs(e, t, i, new P(0), false, new d(0, 0), n);
        return { bbox: a, cursor: c };
      }
      get_line_positions(e, t, i) {
        let s = [], n = [], a = e.split(`
`), c = a.length, u = this.get_interline(i.size.y, i.line_spacing), h = 0;
        for (let b = 0; b < c; b++) {
          let f = a[b], N = new d(t.x, t.y + b * u), { cursor: Z } = this.get_line_bbox(f, N, i.size, i.italic), T = Z.sub(N);
          s.push(T), b == 0 ? h += i.size.y * 1.17 : h += u;
        }
        let m = new d(0, i.size.y);
        switch (i.v_align) {
          case "top":
            break;
          case "center":
            m.y -= h / 2;
            break;
          case "bottom":
            m.y -= h;
            break;
        }
        for (let b = 0; b < c; b++) {
          let f = s[b], N = m.copy();
          switch (N.y += b * u, i.h_align) {
            case "left":
              break;
            case "center":
              N.x = -f.x / 2;
              break;
            case "right":
              N.x = -f.x;
              break;
          }
          n.push(t.add(N));
        }
        let _ = [];
        for (let b = 0; b < c; b++) _.push({ text: a[b], position: n[b], extents: s[b] });
        return _;
      }
      get_markup_as_glyphs(e, t, i, s, n, a, c) {
        let u = new v2(e);
        return this.get_markup_node_as_glyphs(u.root, t, i, s, n, a, c);
      }
      get_markup_node_as_glyphs(e, t, i, s, n, a, c) {
        let u = [], h = [], m = t.copy(), _ = c.copy();
        if (!e.is_root && (e.subscript && (_ = new He(), _.subscript = true), e.superscript && (_ = new He(), _.superscript = true), _.overbar ||= e.overbar, e.text)) {
          let { glyphs: b, cursor: f, bbox: N } = this.get_text_as_glyphs(e.text, i, t, s, n, a, _);
          u = b, h.push(N), m.set(f);
        }
        for (let b of e.children) {
          let { next_position: f, bbox: N, glyphs: Z } = this.get_markup_node_as_glyphs(b, m, i, s, n, a, _);
          m.set(f), h.push(N), u = u.concat(Z);
        }
        return { next_position: m, bbox: O.combine(h), glyphs: u };
      }
      wordbreak_markup(e, t, i) {
        let s = new v2(e);
        return this.wordbreak_markup_node(s.root, t, i);
      }
      wordbreak_markup_node(e, t, i) {
        let s = i.copy(), n = [];
        if (!e.is_root) {
          let a = "";
          if (e.subscript && (a = "_", s.subscript = true), e.superscript && (a = "^", s.superscript = true), e.overbar && (a = "~", s.overbar = true), a) {
            let c = `${a}{`, u = 0;
            if (e.text) {
              let { cursor: h } = this.get_text_as_glyphs(e.text, t, new d(0, 0), new P(0), false, new d(0, 0), s);
              c += e.text, u += h.x;
            }
            for (let h of e.children) {
              let m = this.wordbreak_markup_node(h, t, s);
              for (let { word: _, width: b } of m) c += _, u += b;
            }
            return c += "}", [{ word: c, width: u }];
          } else {
            let c = e.text.trim().split(" ");
            e.text.endsWith(" ") && c.push(" ");
            for (let u of c) {
              let { cursor: h } = this.get_text_as_glyphs(u, t, new d(0, 0), new P(0), false, new d(0, 0), s);
              n.push({ word: u, width: h.x });
            }
          }
        }
        for (let a of e.children) n = n.concat(this.wordbreak_markup_node(a, t, i));
        return n;
      }
    };
    He = class r29 {
      constructor(e = false, t = false, i = false, s = false, n = false, a = false) {
        this.bold = e;
        this.italic = t;
        this.subscript = i;
        this.superscript = s;
        this.overbar = n;
        this.underline = a;
      }
      static {
        l(this, "TextStyle");
      }
      copy() {
        return new r29(this.bold, this.italic, this.subscript, this.superscript, this.overbar, this.underline);
      }
    };
    Ot = class r30 {
      constructor() {
        this.font = null;
        this.h_align = "center";
        this.v_align = "center";
        this.angle = new P(0);
        this.line_spacing = 1;
        this.stroke_width = 0;
        this.italic = false;
        this.bold = false;
        this.underlined = false;
        this.color = p.transparent_black;
        this.visible = true;
        this.mirrored = false;
        this.multiline = true;
        this.size = new d(0, 0);
        this.keep_upright = false;
      }
      static {
        l(this, "TextAttributes");
      }
      copy() {
        let e = new r30();
        return e.font = this.font, e.h_align = this.h_align, e.v_align = this.v_align, e.angle = this.angle.copy(), e.line_spacing = this.line_spacing, e.stroke_width = this.stroke_width, e.italic = this.italic, e.bold = this.bold, e.underlined = this.underlined, e.color = this.color.copy(), e.visible = this.visible, e.mirrored = this.mirrored, e.multiline = this.multiline, e.size = this.size.copy(), e;
      }
    };
    an = ["E_JSZS", "G][EI`", "H\\KFXFQNTNVOWPXRXWWYVZT[N[LZKY", "I[MUWU RK[RFY[", "G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH", "H[MPTP RW[M[MFWF", "G]L[LF RLPXP RX[XF", "MWR[RF", "G\\L[LF RX[OO RXFLR", "F^K[KFRUYFY[", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF", "G\\L[LFTFVGWHXJXMWOVPTQLQ", "JZLFXF RR[RF", "H\\KFY[ RYFK[", "I[RQR[ RKFRQYF", "NVPESH", "HZVZT[P[NZMYLWLQMONNPMTMVN", "MWRMR_QaObNb RRFQGRHSGRFRH", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[", "JZMMR[WM", "G]JMN[RQV[ZM", "H\\RbRD", "F^K[KFYFY[K[", "RR", "NVTEQH", "JZRRQSRTSSRRRT", "MWR[RF RN?O@NAM@N?NA RV?W@VAU@V?VA", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RIPQP", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RTEQH", "I[MUWU RK[RFY[ RN>O@QASAU@V>", "IZNMN[ RPSV[ RVMNU", "G]KPYP RPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF", "I[NNPMTMVNWPWXVZT[P[NZMXMVWT", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN", "MXRMRXSZU[", "H[LTWT RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[", "G]RFRb RPMTMVNXPYRYVXXVZT[P[NZLXKVKRLPNNPM", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEQH", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RTEQH", "I\\NMN[ RNOONQMTMVNWPWb RTEQH", "MXRMRXSZU[ RTEQH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM", "H[MMMXNZP[S[UZVYWWWPVNUM RTEQH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEQH", "LXOTUT", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RPQRPTQUSTURVPUOSPQ", "Pf"];
    f3 = ["JZ", "MWRYSZR[QZRYR[ RRSQGRFSGRSRF", "JZNFNJ RVFVJ", "H]LM[M RRDL_ RYVJV RS_YD", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RRCR^", "F^J[ZF RMFOGPIOKMLKKJIKGMF RYZZXYVWUUVTXUZW[YZ", "E_[[Z[XZUWPQNNMKMINGPFQFSGTITJSLRMLQKRJTJWKYLZN[Q[SZTYWUXRXP", "MWSFQJ", "KYVcUbS_R]QZPUPQQLRISGUDVC", "KYNcObQ_R]SZTUTQSLRIQGODNC", "JZRFRK RMIRKWI ROORKUO", "E_JSZS RR[RK", "MWSZS[R]Q^", 0, "MWRYSZR[QZRYR[", 1, "H\\QFSFUGVHWJXNXSWWVYUZS[Q[OZNYMWLSLNMJNHOGQF", "H\\X[L[ RR[RFPINKLL", "H\\LHMGOFTFVGWHXJXLWOK[X[", 2, "H\\VMV[ RQELTYT", "H\\WFMFLPMOONTNVOWPXRXWWYVZT[O[MZLY", "H\\VFRFPGOHMKLOLWMYNZP[T[VZWYXWXRWPVOTNPNNOMPLR", "H\\KFYFP[", "H\\PONNMMLKLJMHNGPFTFVGWHXJXKWMVNTOPONPMQLSLWMYNZP[T[VZWYXWXSWQVPTO", "H\\N[R[TZUYWVXRXJWHVGTFPFNGMHLJLOMQNRPSTSVRWQXO", "MWRYSZR[QZRYR[ RRNSORPQORNRP", "MWSZS[R]Q^ RRNSORPQORNRP", "E_ZMJSZY", "E_JPZP RZVJV", "E_JMZSJY", "I[QYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS", "D_VQUPSOQOOPNQMSMUNWOXQYSYUXVW RVOVWWXXXZW[U[PYMVKRJNKKMIPHTIXK[N]R^V]Y[", 3, 4, 5, "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[", 6, "HZTPMP RM[MFWF", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR", 7, 8, "JZUFUUTXRZO[M[", 9, "HYW[M[MF", 10, "G]L[LFX[XF", 11, 12, "G]Z]X\\VZSWQVOV RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P[", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG", 13, "G]LFLWMYNZP[T[VZWYXWXF", "I[KFR[YF", "F^IFN[RLV[[F", 14, 15, "H\\KFYFK[Y[", "KYVbQbQDVD", "KYID[_", "KYNbSbSDND", "LXNHREVH", "JZJ]Z]", 16, "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ", 17, "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT", "MYOMWM RR[RISGUFWF", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN", "H[M[MF RV[VPUNSMPMNNMO", "MWR[RM RRFQGRHSGRFRH", 18, "IZN[NF RPSV[ RVMNU", "MXU[SZRXRF", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[", "I\\NMN[ RNOONQMTMVNWPW[", 19, "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ", "I\\WMWb RWZU[Q[OZNYMWMQNOONQMUMWN", "KXP[PM RPQQORNTMVM", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN", "MYOMWM RRFRXSZU[W[", "H[VMV[ RMMMXNZP[S[UZVY", 20, 21, "IZL[WM RLMW[", "JZMMR[ RWMR[P`OaMb", "IZLMWML[W[", "KYVcUcSbR`RVQTOSQRRPRFSDUCVC", 22, "KYNcOcQbR`RVSTUSSRRPRFQDOCNC", "KZMSNRPQTSVRWQ", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "JZ", "MWROQNRMSNRORM RRUSaRbQaRURb", "HZVZT[P[NZMYLWLQMONNPMTMVN RRJR^", "H[LMTM RL[W[ RO[OIPGRFUFWG", "H]LYOV RLLOO RVVYY RVOYL RVVTWQWOVNTNQOOQNTNVOWQWTVV", "F^JTZT RJMZM RRQR[ RKFRQYF", "MWRbRW RRFRQ", "I[N]P^S^U]V[UYOSNQNPONQM RVGTFQFOGNIOKUQVSVTUVSW", "LXNFOGNHMGNFNH RVFWGVHUGVFVH", "@dVKTJPJNKLMKOKSLUNWPXTXVW RRCMDHGELDQEVH[M^R_W^\\[_V`Q_L\\GWDRC", "KZOEQDSDUEVGVN RVMTNQNOMNKOIQHVH", "H\\RMLSRY RXWTSXO", "E_JQZQZV", 24, "@dWXRR RNXNJTJVKWMWOVQTRNR RRCMDHGELDQEVH[M^R_W^\\[_V`Q_L\\GWDRC", "LXMGWG", "JZRFPGOIPKRLTKUITGRF", "E_JOZO RRWRG RZ[J[", "JZNAP@S@UAVCVEUGNNVN", "JZN@V@RESEUFVHVKUMSNPNNM", 25, "H^MMMb RWXXZZ[ RMXNZP[T[VZWXWM", "F]VMV[ ROMOXNZL[ RZMMMKNJP", 26, "MWR\\T]U_TaRbOb", "JZVNNN RNCPBR@RN", "KYQNOMNKNGOEQDSDUEVGVKUMSNQN", "H\\RMXSRY RLWPSLO", "G]KQYQ RVNNN RNCPBR@RN RUYUa RQSN]W]", "G]KQYQ RVNNN RNCPBR@RN RNTPSSSUTVVVXUZNaVa", "G]KQYQ RN@V@RESEUFVHVKUMSNPNNM RUYUa RQSN]W]", "I[SORNSMTNSOSM RWaUbPbNaM_M]N[OZQYRXSVSU", "I[MUWU RK[RFY[ RP>SA", "I[MUWU RK[RFY[ RT>QA", "I[MUWU RK[RFY[ RNAR>VA", "I[MUWU RK[RFY[ RMAN@P?TAV@W?", "I[MUWU RK[RFY[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "I[MUWU RK[RFY[ RRFPEOCPAR@TAUCTERF", "F`JURU RRPYP RH[OF\\F RRFR[\\[", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR\\T]U_TaRbOb", "H[MPTP RW[M[MFWF RP>SA", "H[MPTP RW[M[MFWF RT>QA", "H[MPTP RW[M[MFWF RNAR>VA", "H[MPTP RW[M[MFWF RN?O@NAM@N?NA RV?W@VAU@V?VA", "MWR[RF RP>SA", "MWR[RF RT>QA", "MWR[RF RNAR>VA", 27, 28, "G]L[LFX[XF RMAN@P?TAV@W?", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RP>SA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RT>QA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAR>VA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RMAN@P?TAV@W?", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN?O@NAM@N?NA RV?W@VAU@V?VA", "E_LMXY RXMLY", "G]ZFJ[ RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P[", "G]LFLWMYNZP[T[VZWYXWXF RP>SA", "G]LFLWMYNZP[T[VZWYXWXF RT>QA", "G]LFLWMYNZP[T[VZWYXWXF RNAR>VA", "G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA", "I[RQR[ RKFRQYF RT>QA", "G\\LFL[ RLKTKVLWMXOXRWTVUTVLV", "F]K[KJLHMGOFRFTGUHVJVMSMQNPPPQQSSTVTXUYWYXXZV[R[PZ", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RPESH", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RTEQH", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHREVH", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RMHNGPFTHVGWF", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNFOGNHMGNFNH RVFWGVHUGVFVH", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRHPGOEPCRBTCUETGRH", "D`INKMOMQNRP R[ZY[U[SZRXRPSNUMYM[N\\P\\RRSKSITHVHXIZK[O[QZRX", "HZVZT[P[NZMYLWLQMONNPMTMVN RR\\T]U_TaRbOb", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RPESH", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RTEQH", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHREVH", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNFOGNHMGNFNH RVFWGVHUGVFVH", "MWR[RM RPESH", "MWR[RM RTEQH", "LXNHREVH RR[RM", "LXNFOGNHMGNFNH RVFWGVHUGVFVH RR[RM", "I\\SCQI RWNUMQMONNOMQMXNZP[T[VZWXWLVITGRFNE", "I\\NMN[ RNOONQMTMVNWPW[ RMHNGPFTHVGWF", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RPESH", 29, "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHREVH", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMHNGPFTHVGWF", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNFOGNHMGNFNH RVFWGVHUGVFVH", "E_ZSJS RRXSYRZQYRXRZ RRLSMRNQMRLRN", "H[XMK[ RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[", "H[VMV[ RMMMXNZP[S[UZVY RPESH", "H[VMV[ RMMMXNZP[S[UZVY RTEQH", "H[VMV[ RMMMXNZP[S[UZVY RNHREVH", "H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH", "JZMMR[ RWMR[P`OaMb RTEQH", "H[MFMb RMNOMSMUNVOWQWWVYUZS[O[MZ", "JZMMR[ RWMR[P`OaMb RNFOGNHMGNFNH RVFWGVHUGVFVH", "I[MUWU RK[RFY[ RM@W@", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RMGWG", 30, "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE", "I[MUWU RK[RFY[ RY[W]V_WaYb[b", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RW[U]T_UaWbYb", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RT>QA", "HZVZT[P[NZMYLWLQMONNPMTMVN RTEQH", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RNAR>VA", "HZVZT[P[NZMYLWLQMONNPMTMVN RNHREVH", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR?Q@RAS@R?RA", "HZVZT[P[NZMYLWLQMONNPMTMVN RRFQGRHSGRFRH", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RN>RAV>", "HZVZT[P[NZMYLWLQMONNPMTMVN RNERHVE", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RN>RAV>", "IfW[WF RWZU[Q[OZNYMWMQNOONQMUMWN RbF`J", 28, "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RRHZH", "H[MPTP RW[M[MFWF RM@W@", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RMGWG", "H[MPTP RW[M[MFWF RN>O@QASAU@V>", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNEOGQHSHUGVE", "H[MPTP RW[M[MFWF RR?Q@RAS@R?RA", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RRFQGRHSGRFRH", "H[MPTP RW[M[MFWF RR[P]O_PaRbTb", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RR[P]O_PaRbTb", "H[MPTP RW[M[MFWF RN>RAV>", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNERHVE", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RNAR>VA", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RNHREVH", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RN>O@QASAU@V>", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RNEOGQHSHUGVE", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RR?Q@RAS@R?RA", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RRFQGRHSGRFRH", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RR\\T]U_TaRbOb", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RRGPFODPBRAUA", "G]L[LF RLPXP RX[XF RNAR>VA", "H[M[MF RV[VPUNSMPMNNMO RIAM>QA", "G]IJ[J RL[LF RLPXP RX[XF", "H[M[MF RV[VPUNSMPMNNMO RJHRH", "MWR[RF RMAN@P?TAV@W?", "MWR[RM RMHNGPFTHVGWF", "MWR[RF RM@W@", "MWR[RM RMGWG", "MWR[RF RN>O@QASAU@V>", "MWR[RM RNEOGQHSHUGVE", "MWR[RF RR[P]O_PaRbTb", "MWR[RM RR[P]O_PaRbTb", "MWR[RF RR?Q@RAS@R?RA", "MWR[RM", "MgR[RF RbFbUaX_Z\\[Z[", "MaR[RM RRFQGRHSGRFRH R\\M\\_[aYbXb R\\F[G\\H]G\\F\\H", "JZUFUUTXRZO[M[ RQAU>YA", "MWRMR_QaObNb RNHREVH", "G\\L[LF RX[OO RXFLR RR\\T]U_TaRbOb", "IZN[NF RPSV[ RVMNU RR\\T]U_TaRbOb", 31, "HYW[M[MF RO>LA", "MXU[SZRXRF RTEQH", "HYW[M[MF RR\\T]U_TaRbOb", "MXU[SZRXRF RR\\T]U_TaRbOb", "HYW[M[MF RVHSK", "M^U[SZRXRF RZFXJ", "HYW[M[MF RUNTOUPVOUNUP", "M\\U[SZRXRF RYOZPYQXPYOYQ", "HYW[M[MF RJQPM", "MXU[SZRXRF ROQUM", "G]L[LFX[XF RT>QA", "I\\NMN[ RNOONQMTMVNWPW[ RTEQH", "G]L[LFX[XF RR\\T]U_TaRbOb", "I\\NMN[ RNOONQMTMVNWPW[ RR\\T]U_TaRbOb", "G]L[LFX[XF RN>RAV>", "I\\NMN[ RNOONQMTMVNWPW[ RNERHVE", "MjSFQJ R\\M\\[ R\\O]N_MbMdNePe[", "G]LFL[ RLINGPFTFVGWHXJX^W`VaTbQb", "I\\NMN[ RNOONQMTMVNWPW_VaTbRb", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RM@W@", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMGWG", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN>O@QASAU@V>", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNEOGQHSHUGVE", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RQ>NA RX>UA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RQENH RXEUH", "E`RPYP RRFR[ R\\FNFLGJIIMITJXLZN[\\[", "C`[ZY[U[SZRXRPSNUMYM[N\\P\\RRT RRQQOPNNMKMINHOGQGWHYIZK[N[PZQYRW", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RT>QA", "KXP[PM RPQQORNTMVM RTEQH", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RR\\T]U_TaRbOb", "KXP[PM RPQQORNTMVM RR\\T]U_TaRbOb", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RN>RAV>", "KXP[PM RPQQORNTMVM RNERHVE", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RT>QA", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RTEQH", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RNAR>VA", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RNHREVH", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RR\\T]U_TaRbOb", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RR\\T]U_TaRbOb", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RN>RAV>", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RNERHVE", "JZLFXF RR[RF RR\\T]U_TaRbOb", "MYOMWM RRFRXSZU[W[ RR\\T]U_TaRbOb", "JZLFXF RR[RF RN>RAV>", "M[OMWM RYFXI RRFRXSZU[W[", "JZLFXF RR[RF RNQVQ", "MYOMWM RRFRXSZU[W[ ROSUS", "G]LFLWMYNZP[T[VZWYXWXF RMAN@P?TAV@W?", "H[VMV[ RMMMXNZP[S[UZVY RMHNGPFTHVGWF", "G]LFLWMYNZP[T[VZWYXWXF RM@W@", "H[VMV[ RMMMXNZP[S[UZVY RMGWG", "G]LFLWMYNZP[T[VZWYXWXF RN>O@QASAU@V>", "H[VMV[ RMMMXNZP[S[UZVY RNEOGQHSHUGVE", "G]LFLWMYNZP[T[VZWYXWXF RRAP@O>P<R;T<U>T@RA", "H[VMV[ RMMMXNZP[S[UZVY RRHPGOEPCRBTCUETGRH", "G]LFLWMYNZP[T[VZWYXWXF RQ>NA RX>UA", "H[VMV[ RMMMXNZP[S[UZVY RQENH RXEUH", "G]LFLWMYNZP[T[VZWYXWXF RR[P]O_PaRbTb", "H[VMV[ RMMMXNZP[S[UZVY RV[T]S_TaVbXb", "F^IFN[RLV[[F RNAR>VA", "G]JMN[RQV[ZM RNHREVH", "I[RQR[ RKFRQYF RNAR>VA", "JZMMR[ RWMR[P`OaMb RNHREVH", "JZLFXF RR[RF RN?O@NAM@N?NA RV?W@VAU@V?VA", "H\\KFYFK[Y[ RT>QA", "IZLMWML[W[ RTEQH", "H\\KFYFK[Y[ RR?Q@RAS@R?RA", "IZLMWML[W[ RRFQGRHSGRFRH", "H\\KFYFK[Y[ RN>RAV>", "IZLMWML[W[ RNERHVE", "MYR[RISGUFWF", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ RJHRH", "C\\LFL[T[VZWYXWXTWRVQSPLP RFKFIGGIFSFUGVHWJWLVNUOSP", "G\\VFLFL[R[UZWXXVXSWQUORNLN", "H[WFMFM[ RMNOMSMUNVOWQWWVYUZS[O[MZ", "H]MFM[S[VZXXYVYSXQVOSNMN", "IZNMN[S[UZVXVUUSSRNR", "I^MHNGQFSFVGXIYKZOZRYVXXVZS[Q[NZMY", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RMHKGJEKCLB", "HZVZT[P[NZMYLWLQMONNPMTMVN RTMTIUGWFYF", 28, "C\\FKFIGGIFQFTGVIWKXOXRWVVXTZQ[L[LF", "H]NFXFX[R[OZMXLVLSMQOORNXN", "I\\MFWFW[ RWNUMQMONNOMQMWNYOZQ[U[WZ", "I\\Q[T[VZWYXWXQWOVNTMQMONNOMQMWNYOZQ[T\\V]W_VaTbPbNa", "I\\WPPP RM[W[WFMF", "F^MHNGQFSFVGXIYKZOZRYVXXVZS[Q[NZLXKVJRZP", "G[PPTP RWGUFPFNGMHLJLLMNNOPPMQLRKTKWLYMZO[U[WZ", "HZTPMP RM[MFWF RM[M_LaJbHb", "MYOMWM RR[RISGUFWF RR[R_QaObMb", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RMHKGJEKCLB", "I[KFU[U_TaRbPaO_O[YF", "D`I[IF RIOJNLMOMQNRPRXSZU[X[ZZ[Y\\W\\P[NZM", "MZRFRWSYTZV[X[", "MWR[RF RNPVP", "G_L[LF RX[OO RLRWGYF[G\\I\\K", "IZNMN[ RPSV[ RVMNU RNMNIOGQFSF", "MXU[SZRXRF RNOVO", "JZRMM[ RMFOFPGRMW[ RNLTH", "Ca\\F\\[ R\\XZZX[V[TZSYRWRF RRWQYPZN[L[JZIYHWHF", "G]L[LFX[XF RL[L_KaIbGb", "I\\NMN[ RNOONQMTMVNWPWb", 32, "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH", "DaSGQFMFKGIIHMHTIXKZM[Q[SZUXVTVMUISGUFYF[G\\I\\b", "E^RNPMMMKNJOIQIWJYKZM[P[RZSYTWTQSORNTMVMXNYPYb", "C\\LFL[ RFKFIGGIFTFVGWHXJXMWOVPTQLQ", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RRMRISGUFWF", "G\\LFL[ RQVXb RLKTKVLWMXOXRWTVUTVLV", "H\\XZU[P[NZMYLWLUMSNRPQTPVOWNXLXJWHVGTFOFLG", "IZVZT[P[NZMXMWNUPTSTUSVQVPUNSMPMNN", "H[W[L[SPLFWF", "JYWbUbSaR_RIQGOFMGLIMKOLQKRI", "MYOMWM RRFRXSZU[W[ RW[W_VaTbRb", "HZR[RF RKKKILGNFXF", "MYOMWM RWFUFSGRIRXSZU[W[", "JZLFXF RR[RF RR[R_SaUbWb", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG", "F^ZFUFUJWKYMZPZUYXWZT[P[MZKXJUJPKMMKOJOFJF", "G]LFLWMYNZP[T[VZXXYVYIXGWF", "I`RQR[ RKFRQXGZF\\G]I]K", "J^MMR[ RMbOaP`R[VNXMZN[P[R", "H\\KFYFK[Y[ RNPVP", "IZLMWML[W[ RNTVT", 2, "H\\YFLFSNPNNOMPLRLWMYNZP[V[XZYY", "JZWMNMUVRVPWOXNZN^O`PaRbUbWa", "JZMMVMOTSTUUVWVXUZS[Q[O\\N^N_OaQbVb", "H\\LHMGOFTFVGWHXJXLWOK[X[ RNSVS", "H\\WFMFLPMOONTNVOWPXRXWWYVZT[O[MZLY", "JZVMOMNSPRSRUSVUVXUZS[P[NZ", "J^MZP[T[WZYXZVZSYQWOTNPNPF RLITI", "H[MMMb RMONNPMTMVNWPWSVUM^", "MWRFRb", "JZOFOb RUFUb", "MWRFRb ROWUW ROQUQ", "MWRYSZR[QZRYR[ RRSQGRFSGRSRF", "GpL[LFQFTGVIWKXOXRWVVXTZQ[L[ R_FmF_[m[ Rb>fAj>", "GmL[LFQFTGVIWKXOXRWVVXTZQ[L[ R_MjM_[j[ RaEeHiE", "ImW[WF RWZU[Q[OZNYMWMQNOONQMUMWN R_MjM_[j[ RaEeHiE", "HiW[M[MF RdFdUcXaZ^[\\[", "HcW[M[MF R^M^_]a[bZb R^F]G^H_G^F^H", "MbU[SZRXRF R]M]_\\aZbYb R]F\\G]H^G]F]H", "GmL[LFX[XF RhFhUgXeZb[`[", "GgL[LFX[XF RbMb_aa_b^b RbFaGbHcGbFbH", "IfNMN[ RNOONQMTMVNWPW[ RaMa_`a^b]b RaF`GaHbGaFaH", "I[MUWU RK[RFY[ RN>RAV>", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNERHVE", "MWR[RF RN>RAV>", "MWR[RM RNERHVE", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN>RAV>", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNERHVE", "G]LFLWMYNZP[T[VZWYXWXF RN>RAV>", "H[VMV[ RMMMXNZP[S[UZVY RNERHVE", "G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA RM;W;", "H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH RM@W@", "G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA RT9Q<", "H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", "G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA RN9R<V9", "H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH RN>RAV>", "G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA RP9S<", "H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH RP>SA", 33, "I[MUWU RK[RFY[ RN?O@NAM@N?NA RV?W@VAU@V?VA RM;W;", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNFOGNHMGNFNH RVFWGVHUGVFVH RM@W@", "I[MUWU RK[RFY[ RR?Q@RAS@R?RA RM;W;", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRFQGRHSGRFRH RM@W@", "F`JURU RRPYP RH[OF\\F RRFR[\\[ RO@Y@", "D`INKMOMQNRP R[ZY[U[SZRXRPSNUMYM[N\\P\\RRSKSITHVHXIZK[O[QZRX RMGWG", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RSV[V", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RS^[^", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RN>RAV>", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RNERHVE", "G\\L[LF RX[OO RXFLR RN>RAV>", "IZN[NF RPSV[ RVMNU RJANDRA", "G]R[P]O_PaRbTb RPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF", "H[R[P]O_PaRbTb RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[", "G]R[P]O_PaRbTb RPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RM@W@", "H[R[P]O_PaRbTb RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMGWG", "H\\KFXFQNTNVOWPXRXWWYVZT[N[LZKY RN>RAV>", "JZMMVMOVRVTWUXVZV^U`TaRbObMa RNERHVE", "MWRMR_QaObNb RNERHVE", "GpL[LFQFTGVIWKXOXRWVVXTZQ[L[ R_FmF_[m[", "GmL[LFQFTGVIWKXOXRWVVXTZQ[L[ R_MjM_[j[", "ImW[WF RWZU[Q[OZNYMWMQNOONQMUMWN R_MjM_[j[", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RT>QA", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RTEQH", "CaH[HF RHPTP RTFTXUZW[Z[\\Z]X]M", "G\\LFLb RLINGPFTFVGWHXJXOWRUUL^", "G]L[LFX[XF RP>SA", "I\\NMN[ RNOONQMTMVNWPW[ RPESH", "I[MUWU RK[RFY[ RZ9X< RR;P<O>P@RAT@U>T<R;", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RZ@XC RRBPCOEPGRHTGUETCRB", "F`JURU RRPYP RH[OF\\F RRFR[\\[ RV>SA", "D`INKMOMQNRP R[ZY[U[SZRXRPSNUMYM[N\\P\\RRSKSITHVHXIZK[O[QZRX RTEQH", "G]ZFJ[ RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P[ RT>QA", "H[XMK[ RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RTEQH", "I[MUWU RK[RFY[ ROAL> RVAS>", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR ROHLE RVHSE", "I[MUWU RK[RFY[ RNAO?Q>S>U?VA", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHOFQESEUFVH", "H[MPTP RW[M[MFWF ROAL> RVAS>", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT ROHLE RVHSE", "H[MPTP RW[M[MFWF RNAO?Q>S>U?VA", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHOFQESEUFVH", "MWR[RF ROAL> RVAS>", "MWR[RM ROHLE RVHSE", "MWR[RF RNAO?Q>S>U?VA", "MWR[RM RNHOFQESEUFVH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF ROAL> RVAS>", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ ROHLE RVHSE", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAO?Q>S>U?VA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHOFQESEUFVH", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ ROAL> RVAS>", "KXP[PM RPQQORNTMVM RPHME RWHTE", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RNAO?Q>S>U?VA", "KXP[PM RPQQORNTMVM ROHPFRETEVFWH", "G]LFLWMYNZP[T[VZWYXWXF ROAL> RVAS>", "H[VMV[ RMMMXNZP[S[UZVY ROHLE RVHSE", "G]LFLWMYNZP[T[VZWYXWXF RNAO?Q>S>U?VA", "H[VMV[ RMMMXNZP[S[UZVY RNHOFQESEUFVH", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RS`SaRcQd", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RS`SaRcQd", "JZLFXF RR[RF RS`SaRcQd", "MYOMWM RRFRXSZU[W[ RU`UaTcSd", "I]VRXTYVY[X]V_T`Lb RLHMGOFUFWGXHYJYNXPVRTSNU", "J[UWVXWZW]V_U`SaMb RMNOMSMUNVOWQWTVVUWSXOY", "G]L[LF RLPXP RX[XF RN>RAV>", "H[M[MF RV[VPUNSMPMNNMO RI>MAQ>", "G]L[LFX[XF RX[Xb", "IbWFWXXZZ[\\[^Z_X^V\\UZVV^ RWNUMQMONNOMQMWNYOZQ[T[VZWX", "G]NFLGKIKKLMMNOO RVFXGYIYKXMWNUO ROOUOWPXQYSYWXYWZU[O[MZLYKWKSLQMPOO", "J[MJMMNORQVOWMWJ RPQTQVRWTWXVZT[P[NZMXMTNRPQ", "H\\KFYFK[Y[ RY[Y_XaVbTb", "IZLMWML[W[ RW[W_VaTbRb", "I[MUWU RK[RFY[ RR?Q@RAS@R?RA", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRFQGRHSGRFRH", "H[MPTP RW[M[MFWF RR\\T]U_TaRbOb", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RR\\T]U_TaRbOb", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN?O@NAM@N?NA RV?W@VAU@V?VA RM;W;", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNFOGNHMGNFNH RVFWGVHUGVFVH RM@W@", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RMAN@P?TAV@W? RM;W;", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMHNGPFTHVGWF RM@W@", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RR?Q@RAS@R?RA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RRFQGRHSGRFRH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RR?Q@RAS@R?RA RM;W;", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RRFQGRHSGRFRH RM@W@", "I[RQR[ RKFRQYF RM@W@", "JZMMR[ RWMR[P`OaMb RMGWG", "M]RFRXSZU[W[YZZXYVWUUVQ^", "IbNMN[ RNOONQMTMVNWPWXXZZ[\\[^Z_X^V\\UZVV^", "M]OMWM RRFRXSZU[W[YZZXYVWUUVQ^", "MWRMR_QaObNb", "D`R[RF RRZP[L[JZIYHWHQIOJNLMPMRN RTMXMZN[O\\Q\\W[YZZX[T[RZ", "D`RMRb RRZP[L[JZIYHWHQIOJNLMPMRN RTMXMZN[O\\Q\\W[YZZX[T[RZ", "I[MUWU RK[RFY[ RXCL`", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RXCL`", "HZVZT[P[NZMYLWLQMONNPMTMVN RWHM`", "HYW[M[MF RIOQO", "JZLFXF RR[RF RXCL`", "J[P[R^T_W_ RNZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN", "IZLMWML[N[P\\R^T_W_", "J^MGPFTFWGYIZKZNYPWRTSPSP[", "J^NNPMTMVNWOXQXSWUVVTWPWP[", "G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP RIUOU", "G]IM[M RLFLWMYNZP[T[VZWYXWXF", "I[Y[RFK[", "H[MPTP RW[M[MFWF RXCL`", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RWHM`", "JZUFUUTXRZO[M[ RQPYP", "MWRMR_QaObNb ROTUT RRFQGRHSGRFRH", "G]XFX^Y`Za\\b^b RXIVGTFPFNGLIKMKTLXNZP[T[VZXX", "I\\WMW^X`Ya[b]b RWZU[Q[OZNYMWMQNOONQMUMWN", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RIQOQ", "KXP[PM RPQQORNTMVM RMTUT", "I[KIYI RRQR[ RKFRQYF", "JZLQXQ RMMR[ RWMR[P`OaMb", "H[MMMXNZP[T[VZ RMNOMTMVNWPWRVTTUOUMV", 34, "G\\K[NQOOPNRMTMVNWOXRXVWYVZT[R[PZOYNWMPLNJM", "H[RFPFNGMIM[ RMNOMSMUNVOWQWWVYUZS[O[MZ", "J\\NNPMTMVNWOXQXWWYVZT[P[NZ", "HZVNTMPMNNMOLQLWMYNZP[S[UZVXUVSUQVM^", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RW[W_XaZb\\b", "I\\\\FZFXGWIW[ RWZU[Q[OZNYMWMQNOONQMUMWN", "I[NZP[T[VZWXWPVNTMPMNNMPMRWT", 33, "IbNNPMTMVNWPWXVZT[P[NZMXMV\\S\\U]W_X`X", 35, "J[TTVSWQWPVNTMPMNN RRTTTVUWWWXVZT[P[NZ", "JaRTTTVUWWWXVZT[P[NZ RNNPMTMVNWPWQVSTT[S[U\\W^X_X", "H[TTVSWQWPVNTMPMNNMOLRLVMYNZP[T[VZWXWWVUTTRT", "MWRMR_QaObNb ROTUT", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RWMWIXGZF\\F", "I\\WYVZT[P[NZMXMQNOONQMWMW^V`UaSbMb", "HZUNSMPMNNMOLQLWMYNZP[T[VZVUSU", "JZMMU[U_TaRbPaO_O[WM", "JZMMTVUXTZR[PZOXPVWM", "I\\WMWb RNMNXOZQ[T[VZWY", "H[RFPFNGMIM[ RV[VPUNSMPMNNMO", "H[RFPFNGMIM[ RV[VPUNSMPMNNMO RV[V_UaSbQb", "MWR[RM ROTUT RRFQGRHSGRFRH", 36, "MWR[RM RU[O[ RUMOM", "MXU[SZRXRF RMONNPMTOVNWM", "IYU[SZRXRF RRQQOONMOLQMSOTWT", "MXRFR_SaUbWb", "GZLFLXMZO[ RLMVMOVRVTWUXVZV^U`TaRbObMa", "D`[M[[ R[YZZX[U[SZRXRM RRXQZO[L[JZIXIM", "D`[M[[ R[YZZX[U[SZRXRM RRXQZO[L[JZIXIM R[[[b", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ R[[[_ZaXbVb", "I\\NMN[ RNOONQMTMVNWPW[ RN[N_MaKbIb", "I\\NMN[ RNOONQMTMVNWPW[ RW[W_XaZb\\b", "H[M[MMV[VM", 37, "E]RTXT RRMR[ RZMMMKNJOIQIWJYKZM[Z[", "G]RTRXSZU[V[XZYXYQXOWNUMOMMNLOKQKXLZN[O[QZRX", 38, "LYTMT[ RTWSYRZP[N[", "LYTMT[ RTWSYRZP[N[ RTMTF", "LYTMT[ RTWSYRZP[N[ RT[T_UaWbYb", "KXP[PM RPQQORNTMVM RP[Pb", "KXP[PM RPQQORNTMVM RP[P_QaSbUb", "KXM[S[ RVMTMRNQOPRP[", "LYW[Q[ RNMPMRNSOTRT[", "I[RUW[ RN[NMTMVNWPWRVTTUNU", "I[RSWM RNMN[T[VZWXWVVTTSNS", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RN[N_OaQbSb", "KYWFUFSGRIR_QaObMb", "MWRMR_QaObNb ROTUT RRMRISGUFWF", "KYMFOFQGRIRXSZU[W[", "KYWFUFSGRIR_QaObMaL_M]O\\V\\", "KWU[M[ RRbRPQNOMMM", "MYOMWM RRFR_SaUbWb", "H[JRYR RVMV[ RMMMXNZP[S[UZVY", "I\\XMUMUPWRXTXWWYVZT[Q[OZNYMWMTNRPPPMMM", "H[MMMXNZP[S[UZVYWWWPVNUM", "JZW[RMM[", "G]Z[VMRWNMJ[", "JZW[RM RM[RMTHUGWF", "KYRTR[ RMMRTWM", "IZLMWML[W[ RW[W_XaZb\\b", "IZLMWML[T[VZWXVVTURVN^", "JZMMVMOVRVTWUXVZV^U`TaRbObMa", "JZMMVMOVRVTWUXVZV^U`TaRbPbNaM_N]P\\R]Uc", "J^MGPFTFWGYIZKZNYPWRTSPSP[", "FZWGTFPFMGKIJKJNKPMRPSTST[", "J^MZP[T[WZYXZVZSYQWOTNPNPF", "F[WHVGSFQFNGLIKKJOJYK]L_NaQbSbVaW`", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RROQPRQSPRORQ", "I[STVUWWWXVZT[N[NMSMUNVPVQUSSTNT", "I\\PTNUMWMXNZP[T[VZWYXVXRWOVNTMPMNNMPMQNSPTRT", "HZUNSMPMNNMOLQLWMYNZP[T[VZVUSU RUMUIVGXFZF", "H[MTVT RMMM[ RVMV[", "LXRMR_QaObMaL_M]O\\V\\ RRFQGRHSGRFRH", "J[VMVb RTUNM RN[VS", "JYOMO[V[", "I\\WMWb RWZU[Q[OZNYMWMQNOONQMUMWN RWMWIXGZF\\F", "J^MGPFTFWGYIZKZNYPWRTSPSP[ RLXTX", "FZWGTFPFMGKIJKJNKPMRPSTST[ RPXXX", "D`R[RF RRM]MR[][ RRZP[L[JZIYHWHQIOJNLMPMRN", "E`RFR[ RRNPMMMKNJOIQIWJYKZM[P[RZ RRM\\MUVXVZW[X\\Z\\^[`ZaXbUbSa", "D`R[RF RRM]MR[Z[\\Z]X\\VZUXVT^ RRZP[L[JZIYHWHQIOJNLMPMRN", "G^IMQM RLFLXMZO[QZS[W[YZZXZWYUWTTTRSQQQPRNTMWMYN", "I[KMTM RNFNXOZQ[T[ RYFWFUGTIT_SaQbOb", "F^HMPM RKFKXLZN[P[RZ RZNXMTMRNQOPQPWQYRZT[W[YZZXYVWUUVQ^", "F]HMPMP[ RK[KILGNFPF RPOQNSMVMXNYPY_XaVbTb", "G^LFLXMZO[QZS[W[YZZXZWYUWTTTRSQQQPRNTMWMYN", "H^MM[MP[ RMFMXNZP[[[", "G]JSN[RUV[ZS RJFNNRHVNZF", "G]XXXSLSLX RXKXFLFLK", "I\\WMWb RNMNXOZQ[T[VZWY RNMNIMGKFIF", "I\\\\bZbXaW_WM RNMNXOZQ[T[VZWY RNMNIMGKFIF", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "H[MFM[ RXPMP", "IZNTVT RNMN[", "G]R[RF RKOKFYFYO", "I[R[RF RMOMFWFWO", "MWSFQJ", "MWS[Q_", "G]LFL[XFX[", "H\\MMM[WMW[", 23, 23, "NVR`RcSdTd", "J\\NZP[T[VZWYXWXQWOVNTMPMNN", "HZVZT[P[NZMYLWLQMONNPMTMVN RRSQTRUSTRSRU", "J\\NZP[T[VZWYXWXQWOVNTMPMNN RRSQTRUSTRSRU", "MWSZS[R]Q^ RRNSORPQORNRP", 23, 23, 23, 23, 23, 25, "LXNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", "G[MUWU RK[RFY[ RMEJH", 26, "B[MPTP RW[M[MFWF RHEEH", "A]L[LF RLPXP RX[XF RGEDH", "GWR[RF RMEJH", 24, "B]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RHEEH", 24, "@[RQR[ RKFRQYF RFECH", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH", "MXRMRXSZU[ RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", 3, 4, "HZM[MFXF", "I[K[RFY[K[", 6, "H\\KFYFK[Y[", 7, "F^OPUP RPFTFVGXIYKZNZSYVXXVZT[P[NZLXKVJSJNKKLINGPF", 8, 9, "I[K[RFY[", 10, "G]L[LFX[XF", "H[L[W[ RLFWF RUPNP", 11, "G]L[LFXFX[", 12, 24, "H[W[L[SPLFWF", 13, 15, "G]R[RF RPITIWJYLZNZRYTWVTWPWMVKTJRJNKLMJPI", 14, "G]R[RF RHFJGKIKNLQMROSUSWRXQYNYIZG\\F", "F^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[", 27, "I[RQR[ RKFRQYF RN?O@NAM@N?NA RV?W@VAU@V?VA", 39, 40, 41, 42, "H[MMMXNZP[S[UZVYWWWPVNUM RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", 34, "H[SOUPVQWSWWVYUZS[P[NZMY RKbLaM_MINGPFSFUGVIVLUNSOQO", "JZRYRb RLMMMNNRYWM", "H[SMPMNNMOLQLWMYNZP[S[UZVYWWWQVOUNSMPLNKMINGPFTFVG", 35, "HZMFWFPMNPMSMWNYOZQ[S[U\\V^V_UaSbRb", "I\\NMN[ RNOONQMTMVNWPWb", "H[LPWP RPFSFUGVHWKWVVYUZS[P[NZMYLVLKMHNGPF", 36, 31, "JZRMM[ RMFOFPGRMW[", "H^MMMb RWXXZZ[ RMXNZP[T[VZWXWM", "J[MMR[WPWOVM", "HZMFWF RQFOGNINLONQOUO RQOOPNQMSMWNYOZQ[S[U\\V^V_UaSbRb", 19, "F]VMV[ ROMOXNZL[ RZMMMKNJP", "H\\MbMQNOONQMTMVNWOXQXWWYVZT[Q[OZMX", "HZVNTMPMNNMOLQLWMYNZP[S[U\\V^V_UaSb", "H\\YMPMNNMOLQLWMYNZP[S[UZVYWWWQVOUNSM", "H\\LPMNOMXM RRMRXSZU[", "H[MMMXNZP[S[UZVYWWWPVNUM", "G]MMLNKPKVLXNZP[T[VZXXYVYPXNVMUMSNRPRb", "IZWMLb RLMNNOPT_UaWb", "G]RMRb RKMKVLXNZP[T[VZXXYVYM", 43, "LXNFOGNHMGNFNH RVFWGVHUGVFVH RRMRXSZU[", "H[MMMXNZP[S[UZVYWWWPVNUM RNFOGNHMGNFNH RVFWGVHUGVFVH", 29, 44, 45, "G\\L[LF RXFLR ROOX[Qb", "H[SOUPVQWSWWVYUZS[P[NZMXMINGPFSFUGVIVLUNSOQO", "H[JPKQLSLVMYNZP[S[UZVYWVWKVHUGSFPFNGMHLJLLMNNOPPWP", "I\\KFMFOGQIRKR[ RRKSHTGVFWFYGZI", "NiTEQH RXFZF\\G^I_K_[ R_K`HaGcFdFfGgI", "I\\KFMFOGQIRKR[ RRKSHTGVFWFYGZI RN?O@NAM@N?NA RV?W@VAU@V?VA", 38, "F^RTRX R[MIM RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM", "IZLMNNOPOXNZM[LZLXMVVRWPWNVMUNTPTXUZW[V^U`TaRb", "G]R[Rb RPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF", "H[R[Rb RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[", "FZWFQFNGLIKKJOJRKVLXNZQ[R[T\\U^U_TaSbQb", "HZVMPMNNMOLQLWMYNZP[R[T\\U^U_TaRbPb", "HZTPMP RM[MFWF", "MZVPRP RWFUFSGRIR_QaOb", "H\\MFOGPILSXNTXUZW[", "I[RFMPWPR[", "H\\NGNL RXIULTNTW RKIMGPFTFVGXIYKZOZUYYX[", "H\\L[UR RR[WV RLMPNSPURWVXZXb", "CaRWRR R\\XY]V`SaMa RLFJGHIGLGUHXJZL[N[PZQYRWSYTZV[X[ZZ\\X]U]L\\IZGXF", "G]RTRX RXZW\\S`PaOa RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM", "G]XFXb RPFNGLIKMKTLXNZP[T[VZXX", "I\\WMWb RQMONNOMQMWNYOZQ[T[VZWY", "F]KFK[ RKQMOPNTNVOXQYTYWXZW\\U^R`Nb", "I[WLWMVPTRRSPSNRMPMONMPLRLTMVPWSWWVYUZS[M[", "F]KHLGOFTFWGXHYJYLXOVQJ[N^Q_V_Y^", "J[NNPMTMVNWPWRVTTVN[P]R^U^W]", "G]I[[[ RIFJFLGXZZ[ R[FZFXGLZJ[", "H[KMMNVZX[K[MZVNXM", "G\\XEVFOFMGLHKJKWLYMZO[T[VZWYXWXPWNVMTLNLLMKN", "H[WEVFTGPGNHMILKLWMYNZP[S[UZVYWWWQVOUNSMOMMNLO", "G]RFRb RKQKMYMYQ", "I[MMWM RRFRb", "IZLMNNOPOXNZM[LZLXMVVRWPWNVMUNTPTXUZW[", "H\\WbQbOaN`M^MQNOONQMTMVNWOXQXWWYVZT[Q[OZMX", 17, 18, 32, "HZLTST RVZT[P[NZMYLWLQMONNPMTMVN", "J\\XTQT RNZP[T[VZWYXWXQWOVNTMPMNN", "G\\LFL[ RLKTKVLWMXOXRWTVUTVLV", "H[MFMb RMNOMSMUNVOWQWWVYUZS[O[MZ", 5, "F^K[KFRMYFY[", "G]LbLMRSXMX[", "G\\J`S` RMbMQNOONQMTMVNWOXQXWWYVZT[Q[OZMX", "I^MYNZQ[S[VZXXYVZRZOYKXIVGSFQFNGMH", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RROQPRQSPRORQ", "I^MYNZQ[S[VZXXYVZRZOYKXIVGSFQFNGMH RROQPRQSPRORQ", "H[MPTP RW[M[MFWF RP>SA", "H[MPTP RW[M[MFWF RN?O@NAM@N?NA RV?W@VAU@V?VA", "JbLFXF RR[RF RRMXM[N]P^S^\\]_[aXbVb", "HZM[MFXF RT>QA", "F[JPTP RWYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG", 8, 27, "JZUFUUTXRZO[M[", "AbC[D[FZGXILJILGOFRFR[X[[Z]X^V^S]Q[OXNRN", "AbF[FF RRFR[X[[Z]X^V^S]Q[OXNFN", "JbLFXF RR[RF RRMXM[N]P^S^[", "G\\L[LF RX[OO RXFLR RT>QA", "G]LFL[XFX[ RP>SA", "G[KFRT RYFPXNZL[K[ RN>O@QASAU@V>", "G]R[R` RLFL[X[XF", 3, "G\\VFLFL[R[UZWXXVXSWQUORNLN", 4, "HZM[MFXF", "F^[`[[I[I` RW[WFRFPGOHNJL[", 6, "BbOOF[ RR[RF RRRFF R^[UO R^FRR", "I]PPTP RMGOFTFVGWHXJXLWNVOTPWQXRYTYWXYWZU[O[MZ", "G]LFL[XFX[", "G]LFL[XFX[ RN>O@QASAU@V>", 9, "F\\W[WFTFQGOINLLXKZI[H[", 10, 7, 11, "G]L[LFXFX[", 12, 5, 13, "G[KFRT RYFPXNZL[K[", "G]R[RF RPITIWJYLZNZRYTWVTWPWMVKTJRJNKLMJPI", 14, "G]XFX[ RLFL[Z[Z`", "H\\WFW[ RLFLNMPNQPRWR", "CaRFR[ RHFH[\\[\\F", "CaRFR[ RHFH[\\[\\F R\\[^[^`", "F]HFMFM[S[VZXXYVYSXQVOSNMN", "Da\\F\\[ RIFI[O[RZTXUVUSTQROONIN", "H]MFM[S[VZXXYVYSXQVOSNMN", "I^ZQPQ RMHNGQFSFVGXIYKZOZRYVXXVZS[Q[NZMY", "CaHFH[ ROPHP RTFXFZG\\I]M]T\\XZZX[T[RZPXOTOMPIRGTF", "G\\RQK[ RW[WFOFMGLHKJKMLOMPOQWQ", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR", "H[WEVFTGPGNHMILKLWMYNZP[S[UZVYWWWQVOUNSMOMMNLO", "I[STVUWWWXVZT[N[NMSMUNVPVQUSSTNT", "JYO[OMWM", "H[WOVNTMPMNNMOLQLWMYNZP[S[UZVYWWWJVHUGSFOFMG", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT", "F^QTJ[ RRUJM RRMR[ RZ[ST RZMRU", "K[RTTT RNNPMTMVNWPWQVSTTVUWWWXVZT[P[NZ", "H\\MMM[WMW[", "H\\MMM[WMW[ RNEOGQHSHUGVE", 31, "I[V[VMSMQNPPOXNZL[", "G]L[LMRXXMX[", "H[MTVT RMMM[ RVMV[", 19, "H[M[MMVMV[", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ", 17, "KYMMWM RRMR[", "JZMMR[ RWMR[P`OaMb", 38, "IZL[WM RLMW[", "I\\WMW[ RNMN[Y[Y`", "J\\VMV[ RNMNROTQUVU", "F^RMR[ RKMK[Y[YM", "F^RMR[ RKMK[Y[YM RY[[[[`", "HZJMNMN[S[UZVXVUUSSRNR", "F^YMY[ RKMK[P[RZSXSURSPRKR", "IZNMN[S[UZVXVUUSSRNR", "J\\XTQT RNNPMTMVNWOXQXWWYVZT[P[NZ", "E_JTPT RJMJ[ RT[RZQYPWPQQORNTMWMYNZO[Q[WZYYZW[T[", "I[RUM[ RV[VMPMNNMPMRNTPUVU", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RPESH", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNFOGNHMGNFNH RVFWGVHUGVFVH", "M^OKXK RRFR[ RRSSRUQWQYRZTZ[Y^WaVb", "JYO[OMWM RTEQH", "HZLTST RVZT[P[NZMYLWLQMONNPMTMVN", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN", "MWR[RM RRFQGRHSGRFRH", "LXNFOGNHMGNFNH RVFWGVHUGVFVH RR[RM", 18, "E^H[JZKXLPMNOMRMR[W[YZZXZUYSWRRR", "D^IMI[ RRMR[W[YZZXZVYTWSIS", "M^OKXK RRFR[ RRSSRUQWQYRZTZ[", "IZNMN[ RPSV[ RVMNU RTEQH", "H\\MMM[WMW[ RPESH", "JZMMR[ RWMR[P`OaMb RNEOGQHSHUGVE", "H]R[R` RMMM[W[WM", "CaRWRR RLFJGHIGLGUHXJZL[N[PZQYRWSYTZV[X[ZZ\\X]U]L\\IZGXF", 43, "F]IIVI RMFM[S[VZXXYVYSXQVOSNMN", "HZJMTM RNFN[S[UZVXVUUSSRNR", "D`IFI[ RYPIP R\\Y[ZX[V[SZQXPVOROOPKQISGVFXF[G\\H", "F^KMK[ RWTKT RZZX[T[RZQYPWPQQORNTMXMZN", "F^LSXS RRSR[ RH[RF\\[", "I[NUVU RRUR[ RK[RMY[", "AbF[FF RFS\\S RVSV[ RL[VF`[", "E_J[JM RVUV[ RZUJU RO[VM][", "E_R[RPJFZFRP RI[IVJSLQOPUPXQZS[V[[", "G]R[RTLMXMRT RK[KXLVMUOTUTWUXVYXY[", "AcF[FF RFPSP RV[VPNF^FVP RM[MVNSPQSPYP\\Q^S_V_[", "DaI[IM RITST RV[VTPM\\MVT RO[OXPVQUSTYT[U\\V]X][", "H\\OPSP RNAQFSBTAUA RLGNFSFUGVHWJWLVNUOSPVQWRXTXWWYVZT[O[M\\L^L_MaObWb", "J[RTTT ROHRMTIUHVH RNNPMTMVNWPWQVSTTVUWWWXVZT[Q[O\\N^N_OaQbVb", "G]R[RF RHFJGKIKNLQMROSUSWRXQYNYIZG\\F", "G]RMRb RKMKVLXNZP[T[VZXXYVYM", 32, 37, "I[KFR[YF", 20, "I[KFR[YF ROAL> RVAS>", "JZMMR[WM ROHLE RVHSE", "GmPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF R`Me[ RjMe[c`ba`b", "HkP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ R^Mc[ RhMc[a``a^b", "CaRXR^ RRCRI RMFJGHIGLGUHXJZM[W[ZZ\\X]U]L\\IZGWFMF", "G]RYR] RRKRO ROMMNLOKQKWLYMZO[U[WZXYYWYQXOWNUMOM", "CaRWRR RLFJGHIGLGUHXJZL[N[PZQYRWSYTZV[X[ZZ\\X]U]L\\IZGXF RLBM@O?R?U@X@", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RLIMGOFRFUGXG", "CaRWRR RLFJGHIGLGUHXJZL[N[PZQYRWSYTZV[X[ZZ\\X]U]L\\IZGXF RM<W< RR<R?", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RMEWE RRERH", "FZWGTFPFMGKIJKJNKPMRPSTST[", "FZVNTMPMNNMOLQLSMUNVPWTWT[", "H[N]UO ROQWU RT[LW", "JZMHMFWGWE", "JZMHUEVH", 16, 25, "KZLIMGOFRFUGXG", ":j>R?PAOCPDR RC^D\\F[H\\I^ RCFDDFCHDIF ROcPaR`TaUc ROAP?R>T?UA R[^\\\\^[`\\a^ R[F\\D^C`DaF R`RaPcOePfR", ":jDQ>Q RH[D_ RHGDC RR_Re RRCR= R\\[`_ R\\G`C R`QfQ", "G]LFL[XFX[ RX[[[Ub RN>O@QASAU@V>", "H\\MMM[WMW[ RW[Z[Tb RNEOGQHSHUGVE", "H]MFM[S[VZXXYVYSXQVOSNMN RJIPI", "IZKMQM RNFN[S[UZVXVUUSSRNR", "G\\L[LFTFVGWHXJXMWOVPTQLQ RTMXS", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RSWW]", "HZM[MFXFXA", "JYO[OMWMWH", "HZM[MFXF RJQRQ", "JYO[OMWM RLTTT", "H]M[MFXF RMMSMVNXPYSY\\X_VaSbQb", "J\\O[OMWM ROTTTVUWVXXX[W^UaTb", "BbOOF[ RR[RF RRRFF R^[UO R^FRR R^[`[``", "F^QTJ[ RRUJM RRMR[ RZ[ST RZMRU RZ[\\[\\`", "I]PPTP RMGOFTFVGWHXJXLWNVOTPWQXRYTYWXYWZU[O[MZ RR\\T]U_TaRbOb", "K[RTTT RNNPMTMVNWPWQVSTTVUWWWXVZT[P[NZ RR\\T]U_TaRbOb", "G\\L[LF RX[OO RXFLR RX[Z[Z`", "IZNMN[ RPSV[ RVMNU RV[X[X`", "G\\L[LF RX[OO RXFLR RPKPS", "IZNMN[ RPSV[ RVMNU RRORW", "G\\L[LF RX[OO RXFLR RIJOJ", "IZN[NF RPSV[ RVMNU RKJQJ", "E\\X[OO RXFLR RGFLFL[", "HZPSV[ RVMNU RJMNMN[", "G]L[LF RLPXP RX[XF RX[Z[Z`", "H[MTVT RMMM[ RVMV[ RV[X[X`", "GeL[LF RLPXP RX[XFcF", "H`MTVT RMMM[ RV[VM^M", "GhL[LFXFX[ RXM^MaNcPdSd\\c_aa^b\\b", "HcM[MMVMV[ RVT[T]U^V_X_[^^\\a[b", "F^QFNGLIKKJOJRKVLXNZQ[S[VZXXYVZRZMYJWIVITJSMSRTVUXWZY[[[", "H\\QMPMNNMOLQLWMYNZP[T[VZWYXWXRWPUOSPRRRWSYTZV[Y[", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR\\T]U_TaRbOb", "HZVZT[P[NZMYLWLQMONNPMTMVN RR\\T]U_TaRbOb", "JZLFXF RR[RF RR[T[T`", "KYMMWM RRMR[ RR[T[T`", 15, "JZR[Rb RMMR[WM", "I[RQR[ RKFRQYF RNUVU", "JZR[Rb RMMR[WM RN]V]", "H\\KFY[ RYFK[ RX[Z[Z`", "IZL[WM RLMW[ RV[X[X`", "D]FFRF RXFX[ RLFL[Z[Z`", "G\\RMIM RWMW[ RNMN[Y[Y`", "H\\WFW[ RLFLNMPNQPRWR RW[Y[Y`", "J\\VMV[ RNMNROTQUVU RV[X[X`", "H\\WFW[ RLFLNMPNQPRWR RRNRV", "J\\VMV[ RNMNROTQUVU RRQRY", "G]L[LF RL[ RLPRPUQWSXVX[", "H[M[MF RV[VPUNSMPMNNMO", "@^WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGXIYKZOJQGQEPDOCMCK", "E[VZT[P[NZMXMPNNPMTMVNWPWRMTKTISHQHO", "@^WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGXIYKZOJQGQEPDOCMCK RR[P]O_PaRbTb", "E[VZT[P[NZMXMPNNPMTMVNWPWRMTKTISHQHO RR[P]O_PaRbTb", 8, "BbOOF[ RR[RF RRRFF R^[UO R^FRR RN>O@QASAU@V>", "F^QTJ[ RRUJM RRMR[ RZ[ST RZMRU RNEOGQHSHUGVE", "G\\L[LF RX[OO RXFLR RX[X_WaUbSb", "IZNMN[ RPSV[ RVMNU RV[V_UaSbQb", "F\\W[WFTFQGOINLLXKZI[H[ RW[Z[Tb", "I[V[VMSMQNPPOXNZL[ RV[Y[Sb", "G]L[LF RLPXP RX[XF RX[X_WaUbSb", "H[MTVT RMMM[ RVMV[ RV[V_UaSbQb", "G]L[LF RLPXP RX[XF RX[[[Ub", "H[MTVT RMMM[ RVMV[ RV[Y[Sb", "H\\WFW[ RLFLNMPNQPRWR RW[U[U`", "J\\VMV[ RNMNROTQUVU RV[T[T`", "F^K[KFRUYFY[ RY[\\[Vb", "G]L[LMRXXMX[ RX[[[Ub", 8, 30, "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE", "I[MUWU RK[RFY[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNFOGNHMGNFNH RVFWGVHUGVFVH", "F`JURU RRPYP RH[OF\\F RRFR[\\[", "D`INKMOMQNRP R[ZY[U[SZRXRPSNUMYM[N\\P\\RRSKSITHVHXIZK[O[QZRX", "H[MPTP RW[M[MFWF RN>O@QASAU@V>", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNEOGQHSHUGVE", "F^MHNGQFSFVGXIYKZOZRYVXXVZS[Q[NZLXKVJRZP", 33, "F^MHNGQFSFVGXIYKZOZRYVXXVZS[Q[NZLXKVJRZP RNBOCNDMCNBND RVBWCVDUCVBVD", "I[NNPMTMVNWPWXVZT[P[NZMXMVWT RNFOGNHMGNFNH RVFWGVHUGVFVH", "BbOOF[ RR[RF RRRFF R^[UO R^FRR RN?O@NAM@N?NA RV?W@VAU@V?VA", "F^QTJ[ RRUJM RRMR[ RZ[ST RZMRU RNFOGNHMGNFNH RVFWGVHUGVFVH", "I]PPTP RMGOFTFVGWHXJXLWNVOTPWQXRYTYWXYWZU[O[MZ RN?O@NAM@N?NA RV?W@VAU@V?VA", "K[RTTT RNNPMTMVNWPWQVSTTVUWWWXVZT[P[NZ RNFOGNHMGNFNH RVFWGVHUGVFVH", 2, "JZMMVMOVRVTWUXVZV^U`TaRbObMa", "G]LFL[XFX[ RM@W@", "H\\MMM[WMW[ RMGWG", "G]LFL[XFX[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "H\\MMM[WMW[ RNFOGNHMGNFNH RVFWGVHUGVFVH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN?O@NAM@N?NA RV?W@VAU@V?VA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNFOGNHMGNFNH RVFWGVHUGVFVH", 32, 37, "G]KPYP RPFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN?O@NAM@N?NA RV?W@VAU@V?VA", "H[LTWT RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNFOGNHMGNFNH RVFWGVHUGVFVH", "I^ZPPP RMYNZQ[S[VZXXYVZRZOYKXIVGSFQFNGMH RN?O@NAM@N?NA RV?W@VAU@V?VA", "J\\XTQT RNZP[T[VZWYXWXQWOVNTMPMNN RNFOGNHMGNFNH RVFWGVHUGVFVH", "G[KFRT RYFPXNZL[K[ RM@W@", "JZMMR[ RWMR[P`OaMb RMGWG", "G[KFRT RYFPXNZL[K[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "JZMMR[ RWMR[P`OaMb RNFOGNHMGNFNH RVFWGVHUGVFVH", "G[KFRT RYFPXNZL[K[ RQ>NA RX>UA", "JZMMR[ RWMR[P`OaMb RQENH RXEUH", "H\\WFW[ RLFLNMPNQPRWR RN?O@NAM@N?NA RV?W@VAU@V?VA", "J\\VMV[ RNMNROTQUVU RNFOGNHMGNFNH RVFWGVHUGVFVH", "HZM[MFXF RM[O[O`", "JYO[OMWM RO[Q[Q`", "Da\\F\\[ RIFI[O[RZTXUVUSTQROONIN RN?O@NAM@N?NA RV?W@VAU@V?VA", "F^YMY[ RKMK[P[RZSXSURSPRKR RNFOGNHMGNFNH RVFWGVHUGVFVH", "HZWFMFM[Q[Q_PaNbLb RJQRQ", "JYWMOMO[S[S_RaPbNb RLTTT", "H\\KFY[ RYFK[ RX[X_WaUbSb", "IZL[WM RLMW[ RV[V_UaSbQb", "H\\KFY[ RYFK[ RNPVP", "IZL[WM RLMW[ RNTVT", "G\\WFW[Q[NZLXKVKSLQNOQNWN", "J[VMV[Q[OZNXNUOSQRVR", "B_RXSZU[X[ZZ[X[M RRFRXQZO[L[IZGXFVFSGQIOLNRN", "E]RXSZU[V[XZYXYQ RRMRXQZO[M[KZJXJUKSMRRR", "IePPTP RMGOFTFVGWHXJXLWNVOTPVQWRXTXXYZ[[^[`ZaXaM", "KbRTTT RNNPMTMVNWPWQVSTTVUWWWXXZZ[[[]Z^X^Q", "I\\PPTP RMGOFTFVGWHXJXLWNVOTPVQWRXTX[Z[Z`", "K[RTTT RNNPMTMVNWPWQVSTTVUWWW[Y[Y`", "FdH[I[KZLXNLOIQGTFWFWXXZZ[][_Z`X`M", "IaL[NZOXPPQNSMVMVXWZY[Z[\\Z]X]Q", "CaH[HF RHPTP RTFTXUZW[Z[\\Z]X]M", "F^KTTT RKMK[ RTMTXUZW[X[ZZ[X[R", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR", "HZUNSMPMNNMOLQLWMYNZP[T[VZVUSU", "J_LFXF RRFRXSZU[X[ZZ[X[M", "K]MMWM RRMRXSZU[V[XZYXYS", "G[PPTP RWGUFPFNGMHLJLLMNNOPPMQLRKTKWLYMZO[U[WZ", 35, "F\\W[WFTFQGOINLLXKZI[H[ RW[W_VaTbRb", "I[V[VMSMQNPPOXNZL[ RV[V_UaSbQb", "BaP[^F RD[E[GZHXJLKIMGPF^[", "E^[MO[ RH[JZKXLPMNOM[[", "E_\\FUO\\[ RJ[JFRFTGUHVJVMUOTPRQJQ", "F^KMKb R[MUT[[ RKNMMQMSNTOUQUWTYSZQ[M[KZ", "DaOQH[ RTFT[^[ R[QLQJPIOHMHJIHJGLF^F", "D`H[MU RRPRMKMINHPHRITKURU R[ZY[U[SZRXRPSNUMYM[N\\P\\RRT", "G]Z]X\\VZSWQVOV RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P[", "I\\WMWb RWZU[Q[OZNYMWMQNOONQMUMWN", "F^IFN[RLV[[F", 21, "G\\L[LF RX[OO RXFLR RXKRG", "IZNMN[ RPSV[ RVMNU RWQQM", "FgW[WFTFQGOINLLXKZI[H[ RWM]M`NbPcSc\\b_`a]b[b", "IcV[VMSMQNPPOXNZL[ RVT[T]U^V_X_[^^\\a[b", "GhL[LF RLPXP RX[XF RXM^MaNcPdSd\\c_aa^b\\b", "HcMTVT RMMM[ RVMV[ RVT[T]U^V_X_[^^\\a[b", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "JZNXVX RM[RMW[", "H\\LXRX RRTWT RRMR[Y[ RYMPMK[", "D`[ZY[U[SZRX RINKMOMQNRPRXQZO[K[IZHXHVRUYU[T\\R\\P[NYMUMSNRP", "I[STVUWWWXVZT[N[NMSMUNVPVQUSSTNT RKWQW", 17, "J[SMOMO[S[UZVYWVWRVOUNSM", "J[SMOMO[S[UZVYWVWRVOUNSM RLTRT", "JYOTTT RVMOMO[V[", "J[TTVSWQWPVNTMPMNN RRTTTVUWWWXVZT[P[NZ", "MWRMR[ RRbSaR`QaRbR`", "LYTMTWSYRZP[O[", 31, "JYOMO[V[ RLVRR", "G]L[LMRXXMX[", "I\\W[WMN[NM", 19, "J\\NNPMTMVNWOXQXWWYVZT[P[NZ", "G]YSYVXXWYUZOZMYLXKVKSLQMPOOUOWPXQYS", "G]XYYWYSXQWPUOOOMPLQKSKWLY", "G]YNK[ RYSYVXXWYUZOZMYLXKVKSLQMPOOUOWPXQYS", "DaINKMOMQNRPRXQZO[K[IZHXHVRT RRWSYTZV[Y[[Z\\Y]W]Q\\O[NYMVMTNSORQ", "G]OMNNMPNRPS RTSVRWPVNUM RPSTSVTWVWXVZT[P[NZMXMVNTPS", "I\\XTXQWOVNTMQMONNOMQMT", "H[LTLWMYNZP[S[UZVYWWWT", "I[N[NMTMVNWPWRVTTUNU", "I[RUM[ RV[VMPMNNMPMRNTPUVU", "I[RSMM RVMV[P[NZMXMVNTPSVS", "KYMMWM RRMR[", "H[MMMXNZP[S[UZVXVM", "G]KPYP RKYVYXXYVYSXQWP", "@]KPYP RKYVYXXYVYSXQWP REWFXEYDXEWEY REOFPEQDPEOEQ", "G]KKYK RWKXLYNYQXSVTKT RVTXUYWYZX\\V]K]", 20, 21, "IZLMWML[W[", "JZNMVMRRSRUSVUVXUZS[P[NZ", "H\\XNUMPMNNMOLQLSMUNVPWTXVYWZX\\X^W`VaTbObLa RRTR\\", "JZW[PROPPNRMTNUPTRM[", "JYO[OMWM", "JZM[RMW[", "H[M[MMVMV[", "I[N[NMTMVNWPWRVTTUNU", "I[RMR[ RLMMNMRNTPUTUVTWRWNXM", "I[V[VMSMQNPPOXNZL[", "JZNKVK RMNR@WN", "H\\LKRK RRGWG RR@RNYN RY@P@KN", "I[SGVHWJWKVMTNNNN@S@UAVCVDUFSGNG", "I[SGVHWJWKVMTNNNN@S@UAVCVDUFSGNG RKGQG", "J[S@O@ONSNUMVLWIWEVBUAS@", "JYOGTG RV@O@ONVN", "KZUGPG RN@U@UNNN", "HZUAS@P@NAMBLDLJMLNMPNTNVMVHSH", "H[MGVG RM@MN RV@VN", "MWRNR@ RUNON RU@O@", "LYT@TJSLRMPNON", "IZN@NN RPFVN RV@NH", "JYO@ONVN", "G]LNL@RKX@XN", "H[MNM@VNV@", "I\\WNW@NNN@", "H[PNNMMLLJLDMBNAP@S@UAVBWDWJVLUMSNPN", "G]O@NAMCNEPF RTFVEWCVAU@ RPFTFVGWIWKVMTNPNNMMKMINGPF", "I[NNN@T@VAWCWEVGTHNH", "I[RHWN RNNN@T@VAWCWEVGTHNH", "KYM@W@ RR@RN", "H[M@MKNMPNSNUMVKV@", "G]J@NNRDVNZ@", "KZOEQDSDUEVGVN RVMTNQNOMNKOIQHVH", "JYNDNKOMQNSNUM RNEPDSDUEVGUISJNJ", "H]WDUKTMRNPNNMMKMGNEPDRDTEVMWN", "H\\XMVNUNSMRK RLDODQERHRKQMONNNLMKKKJVJXIYGXEVDUDSERH", "KYO@ON ROMQNSNUMVKVGUESDQDOE", "KYU@UN RUESDQDOENGNKOMQNSNUM", "LYVMTNRNPMOKOGPERDSDUEVGVHOI", "LYOEQDSDUEVGVKUMSNRNPMOKOJVI", "LXPIRI RUETDPDOEOHPIOJOMPNTNUM", "LXRITI ROEPDTDUEUHTIUJUMTNPNOM", "KYUDUPTRRSOS RUESDQDOENGNKOMQNSNUM", "NVRDRN RRUSTRSQTRURS", "IZO@ON RUNQH RUDOJ", "G]KNKD RKEMDODQERGRN RRGSEUDVDXEYGYN", "KZODON ROEQDSDUEVGVPURSSRS", "KYQNOMNKNGOEQDSDUEVGVKUMSNQN", "LYOEQDSDUEVGVKUMSNQNOM", "KYNINGOEQDSDUEVGVI", "KYNINKOMQNSNUMVKVI", "KYOSOD ROEQDSDUEVGVKUMSNQNOM", "NXPDVD RR@RKSMUNVN", "KYUDUN RNDNKOMQNSNUM", "I[MFWF RMMTMVLWJWHVF", "G]YDYN RYMWNUNSMRKRD RRKQMONNNLMKKKD", "LXNDRNVD", "LXVNPGPEQDSDTETGNN", "KYSFRF RNSOQOCPAR@S@UAVCUESFUGVIVKUMSNQNOM", "KXRMRS RMDOERMVD", "KYSDQDOENGNKOMQNSNUMVKVGUESDPCOBOAP@U@", "I[MDLFLJMLNMPNTNVMWLXJXGWEUDSERGRS", "LXVDNS RNDPETRVS", "NVRWRa RRPQQRRSQRPRR", "LWPWPa RPZQXSWUW", "KYUWUa RNWN^O`QaSaU`", "LXNWRaVW", "KYSYRY RNfOdOVPTRSSSUTVVUXSYUZV\\V^U`SaQaO`", "KXR`Rf RMWOXR`VW", "KYOfOZPXRWSWUXVZV^U`SaQaO`", "I[MWLYL]M_N`PaTaV`W_X]XZWXUWSXRZRf", "LXVWNf RNWPXTeVf", "D`IMIXJZL[O[QZRX R[ZY[U[SZRXRPSNUMYM[N\\P\\RRT", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ RIHJGLFPHRGSF", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RQHRGTFXHZG[F", "MYOMWM RR[RISGUFWF RMTNSPRTTVSWR", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ RMTNSPRTTVSWR", "I\\NMN[ RNOONQMTMVNWPW[ RMTNSPRTTVSWR", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RI`J_L^P`R_S^", "KXP[PM RPQQORNTMVM RLTMSORSTUSVR", "KXM[S[ RVMTMRNQOPRP[ RLTMSORSTUSVR", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RNTOSQRUTWSXR", "MYOMWM RRFRXSZU[W[ RMSNRPQTSVRWQ", "IZLMWML[W[ RMTNSPRTTVSWR", "H[M[MJNHOGQFTFVG RMNOMSMUNVOWQWWVYUZS[O[MZ", "H[MGVG RM@MN RV@VN", "JZMMVMOURUTVUWVYV^U`TaRbPbNaM_M^N\\P[V[", "MlOMWM RRFRXSZU[W[ R^[^F Rg[gPfNdMaM_N^O RiC]`", "MWR[RM RU[O[ RUMOM ROTUT", "MXRMRXSZU[ ROTUT", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RHT\\T", "H[MMMXNZP[S[UZVXVM RHT\\T", "I\\XMUMUPWRXTXWWYVZT[Q[OZNYMWMTNRPPPMMM RHU\\U", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "I[MUWU RK[RFY[ RR`TaUcTeRfPeOcPaR`", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RR`TaUcTeRfPeOcPaR`", "G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP RR?Q@RAS@R?RA", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ RN?M@NAO@N?NA", "G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP RRbSaR`QaRbR`", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ RRbSaR`QaRbR`", "G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP RWaMa", "H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ RWaMa", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR\\T]U_TaRbOb RT>QA", "HZVZT[P[NZMYLWLQMONNPMTMVN RR\\T]U_TaRbOb RTEQH", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RR?Q@RAS@R?RA", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RV?U@VAW@V?VA", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RRbSaR`QaRbR`", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RSbTaS`RaSbS`", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RWaMa", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RXaNa", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RQ\\S]T_SaQbNb", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RS\\U]V_UaSbPb", "G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RVcR`Nc", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RWcS`Oc", "H[MPTP RW[M[MFWF RM@W@ RP9S<", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RMGWG RP>SA", "H[MPTP RW[M[MFWF RM@W@ RT9Q<", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RMGWG RT>QA", "H[MPTP RW[M[MFWF RVcR`Nc", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RVcR`Nc", "H[MPTP RW[M[MFWF RW`VaTbP`NaMb", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RW`VaTbP`NaMb", "H[MPTP RW[M[MFWF RR\\T]U_TaRbOb RN>O@QASAU@V>", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RR\\T]U_TaRbOb RNEOGQHSHUGVE", "HZTPMP RM[MFWF RR?Q@RAS@R?RA", "MYOMWM RR[RISGUFWF RT?S@TAU@T?TA", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RM@W@", "I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN RMGWG", "G]L[LF RLPXP RX[XF RR?Q@RAS@R?RA", "H[M[MF RV[VPUNSMPMNNMO RM?L@MAN@M?MA", "G]L[LF RLPXP RX[XF RRbSaR`QaRbR`", "H[M[MF RV[VPUNSMPMNNMO RRbSaR`QaRbR`", "G]L[LF RLPXP RX[XF RN?O@NAM@N?NA RV?W@VAU@V?VA", "H[M[MF RV[VPUNSMPMNNMO RI?J@IAH@I?IA RQ?R@QAP@Q?QA", "G]L[LF RLPXP RX[XF RL\\N]O_NaLbIb", "H[M[MF RV[VPUNSMPMNNMO RM\\O]P_OaMbJb", "G]L[LF RLPXP RX[XF RV`UbScQcObN`", "H[M[MF RV[VPUNSMPMNNMO RV`UbScQcObN`", "MWR[RF RW`VaTbP`NaMb", "MWR[RM RRFQGRHSGRFRH RW`VaTbP`NaMb", "MWR[RF RN?O@NAM@N?NA RV?W@VAU@V?VA RT9Q<", "MWR[RM RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", "G\\L[LF RX[OO RXFLR RT>QA", "IZN[NF RPSV[ RVMNU RPAMD", "G\\L[LF RX[OO RXFLR RRbSaR`QaRbR`", "IZN[NF RPSV[ RVMNU RRbSaR`QaRbR`", "G\\L[LF RX[OO RXFLR RWaMa", "IZN[NF RPSV[ RVMNU RWaMa", "HYW[M[MF RRbSaR`QaRbR`", "MXU[SZRXRF RSbTaS`RaSbS`", "HYW[M[MF RH@R@ RRbSaR`QaRbR`", "MXU[SZRXRF RM@W@ RSbTaS`RaSbS`", "HYW[M[MF RWaMa", "MXU[SZRXRF RXaNa", "HYW[M[MF RVcR`Nc", "MXU[SZRXRF RWcS`Oc", "F^K[KFRUYFY[ RT>QA", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ RTEQH", "F^K[KFRUYFY[ RR?Q@RAS@R?RA", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ RRFQGRHSGRFRH", "F^K[KFRUYFY[ RRbSaR`QaRbR`", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ RRbSaR`QaRbR`", "G]L[LFX[XF RR?Q@RAS@R?RA", "I\\NMN[ RNOONQMTMVNWPW[ RRFQGRHSGRFRH", "G]L[LFX[XF RRbSaR`QaRbR`", "I\\NMN[ RNOONQMTMVNWPW[ RRbSaR`QaRbR`", "G]L[LFX[XF RWaMa", "I\\NMN[ RNOONQMTMVNWPW[ RWaMa", "G]L[LFX[XF RVcR`Nc", "I\\NMN[ RNOONQMTMVNWPW[ RVcR`Nc", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RMAN@P?TAV@W? RT9Q<", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMHNGPFTHVGWF RT>QA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RMAN@P?TAV@W? RN:O;N<M;N:N< RV:W;V<U;V:V<", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMHNGPFTHVGWF RN?O@NAM@N?NA RV?W@VAU@V?VA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RM@W@ RP9S<", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMGWG RP>SA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RM@W@ RT9Q<", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMGWG RT>QA", "G\\L[LFTFVGWHXJXMWOVPTQLQ RT>QA", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RTEQH", "G\\L[LFTFVGWHXJXMWOVPTQLQ RR?Q@RAS@R?RA", "H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ RRFQGRHSGRFRH", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RR?Q@RAS@R?RA", "KXP[PM RPQQORNTMVM RSFRGSHTGSFSH", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RRbSaR`QaRbR`", "KXP[PM RPQQORNTMVM RPbQaP`OaPbP`", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RM@W@ RRbSaR`QaRbR`", "KXP[PM RPQQORNTMVM RNGXG RPbQaP`OaPbP`", "G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ RWaMa", "KXP[PM RPQQORNTMVM RUaKa", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RR?Q@RAS@R?RA", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RRFQGRHSGRFRH", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RRbSaR`QaRbR`", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RRbSaR`QaRbR`", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RU>RA RM>N?M@L?M>M@", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RUERH RMENFMGLFMEMG", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RN>RAV> RR:Q;R<S;R:R<", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RNERHVE RR?Q@RAS@R?RA", "H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RR?Q@RAS@R?RA RRbSaR`QaRbR`", "J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN RRFQGRHSGRFRH RRbSaR`QaRbR`", "JZLFXF RR[RF RR?Q@RAS@R?RA", "MYOMWM RRFRXSZU[W[ RR?Q@RAS@R?RA", "JZLFXF RR[RF RRbSaR`QaRbR`", "MYOMWM RRFRXSZU[W[ RTbUaT`SaTbT`", "JZLFXF RR[RF RWaMa", "MYOMWM RRFRXSZU[W[ RYaOa", "JZLFXF RR[RF RVcR`Nc", "MYOMWM RRFRXSZU[W[ RXcT`Pc", "G]LFLWMYNZP[T[VZWYXWXF RVbUaV`WaVbV` RNbMaN`OaNbN`", "H[VMV[ RMMMXNZP[S[UZVY RVbUaV`WaVbV` RNbMaN`OaNbN`", "G]LFLWMYNZP[T[VZWYXWXF RW`VaTbP`NaMb", "H[VMV[ RMMMXNZP[S[UZVY RW`VaTbP`NaMb", "G]LFLWMYNZP[T[VZWYXWXF RVcR`Nc", "H[VMV[ RMMMXNZP[S[UZVY RVcR`Nc", "G]LFLWMYNZP[T[VZWYXWXF RMAN@P?TAV@W? RT9Q<", "H[VMV[ RMMMXNZP[S[UZVY RMHNGPFTHVGWF RT>QA", "G]LFLWMYNZP[T[VZWYXWXF RM@W@ RN:O;N<M;N:N< RV:W;V<U;V:V<", "H[VMV[ RMMMXNZP[S[UZVY RMGWG RN?O@NAM@N?NA RV?W@VAU@V?VA", "I[KFR[YF RMAN@P?TAV@W?", "JZMMR[WM RMHNGPFTHVGWF", "I[KFR[YF RRbSaR`QaRbR`", "JZMMR[WM RRbSaR`QaRbR`", "F^IFN[RLV[[F RP>SA", "G]JMN[RQV[ZM RPESH", "F^IFN[RLV[[F RT>QA", "G]JMN[RQV[ZM RTEQH", "F^IFN[RLV[[F RN?O@NAM@N?NA RV?W@VAU@V?VA", "G]JMN[RQV[ZM RNFOGNHMGNFNH RVFWGVHUGVFVH", "F^IFN[RLV[[F RR?Q@RAS@R?RA", "G]JMN[RQV[ZM RRFQGRHSGRFRH", "F^IFN[RLV[[F RRbSaR`QaRbR`", "G]JMN[RQV[ZM RRbSaR`QaRbR`", "H\\KFY[ RYFK[ RR?Q@RAS@R?RA", "IZL[WM RLMW[ RRFQGRHSGRFRH", "H\\KFY[ RYFK[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "IZL[WM RLMW[ RNFOGNHMGNFNH RVFWGVHUGVFVH", "I[RQR[ RKFRQYF RR?Q@RAS@R?RA", "JZMMR[ RWMR[P`OaMb RRFQGRHSGRFRH", "H\\KFYFK[Y[ RNAR>VA", "IZLMWML[W[ RNHREVH", "H\\KFYFK[Y[ RRbSaR`QaRbR`", "IZLMWML[W[ RRbSaR`QaRbR`", "H\\KFYFK[Y[ RWaMa", "IZLMWML[W[ RWaMa", "H[M[MF RV[VPUNSMPMNNMO RWaMa", "MYOMWM RRFRXSZU[W[ RN?O@NAM@N?NA RV?W@VAU@V?VA", "G]JMN[RQV[ZM RRHPGOEPCRBTCUETGRH", "JZMMR[ RWMR[P`OaMb RRHPGOEPCRBTCUETGRH", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RWJYIZGYEWD", "MYR[RISGUFWF RT?S@TAU@T?TA", "MYR[RISGUFWF ROSUO", "MYR[RISGUFWF ROLUL", "E^J[JLKIMGPFZFSNVNXOYPZRZWYYXZV[R[PZOY", "H[SMPMNNMOLQLWMYNZP[S[UZVYWWWQVOUNSMPLNKMINGPFTFVG", "I[MUWU RK[RFY[ RRbSaR`QaRbR`", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRbSaR`QaRbR`", "I[MUWU RK[RFY[ RRAT?U=T;R:P:", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRHTFUDTBRAPA", "I[MUWU RK[RFY[ RU>X; RNAR>VA", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RUEXB RNHREVH", "I[MUWU RK[RFY[ RO>L; RNAR>VA", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR ROELB RNHREVH", "I[MUWU RK[RFY[ RNAR>VA RXAZ?[=Z;X:V:", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHREVH RXHZF[DZBXAVA", "I[MUWU RK[RFY[ RNAR>VA RM<N;P:T<V;W:", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHREVH RMAN@P?TAV@W?", "I[MUWU RK[RFY[ RNAR>VA RRbSaR`QaRbR`", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHREVH RRbSaR`QaRbR`", "I[MUWU RK[RFY[ RN>O@QASAU@V> RT9Q<", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE RT>QA", "I[MUWU RK[RFY[ RN>O@QASAU@V> RP9S<", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE RP>SA", "I[MUWU RK[RFY[ RN>O@QASAU@V> RP>R<S:R8P7N7", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE RPERCSAR?P>N>", "I[MUWU RK[RFY[ RN>O@QASAU@V> RM<N;P:T<V;W:", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE RMAN@P?TAV@W?", "I[MUWU RK[RFY[ RN>O@QASAU@V> RRbSaR`QaRbR`", "I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNEOGQHSHUGVE RRbSaR`QaRbR`", "H[MPTP RW[M[MFWF RRbSaR`QaRbR`", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RRbSaR`QaRbR`", "H[MPTP RW[M[MFWF RRAT?U=T;R:P:", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RRHTFUDTBRAPA", "H[MPTP RW[M[MFWF RMAN@P?TAV@W?", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RMHNGPFTHVGWF", "H[MPTP RW[M[MFWF RU>X; RNAR>VA", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RUEXB RNHREVH", "H[MPTP RW[M[MFWF RO>L; RNAR>VA", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT ROELB RNHREVH", "H[MPTP RW[M[MFWF RNAR>VA RXAZ?[=Z;X:V:", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHREVH RXHZF[DZBXAVA", "H[MPTP RW[M[MFWF RNAR>VA RM<N;P:T<V;W:", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHREVH RMAN@P?TAV@W?", "H[MPTP RW[M[MFWF RNAR>VA RRbSaR`QaRbR`", "I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHREVH RRbSaR`QaRbR`", "MWR[RF RRAT?U=T;R:P:", "MWR[RM RRHTFUDTBRAPA", "MWR[RF RRbSaR`QaRbR`", "MWR[RM RRFQGRHSGRFRH RRbSaR`QaRbR`", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RRbSaR`QaRbR`", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RRbSaR`QaRbR`", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RRAT?U=T;R:P:", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RRHTFUDTBRAPA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RU>X; RNAR>VA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUEXB RNHREVH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RO>L; RNAR>VA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ ROELB RNHREVH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAR>VA RXAZ?[=Z;X:V:", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHREVH RXHZF[DZBXAVA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAR>VA RM<N;P:T<V;W:", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHREVH RMAN@P?TAV@W?", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAR>VA RRbSaR`QaRbR`", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHREVH RRbSaR`QaRbR`", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA RT>QA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH RTEQH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA RP>SA", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH RPESH", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA RRAT?U=T;R:P:", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH RRHTFUDTBRAPA", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA RWAVBTCPANBMC", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH RWHVITJPHNIMJ", "G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RVGXFYDXBWA RRbSaR`QaRbR`", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RUNWMXKWIVH RRbSaR`QaRbR`", "G]LFLWMYNZP[T[VZWYXWXF RRbSaR`QaRbR`", "H[VMV[ RMMMXNZP[S[UZVY RRbSaR`QaRbR`", "G]LFLWMYNZP[T[VZWYXWXF RRAT?U=T;R:P:", "H[VMV[ RMMMXNZP[S[UZVY RRHTFUDTBRAPA", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@ RT>QA", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG RTEQH", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@ RP>SA", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG RPESH", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@ RRAT?U=T;R:P:", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG RRHTFUDTBRAPA", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@ RWAVBTCPANBMC", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG RWHVITJPHNIMJ", "G]LFLWMYNZP[T[VZWYXWXF RXFZE[CZAY@ RRbSaR`QaRbR`", "H[VMV[ RMMMXNZP[S[UZVY RVMXLYJXHWG RRbSaR`QaRbR`", "I[RQR[ RKFRQYF RP>SA", "JZMMR[ RWMR[P`OaMb RPESH", "I[RQR[ RKFRQYF RRbSaR`QaRbR`", "JZMMR[ RWMR[P`OaMb RVbWaV`UaVbV`", "I[RQR[ RKFRQYF RRAT?U=T;R:P:", "JZMMR[ RWMR[P`OaMb RRHTFUDTBRAPA", "I[RQR[ RKFRQYF RMAN@P?TAV@W?", "JZMMR[ RWMR[P`OaMb RMHNGPFTHVGWF", "E\\PFP[ RJFJ[Z[", "J[MMWM ROFOXPZR[ RX[VZUXUF", "G]QFOGMJLMLWMYNZP[T[VZXXYVYTXPVMUL", "H[QMONNOMQMWNYOZQ[S[UZVYWWWUVSURSQ", "G[KFRT RYFRTPXOZM[KZJXKVMUOVPX", "JZMMR[ RWMR[Q_PaNbLaK_L]N\\P]Q_", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQHRHSGSE", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQEQGRHSH", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEWH RMHNHOGOE", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEWH RMEMGNHOH", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RXEUH RMHNHOGOE", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RXEUH RMEMGNHOH", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQHRHSGSE RMAN@P?TAV@W?", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQEQGRHSH RMAN@P?TAV@W?", "G[MUWU RK[RFY[ RJHKHLGLE", "G[MUWU RK[RFY[ RJEJGKHLH", "?[MUWU RK[RFY[ RIELH RBHCHDGDE", "?[MUWU RK[RFY[ RIELH RBEBGCHDH", "?[MUWU RK[RFY[ RMEJH RBHCHDGDE", "?[MUWU RK[RFY[ RMEJH RBEBGCHDH", "D[MUWU RK[RFY[ RFAG@I?MAO@P? RJHKHLGLE", "D[MUWU RK[RFY[ RFAG@I?MAO@P? RJEJGKHLH", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RQHRHSGSE", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RQEQGRHSH", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RTEWH RMHNHOGOE", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RTEWH RMEMGNHOH", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RXEUH RMHNHOGOE", "IZPTNUMWMXNZP[T[VZ RRTPTNSMQMPNNPMTMVN RXEUH RMEMGNHOH", 23, 23, "B[MPTP RW[M[MFWF REHFHGGGE", "B[MPTP RW[M[MFWF REEEGFHGH", ":[MPTP RW[M[MFWF RDEGH R=H>H?G?E", ":[MPTP RW[M[MFWF RDEGH R=E=G>H?H", ":[MPTP RW[M[MFWF RHEEH R=H>H?G?E", ":[MPTP RW[M[MFWF RHEEH R=E=G>H?H", 23, 23, "I\\NMN[ RNOONQMTMVNWPWb RQHRHSGSE", "I\\NMN[ RNOONQMTMVNWPWb RQEQGRHSH", "I\\NMN[ RNOONQMTMVNWPWb RTEWH RMHNHOGOE", "I\\NMN[ RNOONQMTMVNWPWb RTEWH RMEMGNHOH", "I\\NMN[ RNOONQMTMVNWPWb RXEUH RMHNHOGOE", "I\\NMN[ RNOONQMTMVNWPWb RXEUH RMEMGNHOH", "I\\NMN[ RNOONQMTMVNWPWb RQHRHSGSE RMAN@P?TAV@W?", "I\\NMN[ RNOONQMTMVNWPWb RQEQGRHSH RMAN@P?TAV@W?", "A]L[LF RLPXP RX[XF RDHEHFGFE", "A]L[LF RLPXP RX[XF RDEDGEHFH", "9]L[LF RLPXP RX[XF RCEFH R<H=H>G>E", "9]L[LF RLPXP RX[XF RCEFH R<E<G=H>H", "9]L[LF RLPXP RX[XF RGEDH R<H=H>G>E", "9]L[LF RLPXP RX[XF RGEDH R<E<G=H>H", ">]L[LF RLPXP RX[XF R@AA@C?GAI@J? RDHEHFGFE", ">]L[LF RLPXP RX[XF R@AA@C?GAI@J? RDEDGEHFH", "MXRMRXSZU[ RQHRHSGSE", "MXRMRXSZU[ RQEQGRHSH", "MXRMRXSZU[ RTEWH RMHNHOGOE", "MXRMRXSZU[ RTEWH RMEMGNHOH", "MXRMRXSZU[ RXEUH RMHNHOGOE", "MXRMRXSZU[ RXEUH RMEMGNHOH", "MXRMRXSZU[ RQHRHSGSE RMAN@P?TAV@W?", "MXRMRXSZU[ RQEQGRHSH RMAN@P?TAV@W?", "GWR[RF RJHKHLGLE", "GWR[RF RJEJGKHLH", "?WR[RF RIELH RBHCHDGDE", "?WR[RF RIELH RBEBGCHDH", "?WR[RF RMEJH RBHCHDGDE", "?WR[RF RMEJH RBEBGCHDH", "DWR[RF RFAG@I?MAO@P? RJHKHLGLE", "DWR[RF RFAG@I?MAO@P? RJEJGKHLH", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RQHRHSGSE", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RQEQGRHSH", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RTEWH RMHNHOGOE", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RTEWH RMEMGNHOH", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RXEUH RMHNHOGOE", "H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RXEUH RMEMGNHOH", 23, 23, "B]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF REHFHGGGE", "B]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF REEEGFHGH", ":]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RDEGH R=H>H?G?E", ":]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RDEGH R=E=G>H?H", ":]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RHEEH R=H>H?G?E", ":]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RHEEH R=E=G>H?H", 23, 23, "H[MMMXNZP[S[UZVYWWWPVNUM RQHRHSGSE", "H[MMMXNZP[S[UZVYWWWPVNUM RQEQGRHSH", "H[MMMXNZP[S[UZVYWWWPVNUM RTEWH RMHNHOGOE", "H[MMMXNZP[S[UZVYWWWPVNUM RTEWH RMEMGNHOH", "H[MMMXNZP[S[UZVYWWWPVNUM RXEUH RMHNHOGOE", "H[MMMXNZP[S[UZVYWWWPVNUM RXEUH RMEMGNHOH", "H[MMMXNZP[S[UZVYWWWPVNUM RQHRHSGSE RMAN@P?TAV@W?", "H[MMMXNZP[S[UZVYWWWPVNUM RQEQGRHSH RMAN@P?TAV@W?", 23, "@[RQR[ RKFRQYF RCECGDHEH", 23, "8[RQR[ RKFRQYF RBEEH R;E;G<H=H", 23, "8[RQR[ RKFRQYF RFECH R;E;G<H=H", 23, "=[RQR[ RKFRQYF R?A@@B?FAH@I? RCECGDHEH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQHRHSGSE", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQEQGRHSH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEWH RMHNHOGOE", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEWH RMEMGNHOH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RXEUH RMHNHOGOE", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RXEUH RMEMGNHOH", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQHRHSGSE RMAN@P?TAV@W?", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQEQGRHSH RMAN@P?TAV@W?", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RCHDHEGEE", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RCECGDHEH", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RBEEH R;H<H=G=E", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RBEEH R;E;G<H=H", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH R;H<H=G=E", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH R;E;G<H=H", "=^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ R?A@@B?FAH@I? RCHDHEGEE", "=^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ R?A@@B?FAH@I? RCECGDHEH", 39, 39, 40, 40, 41, 41, 42, 42, 29, 29, 44, 44, 45, 45, 23, 23, "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQHRHSGSE RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQEQGRHSH RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEWH RMHNHOGOE RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEWH RMEMGNHOH RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RXEUH RMHNHOGOE RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RXEUH RMEMGNHOH RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQHRHSGSE RMAN@P?TAV@W? RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RQEQGRHSH RMAN@P?TAV@W? RR`RcSdTd", "G[MUWU RK[RFY[ RJHKHLGLE RR`RcSdTd", "G[MUWU RK[RFY[ RJEJGKHLH RR`RcSdTd", "?[MUWU RK[RFY[ RIELH RBHCHDGDE RR`RcSdTd", "?[MUWU RK[RFY[ RIELH RBEBGCHDH RR`RcSdTd", "?[MUWU RK[RFY[ RMEJH RBHCHDGDE RR`RcSdTd", "?[MUWU RK[RFY[ RMEJH RBEBGCHDH RR`RcSdTd", "D[MUWU RK[RFY[ RFAG@I?MAO@P? RJHKHLGLE RR`RcSdTd", "D[MUWU RK[RFY[ RFAG@I?MAO@P? RJEJGKHLH RR`RcSdTd", "I\\NMN[ RNOONQMTMVNWPWb RQHRHSGSE RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RQEQGRHSH RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RTEWH RMHNHOGOE RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RTEWH RMEMGNHOH RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RXEUH RMHNHOGOE RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RXEUH RMEMGNHOH RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RQHRHSGSE RMAN@P?TAV@W? RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RQEQGRHSH RMAN@P?TAV@W? RN`NcOdPd", "N]L[LF RLPXP RX[XF RR`RcSdTd", "A]L[LF RLPXP RX[XF RDEDGEHFH RR`RcSdTd", "9]L[LF RLPXP RX[XF RCEFH R<H=H>G>E RR`RcSdTd", "9]L[LF RLPXP RX[XF RCEFH R<E<G=H>H RR`RcSdTd", "9]L[LF RLPXP RX[XF RGEDH R<H=H>G>E RR`RcSdTd", "9]L[LF RLPXP RX[XF RGEDH R<E<G=H>H RR`RcSdTd", ">]L[LF RLPXP RX[XF R@AA@C?GAI@J? RDHEHFGFE RR`RcSdTd", ">]L[LF RLPXP RX[XF R@AA@C?GAI@J? RDEDGEHFH RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQHRHSGSE RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQEQGRHSH RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEWH RMHNHOGOE RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEWH RMEMGNHOH RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RXEUH RMHNHOGOE RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RXEUH RMEMGNHOH RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQHRHSGSE RMAN@P?TAV@W? RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RQEQGRHSH RMAN@P?TAV@W? RR`RcSdTd", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RCHDHEGEE RR`RcSdTd", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RCECGDHEH RR`RcSdTd", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RBEEH R;H<H=G=E RR`RcSdTd", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RBEEH R;E;G<H=H RR`RcSdTd", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH R;H<H=G=E RR`RcSdTd", "8^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH R;E;G<H=H RR`RcSdTd", "=^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ R?A@@B?FAH@I? RCHDHEGEE RR`RcSdTd", "=^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ R?A@@B?FAH@I? RCECGDHEH RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RNEOGQHSHUGVE", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RMGWG", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RPESH RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RR`RcSdTd", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RTEQH RR`RcSdTd", 23, "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RMHNGPFTHVGWF", "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RMHNGPFTHVGWF RR`RcSdTd", 30, "I[MUWU RK[RFY[ RM@W@", "G[MUWU RK[RFY[ RIELH", "G[MUWU RK[RFY[ RMEJH", "I[MUWU RK[RFY[ RR`RcSdTd", "NVQHRHSGSE", "NVR`RcSdTd", "NVQHRHSGSE", "KZMHNGPFTHVGWF", "LXMCNBPATCVBWA RNFOGNHMGNFNH RVFWGVHUGVFVH", "I\\NMN[ RNOONQMTMVNWPWb RPESH RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RN`NcOdPd", "I\\NMN[ RNOONQMTMVNWPWb RTEQH RN`NcOdPd", 23, "I\\NMN[ RNOONQMTMVNWPWb RMHNGPFTHVGWF", "I\\NMN[ RNOONQMTMVNWPWb RMHNGPFTHVGWF RN`NcOdPd", "B[MPTP RW[M[MFWF RDEGH", "B[MPTP RW[M[MFWF RHEEH", "A]L[LF RLPXP RX[XF RCEFH", "A]L[LF RLPXP RX[XF RGEDH", "G]L[LF RLPXP RX[XF RR`RcSdTd", "JZTEWH RMHNHOGOE", "JZXEUH RMHNHOGOE", "NVQHRHSGSE RMAN@P?TAV@W?", "MXRMRXSZU[ RNEOGQHSHUGVE", "MXRMRXSZU[ RMGWG", "MXRMRXSZU[ RNFOGNHMGNFNH RVFWGVHUGVFVH RP>SA", "MXRMRXSZU[ RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", 23, 23, "MXRMRXSZU[ RMHNGPFTHVGWF", "MXRMRXSZU[ RMCNBPATCVBWA RNFOGNHMGNFNH RVFWGVHUGVFVH", "MWR[RF RN>O@QASAU@V>", "MWR[RF RM@W@", "GWR[RF RIELH", "GWR[RF RMEJH", 23, "JZTEWH RMEMGNHOH", "JZXEUH RMEMGNHOH", "NVQEQGRHSH RMAN@P?TAV@W?", "H[MMMXNZP[S[UZVYWWWPVNUM RNEOGQHSHUGVE", "H[MMMXNZP[S[UZVYWWWPVNUM RMGWG", "H[MMMXNZP[S[UZVYWWWPVNUM RNFOGNHMGNFNH RVFWGVHUGVFVH RP>SA", "H[MMMXNZP[S[UZVYWWWPVNUM RNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", "H\\MbMQNOONQMTMVNWOXQXWWYVZT[Q[OZMX RQHRHSGSE", "H\\MbMQNOONQMTMVNWOXQXWWYVZT[Q[OZMX RQEQGRHSH", "H[MMMXNZP[S[UZVYWWWPVNUM RMHNGPFTHVGWF", "H[MMMXNZP[S[UZVYWWWPVNUM RMCNBPATCVBWA RNFOGNHMGNFNH RVFWGVHUGVFVH", "I[RQR[ RKFRQYF RN>O@QASAU@V>", "I[RQR[ RKFRQYF RM@W@", "@[RQR[ RKFRQYF RBEEH", "@[RQR[ RKFRQYF RFECH", "A\\L[LFTFVGWHXJXMWOVPTQLQ RDEDGEHFH", "LXNFOGNHMGNFNH RVFWGVHUGVFVH RP>SA", "LXNFOGNHMGNFNH RVFWGVHUGVFVH RT>QA", 16, 23, 23, "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RPESH RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RR`RcSdTd", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RTEQH RR`RcSdTd", 23, "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RMHNGPFTHVGWF", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RMHNGPFTHVGWF RR`RcSdTd", "B]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RDEGH", "B]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RHEEH", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RBEEH", "@^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RFECH", "F^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[ RR`RcSdTd", 25, "NVQEQGRHSH", 23, "F^", "LX", "F^", "LX", "NV", "OU", "PT", "H\\", "MW", "PT", "QS", 24, 24, 24, 24, 24, 46, 46, "H\\JRZR", "LXVTNT", "F^IT[T", "F^IT[T", "H\\ODOb RUDUb", "JZJbZb RJ]Z]", "MWQGQFRDSC", "MWSFSGRIQJ", "MWSZS[R]Q^", "MWQFQGRISJ", "JZUGUFVDWC RMGMFNDOC", "JZOFOGNIMJ RWFWGVIUJ", "JZOZO[N]M^ RWZW[V]U^", "JZUFUGVIWJ RMFMGNIOJ", "I[MMWM RRFRb", "I[M[W[ RMMWM RRFRb", "E_PQPU RQUQQ RRPRV RSUSQ RTQTU RPTRVTT RPRRPTR RPQRPTQUSTURVPUOSPQ", "E_PPPV RQQQU RRQRU RSSUS RSRST ROPUSOV RVSOWOOVS", "MWRYSZR[QZRYR[", "MaRYSZR[QZRYR[ R\\Y]Z\\[[Z\\Y\\[", "MkRYSZR[QZRYR[ R\\Y]Z\\[[Z\\Y\\[ RfYgZf[eZfYf[", 26, 24, 24, 24, 24, 24, 24, 24, 24, "FjJ[ZF RMFOGPIOKMLKKJIKGMF RcUeVfXeZc[aZ`XaVcU RYZZXYVWUUVTXUZW[YZ", "FvJ[ZF RMFOGPIOKMLKKJIKGMF RcUeVfXeZc[aZ`XaVcU RoUqVrXqZo[mZlXmVoU RYZZXYVWUUVTXUZW[YZ", "MWTFQL", "JZQFNL RWFTL", "G]NFKL RTFQL RZFWL", "MWPFSL", "JZSFVL RMFPL", "G]VFYL RPFSL RJFML", "LXVcR`Nc", "KYUMOSUY", "KYOMUSOY", "E_LMXY RXMLY RKRLSKTJSKRKT RRYSZR[QZRYR[ RRKSLRMQLRKRM RYRZSYTXSYRYT", "MaRYSZR[QZRYR[ RRSQGRFSGRSRF R\\Y]Z\\[[Z\\Y\\[ R\\S[G\\F]G\\S\\F", "I[QFQS RQYRZQ[PZQYQ[ RQYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS RMGOFTFVGWIWKVMUNSORPQRQS", "E_JGZG", "OUb`aa^c\\dYeTfPfKeHdFcCaB`", "OUBFCEFCHBKAP@T@YA\\B^CaEbF", "E_N_VW RV_R[", "CaKRKW RRFRK RYRYW RFUKWPU RH[KWN[ RMIRKWI ROORKUO RTUYW^U RV[YW\\[", 46, 1, "KYQSVS RVbQbQDVD", "KYSSNS RNbSbSDND", "ImQYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS RcYdZc[bZcYc[ R_GaFfFhGiIiKhMgNeOdPcRcS", "IeQYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS R`YaZ`[_Z`Y`[ R`S_G`FaG`S`F", "MiRYSZR[QZRYR[ RRSQGRFSGRSRF R_Y`Z_[^Z_Y_[ R[G]FbFdGeIeKdMcNaO`P_R_S", "KYNMVMPb", "G^NMN[ RUMUXVZX[ RJMWMYNZP", "H\\NQNU RWPWV RPVPPOQOUPV RQPPPNQMSNUPVQVQP", "H\\VQVU RMPMV RTVTPUQUUTV RSPTPVQWSVUTVSVSP", "JZR[RV RWXRVMX RURRVOR", "MWQZQ[R]S^ RRNQORPSORNRP", "OUBFCEFCHBKAP@T@YA\\B^CaEbF Rb`aa^c\\dYeTfPfKeHdFcCaB`", "JZRFRK RMIRKWI ROORKUO RRFRK RWIRKMI RUORKOO", "JZM^WB RNFOGNHMGNFNH RVYWZV[UZVYV[", "E_JSKRNQQRSTVUYTZS", ">fB^B]C[EZOZQYRWSYUZ_Za[b]b^", "E_JSZS RR[RK RLMXY RXMLY", "E_LRMSLTKSLRLT RXYYZX[WZXYX[ RXKYLXMWLXKXM", "D`KFHL RQFNL RWFTL R]FZL", "E_KRLSKTJSKRKT RRYSZR[QZRYR[ RRKSLRMQLRKRM RYRZSYTXSYRYT", "E_LXMYLZKYLXLZ RLLMMLNKMLLLN RRRSSRTQSRRRT RXXYYXZWYXXXZ RXLYMXNWMXLXN", "MWRYSZR[QZRYR[ RRNSORPQORNRP", "E_KRLSKTJSKRKT RRYSZR[QZRYR[ RRKSLRMQLRKRM RYRZSYTXSYRYT", "E_JSZS RR[RK RLXMYLZKYLXLZ RLLMMLNKMLLLN RXXYYXZWYXXXZ RXLYMXNWMXLXN", "CaR\\S]R^Q]R\\R^ RRRSSRTQSRRRT RRHSIRJQIRHRJ", "CaR^S_R`Q_R^R` RRVSWRXQWRVRX RRNSORPQORNRP RRFSGRHQGRFRH", "OU", 24, 24, 24, 24, 24, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, "JZQ@S@UAVDVJUMSNQNOMNJNDOAQ@", "NVRDRN RR=Q>R?S>R=R?", 23, 23, "JZUFUN RQ@NJWJ", "JZV@O@NFPESEUFVHVKUMSNPNNM", "JZNHOFQESEUFVHVKUMSNQNOMNKNFOCPAR@U@", "JZM@W@PN", "JZQFOENCOAQ@S@UAVCUESFQFOGNINKOMQNSNUMVKVIUGSF", "JZVFUHSIQIOHNFNCOAQ@S@UAVCVHUKTMRNON", "I[LHXH RRBRN", "I[LHXH", "I[LJXJ RLFXF", "MWT=S>RAQFQJROSRTS", "MWP=Q>RASFSJROQRPS", "KZODON ROEQDSDUEVGVN", "JZQSSSUTVWV]U`SaQaO`N]NWOTQS", "JZVaNa RNVPURSRa", "JZNTPSSSUTVVVXUZNaVa", "JZNSVSRXSXUYV[V^U`SaPaN`", "JZUYUa RQSN]W]", "JZVSOSNYPXSXUYV[V^U`SaPaN`", "JZN[OYQXSXUYV[V^U`SaQaO`N^NYOVPTRSUS", "JZMSWSPa", "JZQYOXNVOTQSSSUTVVUXSYQYOZN\\N^O`QaSaU`V^V\\UZSY", "JZVYU[S\\Q\\O[NYNVOTQSSSUTVVV[U^T`RaOa", "I[L[X[ RRURa", "I[L[X[", "I[L]X] RLYXY", "MWTPSQRTQYQ]RbSeTf", "MWPPQQRTSYS]RbQePf", 24, "KZOXQWSWUXVZVa RV`TaQaO`N^O\\Q[V[", "LYV`TaRaP`O^OZPXRWSWUXVZV[O\\", "KYQaO`N^NZOXQWSWUXVZV^U`SaQa", "KYNWVa RVWNa", "LYOXQWSWUXVZV^U`SaRaP`O^O]V\\", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "F[XMPMP[X[ RTGRFNFLGKHJJJPKRLSNTUT", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RSBG_ RZBN_", "F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR[RM RRQSOTNVMXM", "HZTPMP RM[MFWF RJVRV", "H[LMTM RL[W[ RO[OIPGRFUFWG RLSTS", "D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[ RWHM`", "G]L[LFX[XF RHV\\V RHP\\P", "GyL[LFTFVGWHXJXMWOVPTQLQ R^MfM RaFaXbZd[f[ RlZn[r[tZuXuWtUrToTmSlQlPmNoMrMtN", "GmX[QQ RL[LFTFVGWHXJXMWOVPTQLQ R`Zb[f[hZiXiWhUfTcTaS`Q`PaNcMfMhN", "F^IFN[RLV[[F RHV\\V RHP\\P", "D`I[IFOFRGTIULUR RONOUPXRZU[[[[F", "I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN RRHZH RXaNa", "F[HSQS RHNTN RWYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH", "G\\L[LF RX[OO RXFLR RLOTO", "JZLFXF RR[RF ROVUR ROPUL", "IoK[RFY[K[ R`b`QaObNdMgMiNjOkQkWjYiZg[d[bZ`X", "G]ITJSLRNSOTQUSTXOYLYIXGVFUFSGRIRLSOXTYVYWXYWZT[", "G\\L[LFTFVGWHXJXMWOVPTQLQ RHL\\L", "F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR RRCR^", "I[K[RFY[ RHV\\V RHP\\P", "H\\XZU[P[NZMYLWLUMSNRPQTPVOWNXLXJWHVGTFOFLG RRCR^", "HZVZT[P[NZMYLWLQMONNPMTMVN RRJR^", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "F^J[O[OWMVKTJQJLKIMGPFTFWGYIZLZQYTWVUWU[Z[", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "E_ZSJS RNWJSNO", "E_R[RK RNORKVO", "E_JSZS RVWZSVO", "E_RKR[ RVWR[NW", "E_JSZS RVWZSVO RNOJSNW", "E_R[RK RNORKVO RVWR[NW", "E_KLYZ RRLKLKS", "E_YLKZ RRLYLYS", "E_YZKL RRZYZYS", "E_KZYL RRZKZKS", "E_ZSJS RRWVO RNOJSNW", "E_JSZS RRONW RVWZSVO", "E_JWJQPQ RJQMTOUQTSRUQWRZU", "E_ZWZQTQ RZQWTUUSTQROQMRJU", "E_ZSJS RTOPSTW RNWJSNO", "E_R[RK RNURQVU RNORKVO", "E_JSZS RPOTSPW RVWZSVO", "E_RKR[ RVQRUNQ RVWR[NW", "E_JSVS RZOVSZW RNWJSNO", "E_ZSNS RJONSJW RVWZSVO", "E_ZOZW RJSZS RNWJSNO", "E_R[RK RV[N[ RNORKVO", "E_JOJW RZSJS RVWZSVO", "E_RKR[ RNKVK RVWR[NW", "E_N[V[ RR[RK RNWR[VW RNORKVO", "E_NWJSNO RJSWSYRZPYNWM", "E_VWZSVO RZSMSKRJPKNMM", "E_NWJSNO RJSWSYRZPYNWMUNTPTW", "E_VWZSVO RZSMSKRJPKNMMONPPPW", "E_PUJUJO RZWZQTQ RZQWTUUSTQROQMRJU", "E_JSZS RTOPW RNOJSNW RVWZSVO", "E_PWR[VY ROKLTVOR[", "E_V[VOJO RNSJONK", "E_N[NOZO RVSZOVK", "E_VKVWJW RNSJWN[", "E_NKNWZW RVSZWV[", "E_JOVOV[ RZWV[RW", "E_VKVWJW RNSJWN[", "E_OQKUGQ RYRYQXNVLSKQKNLLNKQKU", "E_UQYU]Q RKRKQLNNLQKSKVLXNYQYU", "E_KLYZ RKHYH RRLKLKS", "E_JWZW RJKJS RZSZ[ RZOJO RNSJONK RV[ZWVS", "E_[KUKUQ RMMLNKQKSLVNXQYSYVXXVYSYQXNUK", "E_IKOKOQ RWMXNYQYSXVVXSYQYNXLVKSKQLNOK", "E_ZSJSNO", "E_ZSJSNW", "E_R[RKVO", "E_R[RKNO", "E_JSZSVO", "E_JSZSVW", "E_RKR[VW", "E_RKR[NW", "E_ZWJW RJOZO RVSZOVK RN[JWNS", "E_N[NK RVKV[ RJONKRO RRWV[ZW", "E_JWZW RZOJO RNSJONK RV[ZWVS", "E_ZWJW RJOZO RN[JWNSJONK", "E_N[NK RVKV[ RJONKROVKZO", "E_JWZW RZOJO RV[ZWVSZOVK", "E_VKV[ RN[NK RZWV[RWN[JW", "E_JVZVVZ RZPJPNL", "E_ZVJVNZ RJPZPVL", "E_ZPMP RZVMV RRXVN ROXJSON", "E_MVWV RMPWP RSNQX ROXJSON RUNZSUX", "E_JVWV RJPWP RRNNX RUNZSUX", "E_ZPMP RZVMV ROXJSON", "E_ONO[ RUNU[ RWPRKMP", "E_JVWV RJPWP RUNZSUX", "E_UXUK ROXOK RMVR[WV", "E_MVWV RMPWP ROXJSON RUNZSUX", "E_OXON RUXUN RMVR[WV RWPRKMP", "E_[XOL RW\\KP RSLKLKT", "E_IXUL RM\\YP RQLYLYT", "E_INUZ RMJYV RQZYZYR", "E_[NOZ RWJKV RSZKZKR", "E_ZXOX RZSJS RZNON RQLJSQZ", "E_JXUX RJSZS RJNUN RSLZSSZ", "E_NWJSNO RZUWQTUQQNULSJS", "E_VWZSVO RJUMQPUSQVUXSZS", "E_NXVX RNSVS RR[RK RNORKVO", "E_VNNN RVSNS RRKR[ RVWR[NW", "E_ZSWS RSSQS RMSJS RNOJSNW", "E_R[RX RRTRR RRNRK RNORKVO", "E_JSMS RQSSS RWSZS RVWZSVO", "E_RKRN RRRRT RRXR[ RVWR[NW", "E_ZSJS RJWJO RNOJSNW", "E_JSZS RZOZW RVWZSVO", "E_ZPZVOVOXJSONOPZP", "E_U[O[OPMPRKWPUPU[", "E_JVJPUPUNZSUXUVJV", "E_OKUKUVWVR[MVOVOK", "E_U[O[OWUWU[ RUSOSOPMPRKWPUPUS", "E_W[M[MWOWOPMPRKWPUPUWWWW[", "E_ONUN RW[M[MWOWOPMPRKWPUPUWWWW[", "E_RKR[ RW[M[MWOWOPMPRKWPUPUWWWW[", "E_PPMPRKWPTP RU[O[OSMSRNWSUSU[", "E_PPMPRKWPTP RW[M[MWOWOSMSRNWSUSUWWWW[", "E_JNNNNPUPUNZSUXUVNVNXJXJN", "E_Z[NO RZKJKJ[ RUONONV", "E_JKVW RJ[Z[ZK ROWVWVP", "E_MPRKWPUPUVWVR[MVOVOPMP", "E_JSZS RVWZSVO RTRTTSVQWOWMVLTLRMPOOQOSPTR", "E_V[VK RNKN[ RZOVKRO RRWN[JW", "E_J[Z[ RJKZK RZSJS RVGZKVOZSVWZ[V_", "E_ZSJS RTWTO RNOJSNW", "E_JSZS RPOPW RVWZSVO", "E_JSZS RRORW RNOJSNW RVWZSVO", "E_ZSJS RWWWO RRWRO RNOJSNW", "E_JSZS RMOMW RRORW RVWZSVO", "E_JSZS RPOPW RTOTW RNWJSNO RVWZSVO", "E_NSZS RNWNOJSNW", "E_VSJS RVWVOZSVW", "E_NSVS RNWJSNONW RVWVOZSVW", "I[MLWL RKFR[YF", "HZVHUGSFPFNGMHLKLVMYNZP[S[UZVY", "H[WOVNTMPMNNMOLQLWMYNZP[S[UZVYWWWJVHUGSFOFMG", "I\\WPPP RM[W[WFMF", "I\\WQPQ RMFWFW[M[ RXCL`", "C`G[\\F ROFTFXHZJ\\N\\SZWXYT[O[KYIWGSGNIJKHOF", "I[K[RFY[K[", "I[YFR[KFYF", "C`\\QGQ R\\GOGKIIKGOGSIWKYO[\\[", "C`[CH^ R\\QGQ R\\GOGKIIKGOGSIWKYO[\\[", "E_JSZS RZZPZMYKWJTJRKOMMPLZL", "DaHP]P RHZUZYX[V]R]N[JYHUFHF", "DaI^\\C RHP]P RHZUZYX[V]R]N[JYHUFHF", "E_ZSJS RJZTZWYYWZTZRYOWMTLJL", "E_M[WQ RMZWP RMYWO RMXWN RMWWM RMVWL RMUWK RMTVK RMSUK RMRTK RMQSK RMPRK RMOQK RMNPK RMMOK RMLNK RN[WR RO[WS RP[WT RQ[WU RR[WV RS[WW RT[WX RU[WY RV[WZ RM[MKWKW[M[", "E_Z`ZFJFJ`", "E_ZFZ`J`JF", "E_Z`I`TSIF[F", 0, "E_ZWJW RROR_ RJKZK", "E_JSZS RR[RK RRDQERFSERDRF", 1, "KYID[_", "E_KOYW RR[RK RYOKW", "E_PQRPTQUSTURVPUOSPQ", "E_PQPU RQUQQ RRPRV RSUSQ RTQTU RPTRVTT RPRRPTR RPQRPTQUSTURVPUOSPQ", "IbMTQSS[bB", "IbMTQSS[bB RN@V@RESEUFVHVKUMSNPNNM", "IbMTQSS[bB RUFUN RQ@NJWJ", "E_XPWPUQQUOVMULSMQOPQQUUWVXV", "E_TQVPXQYSXUVVTUPQNPLQKSLUNVPUTQ", "E_JKJ[Z[", "E_ZKJ[Z[", "E_ZKJ[Z[ RPSRUTZT]", "E_Z[JSZK RSYTWUSTOSM", 22, "H\\NUVQ RRDRb", "H\\ODOb RUDUb", "H\\LVXP RODOb RUDUb", "E_[[RKI[", "E_IKR[[K", "E_Z[ZQXMTKPKLMJQJ[", "E_JKJULYP[T[XYZUZK", "H\\L]M_O`Q_R]RISGUFWGXI", "D`H]I_K`M_N]NIOGQFSGTI RP]Q_S`U_V]VIWGYF[G\\I", "@dD]E_G`I_J]JIKGMFOGPI RL]M_O`Q_R]RISGUFWGXI RT]U_W`Y_Z]ZI[G]F_G`I", "H\\L]M_O`Q_R]RISGUFWGXI RRMUNWPXSWVUXRYOXMVLSMPONRM", "D`H]I_K`M_N]NIOGQFSGTI RP]Q_S`U_V]VIWGYF[G\\I RVMYN[P\\S[VYXVYNYKXIVHSIPKNNMVM", "@dD]E_G`I_J]JIKGMFOGPI RL]M_O`Q_R]RISGUFWGXI RT]U_W`Y_Z]ZI[G]F_G`I RZM]N_P`S_V]XZYJYGXEVDSEPGNJMZM", "H\\URXU[R RLSMPONRMUNWPXSXU RL]M_O`Q_R]RISGUFWGXI", "H\\UQXT[Q RL]M_O`Q_R]RISGUFWGXI RLSMPONRMUNWPXSWVUXRYOXMVLS", "H\\UUXR[U RL]M_O`Q_R]RISGUFWGXI RLSMPONRMUNWPXSWVUXRYOXMVLS", "E_KXLYKZJYKXKZ RRLSMRNQMRLRN RYXZYYZXYYXYZ", "E_YNXMYLZMYNYL RRZQYRXSYRZRX RKNJMKLLMKNKL", "JZRXSYRZQYRXRZ RRLSMRNQMRLRN", "E_LXMYLZKYLXLZ RLLMMLNKMLLLN RXXYYXZWYXXXZ RXLYMXNWMXLXN", "E_JSZS RRFQGRHSGRFRH", "E_JSTS RYXZYYZXYYXYZ RYLZMYNXMYLYN", "E_JSZS RLXMYLZKYLXLZ RLLMMLNKMLLLN RXXYYXZWYXXXZ RXLYMXNWMXLXN", "E_JSKRNQQRSTVUYTZS RRXSYRZQYRXRZ RRLSMRNQMRLRN", "E_JSKRNQQRSTVUYTZS", "E_ZSYRVQSRQTNUKTJS", "E_WPYQZSYUWVTUPQMPKQJSKUMV", "E_JSKNLLNKPLQNSXTZV[XZYXZS", "E_RKSLTOSRQTPWQZR[", "E_JSKRNQQRSTVUYTZS RVKN[", "E_ZPJP RZVYWVXSWQUNTKUJV", "E_JVZV RJPKONNQOSQVRYQZP", "E_JVZV RJPKONNQOSQVRYQZP RVKN[", "E_JYZY RJSZS RJMKLNKQLSNVOYNZM", "E_JYZY RJSZS RUPO\\ RJMKLNKQLSNVOYNZM", "E_JYZY RJSZS RJMKLNKQLSNVOYNZM RXGL_", "E_JVKUNTQUSWVXYWZV RJPKONNQOSQVRYQZP", "E_JVKUNTQUSWVXYWZV RJPKONNQOSQVRYQZP RVKN[", "E_JYZY RJSKRNQQRSTVUYTZS RJMKLNKQLSNVOYNZM", "E_JYKXNWQXSZV[YZZY RJSKRNQQRSTVUYTZS RJMKLNKQLSNVOYNZM", "E_ZYJY RZSJS RZMYLVKSLQNNOKNJM", "E_JXLWPVTVXWZX RJNLOPPTPXOZN", "E_JVNVNWOYQZSZUYVWVVZV RJPNPNOOMQLSLUMVOVPZP", "E_ZVJV RJPNPNOOMQLSLUMVOVPZP", "E_JPZP RZVJV RRHQIRJSIRHRJ", "E_JPZP RZVJV RRXSYRZQYRXRZ RRLSMRNQMRLRN", "E_JPZP RZVJV RKJLKKLJKKJKL RYZZ[Y\\X[YZY\\", "E_ZPJP RJVZV RYJXKYLZKYJYL RKZJ[K\\L[KZK\\", "AcNP^P R^VNV RGVHWGXFWGVGX RGNHOGPFOGNGP", "AcVPFP RFVVV R]V\\W]X^W]V]X R]N\\O]P^O]N]P", "E_JPZP RZVJV RPQRPTQUSTURVPUOSPQ", "E_JPZP RZVJV RRJPIOGPERDTEUGTIRJ", "E_JPZP RZVJV RNJOHQGSGUHVJ", "E_JPZP RZVJV RNJRGVJ", "E_JPZP RZVJV RNGRJVG", "E_JPZP RZVJV RRATGOCUCPGRA", "E_JPZP RZVJV RR?NJVJR?", "E_JPZP RYC]C RZVJV R]?[@ZBZJ RM?MJKJIIHGHEICKBMB RQFVFVCUBRBQCQIRJUJ", "E_JPZP RZVJV RMBMJ RMCNBQBRCRJ RRCSBVBWCWJ", "E_JPZP RZVJV RRHSIRJQIRHRJ RN@P?S?U@VBUDSE", "E_JPZP RTMPY RZVJV", "E_JYZY RJSZS RJMZM", "E_JYZY RJSZS RJMZM RXGL_", "E_J\\Z\\ RJPZP RJJZJ RZVJV", "E_ZZJZ RZVJPZJ", "E_JZZZ RJVZPJJ", "E_J]Z] RZWJW RZSJMZG", "E_Z]J] RJWZW RJSZMJG", "E_J]Z] RTTP` RZWJW RZSJMZG", "E_JWZW RTTP` RZ]J] RJSZMJG", "=gRMBSRY RbMRSbY", "=gRMbSRY RBMRSBY", "I[OCPDRGSITLUQUUTZS]R_PbOc RUcTbR_Q]PZOUOQPLQIRGTDUC", "E_JXLWPVTVXWZX RJNLOPPTPXOZN RVKN[", "E_ZMJSZY RVKN[", "E_JMZSJY RVKN[", "E_ZZJZ RZVJPZJ RXGL_", "E_JZZZ RJVZPJJ RXGL_", "E_ZVJPZJ RJZKYNXQYS[V\\Y[ZZ", "E_JVZPJJ RJZKYNXQYS[V\\Y[ZZ", "E_ZVJPZJ RJZKYNXQYS[V\\Y[ZZ RXGL_", "E_JVZPJJ RJZKYNXQYS[V\\Y[ZZ RXGL_", "E_JSZYJ_ RZSJMZG", "E_ZSJYZ_ RJSZMJG", "E_JSZYJ_ RZSJMZG RXGL_", "E_ZSJYZ_ RJSZMJG RXGL_", "E_ZKXNVPRRJSRTVVXXZ[", "E_JKLNNPRRZSRTNVLXJ[", "E_JVRWVYX[Z^ RZHXKVMROJPRQVSXUZX", "E_ZVRWNYL[J^ RJHLKNMROZPRQNSLUJX", "E_J[KZNYQZS\\V]Y\\Z[ RZHXKVMROJPRQVSXUZX", "E_J[KZNYQZS\\V]Y\\Z[ RJXLUNSRQZPRONMLKJH", "E_ZKXNVPRRJSRTVVXXZ[ RVKN[", "E_JKLNNPRRZSRTNVLXJ[ RVKN[", "E_ZMNMLNKOJQJUKWLXNYZY", "E_JMVMXNYOZQZUYWXXVYJY", "E_ZMNMLNKOJQJUKWLXNYZY RVKN[", "E_JMVMXNYOZQZUYWXXVYJY RVKN[", "E_J\\Z\\ RZJNJLKKLJNJRKTLUNVZV", "E_Z\\J\\ RJJVJXKYLZNZRYTXUVVJV", "E_J\\Z\\ RZJNJLKKLJNJRKTLUNVZV RXGL_", "E_Z\\J\\ RJJVJXKYLZNZRYTXUVVJV RXGL_", "E_J\\Z\\ RZJNJLKKLJNJRKTLUNVZV RSYQ_", "E_Z\\J\\ RJJVJXKYLZNZRYTXUVVJV RSYQ_", "E_JKJULYP[T[XYZUZK ROSUS RSUUSSQ", "E_JKJULYP[T[XYZUZK RRRQSRTSSRRRT", "E_JKJULYP[T[XYZUZK RLSXS RRMRY", "E_ZYJYJMZM", "E_JYZYZMJM", "E_Z\\J\\ RZVJVJJZJ", "E_J\\Z\\ RJVZVZJJJ", "E_Z[ZKJKJ[", "E_JKJ[Z[ZK", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RLSXS RRMRY", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RLSXS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RMNWX RWNMX", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RWFM^", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRRQSRTSSRRRT", 47, "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRNRS RMQRSWQ ROWRSUW", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RLUXU RLQXQ", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RNSVS", "E_JKZKZ[J[JK RLSXS RRMRY", "E_JKZKZ[J[JK RLSXS", "E_JKZKZ[J[JK RMNWX RWNMX", "E_JKZKZ[J[JK RRRQSRTSSRRRT", "E_J[JK RJSZS", "E_Z[ZK RZSJS", "E_ZKJK RRKR[", "E_J[Z[ RR[RK", "I[NSVS RNKN[", "I[NVVV RNPVP RNKN[", "E_JVZV RJPZP RJKJ[", "E_JKJ[ RPSZS RPKP[", "E_JKJ[ ROKO[ RTKT[ RYSTS", "E_JKJ[ RPVYV RPPYP RPKP[", "E_J[JK RJSZS RXGL_", "E_JVZV RJPZP RJKJ[ RXGL_", "E_JKJ[ RPSZS RPKP[ RXGL_", "E_JKJ[ RPVYV RPPYP RPKP[ RXGL_", "E_VKXLYNXPVQRRJSRTVUXVYXXZV[", "E_NKLLKNLPNQRRZSRTNULVKXLZN[", "E_JSZYZMJS", "E_ZSJYJMZS", "E_Z[J[ RJQZWZKJQ", "E_J[Z[ RZQJWJKZQ", "BbXQXU RYQYU RZPZV R[Q[U R\\Q\\U RMSLQJPHQGSHUJVLUMSWSXUZV\\U]S\\QZPXQWS", "BbLQLU RKQKU RJPJV RIQIU RHQHU RWSXQZP\\Q]S\\UZVXUWSMSLUJVHUGSHQJPLQMS", "E_JSTSUUWVYUZSYQWPUQTS", "E_JSNS RR[RW RRKRO RZSVS", "I[NFVF RRFR[", "E_J[Z[ RZKRVJK", "E_ZKJK RJ[RPZ[", "E_JKZK RZPR[JP", "E_JKJ[Z[ RJOLOQQTTVYV[", "E_Z[ZKJ[Z[", "Bb_`REE`", "BbEFRa_F", "Bb]`]O\\KZHWFSEQEMFJHHKGOG`", "BbGFGWH[J^M`QaSaW`Z^\\[]W]F", "E_RaJSRFZSRa", 26, "I[RRTXOTUTPXRR", "E_ZSJS RRXSYRZQYRXRZ RRLSMRNQMRLRN RLMXY RXMLY", "E_JKZ[ZKJ[JK", "E_ZKJ[JKZ[", "E_JKZ[ZKJ[", "E_JKZ[ RRSJ[", "E_ZKJ[ RRSZ[", "E_ZVJV RZPYOVNSOQQNRKQJP", "E_JKMMOOQSR[SSUOWMZK", "E_Z[WYUWSSRKQSOWMYJ[", "E_ZPSPQQPSQUSVZV RZ\\Q\\N[KXJUJQKNNKQJZJ", "E_JPQPSQTSSUQVJV RJ\\S\\V[YXZUZQYNVKSJJJ", "E_U[UTTRRQPROTO[ R[[[RZOWLTKPKMLJOIRI[", "E_OKORPTRUTTURUK RIKITJWMZP[T[WZZW[T[K", "E_RKR[ RL[LSMPNOQNSNVOWPXSX[", "E_JPZP RZVJV RODOb RUDUb", "E_ZMJSZY RYRXSYTZSYRYT", "E_JMZSJY RKRJSKTLSKRKT", "5oJM:SJY RZMJSZY RjMZSjY", "5oZMjSZY RJMZSJY R:MJS:Y", "E_ZSJS RJWZ[J_ RZOJKZG", "E_JSZS RZWJ[Z_ RJOZKJG", "E_ZLJL RZPJVZ\\", "E_JLZL RJPZVJ\\", "E_JPROVMXKZH RZ^X[VYRWJVRUVSXQZN", "E_ZPRONMLKJH RJ^L[NYRWZVRUNSLQJN", "E_JPROVMXKZH RZ^X[VYRWJVRUVSXQZN RXGL_", "E_ZPRONMLKJH RJ^L[NYRWZVRUNSLQJN RXGL_", "E_Z\\J\\ RZVJVJJZJ RXGL_", "E_J\\Z\\ RJVZVZJJJ RXGL_", "E_Z\\J\\ RZVJVJJZJ RSYQ_", "E_J\\Z\\ RJVZVZJJJ RSYQ_", "E_ZVJPZJ RJZKYNXQYS[V\\Y[ZZ RSWQ]", "E_JVZPJJ RJZKYNXQYS[V\\Y[ZZ RSWQ]", "E_J[KZNYQZS\\V]Y\\Z[ RZHXKVMROJPRQVSXUZX RSXQ^", "E_J[KZNYQZS\\V]Y\\Z[ RJXLUNSRQZPRONMLKJH RSXQ^", "E_JSZYZMJS RXGL_", "E_ZSJYJMZS RXGL_", "E_Z[J[ RJQZWZKJQ RXGL_", "E_J[Z[ RZQJWJKZQ RXGL_", "CaR\\S]R^Q]R\\R^ RRRSSRTQSRRRT RRHSIRJQIRHRJ", "CaHRISHTGSHRHT RRRSSRTQSRRRT R\\R]S\\T[S\\R\\T", "Ca\\H[I\\J]I\\H\\J RRRQSRTSSRRRT RH\\G]H^I]H\\H^", "CaHHIIHJGIHHHJ RRRSSRTQSRRRT R\\\\]]\\^[]\\\\\\^", ">`BQ\\Q R\\GOGKIIKGOGSIWKYO[\\[", ">`GQ\\Q R\\M\\U R\\GOGKIIKGOGSIWKYO[\\[", "E_JSZS RZPZV RZZPZMYKWJTJRKOMMPLZL", "C`\\QGQ R\\GOGKIIKGOGSIWKYO[\\[ RR@QARBSAR@RB", "C`GA\\A R\\QGQ R\\[O[KYIWGSGOIKKIOG\\G", "E_JSZS RZGJG RZLPLMMKOJRJTKWMYPZZZ", "C`G`\\` R\\PGP R\\FOFKHIJGNGRIVKXOZ\\Z", "C`HT\\T RHN\\N R\\GOGKIIKGOGSIWKYO[\\[", "DfbQHQ RHGUGYI[K]O]S[WYYU[H[", "Df]QHQ RHMHU RHGUGYI[K]O]S[WYYU[H[", "E_ZSJS RJPJV RJZTZWYYWZTZRYOWMTLJL", "Da]AHA RHQ]Q RH[U[YY[W]S]O[KYIUGHG", "E_ZSJS RJGZG RJLTLWMYOZRZTYWWYTZJZ", "C`GQ\\Q R\\GGGG[\\[", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RZKJ[", "E_JQRWROZU", "E_J[JORGZOZ[J[", "E_NORKVO", "E_VWR[NW", "E_ZKJK RJ[RPZ[", "E_JNZN RJHZH RJ[RSZ[", "H\\RDSETGSIRJQLRNSOTQSSRTQVRXSYT[S]R^Q`Rb", "KYQbQDVD", "KYSbSDND", "KYQDQbVb", "KYSDSbNb", "E_RWR[ RVSZS", "E_RWR[ RNSJS", "E_RORK RVSZS", "E_RORK RNSJS", "E_ZQJQJV", "D`[JZLYPYVZZ[\\Y[UZOZK[I\\JZKVKPJLIJKKOLULYK[J", "E_JSJQLMPKTKXMZQZS", "E_JSJQLMPKTKXMZQZS RJSZS", "E_JMLLPKTKXLZMR[JM", "E_PUJ[ RTKWLYNZQYTWVTWQVOTNQONQLTK", "E_JSZS RR[RK RVRUPSOQOOPNRNTOVQWSWUVVTVR", "E_JWZW RJOZO RNKN[ RVKV[", "E_LPXPZO[MZKXJVKUMUYV[X\\Z[[YZWXVLVJWIYJ[L\\N[OYOMNKLJJKIMJOLP", "E_ZUJUJP", "E_RORSUS RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_M[RVW[ RN[RWV[ RP[RYT[ RS[RZQ[ RU[RXO[ RYMRPKMROYM RJFZFZKYMKTJVJ[Z[ZVYTKMJJJF", "JZVFNFNM", "JZNFVFVM", "JZV[N[NT", "JZN[V[VT", "H\\RbRMSITGVFXGYI", "H\\RDRYQ]P_N`L_K]", "E_JUKTMSRRWSYTZU", "E_ZQYRWSRTMSKRJQ", "E_LKHK RXK\\K RNORKVO", "@dXK^K RFKLKX[^[", "AfJKZ[ RZKJ[ RFKZKbSZ[F[FK", "AcJKZ[ RZKJ[ RFK^K^[F[FK", "9k>VfV R>LfL RCQCL RD[DV REVEQ RFLFG RHQHL RJVJQ RK[KV RKLKG RMQML ROVOQ RPLPG RRQRL RTVTQ RULUG RWQWL RYVYQ RZ[ZV RZLZG R\\Q\\L R^V^Q R_L_G R`[`V R>QaQaL R>[>GfGf[>[", "KYUcOSUC", "KYOcUSOC", ">cZKJ[ RJKZ[ R^KJKBSJ[^[^K", "AcKOKW RR[YW RRKYO RRE^L^ZRaFZFLRE", "H\\PNKX RYNTX RVRUPSOQOOPNRNTOVQWSWUVVTVR", "E_N[J[JW RZSRSJ[ RVRUPSOQOOPNRNTOVQWSWUVVTVR", "E_JSZS RNYVY RVMNM", "E_RPRKNN RZPZKVN RRKJ[R[ZK", "H\\LS[S RRMRY RXP[SXV RVRUPSOQOOPNRNTOVQWSWUVVTVR", "E_ZSJ\\JJZS RJSZS", "E_J[JRZ[J[", "E_JWJ[Z[ZW", "E_VWR[NW", "D`JaZa RJFZF RRFRa", "D`MFWFWaMaMF", "D`IF[F[aIaIF RJPZP RZVJV", "D`IF[F[aIaIF RZSJS RRXSYRZQYRXRZ RRLSMRNQMRLRN", "D`IF[F[aIaIF RRJ[SR\\ISRJ", "D`IF[F[aIaIF RPQRPTQUSTURVPUOSPQ", "D`IF[F[aIaIF RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRbRD", 47, "E_JSZS RZKJ[", "E_JSZS RJKZ[", "D`IaIF[F[aIa[F", "D`[a[FIFIa[aIF", "D`IF[F[aIaIF RZMJSZY", "D`IF[F[aIaIF RJMZSJY", "E_ZSJS RNWJSNO RR[RK", "E_JSZS RVWZSVO RR[RK", "D`IF[F[aIaIF RZSJS RNWJSNO", "D`IF[F[aIaIF RJSZS RVWZSVO", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RLGX_", "E_J[Z[ RR[RK RZaJa", "E_RKX[L[RK RRbRD", "D`IF[F[aIaIF RIKR[[K", "D`IF[F[aIaIF RRKX[L[RK", "E_ZKJK RRKR[ RVRUPSOQOOPNRNTOVQWSWUVVTVR", "E_R[RK RNORKVO RJSZS", "D`IF[F[aIaIF RR[RK RNORKVO", "E_ZKJK RRKR[ RMEWE", "E_R[LKXKR[ RRbRD", "D`IF[F[aIaIF R[[RKI[", "D`IF[F[aIaIF RR[LKXKR[", "E_J[Z[ RR[RK RPQRPTQUSTURVPUOSPQ", "E_RKR[ RVWR[NW RJSZS", "D`IF[F[aIaIF RRKR[ RVWR[NW", "JZJ]Z] RSFQJ", "E_RKX[L[RK RJ]Z]", "E_RJ[SR\\ISRJ RJ]Z]", "E_PQRPTQUSTURVPUOSPQ RJ]Z]", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RJ]Z]", "E_Z[ZQXMTKPKLMJQJ[ RPQRPTQUSTURVPUOSPQ", "D`IF[F[aIaIF RSFQJ", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRPTVORURPVRP", "D`IF[F[aIaIF RRYSZR[QZRYR[ RRNSORPQORNRP", "E_ZKJK RRKR[ RNDOENFMENDNF RVDWEVFUEVDVF", "E_R[LKXKR[ RNFOGNHMGNFNH RVFWGVHUGVFVH", "E_RKWZJQZQMZRK RNDOENFMENDNF RVDWEVFUEVDVF", "E_PQRPTQUSTURVPUOSPQ RNIOJNKMJNINK RVIWJVKUJVIVK", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RNDOENFMENDNF RVDWEVFUEVDVF", "E_JKJULYP[T[XYZUZK RRbRD", "E_ZMNMLNKOJQJUKWLXNYZY RRbRD", "E_JSKRNQQRSTVUYTZS RNFOGNHMGNFNH RVFWGVHUGVFVH", "E_JMZSJY RNFOGNHMGNFNH RVFWGVHUGVFVH", "E_JSZS RSZS[R]Q^", "E_R[LKXKR[ RJSKRNQQRSTVUYTZS", "H\\QFSFUGVHWJXNXSWWVYUZS[Q[OZNYMWLSLNMJNHOGQF RJPKONNQOSQVRYQZP", "E_JSKRNQQRSTVUYTZS RRbRD", "MWSZS[R]Q^ RRNSORPQORNRP RJ]Z]", "D`IF[F[aIaIF RJPZP RTMPY RZVJV", "D`IF[F[aIaIF RQYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS", "E_IKR[[K RJSKRNQQRSTVUYTZS", "E_[[RKI[ RJSKRNQQRSTVUYTZS", 36, "H\\MbMQNOONQMTMVNWOXQXWWYVZT[Q[OZMX", 43, "H]YMVWUYTZR[P[NZMYLVLRMONNPMRMTNUOVQWXXZZ[ RJ]Z]", "HZLTST RVZT[P[NZMYLWLQMONNPMTMVN RJ]Z]", "MXRMRXSZU[ RJ]Z]", "G]RTRX RMMLNKPKXLZN[O[QZRXSZU[V[XZYXYPXNWM RJ]Z]", 34, "IbMTQSS[bB RXL`L", "A_J_F_F[ RJKJ[Z[ RF_OVEQOG", "E_JWNWN[V[VWZW", "E_NSN[J[ RVSV[Z[ RJSJQLMPKTKXMZQZSJS", "E_PQPU RQUQQ RRPRV RSUSQ RTQTU RPTRVTT RPRRPTR RPQRPTQUSTURVPUOSPQ RRbRD", "E_VWR[NW ROEQDSDUEVGVN RVMTNQNOMNKOIQHVH", "BbF[^[ RGLIKKKMLNNNU RUSVTUUTTUSUU R]S^T]U\\T]S]U RNTLUIUGTFRGPIONO", "BbF[N[ RV[^[ RGLIKKKMLNNNU RWLYK[K]L^N^U RNTLUIUGTFRGPIONO R^T\\UYUWTVRWPYO^O", "BbHPDP RJUFX RJKFH R^XZU R^HZK R`P\\P RTTRUPUNTMRMQNNPLRKVKTU", "=_RKR[B[BKRK RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_JKZKZ[J[JK RRbRD", "C_ESUS RQWUSQO RJWJ[Z[ZKJKJO", "@dX[^[ RZO^KZG RF[L[XK^K", "E_KOYW RR[RK RYOKW RRMONMPLSMVOXRYUXWVXSWPUNRM", "E_JSOSR[USZS RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_R[KOYOR[ RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_STJK RJOJKNK RSKTKXMZQZUXYT[P[LYJUJT", "D`KNKROR RYRWPTOPOMPKR RNXMVKUIVHXIZK[MZNX RVXWZY[[Z\\X[VYUWVVX", "E_I[N[NKVKV[[[", "E_I[V[VK RN[NK[K", "E_JKZK RJSRKZSR[JS", "E_Z[J[ RZSR[JSRKZS", "E_JKZK RJSRKZSR[JS RJSZS", "E_Z[J[ RZSR[JSRKZS RJSZS", "E_JVLV RJPZP RQVSV RXVZV", "BbL[FQLGXG^QX[L[", "D`IF[F[aIaIF", "MWTFQL", "AcZSJS RRORK RR[RW RNOJSNW R^[F[FK^K^[", "AcJSZS RRWR[ RRKRO RVWZSVO RFK^K^[F[FK", "BbLHQHQC RLSLHQCXCXSLS RLKJKHLGNGXHZJ[Z[\\Z]X]N\\LZKXK", "BbROJW RZORW RGXGNHLJKZK\\L]N]X\\ZZ[J[HZGX", "H\\XDVGUITLSQR[Rb", 22, "H\\XbV_U]TZSURKRD", "H\\LDNGOIPLQQR[Rb", 22, "H\\LbN_O]PZQURKRD", "H\\XGRGRb", 22, "H\\X_R_RD", "H\\LGRGRb", 22, "H\\L_R_RD", "H\\XDTHSJRNRb", "H\\RDRIQMPOLSPWQYR]Rb", "H\\XbT^S\\RXRD", 22, "H\\LDPHQJRNRb", "H\\RDRISMTOXSTWSYR]Rb", "H\\LbP^Q\\RXRD", 22, "H\\HS\\S", "H\\WDSHRKR[Q^Mb", "H\\MDQHRKR[S^Wb", "E_VbIF\\F", "E_VDI`\\`", ">fC^CYaYa^", ">fCHCMaMaH", ">fC^CYaYa^ RaHaMCMCH", "IbMTQSS[bB", 22, 22, "H\\HG\\G", "H\\HM\\M", "H\\\\YHY", "H\\\\_H_", "E_UFOFO[", "E_U[O[OF", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRbRD", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RZEJE RRERa", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RJaZa RRaRE", "E_RK[[I[RK RRbRD", "E_RK[[I[RK RZEJE RRERa", "E_RK[[I[RK RJaZa RRaRE", "E_JSKRNQQRSTVUYTZS RRbRD", "E_JSKRNQQRSTVUYTZS RZEJE RRERa", "E_JSKRNQQRSTVUYTZS RJaZa RRaRE", "E_JaZa RRaRE", "E_ZEJE RRERa", "E_OFUFU[", "E_O[U[UF", "D`TFQL RMKJKJ[Z[ZKWK", "E_IWN\\NZZZZKTKTTNTNRIW", "E_Z[J[ RJVRKZV", 22, "H\\NQNROTQUSUUTVRVQ", "H\\NQNROTQUSUUTVRVQ RMKWK", "H\\NQNROTQUSUUTVRVQ RW[M[", "CaGQGRHTJULUNTOROQ RUQURVTXUZU\\T]R]Q RGK]K", "CaGQGRHTJULUNTOROQ RUQURVTXUZU\\T]R]Q R][G[", "E_JQJRKTMUOUQTRRRQ RRRSTUUWUYTZRZQ", "E_JUZUZP", "E_JPJUZUZP", "E_RPRU RJPJUZUZP", "E_HO\\O RLUXU RRFRO RT[P[", "E_HS\\S RJMZMZYJYJM", ">fB]C\\FZHYKXPWTWYX\\Y^Za\\b]", ">fbIaJ^L\\MYNTOPOKNHMFLCJBI", ">fB^B]C[EZOZQYRWSYUZ_Za[b]b^", ">fbHbIaK_LULSMROQMOLELCKBIBH", ">fB^FY^Yb^", ">fbH^MFMBH", "E_I[NKVK[[I[", "AcRE^L^ZRaFZFLRE RQLSLVMXOYRYTXWVYSZQZNYLWKTKRLONMQL", 0, "E_HXMN\\NWXHX", "E_JSZS RJSKNLLNKPLQNSXTZV[XZYXZS", "E_LMXY RXMLY RPQRPTQUSTURVPUOSPQ", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "E_KKK[ RL[LK RMKM[ RN[NK ROKO[ RP[PK RQKQ[ RR[RK RSKS[ RT[TK RUKU[ RV[VK RWKW[ RX[XK RYKY[ RJKZKZ[J[JK", "E_JKZKZ[J[JK", "E_KLMKWKYLZNZXYZW[M[KZJXJNKL", "E_JKZKZ[J[JK RPPPV RQVQP RRPRV RSVSP RTPTV ROVOPUPUVOV", "E_JWZW RJSZS RJOZO RJKZKZ[J[JK", "E_NKN[ RRKR[ RVKV[ RJKZKZ[J[JK", "E_JWZW RJSZS RJOZO RNKN[ RRKR[ RVKV[ RJKZKZ[J[JK", "E_JKZ[ RN[JW RT[JQ RZUPK RZOVK RJKZKZ[J[JK", "E_J[ZK RJUTK RJONK RP[ZQ RV[ZW RJKZKZ[J[JK", "E_J[ZK RJUTK RJONK RJKZ[ RN[JW RP[ZQ RT[JQ RV[ZW RZUPK RZOVK RJKZKZ[J[JK", "E_PPPV RQVQP RRPRV RSVSP RTPTV ROVOPUPUVOV", "E_OVOPUPUVOV", "E_JXTN RJWSN RJVRN RJUQN RJTPN RJSON RJRNN RJQMN RJPLN RJOKN RKXUN RLXVN RMXWN RNXXN ROXYN RPXZN RQXZO RRXZP RSXZQ RTXZR RUXZS RVXZT RWXZU RXXZV RYXZW RJNZNZXJXJN", "E_JNZNZXJXJN", "E_M[WQ RMZWP RMYWO RMXWN RMWWM RMVWL RMUWK RMTVK RMSUK RMRTK RMQSK RMPRK RMOQK RMNPK RMMOK RMLNK RN[WR RO[WS RP[WT RQ[WU RR[WV RS[WW RT[WX RU[WY RV[WZ RM[MKWKW[M[", "E_M[MKWKW[M[", "E_NNLP RONKR RPNJT RQNIV RRNHX RSNIX RTNJX RUNKX RVNLX RWNMX RXVVX RXNNX RYTUX RYNOX RZRTX RZNPX R[PSX R[NQX R\\NRX RHXMN\\NWXHX", "E_HXMN\\NWXHX", "E_JZJ[ RKXK[ RLVL[ RMTM[ RNSN[ ROQO[ RPOP[ RQMQ[ RRKR[ RSMS[ RTOT[ RUQU[ RVSV[ RWTW[ RXVX[ RYXY[ RZ[RLJ[ RZZZ[ RRK[[I[RK", "E_RK[[I[RK", "E_OUOV RPSPV RQQQV RRORV RSQSV RTSTV RUUUV ROVRPUV RROVVNVRO", "E_ROVVNVRO", "E_KKK[ RLLLZ RMLMZ RNMNY ROMOY RPNPX RQNQX RRORW RSPSV RTPTV RUQUU RVQVU RWSXS RWRWT RJKYSJ[ RZSJ\\JJZS", "E_ZSJ\\JJZS", "E_PPPV RQQQU RRQRU RSSUS RSRST ROPUSOV RVSOWOOVS", "E_VSOWOOVS", "E_KNKX RLNLX RMOMW RNONW ROOOW RPPPV RQPQV RRPRV RSQSU RTQTU RURUT RVRVT RWRWT RXSWS RJNYSJX RZSJYJMZS", "E_ZSJYJMZS", "E_ZLZK RYNYK RXPXK RWRWK RVSVK RUUUK RTWTK RSYSK RR[RK RQYQK RPWPK ROUOK RNSNK RMRMK RLPLK RKNKK RJKRZZK RJLJK RR[IK[KR[", "E_R[IK[KR[", "E_UQUP RTSTP RSUSP RRWRP RQUQP RPSPP ROQOP RUPRVOP RRWNPVPRW", "E_RWNPVPRW", "E_Y[YK RXZXL RWZWL RVYVM RUYUM RTXTN RSXSN RRWRO RQVQP RPVPP ROUOQ RNUNQ RMSLS RMTMR RZ[KSZK RJSZJZ\\JS", "E_JSZJZ\\JS", "E_TVTP RSUSQ RRURQ RQSOS RQTQR RUVOSUP RNSUOUWNS", "E_NSUOUWNS", "E_YXYN RXXXN RWWWO RVWVO RUWUO RTVTP RSVSP RRVRP RQUQQ RPUPQ ROTOR RNTNR RMTMR RLSMS RZXKSZN RJSZMZYJS", "E_JSZMZYJS", "E_JRJT RKUKQ RLPLV RMWMO RNNNX ROYOM RPLPZ RQ[QK RRJR\\ RS[SK RTLTZ RUYUM RVNVX RWWWO RXPXV RYUYQ RZRZT RRJ[SR\\ISRJ", "E_RJ[SR\\ISRJ", "E_RJ[SR\\ISRJ RPRPT RQUQQ RRPRV RSUSQ RTRTT RRPUSRVOSRP", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RPQPU RQUQQ RRPRV RSUSQ RTQTU RPTRVTT RPRRPTR RPQRPTQUSTURVPUOSPQ", "E_RaJSRFZSRa", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK", "E_JQKO RKWJU RNLPK RP[NZ RTKVL RVZT[ RYOZQ RZUYW", "E_NLNZ RRKR[ RVLVZ RPKTKXMZQZUXYT[P[LYJUJQLMPK", 47, "E_KOKW RLXP[ RLNPK RLMLY RMYMM RNLNZ ROZOL RPKP[ RQ[QK RRKR[ RS[SK RT[XX RTKT[ RTKXN RUZUL RVLVZ RWYWM RXMXY RYWYO RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RKOKW RLYLM RMMMY RNZNL ROLOZ RP[LX RP[PK RLN RQKQ[ RR[P[LYJUJQLMPKRKR[", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RYWYO RXMXY RWYWM RVLVZ RUZUL RTKXN RTKT[ RXX RS[SK RRKTKXMZQZUXYT[R[RK", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RKOKS RLMLS RMSMM RNLNS ROSOL RPKLN RPKPS RQKQS RRKRS RSKSS RTSTK RXN RULUS RVSVL RWMWS RXMXS RYOYS RJSJQLMPKTKXMZQZSJS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RYWYS RXYXS RWSWY RVZVS RUSUZ RT[XX RT[TS RS[SS RR[RS RQ[QS RPSP[ RLX ROZOS RNSNZ RMYMS RLYLS RKWKS RZSZUXYT[P[LYJUJSZS", "E_SSSK RTKTS RTKXN RUSUL RVLVS RWSWM RXMXS RYSYO RZSRSRK RPKTKXMZQZUXYT[P[LYJUJQLMPK", "E_QSQ[ RP[PS RP[LX ROSOZ RNZNS RMSMY RLYLS RKSKW RJSRSR[ RT[P[LYJUJQLMPKTKXMZQZUXYT[ RYWYO RXMXY RWYWM RVLVZ RUZUL RTKXN RTKT[ RXX RS[SK RRKTKXMZQZUXYT[R[RK", "E_KOKW RLYLM RMMMY RNZNL ROLOZ RP[LX RP[PK RLN RQKQ[ RR[P[LYJUJQLMPKRKR[", "E_YWYO RXMXY RWYWM RVLVZ RUZUL RTKXN RTKT[ RXX RS[SK RRKTKXMZQZUXYT[R[RK", "E_FDFb RGbGD RHDHb RIbID RJDJb RKbKD RLbLW RLDLO RMXMb RMNMD RNbNY RNDNM ROZOb ROLOD RPbPZ RPDPL RQZQb RQLQD RRbRZ RRDRL RSZSb RSLSD RTbTZ RTDTL RUZUb RULUD RVbVY RVDVM RWXWb RWNWD RXbXW RXDXO RYbYD RZDZb R[b[D R\\D\\b R]b]D R^D^b R_bEbED_D_b RKTKRLONMQLSLVMXOYRYTXWVYSZQZNYLWKT", "E_FRFD RGNIJ RGDGN RHLHD RIDIK RJJJD RJJMG RKDKI RLHLD RMHQF RMDMH RNGND ROPOS RODOG RPSPP RPGPD RQPQS RQDQG RRSRO RRGRD RSPSS RSFWH RSDSG RTSTP RTGTD RUPUS RUDUG RVGVD RWGZJ RWDWH RXHXD RYDYI RZJZD R[J]N R[D[K R\\L\\D R]D]N R^R^D ROQROUQ RNSOPROUPVSNS RFSFRGNIKJJMHQGSGWHZJ[K]N^R^S_S_DEDESFS R^T^b R]X[\\ R]b]X R\\Z\\b R[b[[ RZ\\Zb RZ\\W_ RYbY] RX^Xb RW^S` RWbW^ RV_Vb RUVUS RUbU_ RTSTV RT_Tb RSVSS RSbS_ RRSRW RR_Rb RQVQS RQ`M^ RQbQ_ RPSPV RP_Pb ROVOS RObO_ RN_Nb RM_J\\ RMbM^ RL^Lb RKbK] RJ\\Jb RI\\GX RIbI[ RHZHb RGbGX RFTFb RUURWOU RVSUVRWOVNSVS R^S^T]X[[Z\\W^S_Q_M^J\\I[GXFTFSESEb_b_S^S", "E_FRFD RGNIJ RGDGN RHLHD RIDIK RJJJD RJJMG RKDKI RLHLD RMHQF RMDMH RNGND ROPOS RODOG RPSPP RPGPD RQPQS RQDQG RRSRO RRGRD RSPSS RSFWH RSDSG RTSTP RTGTD RUPUS RUDUG RVGVD RWGZJ RWDWH RXHXD RYDYI RZJZD R[J]N R[D[K R\\L\\D R]D]N R^R^D ROQROUQ RNSOPROUPVSNS RFSFRGNIKJJMHQGSGWHZJ[K]N^R^S_S_DEDESFS", "E_^T^b R]X[\\ R]b]X R\\Z\\b R[b[[ RZ\\Zb RZ\\W_ RYbY] RX^Xb RW^S` RWbW^ RV_Vb RUVUS RUbU_ RTSTV RT_Tb RSVSS RSbS_ RRSRW RR_Rb RQVQS RQ`M^ RQbQ_ RPSPV RP_Pb ROVOS RObO_ RN_Nb RM_J\\ RMbM^ RL^Lb RKbK] RJ\\Jb RI\\GX RIbI[ RHZHb RGbGX RFTFb RUURWOU RVSUVRWOVNSVS R^S^T]X[[Z\\W^S_Q_M^J\\I[GXFTFSESEb_b_S^S", "E_JSJQLMPKRK", "E_ZSZQXMTKRK", "E_ZSZUXYT[R[", "E_JSJULYP[R[", "E_JSJQLMPKTKXMZQZS", "E_ZSZUXYT[P[LYJUJS", "E_KZK[ RLYL[ RMXM[ RNWN[ ROVO[ RPUP[ RQTQ[ RRSR[ RSRS[ RTQT[ RUPU[ RVOV[ RWNW[ RXMX[ RYLY[ RZ[ZKJ[Z[", "E_YZY[ RXYX[ RWXW[ RVWV[ RUVU[ RTUT[ RSTS[ RRSR[ RQRQ[ RPQP[ ROPO[ RNON[ RMNM[ RLML[ RKLK[ RJ[JKZ[J[", "E_YLYK RXMXK RWNWK RVOVK RUPUK RTQTK RSRSK RRSRK RQTQK RPUPK ROVOK RNWNK RMXMK RLYLK RKZKK RJKJ[ZKJK", "E_KLKK RLMLK RMNMK RNONK ROPOK RPQPK RQRQK RRSRK RSTSK RTUTK RUVUK RVWVK RWXWK RXYXK RYZYK RZKZ[JKZK", "E_PQRPTQUSTURVPUOSPQ", "E_JKZKZ[J[JK RK[KK RLKL[ RM[MK RNKN[ RO[OK RPKP[ RQ[QK RJ[JKRKR[J[", "E_JKZKZ[J[JK RYKY[ RX[XK RWKW[ RV[VK RUKU[ RT[TK RSKS[ RZKZ[R[RKZK", "E_JKZKZ[J[JK RYLYK RXMXK RWNWK RVOVK RUPUK RTQTK RSRSK RRSRK RQTQK RPUPK ROVOK RNWNK RMXMK RLYLK RKZKK RJKJ[ZKJK", "E_JKZKZ[J[JK RKZK[ RLYL[ RMXM[ RNWN[ ROVO[ RPUP[ RQTQ[ RRSR[ RSRS[ RTQT[ RUPU[ RVOV[ RWNW[ RXMX[ RYLY[ RZ[ZKJ[Z[", "E_JKZKZ[J[JK RR[RK", "E_RK[[I[RK RRUQVRWSVRURW", "E_J[RL RJZJ[ RKXK[ RLVL[ RMTM[ RNSN[ ROQO[ RPOP[ RQMQ[ RRKR[ RRK[[I[RK", "E_Z[RL RZZZ[ RYXY[ RXVX[ RWTW[ RVSV[ RUQU[ RTOT[ RSMS[ RRKR[ RRKI[[[RK", "C`OFTFXHZJ\\N\\SZWXYT[O[KYIWGSGNIJKHOF", "E_JKZKZ[J[JK RRKRSJS", "E_JKZKZ[J[JK RR[RSJS", "E_JKZKZ[J[JK RR[RSZS", "E_JKZKZ[J[JK RRKRSZS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRKRSJS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RR[RSJS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RR[RSZS", "E_PKTKXMZQZUXYT[P[LYJUJQLMPK RRKRSZS", "E_JKJ[ZKJK", "E_ZKZ[JKZK", "E_J[JKZ[J[", "E_JKZKZ[J[JK", "E_KKK[ RL[LK RMKM[ RN[NK ROKO[ RP[PK RQKQ[ RR[RK RSKS[ RT[TK RUKU[ RV[VK RWKW[ RX[XK RYKY[ RJKZKZ[J[JK", "E_OVOPUPUVOV", "E_PPPV RQVQP RRPRV RSVSP RTPTV ROVOPUPUVOV", "E_Z[ZKJ[Z[", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 48, "PfUUYZ", "PfWTYT[V[XYZWZUXUVWT", "PfZKXS R^K\\S", "PfYFUISMSQUUZXZUXTXRZQ[R[L]N^L^FaIcMcQaU\\X", "PfZJYMVQ RYM`M\\T RZR]V", "PfbHTWWK^R", "PfWG_GcMcS_XWXSSSMWG", "PfaD[OaZ", "PfUD[OUZ", "PfaD[OaZ R^DXO^Z", "PfUD[OUZ RXD^OXZ", "PfbD^D^R", "PfT[X[XO", "PfbDbH^H^PZPZDbD", "PfT[TWYWYO]O][T[", "Pf^DbDaIaOaUbZ^Z^D", "PfTDXDX[T[UVUITD", "PfUIaI RUNaN R[N[Y", "PfUJaJaNUNUJ RURaRaVUVUR", "PfbD_H_VbZ", "PfTDWHWVTZ", "Pf\\DbDaIaOaUbZ\\Z\\D", "PfTDZDZ[T[UVUITD", "PfbD]F]XbZ R`E`Y", "PfTDYFYXTZ RVEVY", "PfbD]D][b[ R`D`[", "PfTDYDY[T[ RVDV[", "PfTOXL^RbO", "Pf^EbK RYE]K", "PfWDTJ R[DXJ", "PfXTTY R]TYY", "PfWI_I RWL_L R[L[S RWSXU^U_S RVNXNYPXRVRUPVN R^N`NaP`R^R]P^N RTNRNRSTSVX`XbSdSdNbN", "Pf[F[Y", "PfXJXU R]F]X", "PfVHVX R[J[V R`G`X", "PfaK^SUZ RWOaV", "PfZHVN]O_R_U]XYXWTWR_M", "Pf[M[P RTPbP", "Pf[J[M RTMbM RTQbQ", "Pf[I[L RTLbL RTPbP RTTbT", "PfXLWOTR RWObO R`O_VV[ RVQ[S_Y", "PfT\\W\\Y^YaWcTcRaR^T\\", "PfTAWAYCYFWHTHRFRCTA", "Pf_AbAdCdFbH_H]F]C_A", "Pf_\\b\\d^dabc_c]a]^_\\", "PfgOjOlQlTjVgVeTeQgO", "PfgKjKlMlPjRgRePeMgK RgTjTlVlYj[g[eYeVgT", "PfSQVMYQ\\M_QbM", "Pf]DWP]Z", "Pf]I`L R`HcK R]DWP]Z", "Pf_GWY", "Pf_MaP RbMdP R_GWY", "PfVH_X", "PfWG_GcMcS_XWXSSSMWG RWK_K RWO_O R[O[U", "PfUFZY R[FUY R\\FaY RaF\\Y", "PfULaL R[E[Y", "PfTLbL RXEXY R^E^Y", "PfTNbN RWGWVUY R[I[V R_H_Y", "PfXI^N\\O RXP^U", "PfUJaJaWUWUJ RaJUW", "PfTLWHZM]JbW", "PfTIVI RXIZI R\\I^I R`IbI RbK RbMbO RbQbS RbUbW R`W R^W\\W RZWXW RVWTWTU RTSTQ RTOTM RTKTI RWM[K]N`L RWQ_Q RWT_T R\\PYV", "PfUHaHaYUYUH R_JWW RWJ_W", 48, "PfVO]O RYLYTZY R\\QXYWYVXVUZR^R`U`W]Z", "PfTI^H RYEXPZY R]LZUVZTUXP^NaRaX][", "PfVPVWX[ZX R]Q`W", "Pf^J`NaS RTHTOUTWZZT", "PfZJ]L RWO]N_Q^VZ[", "PfXD]F RUM\\J_M_S]XXZ", "PfZN]P RXR^RX[ R[W]W][`[", "PfYE]H RWL^KV[ RYU]R]Z`Z", "PfUQ[Q RXNX[UYUWZT^T`W`Y[[ R]O`R", "PfTJ[I RWEWYTWTSZP^QaS`X[Y R^HaL", "PfSLZK\\OZZWY RXDTZ R]IaQ", "PfSLZK\\OZZWX RXDTY R]H`Q R`JbM RcIeL", "PfVI^G RUNaK RYD]SZS RVTVWXY\\Z", "PfVI^G RUNaK RYD]SZS RVTVWXY\\Z R_DaG RbCdF", "Pf]EXO]Z", "Pf]EXO]Z R_IaL RbHdK", "PfZLaL RVDUKURUVVYXS R^E_M_S^W\\Z", "PfZLaL RVDUKURUVVYXS R^E_M_S^W\\Z RaEcH RdDfG", "PfWG^G[J RWPUUWZ`Z", "PfWG^G[J RWPUUWZ`Z R`DbG RcCeF", "PfTK`I RYE_R[Q RVRVVXY]Z", "PfTK`I RYE_R[Q RVRVVXY]Z R_DaG RbCdF", "PfWEWVXYZ[][`YaU", "PfWEWVXYZ[][`YaU R\\L^O R_KaN", "PfSJaJ R]E]S\\WX[ R\\OZMYMWPWRYSZS\\Q", "PfSJaJ R]E]S\\WX[ R\\OZMYMWPWRYSZS\\Q R`DbG RcCeF", "PfTMbL R^E^S\\R RWGWZ`Z", "PfTMbL R^E^S\\R RWGWZ`Z R`EbH RcDeG", "PfWF_EXM RTNaL R_M[PYRYU[X^Z", "PfWF_EXM RTNaL R_M[PYRYU[X^Z RaDcG RdCfF", "PfTI[I RYDTY RZN`N RYSZW\\YaY", "PfTI[I RYDTY RZN`N RYT[YaY R_GaJ RbFdI", "PfTI^I RXDUSYO]O_R_V\\YX[", "PfTI^I RXDUSYO]O_R_V\\YX[ R^E`H RaDcG", "PfTO]M`NaR_UYX", "PfSL]I`JaMaP`S]VWX", "PfSL]I`JaMaP`S]VWX R`EbH RcDeG", "PfTIaG R_H[KYPYV[Y^Z", "PfTIaG R_H[KYPYV[Y^Z R`CbF RcBeE", "Pf_KWQUSUWWZ_Z RWDXIZN", "Pf_KWQUSUWWZ_Z RWDXIZN R_GaJ RbFdI", "PfTIZI RXDTU R_HbL R]L]X[YXXXT[SaX", "PfZHaH RUDTLTRUYWR RZSZW[XaX", "PfUGXW R[EXTUXSUTQWK]JaNaV^Z\\ZZW\\TbY", "PfWEWZ RTJWJWK RSVZK^IaJbNaU^Y\\YZXZU]TbX", "Pf[GWWTTTLVH[F_GbLbRaV\\Y", "PfYIaI R^E^YYXYT\\SaW RUETKTQUYVR", "PfYIaI R^E^YYXYT\\SaW RUETKTQUYVR R`EbH RcDeG", "PfYIaI R^E^YYXYT\\SaW RUETKTQUYVR RbDcDdEdFcGbGaFaEbD", "PfSKYGUNUTVXXZ[Y\\W]S^M]GbO", "PfSKYGUNUTVXXZ[Y\\W]S^M]GbO R`EbH RcDeG", "PfSKYGUNUTVXXZ[Y\\W]S^M]GbO RbEcEdFdGcHbHaGaFbE", "PfYE]H RZK[Q]U\\YYYWW RVPTX R_QaW", "PfYE]H RZK[Q]U\\YYYWW RVPTX R_QaW R_DaG RbCdF", "PfYE]H RZK[Q]U\\YYYWW RVPTX R_QaW R`DaDbEbFaG`G_F_E`D", "PfTRYKbS", "Pf^J`M RaIcL RTRYKbS", "Pf_I`IaJaK`L_L^K^J_I RTRYKbS", "PfYF`F RYL`L R^F^ZZYZW\\UbX RUETKTQUZWS", "PfYF`F RYL`L R^F^[ZYZW\\UbX RUETKTQUZWS RaCcF RdBfE", "PfYF`F RYL`L R^F^[ZYZW\\UbX RUETKTQUZWS RcCdCeDeEdFcFbEbDcC", "PfTH`H RVM^M R[D[YXYUWVUZT`W", "PfVG\\GZNVXTUTRWP[PbT R_K_Q^U[Y", "PfSHYH RWEVVXZ^Z_V_Q RVRUTTTSRSPTNUNVP R]IaN", "PfUHYX R[FYVVZSVSRWM[K_MbRaW]Z", "PfYDXVYZ[[^[`ZaV`P RTI\\I RUO\\O", "PfUR]N`O`Q_S\\T RVL[[ RYK[M", "PfSO_KaLbP_S\\S RUG[[ RYE\\H", "PfTLTVWP\\MaQaV]YYV R]J]R[[", "PfULUXXP[M_MbPbU_W\\WZU R]J]Y[[", "Pf[N[ZVYVVYU`X R[Q_Q", "Pf[E[[WZUXUVWTaY R[K`J", "PfYE]H RXIVUYQ]P`S_XY[", "Pf^E^R]VYZ RWEVJVNWQYN", "PfWF_EVS[O`OaRaW][Y[XWZU^Y", "PfWEWZ RTJXIWJ RSV\\I_I`L_S_YbU", "PfXG^FWT[O`OaRaW^YZZ", "PfWIWZ RULXLWN RUU[M^MaNaT_W[Y", "PfWEWZ RTKXJWL RSVYN[K_KaMbQ`U[Y", "PfWG]FWZUUVQZM^NaQaX][ZY[V_X", "PfXE^EVN R\\K`M`QZTWRXP[QTY RVWXW[Z R]W_WaY", "PfUH^H RZDUSYM[O\\U R`NWUWXZ[_[", "Pf[EU[ZQ\\Q^[_[bV", "PfXD]F RUM\\J_M_S]XXZ R`FbI RcEeH", "PfUO\\N]P\\YYW RYJUY R^LaQ", "PfYP`O RUKTQTUVZWW R]L]V\\X[[", 48, 48, "Pf^E`H RaDcG", "PfaDbDcEcFbGaG`F`EaD", "PfSEUH RVDXG", "PfTDUDVEVFUGTGSFSETD", "PfYI`P\\R", "PfYI`P\\R R^G`J RaFcI", "PfZJ`J R[EUW RXP^P`S_X\\[YZ", "PfTLbL RTTbT", "PfVK`K_N]Q R[N[RZUXX", "PfTGbGaI_L\\N RZJZQZSYVW[", "Pf[P[Z R^J\\NYQVS", "Pf[L[[ R`E^H[LWOTQ", "PfZHZL RVOVL_L_O^S]U[WXY", "Pf[D[H RUOUHaH`N_Q]U[XWZ", "PfWL_L R[L[W RVW`W", "PfUIaI RTWbW R[I[W", "PfWO`O R]K]Z[Y R\\O[RYUVX", "PfUKbK R^D^Z[Y R]K[PXSTW", "PfUJaJ`Y]W RZCZJZOYSWVUY", "PfUJaJ`Y]W RZCZJZOYSWVUY R_EaH RaCcF", "PfVL^J RUSaP RYD]Z", "Pf]E_G R`DbF RVL^J RUSaP RYD]Z", "PfZDYIWLUP RZH`H`L_P]T[WWZ", "PfZDYIWLUO RZGaG`L_P]T[WWZ R`DbF RcCeE", "PfWKbK RXDWHUMTP R]K]P\\SZVWZ", "PfWKbK RXDWHUMTQ R]K]P\\SZVWZ R^G`I RaFcH", "PfUIaIaWUW", "Pf`FbH RcEeG RUIaIaWUW", "PfTKbK RWEWR R_D_K_O^S]U[XYZ", "PfTKbK RWEWR R_D_K_O^S]U[XYZ RaDbF RdCeE", "PfWFZI RULXO RUYZW]U_SbK", "PfWFZI RULXO RUYZW]U_SbK R_GaI RbFdH", "PfUF^F]L[PYSWVTY R[Q]T`Y", "PfUF^F]L[OYSWVTY R[Q]T`Y R`EbG RcDeF", "PfULbJ^R RYEYXaX", "Pf_EaG RbDdF RULbJ^R RYDYXaX", "PfUFWL R`F`L_P^S\\VWY", "PfaG`L_P^T\\WXZ RaDcF RdCfE RUGWM", "PfXL]R RYDXHWLUP RYH`H_L^P]T[WXZ", "PfXL]R RYDXHWLUP RYH`H_L^P]T[WXZ R`EbG RcDeF", "PfTNbN R_E]FZGVH R\\G\\M[QZUYWVZ", "PfTNbN R_E]FZGVH R\\G\\M[QZUYWWZ R`DbF RcCeE", "PfULWQ RZK[P R`L`Q_T\\WYY", "PfUGWN RYF[L R`G`M_Q]U[WXY", "PfUGWN RYF[L R`G`M_Q]U[WXY RaEcG RdDfF", "PfWG_G RTMbM R[M[RYVVZ", "Pf`EbG RcDeF RWG_G RTMbM R[M[RYVVZ", "Pf[D[Z R[MaR", "Pf_KaM RbJdL R[D[Z R[MaR", "PfTLbL R[D[K[QZTXWVZ", "PfUKaK RSWcW", "PfXM_W RWF`F_L^P\\UZWVZ", "PfYD]G R[P[[ R]QaU RVH`H^L\\OYRTU", "Pf_F^L]QZUVY", "Pf^JbV RYJXOVSTV", "Pf^JbV RYJXOVSTV R_HaJ RbGdI", "Pf^JbV RYJXOVSTV R`GaGbHbIaJ`J_I_H`G", "PfUFUYaY R`J\\MYNVO", "PfUFUYaY R`J\\MYNVO R`HbJ RcGeI", "PfUFUYaY R`J\\MYNVO RaFbFcGcHbIaI`H`GaF", "PfUH`H`M_R]UZWVY", "PfUH`H`M_R]UZWVY RaFcH RdEfG", "PfUH`H`M_R]UZWVY RbEcEdFdGcHbHaGaFbE", "PfTRYJbV", "Pf]K_M R`JbL RTRYJbV", "Pf_K`KaLaM`N_N^M^L_K RTRYJbV", "PfUKaK R[E[ZXY R^OaW RWOVRUTTW", "PfUKaK R[E[ZXY R^OaW RWOVRUTTW R`GbI RcFeH", "PfUKaK R[E[ZXY R^OaW RWOVRUTTW RaFbFcGcHbIaI`H`GaF", "PfTJaJ_N]Q[S RWPZS[U]X", "PfWFaJ RWM_P RUT`Y", "Pf[FUY_W R]PaZ", "Pf`E_J]OZSXUTX RXKZM]Q`U", "PfVG`G RSOcO RZGZY`Y", "PfUOaL^R RXI[Z", "PfXE[Z RTMaI`L_O^Q", "PfXL^L^V RVVaV", "PfVI`I_W RSWcW", "PfWL_L_XWX RWR_R", "PfUHaHaXUX RUPaP", "PfVG`G RTLaLaQ_T\\WXZ", "PfXEXP R_E_M_Q]U\\WYZ", "PfWGWOVSUVTY R[E[Y]W_TaP", "PfWEWX[W^U`SbO", "PfUHUV RUHaHaVUV", "PfVPVJ`J_P]UYZ", "PfUGUN RaG`M_Q^U\\XYZ RUGaG", "PfWJbJ RWJWS RSScS R]D]Z", "PfVIaI]P R[L[W RSWcW", "PfVM`M RUF`F`L`O_S]VZXVZ", "PfUHYL RUXZW]T_QaJ", "Pf[D[H RUOUHaH`N_Q]U[XWZ RaEcG RdDfF", "PfWM_M^Y\\X R[IZNYSWX", "PfYMaM RYIXMWPUS R_M^Q]T\\WZZ", "PfaEcG RdDfF RUGUN RaG`N`Q^U\\WYZ RUGaG", "Pf`GbI RcFeH RWJbJ RWJWS RSScS R]D]Z", "Pf`FbH RcEeG RVIaI]P R[L[W RSWcW", "PfVM`M RUF`F`L`O_S]VZXVZ RaEcG RdDfF", "PfZP\\P]Q]S\\TZTYSYQZP", "PfSPcP", "PfWK^U", "Pf\\M^O R_KaM RWK^U", "PfVF`F`Y", 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, "PoROlO", "PoRFlF RX[`[ R`F`[", "PoRFlF R^[e[ RZFVQ RWNiNfZ", "Po\\D\\[j[jW RSOkK", "PoR[l[ R_D_[", "PoRFlF R_F_[", "PoRGlG R[UU[ R^LYW R_G\\T", "PoRFlF R\\F[PXVT[ R\\NiMiTg[`[", "PoRIlI RWLZS^WcYj[ RbDbLaT\\XYZS[", "PoTFjF RVPhP RR[l[", "Po^MjM RR[l[ R^D^[", "PoRElE R^E^[ R^KjQ", "PoSGlG RfFf[ RXVR[ RYFYPXV", "PoRElE R`H`[ RaGXPRS RaLiOlS", "PoYHiH RRTlT R\\[d[ RYCWNgNeZ", "PoRElE RURjR Rb[h[ RUJUU R_E_R R_KkKjRi[", "PoRElE R_KjK Rb[i[ R_E_P RUQlQi[ RVITR", "PoROlO RR[l[ R[FZNX[ RUFgFf[", "PoaXhX RR[l[ R`PcT RXUSW R^NVV RVK`P RaH^O RTFkFkNiX", "PoTGjG RRLlL ReS`X RYQhQbW R^C\\JXQ RYWeZ", "PoWLgL RWTgT RR[l[ RWEW[ RWEgEg[", "PoSFkF RR[l[ R`I`Y RcMfOkS RaF`IXQRS", "PoRJlJ R_RgR RWYkY RWDW[ R_C_T RgDgT", "PoRKlK RWYgY RWCW[ R_C_Y RgCg[", "PoWNkN RR[l[ RWGW[ RdNd[ RhEWG", "PoRElE Re[j[ RSKS[ RSKkKk[ R_F^PZUVV R^NgV", "PoR[l[ R[D[[ RcDc[ RTKXS RjKfS", "PoR[l[ RhTlX RaT\\X RYL\\O^T ReMiV RXOTW RcN_W RdHgS RYEWS RdDbR", "PoRGlG RUPjP R[[`[ R`K`[ ReSlY RYKUO RXTRZ R\\CYL", "Po`VkV RTV]V RR[l[ RkJgN RbJ`NhN`V R]J\\N RVKTO[OTV RZDVM RfDbL", "PoYX_X RS[k[ R_J_X RVEgEdG_J RRL[LXQSV RjJgMbN R`JbOgTlV", "PoSEkE RUJiJ RRPlP RZZjZ RXZhZ RRZeZ R_E_P ReTl[ R[PWZ"];
    w = class r31 extends Xt {
      static {
        l(this, "StrokeFont");
      }
      static {
        this.overbar_position_factor = 1.4;
      }
      static {
        this.underline_position_factor = -0.16;
      }
      static {
        this.font_scale = 1 / 21;
      }
      static {
        this.font_offset = -10;
      }
      static default() {
        return this.instance || (this.instance = new r31()), this.instance;
      }
      #e = /* @__PURE__ */ new Map();
      #t = [];
      constructor() {
        super("stroke"), this.#i();
      }
      #i() {
        for (let e of an) this.#t.push(cn(e));
        for (let e = 0; e < 256; e++) this.#r(e);
      }
      #r(e) {
        let t = f3[e];
        if (G(t)) this.#e.set(e, cn(t));
        else if (le(t)) {
          let i = this.#t[t];
          this.#e.set(e, i);
        } else throw new Error(`Invalid glyph data for glyph ${e}: ${t}`);
        f3[e] = void 0;
      }
      get_glyph(e) {
        let t = M3(e) - M3(" ");
        return t < 0 || t > f3.length ? this.get_glyph("?") : (this.#e.has(t) || this.#r(t), this.#e.get(t));
      }
      get_line_extents(e, t, i, s, n) {
        let a = super.get_line_extents(e, t, i, s, n), c = i * 1.25 * 2;
        return a.x += c, a.y += c, a;
      }
      compute_underline_vertical_position(e) {
        return e * r31.underline_position_factor;
      }
      compute_overbar_vertical_position(e) {
        return e * r31.overbar_position_factor;
      }
      get_interline(e, t = 1) {
        return e * t * r31.interline_pitch_ratio;
      }
      get_text_as_glyphs(e, t, i, s, n, a, c) {
        let N = [], Z = i.copy(), T = t.copy(), x = c.italic ? r31.italic_tilt : 0;
        (c.subscript || c.superscript) && (T = T.multiply(0.7), c.subscript ? Z.y += T.y * 0.3 : Z.y -= T.y * 0.5);
        for (let Oe of e) switch (Oe) {
          case "	":
            {
              let j = Math.round(T.x * 3.28), se = (Z.x - a.x) % j;
              Z.x += j - se;
            }
            break;
          case " ":
            Z.x += Math.round(T.x * 0.6);
            break;
          default:
            {
              let j = this.get_glyph(Oe), se = j.bbox.end.multiply(T);
              N.push(j.transform(T, Z, x, s, n, a)), x && (se.x -= se.y * x), Z.x += Math.round(se.x);
            }
            break;
        }
        let C = false, X = new d(0, 0), U = T.x * 0.1;
        if (c.overbar ? (C = true, X.y = this.compute_overbar_vertical_position(T.y)) : c.underline && (C = true, X.y = this.compute_underline_vertical_position(T.y)), C) {
          c.italic && (X.x = X.y * r31.italic_tilt);
          let Oe = new d(i.x + X.x + U, Z.y - X.y), j = new d(Z.x + X.x - U, Z.y - X.y), se = new U2([[Oe, j]], O.from_points([Oe, j]));
          N.push(se.transform(new d(1, 1), new d(0, 0), 0, s, n, a));
        }
        let st = new O();
        return st.start = i, st.end = new d(Z.x + X.x - Math.round(T.x * 0.2), Z.y + Math.max(T.y, X.y * r31.overbar_position_factor)), { bbox: st, glyphs: N, cursor: new d(Z.x, i.y) };
      }
    };
    l(M3, "ord");
    l(ln, "decode_coord_val");
    l(To, "decode_coord");
    l(cn, "decode_glyph");
    $ = class {
      constructor(e) {
        this.text_pos = new d(0, 0);
        this.attributes = new Ot();
        this.text = e;
      }
      static {
        l(this, "EDAText");
      }
      apply_effects(e) {
        this.attributes.h_align = e.justify.horizontal, this.attributes.v_align = e.justify.vertical, this.attributes.mirrored = e.justify.mirror, this.attributes.italic = e.font.italic, this.attributes.bold = e.font.bold, this.attributes.size.set(e.font.size.multiply(1e4)), this.attributes.stroke_width = (e.font.thickness ?? 0) * 1e4, this.attributes.stroke_width = this.get_effective_text_thickness(1588), this.attributes.color = e.font.color;
      }
      apply_at(e) {
        this.text_pos = e.position.multiply(1e4), this.text_angle = P.from_degrees(e.rotation);
      }
      get shown_text() {
        return this.text;
      }
      get_effective_text_thickness(e) {
        let t = this.text_thickness;
        return t < 1 && (t = e ?? 0, this.bold ? t = yo(this.text_width) : t <= 1 && (t = Lo(this.text_width))), t = Xo(t, this.text_width, true), t;
      }
      get text_angle() {
        return this.attributes.angle;
      }
      set text_angle(e) {
        this.attributes.angle = e;
      }
      get italic() {
        return this.attributes.italic;
      }
      get bold() {
        return this.attributes.bold;
      }
      get visible() {
        return this.attributes.visible;
      }
      get mirrored() {
        return this.attributes.mirrored;
      }
      get multiline() {
        return this.attributes.multiline;
      }
      get h_align() {
        return this.attributes.h_align;
      }
      set h_align(e) {
        this.attributes.h_align = e;
      }
      get v_align() {
        return this.attributes.v_align;
      }
      set v_align(e) {
        this.attributes.v_align = e;
      }
      get line_spacing() {
        return this.attributes.line_spacing;
      }
      get text_size() {
        return this.attributes.size;
      }
      get text_width() {
        return this.attributes.size.x;
      }
      get text_height() {
        return this.attributes.size.y;
      }
      get text_color() {
        return this.attributes.color;
      }
      get keep_upright() {
        return this.attributes.keep_upright;
      }
      get text_thickness() {
        return this.attributes.stroke_width;
      }
      get_text_box(e, t) {
        let i = this.text_pos.copy(), s = new O(0, 0, 0, 0), n = [], a = this.shown_text, c = this.get_effective_text_thickness();
        this.multiline && (n = a.split(`
`), n.length && (e != null && e < n.length ? a = n[e] : a = n[0]));
        let u = w.default(), h = this.text_size.copy(), m = this.bold, _ = this.italic, b = u.get_line_extents(a, h, c, m, _), f = 0, N = b.copy();
        if (this.multiline && e && e < n.length && (i.y -= Math.round(e * u.get_interline(h.y))), a.includes("~{") && (f = b.y / 14), t && (i.y = -i.y), s.start = i, this.multiline && !e && n.length) {
          for (let T of n.slice(1)) b = u.get_line_extents(T, h, c, m, _), N.x = Math.max(N.x, b.x);
          N.y += Math.round((n.length - 1) * u.get_interline(h.y));
        }
        s.w = N.x, s.h = N.y;
        let Z = this.italic ? Math.round(h.y * Xt.italic_tilt) : 0;
        switch (this.h_align) {
          case "left":
            this.mirrored && (s.x = s.x - (s.w - Z));
            break;
          case "center":
            s.x = s.x - (s.w - Z) / 2;
            break;
          case "right":
            this.mirrored || (s.x = s.x - (s.w - Z));
            break;
        }
        switch (this.v_align) {
          case "top":
            break;
          case "center":
            s.y = s.y - (s.h + f) / 2;
            break;
          case "bottom":
            s.y = s.y - (s.h + f);
            break;
        }
        return s;
      }
    };
    l(yo, "get_bold_thickness");
    l(Lo, "get_normal_thickness");
    l(Xo, "clamp_thickness");
    N3 = class extends $ {
      static {
        l(this, "LibText");
      }
      constructor(e) {
        super(e);
      }
      get shown_text() {
        return this.text;
      }
      get bounding_box() {
        let e = this.get_text_box(void 0, true).mirror_vertical(), t = this.text_pos, i = e.start, s = e.end, n = this.text_angle.negative();
        return i = n.rotate_point(i, t), s = n.rotate_point(s, t), e = O.from_points([i, s]), e = e.mirror_vertical(), e;
      }
      get world_pos() {
        let e = this.bounding_box, t = e.center;
        if (this.attributes.angle.is_vertical) switch (this.attributes.h_align) {
          case "left":
            t.y = e.y2;
            break;
          case "center":
            t.y = (e.y + e.y2) / 2;
            break;
          case "right":
            t.y = e.y;
            break;
        }
        else switch (this.attributes.h_align) {
          case "left":
            t.x = e.x;
            break;
          case "center":
            t.x = (e.x + e.x2) / 2;
            break;
          case "right":
            t.x = e.x2;
            break;
        }
        return t;
      }
      apply_symbol_transformations(e) {
        for (let t = 0; t < e.rotations; t++) this.rotate(new d(0, 0), true);
        e.mirror_x && this.mirror_vertically(new d(0, 0)), e.mirror_y && this.mirror_horizontally(new d(0, 0)), this.text_pos = this.text_pos.add(e.position.multiply(new d(1e4, -1e4)));
      }
      normalize_justification(e) {
        let t = new d(0, 0), i = this.get_text_box();
        this.text_angle.is_horizontal ? (this.h_align == "left" ? t.x = i.w / 2 : this.h_align == "right" && (t.x = -(i.w / 2)), this.v_align == "top" ? t.y = -(i.h / 2) : this.v_align == "bottom" && (t.y = i.h / 2)) : (this.h_align == "left" ? t.y = i.w / 2 : this.h_align == "right" && (t.y = -(i.w / 2)), this.v_align == "top" ? t.x = i.h / 2 : this.v_align == "bottom" && (t.x = -(i.h / 2))), e && (t = t.multiply(-1)), this.text_pos = this.text_pos.add(t);
      }
      rotate(e, t = false) {
        this.normalize_justification(false);
        let i = P.from_degrees(t ? -90 : 90);
        this.text_pos = i.rotate_point(this.text_pos, e), this.text_angle.is_horizontal ? this.text_angle.degrees = 90 : (this.h_align = Ft(this.h_align, "left", "right"), this.v_align = Ft(this.v_align, "top", "bottom"), this.text_angle.degrees = 0), this.normalize_justification(true);
      }
      mirror_horizontally(e) {
        this.normalize_justification(false);
        let t = this.text_pos.x;
        t -= e.x, t *= -1, t += e.x, this.text_angle.is_horizontal ? this.h_align = Ft(this.h_align, "left", "right") : this.v_align = Ft(this.v_align, "top", "bottom"), this.text_pos.x = t, this.normalize_justification(true);
      }
      mirror_vertically(e) {
        this.normalize_justification(false);
        let t = this.text_pos.y;
        t -= e.y, t *= -1, t += e.y, this.text_angle.is_horizontal ? this.v_align = Ft(this.v_align, "top", "bottom") : this.h_align = Ft(this.h_align, "left", "right"), this.text_pos.y = t, this.normalize_justification(true);
      }
    };
    l(Ft, "swap_values");
    g3 = class extends $ {
      constructor(t, i) {
        super(t);
        this.parent = i;
      }
      static {
        l(this, "SchField");
      }
      get shown_text() {
        return this.text == "~" ? "" : this.text;
      }
      get draw_rotation() {
        let t = this.text_angle.degrees, i = this.parent?.transform ?? F.identity();
        return Math.abs(i.elements[1]) == 1 && (t == 0 || t == 180 ? t = 90 : t = 0), P.from_degrees(t);
      }
      get position() {
        if (this.parent) {
          let t = this.text_pos.sub(this.parent.position);
          return t = this.parent.transform.transform(t), t.add(this.parent.position);
        }
        return this.text_pos;
      }
      get bounding_box() {
        let t = this.get_text_box();
        if (!this.parent?.is_symbol) return t;
        let i = this.parent?.position ?? new d(0, 0), s = this.text_pos.sub(i), n = t.start.sub(i), a = t.end.sub(i);
        n = this.text_angle.rotate_point(n, s), a = this.text_angle.rotate_point(a, s), n.y = Rn(n.y, s.y), a.y = Rn(a.y, s.y);
        let c = this.parent?.transform ?? F.identity();
        return t.start = c.transform(n), t.end = c.transform(a), t.start = t.start.add(i), t;
      }
    };
    l(Rn, "mirror");
    ze = class extends $ {
      static {
        l(this, "SchText");
      }
      constructor(e) {
        super(e);
      }
      apply_at(e) {
        super.apply_at(e), this.set_spin_style_from_angle(this.text_angle);
      }
      set_spin_style_from_angle(e) {
        switch (e.degrees) {
          default:
          case 0:
            this.text_angle.degrees = 0, this.h_align = "left";
            break;
          case 90:
            this.text_angle.degrees = 90, this.h_align = "left";
            break;
          case 180:
            this.text_angle.degrees = 0, this.h_align = "right";
            break;
          case 270:
            this.text_angle.degrees = 90, this.h_align = "right";
            break;
        }
        this.v_align = "bottom";
      }
      get shown_text() {
        return this.text;
      }
    };
    ae = class {
      constructor(e, t, i = true, s = false, n = p.white) {
        this.highlighted = false;
        this.interactive = false;
        this.bboxes = /* @__PURE__ */ new Map();
        this.#e = i, this.layer_set = e, this.name = t, this.color = n, this.interactive = s, this.items = [];
      }
      static {
        l(this, "ViewLayer");
      }
      #e;
      dispose() {
        this.clear();
      }
      clear() {
        this.graphics?.dispose(), this.graphics = void 0, this.items = [], this.bboxes.clear();
      }
      get visible() {
        return this.#e instanceof Function ? this.#e() : this.#e;
      }
      set visible(e) {
        this.#e = e;
      }
      get bbox() {
        return O.combine(this.bboxes.values());
      }
      *query_point(e) {
        for (let t of this.bboxes.values()) t.contains_point(e) && (yield t);
      }
    };
    Ut = class {
      static {
        l(this, "ViewLayerSet");
      }
      #e = [];
      #t = /* @__PURE__ */ new Map();
      #i;
      constructor() {
        this.#i = new ae(this, ":Overlay", true, false, p.white);
      }
      dispose() {
        this.#i.dispose();
        for (let e of this.#e) e.dispose();
        this.#e.length = 0, this.#t.clear();
      }
      add(...e) {
        for (let t of e) this.#e.push(t), this.#t.set(t.name, t);
      }
      *in_order() {
        for (let e of this.#e) yield e;
      }
      *in_display_order() {
        for (let e = this.#e.length - 1; e >= 0; e--) {
          let t = this.#e[e];
          t.highlighted || (yield t);
        }
        for (let e = this.#e.length - 1; e >= 0; e--) {
          let t = this.#e[e];
          t.highlighted && (yield t);
        }
        yield this.#i;
      }
      by_name(e) {
        return this.#t.get(e);
      }
      *query(e) {
        for (let t of this.#e) e(t) && (yield t);
      }
      get overlay() {
        return this.#i;
      }
      highlight(e) {
        let t = [];
        e && (t = Os(e).map((i) => i instanceof ae ? i.name : i));
        for (let i of this.#e) t.includes(i.name) ? i.highlighted = true : i.highlighted = false;
      }
      is_any_layer_highlighted() {
        for (let e of this.#e) if (e.highlighted) return true;
        return false;
      }
      *grid_layers() {
        yield this.by_name(":Grid");
      }
      *interactive_layers() {
        for (let e of this.in_order()) e.interactive && e.visible && (yield e);
      }
      *query_point(e) {
        for (let t of this.interactive_layers()) for (let i of t.query_point(e)) yield { layer: t, bbox: i };
      }
      *query_item_bboxes(e) {
        for (let t of this.interactive_layers()) {
          let i = t.bboxes.get(e);
          i && (yield i);
        }
      }
      get bbox() {
        let e = [];
        for (let t of this.in_order()) e.push(t.bbox);
        return O.combine(e);
      }
    };
    x2 = new ie("kicanvas:project");
    fe = class {
      constructor(e, t) {
        this.view_painter = e;
        this.gfx = t;
      }
      static {
        l(this, "ItemPainter");
      }
      get theme() {
        return this.view_painter.theme;
      }
    };
    Ge = class {
      constructor(e, t, i) {
        this.gfx = e;
        this.layers = t;
        this.theme = i;
      }
      static {
        l(this, "DocumentPainter");
      }
      #e = /* @__PURE__ */ new Map();
      set painter_list(e) {
        for (let t of e) for (let i of t.classes) this.#e.set(i, t);
      }
      get painters() {
        return this.#e;
      }
      paint(e) {
        x2.debug("Painting"), x2.debug("Sorting paintable items into layers");
        for (let t of e.items()) {
          let i = this.painter_for(t);
          if (!i) {
            x2.warn(`No painter found for ${t?.constructor.name}`);
            continue;
          }
          for (let s of i.layers_for(t)) this.layers.by_name(s)?.items.push(t);
        }
        for (let t of this.paintable_layers()) x2.debug(`Painting layer ${t.name} with ${t.items.length} items`), this.paint_layer(t);
        x2.debug("Painting complete");
      }
      *paintable_layers() {
        yield* this.layers.in_display_order();
      }
      paint_layer(e) {
        let t = /* @__PURE__ */ new Map();
        this.gfx.start_layer(e.name);
        for (let i of e.items) {
          this.gfx.start_bbox(), this.paint_item(e, i);
          let s = this.gfx.end_bbox(i);
          t.set(i, s);
        }
        e.graphics = this.gfx.end_layer(), e.bboxes = t;
      }
      paint_item(e, t, ...i) {
        this.painter_for(t)?.paint(e, t, ...i);
      }
      painter_for(e) {
        return this.painters.get(e.constructor);
      }
      layers_for(e) {
        return this.painters.get(e.constructor)?.layers_for(e) || [];
      }
    };
    qe = class r33 {
      static {
        l(this, "StrokePainter");
      }
      static line(e, t, i, s) {
        let n = i.stroke;
        if (n.type === "solid" || n.type === "default") {
          s(e);
          return;
        }
        for (let [a, c] of r33.windowed2_iter(e)) this.line_helper(a, c, t, i, s);
      }
      static line_helper(e, t, i, s, n) {
        let a = t.sub(e), c = a.magnitude, u = a.normalize(), h = dt.dot_length(i), m = dt.gap_length(i, s), _ = dt.dash_length(i, s), b = [];
        switch (s.stroke.type) {
          case "dash":
            b = [_, m];
            break;
          case "dot":
            b = [h, m];
            break;
          case "dash_dot":
            b = [_, m, h, m];
            break;
          case "dash_dot_dot":
            b = [_, m, h, m, h, m];
            break;
          default:
            return;
        }
        let f = 0, N = 0;
        for (; f < c; ) {
          let Z = b[N], T = Math.min(Z, c - f);
          if (N % 2 === 0 && T > 0) {
            let x = e.add(u.multiply(f)), C = x.add(u.multiply(T));
            n([x, C]);
          }
          f += T, N = (N + 1) % b.length;
        }
      }
      static *windowed2_iter(e) {
        for (let t = 0; t < e.length - 1; t++) yield [e[t], e[t + 1]];
      }
    };
    l(Q2, "offset_point");
    gr = class extends fe {
      constructor() {
        super(...arguments);
        this.classes = [O2];
      }
      static {
        l(this, "LinePainter");
      }
      layers_for(t) {
        return [":DrawingSheet"];
      }
      paint(t, i) {
        let s = i.parent, [n, a] = [i.incrx ?? 0, i.incry ?? 0];
        for (let c = 0; c < i.repeat; c++) {
          let u = new d(n * c, a * c), [h, m] = [Q2(s, i.start.position.add(u), i.start.anchor), Q2(s, i.end.position.add(u), i.start.anchor)];
          if (!h || !m) return;
          this.gfx.line(new v([h, m], i.linewidth || s.setup.linewidth, t.color));
        }
      }
    };
    Vr = class extends fe {
      constructor() {
        super(...arguments);
        this.classes = [Lt];
      }
      static {
        l(this, "RectPainter");
      }
      layers_for(t) {
        return [":DrawingSheet"];
      }
      paint(t, i) {
        let s = i.parent, [n, a] = [i.incrx ?? 0, i.incry ?? 0];
        for (let c = 0; c < i.repeat; c++) {
          let u = new d(n * c, a * c), [h, m] = [Q2(s, i.start.position.add(u), i.start.anchor, c > 0), Q2(s, i.end.position.add(u), i.end.anchor, c > 0)];
          if (!h || !m) return;
          let _ = O.from_points([h, m]);
          this.gfx.line(v.from_BBox(_, i.linewidth || s.setup.linewidth, t.color));
        }
      }
    };
    Pr = class extends fe {
      constructor() {
        super(...arguments);
        this.classes = [F2];
      }
      static {
        l(this, "TbTextPainter");
      }
      layers_for(t) {
        return [":DrawingSheet"];
      }
      paint(t, i) {
        let s = new $(i.shown_text);
        switch (s.h_align = "left", s.v_align = "center", s.text_angle = P.from_degrees(i.rotate), i.justify) {
          case "center":
            s.h_align = "center", s.v_align = "center";
            break;
          case "left":
            s.h_align = "left";
            break;
          case "right":
            s.h_align = "right";
            break;
          case "top":
            s.v_align = "top";
            break;
          case "bottom":
            s.v_align = "bottom";
            break;
        }
        s.attributes.bold = i.font?.bold ?? false, s.attributes.italic = i.font?.italic ?? false, s.attributes.color = t.color, s.attributes.size = (i.font?.size ?? i.parent.setup.textsize).multiply(1e4), s.attributes.stroke_width = (i.font?.linewidth ?? i.parent.setup.textlinewidth) * 1e4;
        let [n, a] = [i.incrx ?? 0, i.incry ?? 0];
        for (let c = 0; c < i.repeat; c++) {
          let u = new d(n * c, a * c), h = Q2(i.parent, i.pos.position.add(u), i.pos.anchor);
          if (!h) return;
          if (i.incrlabel && i.text.length == 1) {
            let m = i.incrlabel * c, _ = i.text.charCodeAt(0);
            _ >= 48 && _ <= 57 ? s.text = `${m + _ - 48}` : s.text = String.fromCharCode(_ + m);
          }
          s.text_pos = h?.multiply(1e4), this.gfx.state.push(), w.default().draw(this.gfx, s.shown_text, s.text_pos, s.attributes), this.gfx.state.pop();
        }
      }
    };
    V3 = class extends Ge {
      static {
        l(this, "DrawingSheetPainter");
      }
      constructor(e, t, i) {
        super(e, t, i), this.painter_list = [new gr(this, e), new Vr(this, e), new Pr(this, e)];
      }
      *paintable_layers() {
        yield this.layers.by_name(":DrawingSheet");
      }
    };
    W3 = class {
      constructor(e, t, i) {
        this.min_zoom = e;
        this.spacing = t;
        this.radius = i;
      }
      static {
        l(this, "GridLOD");
      }
    };
    Z3 = class {
      constructor(e, t, i, s = new d(0, 0), n = p.white, a = p.white, c = [new W3(2.5, 10, 0.2), new W3(15, 1, 0.05)]) {
        this.gfx = e;
        this.camera = t;
        this.layer = i;
        this.origin = s;
        this.color = n;
        this.origin_color = a;
        this.lods = c;
      }
      static {
        l(this, "Grid");
      }
      #e = new O(0, 0, 0, 0);
      #t;
      reset() {
        this.#t = void 0, this.#e.w = 0, this.#e.h = 0, this.layer.clear();
      }
      update() {
        let e;
        for (let c of this.lods) this.camera.zoom >= c.min_zoom && (e = c);
        if (!e) {
          this.reset();
          return;
        }
        let t = this.camera.bbox;
        if (this.#t == e && this.#e.contains(t)) return;
        t = t.grow(t.w * 0.2), this.#t = e, this.#e = t;
        let i = Math.round((t.x - this.origin.x) / e.spacing), s = Math.round((t.x2 - this.origin.x) / e.spacing), n = Math.round((t.y - this.origin.y) / e.spacing), a = Math.round((t.y2 - this.origin.y) / e.spacing);
        i > s && ([i, s] = [s, i]), n > a && ([n, a] = [a, n]), s += 1, a += 1, this.gfx.start_layer(this.layer.name);
        for (let c = i; c <= s; c += 1) for (let u = n; u <= a; u += 1) {
          let h = new d(c * e.spacing + this.origin.x, u * e.spacing + this.origin.y);
          this.gfx.circle(h, e.radius, this.color);
        }
        if (this.origin.x != 0 && this.origin.y != 0) {
          this.gfx.arc(this.origin, 1, new P(0), new P(2 * Math.PI), e.radius / 2, this.origin_color);
          let c = new d(1.5, 1.5);
          this.gfx.line([this.origin.sub(c), this.origin.add(c)], e.radius / 2, this.origin_color), c = new d(-1.5, 1.5), this.gfx.line([this.origin.sub(c), this.origin.add(c)], e.radius / 2, this.origin_color);
        }
        this.layer.graphics = this.gfx.end_layer();
      }
    };
    S3 = class {
      constructor(e = "kc", t) {
        this.prefix = e;
        this.reviver = t;
      }
      static {
        l(this, "LocalStorage");
      }
      key_for(e) {
        return `${this.prefix}:${e}`;
      }
      set(e, t, i) {
        window.localStorage.setItem(this.key_for(e), JSON.stringify({ val: t, exp: i }));
      }
      get(e, t) {
        let i = window.localStorage.getItem(this.key_for(e));
        if (i === null) return t;
        let s = JSON.parse(i, this.reviver);
        return s.exp && s.exp < Date.now() ? (this.delete(e), t) : s.val;
      }
      delete(e) {
        window.localStorage.removeItem(this.key_for(e));
      }
    };
    Oo = { name: "witchhazel", friendly_name: "Witch Hazel", board: { anchor: p.from_css("rgb(100, 203, 150)"), aux_items: p.from_css("rgb(255, 98, 0)"), b_adhes: p.from_css("rgb(0, 0, 132)"), b_crtyd: p.from_css("rgb(174, 129, 255)"), b_fab: p.from_css("rgb(113, 103, 153)"), b_mask: p.from_css("rgba(78, 129, 137, 0.800)"), b_paste: p.from_css("rgba(167, 234, 255, 0.502)"), b_silks: p.from_css("rgb(136, 100, 203)"), background: p.from_css("rgb(19, 18, 24)"), cmts_user: p.from_css("rgb(129, 255, 190)"), copper: { b: p.from_css("rgb(111, 204, 219)"), f: p.from_css("rgb(226, 114, 153)"), in1: p.from_css("rgb(127, 200, 127)"), in10: p.from_css("rgb(237, 124, 51)"), in11: p.from_css("rgb(91, 195, 235)"), in12: p.from_css("rgb(247, 111, 142)"), in13: p.from_css("rgb(167, 165, 198)"), in14: p.from_css("rgb(40, 204, 217)"), in15: p.from_css("rgb(232, 178, 167)"), in16: p.from_css("rgb(242, 237, 161)"), in17: p.from_css("rgb(237, 124, 51)"), in18: p.from_css("rgb(91, 195, 235)"), in19: p.from_css("rgb(247, 111, 142)"), in2: p.from_css("rgb(206, 125, 44)"), in20: p.from_css("rgb(167, 165, 198)"), in21: p.from_css("rgb(40, 204, 217)"), in22: p.from_css("rgb(232, 178, 167)"), in23: p.from_css("rgb(242, 237, 161)"), in24: p.from_css("rgb(237, 124, 51)"), in25: p.from_css("rgb(91, 195, 235)"), in26: p.from_css("rgb(247, 111, 142)"), in27: p.from_css("rgb(167, 165, 198)"), in28: p.from_css("rgb(40, 204, 217)"), in29: p.from_css("rgb(232, 178, 167)"), in3: p.from_css("rgb(79, 203, 203)"), in30: p.from_css("rgb(242, 237, 161)"), in4: p.from_css("rgb(219, 98, 139)"), in5: p.from_css("rgb(167, 165, 198)"), in6: p.from_css("rgb(40, 204, 217)"), in7: p.from_css("rgb(232, 178, 167)"), in8: p.from_css("rgb(242, 237, 161)"), in9: p.from_css("rgb(141, 203, 129)") }, cursor: p.from_css("rgb(220, 200, 255)"), drc_error: p.from_css("rgba(255, 0, 237, 0.800)"), drc_exclusion: p.from_css("rgba(255, 255, 255, 0.800)"), drc_warning: p.from_css("rgba(255, 208, 66, 0.800)"), dwgs_user: p.from_css("rgb(248, 248, 240)"), eco1_user: p.from_css("rgb(129, 238, 255)"), eco2_user: p.from_css("rgb(255, 129, 173)"), edge_cuts: p.from_css("rgb(129, 255, 190)"), f_adhes: p.from_css("rgb(132, 0, 132)"), f_crtyd: p.from_css("rgb(174, 129, 255)"), f_fab: p.from_css("rgb(113, 103, 153)"), f_mask: p.from_css("rgb(137, 78, 99)"), f_paste: p.from_css("rgba(252, 249, 255, 0.502)"), f_silks: p.from_css("rgb(220, 200, 255)"), footprint_text_invisible: p.from_css("rgb(40, 38, 52)"), grid: p.from_css("rgb(113, 103, 153)"), grid_axes: p.from_css("rgb(255, 129, 173)"), margin: p.from_css("rgb(78, 137, 107)"), no_connect: p.from_css("rgb(255, 148, 0)"), pad_plated_hole: p.from_css("rgb(194, 194, 0)"), pad_through_hole: p.from_css("rgb(227, 209, 46)"), non_plated_hole: p.from_css("rgb(129, 255, 190)"), ratsnest: p.from_css("rgb(128, 119, 168)"), user_1: p.from_css("rgb(194, 118, 0)"), user_2: p.from_css("rgb(89, 148, 220)"), user_3: p.from_css("rgb(180, 219, 210)"), user_4: p.from_css("rgb(216, 200, 82)"), user_5: p.from_css("rgb(194, 194, 194)"), user_6: p.from_css("rgb(89, 148, 220)"), user_7: p.from_css("rgb(180, 219, 210)"), user_8: p.from_css("rgb(216, 200, 82)"), user_9: p.from_css("rgb(232, 178, 167)"), via_blind_buried: p.from_css("rgb(203, 196, 100)"), via_hole: p.from_css("rgb(40, 38, 52)"), via_micro: p.from_css("rgb(255, 148, 0)"), via_through: p.from_css("rgb(227, 209, 46)"), worksheet: p.from_css("rgb(100, 190, 203)") }, schematic: { anchor: p.from_css("rgb(174, 129, 255)"), aux_items: p.from_css("rgb(255, 160, 0)"), background: p.from_css("rgb(19, 18, 24)"), brightened: p.from_css("rgb(200, 255, 227)"), bus: p.from_css("rgb(129, 238, 255)"), bus_junction: p.from_css("rgb(163, 243, 255)"), component_body: p.from_css("rgb(67, 62, 86)"), component_outline: p.from_css("rgb(197, 163, 255)"), cursor: p.from_css("rgb(220, 200, 255)"), erc_error: p.from_css("rgba(255, 55, 162, 0.800)"), erc_warning: p.from_css("rgba(255, 92, 0, 0.800)"), fields: p.from_css("rgb(174, 129, 255)"), grid: p.from_css("rgb(113, 103, 153)"), grid_axes: p.from_css("rgb(255, 129, 173)"), hidden: p.from_css("rgb(67, 62, 86)"), junction: p.from_css("rgb(220, 200, 255)"), label_global: p.from_css("rgb(255, 247, 129)"), label_hier: p.from_css("rgb(163, 255, 207)"), label_local: p.from_css("rgb(220, 200, 255)"), netclass_flag: p.from_css("rgb(220, 200, 255)"), no_connect: p.from_css("rgb(255, 129, 173)"), note: p.from_css("rgb(248, 248, 240)"), pin: p.from_css("rgb(129, 255, 190)"), pin_name: p.from_css("rgb(129, 255, 190)"), pin_number: p.from_css("rgb(100, 203, 150)"), reference: p.from_css("rgb(129, 238, 255)"), rule_area: p.from_css("rgb(197, 163, 255)"), shadow: p.from_css("rgb(200, 248, 255)"), sheet: p.from_css("rgb(174, 129, 255)"), sheet_background: p.from_css("rgb(19, 18, 24)"), sheet_fields: p.from_css("rgb(129, 255, 190)"), sheet_filename: p.from_css("rgb(78, 129, 137)"), sheet_label: p.from_css("rgb(129, 255, 190)"), sheet_name: p.from_css("rgb(129, 238, 255)"), value: p.from_css("rgb(129, 238, 255)"), wire: p.from_css("rgb(174, 129, 255)"), worksheet: p.from_css("rgb(100, 190, 203)") } };
    Wr = Oo;
    Fo = { name: "kicad", friendly_name: "KiCad", board: { anchor: p.from_css("rgb(255, 38, 226)"), aux_items: p.from_css("rgb(255, 255, 255)"), b_adhes: p.from_css("rgb(0, 0, 132)"), b_crtyd: p.from_css("rgb(38, 233, 255)"), b_fab: p.from_css("rgb(88, 93, 132)"), b_mask: p.from_css("rgba(2, 255, 238, 0.400)"), b_paste: p.from_css("rgba(0, 194, 194, 0.902)"), b_silks: p.from_css("rgb(232, 178, 167)"), background: p.from_css("rgb(0, 16, 35)"), cmts_user: p.from_css("rgb(89, 148, 220)"), copper: { b: p.from_css("rgb(77, 127, 196)"), f: p.from_css("rgb(200, 52, 52)"), in1: p.from_css("rgb(127, 200, 127)"), in10: p.from_css("rgb(237, 124, 51)"), in11: p.from_css("rgb(91, 195, 235)"), in12: p.from_css("rgb(247, 111, 142)"), in13: p.from_css("rgb(167, 165, 198)"), in14: p.from_css("rgb(40, 204, 217)"), in15: p.from_css("rgb(232, 178, 167)"), in16: p.from_css("rgb(242, 237, 161)"), in17: p.from_css("rgb(237, 124, 51)"), in18: p.from_css("rgb(91, 195, 235)"), in19: p.from_css("rgb(247, 111, 142)"), in2: p.from_css("rgb(206, 125, 44)"), in20: p.from_css("rgb(167, 165, 198)"), in21: p.from_css("rgb(40, 204, 217)"), in22: p.from_css("rgb(232, 178, 167)"), in23: p.from_css("rgb(242, 237, 161)"), in24: p.from_css("rgb(237, 124, 51)"), in25: p.from_css("rgb(91, 195, 235)"), in26: p.from_css("rgb(247, 111, 142)"), in27: p.from_css("rgb(167, 165, 198)"), in28: p.from_css("rgb(40, 204, 217)"), in29: p.from_css("rgb(232, 178, 167)"), in3: p.from_css("rgb(79, 203, 203)"), in30: p.from_css("rgb(242, 237, 161)"), in4: p.from_css("rgb(219, 98, 139)"), in5: p.from_css("rgb(167, 165, 198)"), in6: p.from_css("rgb(40, 204, 217)"), in7: p.from_css("rgb(232, 178, 167)"), in8: p.from_css("rgb(242, 237, 161)"), in9: p.from_css("rgb(141, 203, 129)") }, cursor: p.from_css("rgb(255, 255, 255)"), drc_error: p.from_css("rgba(215, 91, 107, 0.800)"), drc_exclusion: p.from_css("rgba(255, 255, 255, 0.800)"), drc_warning: p.from_css("rgba(255, 208, 66, 0.800)"), dwgs_user: p.from_css("rgb(194, 194, 194)"), eco1_user: p.from_css("rgb(180, 219, 210)"), eco2_user: p.from_css("rgb(216, 200, 82)"), edge_cuts: p.from_css("rgb(208, 210, 205)"), f_adhes: p.from_css("rgb(132, 0, 132)"), f_crtyd: p.from_css("rgb(255, 38, 226)"), f_fab: p.from_css("rgb(175, 175, 175)"), f_mask: p.from_css("rgba(216, 100, 255, 0.400)"), f_paste: p.from_css("rgba(180, 160, 154, 0.902)"), f_silks: p.from_css("rgb(242, 237, 161)"), footprint_text_invisible: p.from_css("rgb(132, 132, 132)"), grid: p.from_css("rgb(132, 132, 132)"), grid_axes: p.from_css("rgb(194, 194, 194)"), margin: p.from_css("rgb(255, 38, 226)"), no_connect: p.from_css("rgb(0, 0, 132)"), pad_plated_hole: p.from_css("rgb(194, 194, 0)"), pad_through_hole: p.from_css("rgb(227, 183, 46)"), non_plated_hole: p.from_css("rgb(26, 196, 210)"), ratsnest: p.from_css("rgba(245, 255, 213, 0.702)"), user_1: p.from_css("rgb(194, 194, 194)"), user_2: p.from_css("rgb(89, 148, 220)"), user_3: p.from_css("rgb(180, 219, 210)"), user_4: p.from_css("rgb(216, 200, 82)"), user_5: p.from_css("rgb(194, 194, 194)"), user_6: p.from_css("rgb(89, 148, 220)"), user_7: p.from_css("rgb(180, 219, 210)"), user_8: p.from_css("rgb(216, 200, 82)"), user_9: p.from_css("rgb(232, 178, 167)"), via_blind_buried: p.from_css("rgb(187, 151, 38)"), via_hole: p.from_css("rgb(227, 183, 46)"), via_micro: p.from_css("rgb(0, 132, 132)"), via_through: p.from_css("rgb(236, 236, 236)"), worksheet: p.from_css("rgb(200, 114, 171)") }, schematic: { anchor: p.from_css("rgb(0, 0, 255)"), aux_items: p.from_css("rgb(0, 0, 0)"), background: p.from_css("rgb(245, 244, 239)"), brightened: p.from_css("rgb(255, 0, 255)"), bus: p.from_css("rgb(0, 0, 132)"), bus_junction: p.from_css("rgb(0, 0, 132)"), component_body: p.from_css("rgb(255, 255, 194)"), component_outline: p.from_css("rgb(132, 0, 0)"), cursor: p.from_css("rgb(15, 15, 15)"), erc_error: p.from_css("rgba(230, 9, 13, 0.800)"), erc_warning: p.from_css("rgba(209, 146, 0, 0.800)"), fields: p.from_css("rgb(132, 0, 132)"), grid: p.from_css("rgb(181, 181, 181)"), grid_axes: p.from_css("rgb(0, 0, 132)"), hidden: p.from_css("rgb(94, 194, 194)"), junction: p.from_css("rgb(0, 150, 0)"), label_global: p.from_css("rgb(132, 0, 0)"), label_hier: p.from_css("rgb(114, 86, 0)"), label_local: p.from_css("rgb(15, 15, 15)"), netclass_flag: p.from_css("rgb(72, 72, 72)"), no_connect: p.from_css("rgb(0, 0, 132)"), note: p.from_css("rgb(0, 0, 194)"), pin: p.from_css("rgb(132, 0, 0)"), pin_name: p.from_css("rgb(0, 100, 100)"), pin_number: p.from_css("rgb(169, 0, 0)"), reference: p.from_css("rgb(0, 100, 100)"), rule_area: p.from_css("rgb(255, 0, 0)"), shadow: p.from_css("rgba(199, 235, 255, 0.800)"), sheet: p.from_css("rgb(132, 0, 0)"), sheet_background: p.from_css("rgba(255, 255, 255, 0.000)"), sheet_fields: p.from_css("rgb(132, 0, 132)"), sheet_filename: p.from_css("rgb(114, 86, 0)"), sheet_label: p.from_css("rgb(0, 100, 100)"), sheet_name: p.from_css("rgb(0, 100, 100)"), value: p.from_css("rgb(0, 100, 100)"), wire: p.from_css("rgb(0, 150, 0)"), worksheet: p.from_css("rgb(132, 0, 0)") } };
    un = Fo;
    pn = [Wr, un];
    Uo = new Map(pn.map((r40) => [r40.name, r40]));
    Te = { default: Wr, by_name(r40) {
      return Uo.get(r40) ?? this.default;
    }, list() {
      return pn;
    } };
    ce = class r34 extends EventTarget {
      constructor() {
        super(...arguments);
        this.storage = new S3("kc:prefs");
        this.theme = Te.default;
        this.alignControlsWithKiCad = true;
      }
      static {
        l(this, "Preferences");
      }
      static {
        this.INSTANCE = new r34();
      }
      save() {
        this.storage.set("theme", this.theme.name), this.storage.set("alignControlsWithKiCad", this.alignControlsWithKiCad), this.dispatchEvent(new T3({ preferences: this }));
      }
      load() {
        this.theme = Te.by_name(this.storage.get("theme", Te.default.name)), this.alignControlsWithKiCad = this.storage.get("alignControlsWithKiCad", false);
      }
    };
    ce.INSTANCE.load();
    T3 = class r35 extends CustomEvent {
      static {
        l(this, "PreferencesChangeEvent");
      }
      static {
        this.type = "kicanvas:preferences:change";
      }
      constructor(e) {
        super(r35.type, { detail: e, composed: true, bubbles: true });
      }
    };
    l(hn, "WithPreferences");
    dn = 8;
    y3 = 24;
    vo = 5e-3;
    mn = 1;
    _n = ce.INSTANCE;
    L3 = class {
      constructor(e, t, i, s = 0.5, n = 10, a) {
        this.target = e;
        this.camera = t;
        this.callback = i;
        this.min_zoom = s;
        this.max_zoom = n;
        this.bounds = a;
        this.target.addEventListener("wheel", (_) => this.#i(_), { passive: false });
        let c = null, u = null;
        this.target.addEventListener("touchstart", (_) => {
          _.touches.length === 2 ? c = this.#t(_.touches) : _.touches.length === 1 && (u = _.touches);
        }), this.target.addEventListener("touchmove", (_) => {
          if (_.touches.length === 2) {
            if (c !== null) {
              let b = this.#t(_.touches);
              if (Math.abs(c - b) < 10) {
                let f = b / c * 4;
                c < b ? this.#n(f * -1) : this.#n(f);
              }
              c = b;
            }
          } else if (_.touches.length === 1 && u !== null) {
            let b = u[0]?.clientX ?? 0, f = u[0]?.clientY ?? 0, N = _.touches[0]?.clientX ?? 0, Z = _.touches[0]?.clientY ?? 0;
            Math.abs(b - N) < 100 && Math.abs(f - Z) < 100 && this.#s(b - N, f - Z), u = _.touches;
          }
        }), this.target.addEventListener("touchend", () => {
          c = null, u = null;
        });
        let h = null, m = false;
        this.target.addEventListener("mousedown", (_) => {
          (_.button === 1 || _.button === 2) && (_.preventDefault(), m = true, h = new d(_.clientX, _.clientY));
        }), this.target.addEventListener("mousemove", (_) => {
          if (m && h !== null) {
            let b = new d(_.clientX, _.clientY), f = b.sub(h);
            this.#s(-f.x, -f.y), h = b;
          }
        }), this.target.addEventListener("mouseup", (_) => {
          (_.button === 1 || _.button === 2) && (m = false, h = null);
        }), this.target.addEventListener("contextmenu", (_) => {
          _.preventDefault();
        });
      }
      static {
        l(this, "PanAndZoom");
      }
      #e;
      #t(e) {
        if (e[0] && e[1]) {
          let t = e[0].clientX - e[1].clientX, i = e[0].clientY - e[1].clientY;
          return Math.sqrt(t * t + i * i);
        }
        return 0;
      }
      #i(e) {
        e.preventDefault();
        let t = e.deltaX, i = e.deltaY;
        _n.alignControlsWithKiCad ? t == 0 && e.ctrlKey && ([t, i] = [i, t]) : t == 0 && e.shiftKey && ([t, i] = [i, t]), e.deltaMode === WheelEvent.DOM_DELTA_LINE ? (t *= dn, i *= dn) : e.deltaMode === WheelEvent.DOM_DELTA_PAGE && (t *= y3, i *= y3), t = Math.sign(t) * Math.min(y3, Math.abs(t)), i = Math.sign(i) * Math.min(y3, Math.abs(i)), _n.alignControlsWithKiCad ? e.shiftKey || e.ctrlKey ? this.#s(-t, i) : (this.#e = this.target.getBoundingClientRect(), this.#n(i, this.#r(e))) : e.ctrlKey ? (this.#e = this.target.getBoundingClientRect(), this.#n(i, this.#r(e))) : this.#s(t, i), this.target.dispatchEvent(new MouseEvent("panzoom", { clientX: e.clientX, clientY: e.clientY }));
      }
      #r(e) {
        return new d(e.clientX - this.#e.left, e.clientY - this.#e.top);
      }
      #s(e, t) {
        let i = new d(e * mn, t * mn).multiply(1 / this.camera.zoom);
        this.camera.translate(i), this.callback && this.callback();
      }
      #n(e, t) {
        if (this.camera.zoom *= Math.exp(e * -vo), this.camera.zoom = Math.min(this.max_zoom, Math.max(this.camera.zoom, this.min_zoom)), t != null) {
          let i = this.camera.screen_to_world(t), s = this.camera.screen_to_world(t), n = i.sub(s);
          this.camera.translate(n);
        }
        this.callback && this.callback();
      }
    };
    X3 = class {
      constructor(e, t) {
        this.target = e;
        this.callback = t;
        this.#e = new ResizeObserver(() => {
          this.callback(this.target);
        }), this.#e.observe(e);
      }
      static {
        l(this, "SizeObserver");
      }
      #e;
      dispose() {
        this.#e?.disconnect(), this.#e = void 0;
      }
    };
    O3 = class {
      constructor(e, t) {
        this.renderer = e;
        this.callback = t;
        this.ready = new Ve();
        this.camera = new j2(new d(0, 0), new d(0, 0), 1, new P(0)), this.#e = new X3(this.renderer.canvas, () => {
          this.#i(), this.callback();
        }), this.#i();
      }
      static {
        l(this, "Viewport");
      }
      #e;
      #t;
      dispose() {
        this.#e.dispose();
      }
      #i() {
        let e = this.renderer.canvas;
        e.clientWidth > 0 && e.clientHeight > 0 && (this.width != e.clientWidth || this.height != e.clientHeight) && (this.width = e.clientWidth, this.height = e.clientHeight, this.camera.viewport_size = new d(this.width, this.height), this.width && this.height && this.ready.open());
      }
      enable_pan_and_zoom(e, t) {
        this.#t = new L3(this.renderer.canvas, this.camera, () => {
          this.callback();
        }, e, t);
      }
      get view_matrix() {
        return this.camera.matrix;
      }
      set bounds(e) {
        this.#t && (this.#t.bounds = e);
      }
    };
    w2 = class extends EventTarget {
      constructor(t, i = true) {
        super();
        this.canvas = t;
        this.interactive = i;
        this.mouse_position = new d(0, 0);
        this.loaded = new Ve();
        this.disposables = new ot();
        this.setup_finished = new Ve();
      }
      static {
        l(this, "Viewer");
      }
      #e;
      dispose() {
        this.disposables.dispose();
      }
      addEventListener(t, i, s) {
        return super.addEventListener(t, i, s), { dispose: l(() => {
          this.removeEventListener(t, i, s);
        }, "dispose") };
      }
      async setup() {
        this.renderer = this.disposables.add(this.create_renderer(this.canvas)), await this.renderer.setup(), this.viewport = this.disposables.add(new O3(this.renderer, () => {
          this.on_viewport_change();
        })), this.interactive && (this.viewport.enable_pan_and_zoom(0.5, 190), this.disposables.add(I(this.canvas, "mousemove", (t) => {
          this.on_mouse_change(t);
        })), this.disposables.add(I(this.canvas, "panzoom", (t) => {
          this.on_mouse_change(t);
        })), this.disposables.add(I(this.canvas, "click", (t) => {
          let i = this.layers.query_point(this.mouse_position);
          this.on_pick(this.mouse_position, i);
        }))), this.setup_finished.open();
      }
      on_viewport_change() {
        this.interactive && this.draw();
      }
      on_mouse_change(t) {
        let i = this.canvas.getBoundingClientRect(), s = this.viewport.camera.screen_to_world(new d(t.clientX - i.left, t.clientY - i.top));
        (this.mouse_position.x != s.x || this.mouse_position.y != s.y) && (this.mouse_position.set(s), this.dispatchEvent(new ct(this.mouse_position)));
      }
      resolve_loaded(t) {
        t && (this.loaded.open(), this.dispatchEvent(new te()));
      }
      on_draw() {
        if (this.renderer.clear_canvas(), !this.layers) return;
        let t = 0.01, i = this.viewport.camera.matrix, s = this.layers.is_any_layer_highlighted();
        for (let n of this.layers.in_display_order()) if (n.visible && n.graphics) {
          let a = n.opacity;
          s && !n.highlighted && (a = 0.25), n.graphics.render(i, t, a), t += 0.01;
        }
      }
      draw() {
        this.viewport && window.requestAnimationFrame(() => {
          this.on_draw();
        });
      }
      on_pick(t, i) {
        let s = null;
        for (let { bbox: n } of i) {
          s = n;
          break;
        }
        this.select(s);
      }
      select(t) {
        this.selected = t;
      }
      get selected() {
        return this.#e;
      }
      set selected(t) {
        this._set_selected(t);
      }
      _set_selected(t) {
        let i = this.#e;
        this.#e = t?.copy() || null, this.dispatchEvent(new z({ item: this.#e?.context, previous: i?.context })), Fe(() => this.paint_selected());
      }
      get selection_color() {
        return p.white;
      }
      paint_selected() {
        let t = this.layers.overlay;
        if (t.clear(), this.#e) {
          let i = this.#e.copy().grow(this.#e.w * 0.1);
          this.renderer.start_layer(t.name), this.renderer.line(v.from_BBox(i, 0.254, this.selection_color)), this.renderer.polygon(J.from_BBox(i, this.selection_color)), t.graphics = this.renderer.end_layer(), t.graphics.composite_operation = "overlay";
        }
        this.draw();
      }
      zoom_to_selection() {
        this.selected && (this.viewport.camera.bbox = this.selected.grow(10), this.draw());
      }
      flip_view() {
        let t = !this.viewport.camera.flipped;
        this.viewport.camera.flipped = t;
        for (let i of this.layers.in_order()) i.graphics && (i.graphics.renderer.state.flipped = t);
        this.paint(), this.draw();
      }
    };
    W([lt], w2.prototype, "_set_selected", 1);
    Je = new ie("kicanvas:viewer");
    vt = class extends w2 {
      static {
        l(this, "DocumentViewer");
      }
      constructor(e, t, i) {
        super(e, t), this.theme = i;
      }
      get grid_origin() {
        return new d(0, 0);
      }
      async load(e) {
        await this.setup_finished, this.document != e && (Je.info(`Loading ${e.filename} into viewer`), this.document = e, this.paint(), Fe(async () => {
          Je.info("Waiting for viewport"), await this.viewport.ready, this.viewport.bounds = this.drawing_sheet.page_bbox.grow(50), Je.info("Positioning camera"), this.zoom_to_page(), this.resolve_loaded(true), this.selected && (this.selected = null), this.draw();
        }));
      }
      paint() {
        this.document && (this.renderer.background_color = this.theme.background, Je.info("Loading drawing sheet"), this.drawing_sheet || (this.drawing_sheet = X2.default()), this.drawing_sheet.document = this.document, Je.info("Creating layers"), this.disposables.disposeAndRemove(this.layers), this.layers = this.disposables.add(this.create_layer_set()), Je.info("Painting items"), this.painter = this.create_painter(), this.painter.paint(this.document), Je.info("Painting drawing sheet"), new V3(this.renderer, this.layers, this.theme).paint(this.drawing_sheet), Je.info("Painting grid"), this.grid = new Z3(this.renderer, this.viewport.camera, this.layers.by_name(":Grid"), this.grid_origin, this.theme.grid, this.theme.grid_axes));
      }
      zoom_to_page() {
        this.viewport.camera.bbox = this.drawing_sheet.page_bbox.grow(10), this.draw();
      }
      draw() {
        this.viewport && (this.grid?.update(), super.draw());
      }
      select(e) {
        if (e != null && !(e instanceof O)) throw new Error(`Unable to select item ${e}, could not find an object that matched.`);
        this.selected = e ?? null;
      }
    };
    tt = ((S) => (S.dwgs_user = "Dwgs.User", S.cmts_user = "Cmts.User", S.eco1_user = "Eco1.User", S.eco2_user = "Eco2.User", S.edge_cuts = "Edge.Cuts", S.margin = "Margin", S.user_1 = "User.1", S.user_2 = "User.2", S.user_3 = "User.3", S.user_4 = "User.4", S.user_5 = "User.5", S.user_6 = "User.6", S.user_7 = "User.7", S.user_8 = "User.8", S.user_9 = "User.9", S.anchors = ":Anchors", S.non_plated_holes = ":NonPlatedHoles", S.via_holes = ":Via:Holes", S.pad_holes_netname = ":Pad:Holes:NetName", S.pad_holes = ":Pad:Holes", S.pad_holewalls = ":Pad:HoleWalls", S.via_holewalls = ":Via:HoleWalls", S.pads_front_netname = ":Pads:Front:NetName", S.pads_front = ":Pads:Front", S.f_cu = "F.Cu", S.f_mask = "F.Mask", S.f_silks = "F.SilkS", S.f_adhes = "F.Adhes", S.f_paste = "F.Paste", S.f_crtyd = "F.CrtYd", S.f_fab = "F.Fab", S.in1_cu = "In1.Cu", S.in2_cu = "In2.Cu", S.in3_cu = "In3.Cu", S.in4_cu = "In4.Cu", S.in5_cu = "In5.Cu", S.in6_cu = "In6.Cu", S.in7_cu = "In7.Cu", S.in8_cu = "In8.Cu", S.in9_cu = "In9.Cu", S.in10_cu = "In10.Cu", S.in11_cu = "In11.Cu", S.in12_cu = "In12.Cu", S.in13_cu = "In13.Cu", S.in14_cu = "In14.Cu", S.in15_cu = "In15.Cu", S.in16_cu = "In16.Cu", S.in17_cu = "In17.Cu", S.in18_cu = "In18.Cu", S.in19_cu = "In19.Cu", S.in20_cu = "In20.Cu", S.in21_cu = "In21.Cu", S.in22_cu = "In22.Cu", S.in23_cu = "In23.Cu", S.in24_cu = "In24.Cu", S.in25_cu = "In25.Cu", S.in26_cu = "In26.Cu", S.in27_cu = "In27.Cu", S.in28_cu = "In28.Cu", S.in29_cu = "In29.Cu", S.in30_cu = "In30.Cu", S.pads_back_netname = ":Pads:Back:NetName", S.pads_back = ":Pads:Back", S.b_cu = "B.Cu", S.b_mask = "B.Mask", S.b_silks = "B.SilkS", S.b_adhes = "B.Adhes", S.b_paste = "B.Paste", S.b_crtyd = "B.CrtYd", S.b_fab = "B.Fab", S[S.drawing_sheet = ":DrawingSheet"] = "drawing_sheet", S[S.grid = ":Grid"] = "grid", S))(tt || {});
    xo = [":NonPlatedHoles", ":Via:Holes", ":Pad:Holes", ":Pad:HoleWalls", ":Via:HoleWalls"];
    et = ["F.Cu", "In1.Cu", "In2.Cu", "In3.Cu", "In4.Cu", "In5.Cu", "In6.Cu", "In7.Cu", "In8.Cu", "In9.Cu", "In10.Cu", "In11.Cu", "In12.Cu", "In13.Cu", "In14.Cu", "In15.Cu", "In16.Cu", "In17.Cu", "In18.Cu", "In19.Cu", "In20.Cu", "In21.Cu", "In22.Cu", "In23.Cu", "In24.Cu", "In25.Cu", "In26.Cu", "In27.Cu", "In28.Cu", "In29.Cu", "In30.Cu", "B.Cu"];
    l(ye, "virtual_layer_for");
    l(bn, "is_virtual");
    l(Qo, "is_virtual_for");
    l(wo, "is_pad_layer_for");
    l(fn, "is_copper");
    l(Mn, "is_manufacturing_layer");
    l(Nn, "copper_layers_between");
    F3 = class extends Ut {
      constructor(t, i) {
        super();
        this.theme = i;
        let s = /* @__PURE__ */ new Map();
        for (let n of t.layers) s.set(n.canonical_name, n);
        for (let n of Object.values(tt)) {
          if (!bn(n) && !s.has(n)) continue;
          let a = true, c = false;
          xo.includes(n) && (a = l(() => this.is_any_copper_layer_visible(), "visible"), c = true), (n == ":Pads:Front" || n == ":Pads:Front:NetName") && (a = l(() => this.by_name("F.Cu").visible, "visible"), c = true), (n == ":Pads:Back" || n == ":Pads:Back:NetName") && (a = l(() => this.by_name("B.Cu").visible, "visible"), c = true), n == ":Pad:Holes:NetName" && (a = l(() => this.by_name(":Pad:Holes").visible, "visible"), c = true), fn(n) && (c = true, this.add(new ae(this, ye(n, "BBViaHoles"), () => this.by_name(n).visible, false, this.color_for(":Via:Holes"))), this.add(new ae(this, ye(n, "BBViaHoleWalls"), () => this.by_name(n).visible, false, this.color_for(":Via:HoleWalls"))), this.add(new ae(this, ye(n, "Zones"), () => this.by_name(n).visible, false, this.color_for(n)))), this.add(new ae(this, n, a, c, this.color_for(n)));
        }
      }
      static {
        l(this, "LayerSet");
      }
      color_for(t) {
        switch (t) {
          case tt.drawing_sheet:
            return this.theme.worksheet ?? p.white;
          case ":Pads:Front":
            return this.theme.copper?.f ?? p.white;
          case ":Pads:Back":
            return this.theme.copper?.b ?? p.white;
          case ":NonPlatedHoles":
            return this.theme.non_plated_hole ?? p.white;
          case ":Via:Holes":
            return this.theme.via_hole ?? p.white;
          case ":Via:HoleWalls":
            return this.theme.via_through ?? p.white;
          case ":Pad:Holes":
            return this.theme.background ?? p.white;
          case ":Pad:HoleWalls":
            return this.theme.pad_through_hole ?? p.white;
          case ":Pads:Front:NetName":
            return p.white.with_alpha(0.8);
          case ":Pads:Back:NetName":
            return p.white.with_alpha(0.8);
          case ":Pad:Holes:NetName":
            return p.white.with_alpha(0.8);
        }
        let i = t;
        return i = i.replace(":Zones:", "").replace(".", "_").toLowerCase(), i.endsWith("_cu") ? (i = i.replace("_cu", ""), this.theme.copper[i] ?? p.white) : this.theme[i] ?? p.white;
      }
      *in_ui_order() {
        let t = [...et, "F.Adhes", "B.Adhes", "F.Paste", "B.Paste", "F.SilkS", "B.SilkS", "F.Mask", "B.Mask", "Dwgs.User", "Cmts.User", "Eco1.User", "Eco2.User", "Edge.Cuts", "Margin", "F.CrtYd", "B.CrtYd", "F.Fab", "B.Fab", "User.1", "User.2", "User.3", "User.4", "User.5", "User.6", "User.7", "User.8", "User.9"];
        for (let i of t) {
          let s = this.by_name(i);
          s && (yield s);
        }
      }
      *copper_layers() {
        for (let t of et) {
          let i = this.by_name(t);
          i && (yield i);
        }
      }
      *via_layers() {
        yield this.by_name(":Via:Holes"), yield this.by_name(":Via:HoleWalls");
        for (let t of et) for (let i of ["BBViaHoleWalls", "BBViaHoles"]) {
          let s = this.by_name(ye(t, i));
          s && (yield s);
        }
      }
      *zone_layers() {
        for (let t of et) {
          let i = ye(t, "Zones"), s = this.by_name(i);
          s && (yield s);
        }
      }
      *pad_layers() {
        yield this.by_name(":Pads:Front:NetName"), yield this.by_name(":Pads:Front"), yield this.by_name(":Pads:Back:NetName"), yield this.by_name(":Pads:Back");
      }
      *pad_hole_layers() {
        yield this.by_name(":Pad:Holes"), yield this.by_name(":Pad:Holes:NetName"), yield this.by_name(":Pad:HoleWalls");
      }
      is_any_copper_layer_visible() {
        for (let t of this.copper_layers()) if (t.visible) return true;
        return false;
      }
      highlight(t) {
        let i = "";
        t instanceof ae ? i = t.name : G(t) && (i = t);
        let s = this.query((n) => n.name == i || Qo(i, n.name) || wo(i, n.name));
        super.highlight(s);
      }
    };
    Me = class extends fe {
      static {
        l(this, "BoardItemPainter");
      }
      get theme() {
        return this.view_painter.theme;
      }
      get filter_net() {
        return this.view_painter.filter_net;
      }
      isFillValid(e) {
        return !!(e && e !== "none" && e !== "no");
      }
    };
    it = class extends Me {
      static {
        l(this, "GraphicItemPainter");
      }
      styled_line(e, t, i, s) {
        let n = l((a) => {
          this.gfx.line(a, t, i);
        }, "draw_line");
        qe.line(e, t, s, n);
      }
    };
    xt = class extends Me {
      static {
        l(this, "NetNameItemPainter");
      }
      draw_net_name(e, t, i, s, n) {
        let a = new Ot(), c = t.copy().multiply(1e4), u = i / Math.max(e.length, 3), h = Math.min(s, u) * 1e4 * 0.95;
        a.color = n, a.bold = true, a.size = new d(h, h), a.stroke_width = h / 8, a.mirrored = this.gfx.state.flipped, w.default().draw(this.gfx, e, c, a);
      }
      static displayed_netname(e) {
        return e ? e.split("/").slice(-1)[0] : void 0;
      }
    };
    Zr = class extends it {
      constructor() {
        super(...arguments);
        this.classes = [bt, h2];
      }
      static {
        l(this, "LinePainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net) return;
        let s = [i.start, i.end];
        this.styled_line(s, i.width, t.color, i.stroke_params);
      }
    };
    Sr = class extends it {
      constructor() {
        super(...arguments);
        this.classes = [gt, b2];
      }
      static {
        l(this, "RectPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net) return;
        let s = t.color, n = [i.start, new d(i.end.x, i.start.y), i.end, new d(i.start.x, i.end.y), i.start];
        this.styled_line(n, i.width, s, i.stroke_params), this.isFillValid(i.fill) && this.gfx.polygon(new J(n, s));
      }
    };
    Tr = class extends it {
      constructor() {
        super(...arguments);
        this.classes = [We, Nt, _2];
      }
      static {
        l(this, "PolyPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net) return;
        let s = t.color;
        i.width && this.styled_line([...i.polyline, i.polyline[0]], i.width, s, i.stroke_params), this.isFillValid(i.fill) && this.gfx.polygon(new J(i.polyline, s));
      }
    };
    yr = class extends it {
      constructor() {
        super(...arguments);
        this.classes = [Mt, m2];
      }
      static {
        l(this, "ArcPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net) return;
        let s = i.arc, n = s.to_polyline();
        this.gfx.line(new v(n, s.width, t.color));
      }
    };
    Lr = class extends it {
      constructor() {
        super(...arguments);
        this.classes = [ft, d2];
      }
      static {
        l(this, "CirclePainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net) return;
        let s = t.color, n = i.center.sub(i.end).magnitude, a = new q(i.center, n, new P(0), new P(2 * Math.PI), i.width);
        if (this.isFillValid(i.fill)) this.gfx.circle(new A(a.center, a.radius + (i.width ?? 0), s));
        else {
          let c = a.to_polyline();
          this.gfx.line(new v(c, a.width, s));
        }
      }
    };
    Xr = class extends xt {
      constructor() {
        super(...arguments);
        this.classes = [c2];
      }
      static {
        l(this, "TraceSegmentPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net && i.net != this.filter_net) return;
        let s = [i.start, i.end];
        this.gfx.line(new v(s, i.width, t.color));
      }
    };
    Or = class extends xt {
      constructor() {
        super(...arguments);
        this.classes = [R2];
      }
      static {
        l(this, "TraceArcPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net && i.net != this.filter_net) return;
        let s = q.from_three_points(i.start, i.mid, i.end, i.width), n = s.to_polyline();
        this.gfx.line(new v(n, s.width, t.color));
      }
    };
    Fr = class extends xt {
      constructor() {
        super(...arguments);
        this.classes = [u2];
      }
      static {
        l(this, "ViaPainter");
      }
      layers_for(t) {
        if (t.layers) {
          let i = [];
          for (let s of Nn(t.layers[0], t.layers[1])) i.push(ye(s, "BBViaHoles")), i.push(ye(s, "BBViaHoleWalls"));
          return i;
        } else return [":Via:Holes", ":Via:HoleWalls"];
      }
      paint(t, i) {
        if (this.filter_net && i.net != this.filter_net) return;
        let s = t.color;
        t.name.endsWith("HoleWalls") || t.name == ":Overlay" ? this.gfx.circle(new A(i.at.position, i.size / 2, s)) : t.name.endsWith("Holes") && (this.gfx.circle(new A(i.at.position, i.drill / 2, s)), (i.type == "blind" || i.type == "micro") && i.layers && (this.gfx.arc(i.at.position, i.size / 2 - i.size / 8, P.from_degrees(250), P.from_degrees(290), i.size / 4, t.layer_set.by_name(i.layers[0])?.color ?? p.transparent_black), this.gfx.arc(i.at.position, i.size / 2 - i.size / 8, P.from_degrees(70), P.from_degrees(110), i.size / 4, t.layer_set.by_name(i.layers[1])?.color ?? p.transparent_black)));
      }
    };
    Ur = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [mt];
      }
      static {
        l(this, "ZonePainter");
      }
      layers_for(t) {
        let i = t.layers ?? [t.layer];
        return i.length && i[0] == "F&B.Cu" && (i.shift(), i.push("F.Cu", "B.Cu")), i.map((s) => et.includes(s) ? ye(s, "Zones") : s);
      }
      paint(t, i) {
        if (i.filled_polygons && !(this.filter_net && i.net != this.filter_net)) for (let s of i.filled_polygons) !t.name.includes(s.layer) && t.name != ":Overlay" || this.gfx.polygon(new J(s.polyline, t.color));
      }
    };
    vr = class r36 extends xt {
      constructor() {
        super(...arguments);
        this.classes = [f2];
      }
      static {
        l(this, "PadPainter");
      }
      layers_for(t) {
        let i = [];
        for (let s of t.layers) s == "*.Cu" ? (i.push(":Pads:Front"), i.push(":Pads:Back")) : s == "F.Cu" ? i.push(":Pads:Front") : s == "B.Cu" ? i.push(":Pads:Back") : s == "*.Mask" ? (i.push("F.Mask"), i.push("B.Mask")) : s == "*.Paste" ? (i.push("F.Paste"), i.push("B.Paste")) : i.push(s);
        switch (t.type) {
          case "thru_hole":
            i.push(":Pad:HoleWalls"), i.push(":Pad:Holes:NetName"), i.push(":Pad:Holes");
            break;
          case "np_thru_hole":
            i.push(":NonPlatedHoles");
            break;
          case "smd":
            i.includes(":Pads:Front") ? i.push(":Pads:Front:NetName") : i.includes(":Pads:Back") && i.push(":Pads:Back:NetName");
            break;
          case "connect":
            break;
          default:
            n2(`Unhandled pad type "${t.type}"`);
            break;
        }
        return i;
      }
      paint(t, i) {
        if (this.filter_net && i.net?.number != this.filter_net) return;
        let s = t.color, n = F.translation(i.at.position.x, i.at.position.y);
        n.rotate_self(-P.deg_to_rad(i.parent.at.rotation)), n.rotate_self(P.deg_to_rad(i.at.rotation)), this.gfx.state.push(), this.gfx.state.multiply(n);
        let a = new d(0, 0), c = t.name == ":Pad:Holes" || t.name == ":NonPlatedHoles", u = t.name == ":Pads:Front:NetName" || t.name == ":Pads:Back:NetName" || t.name == ":Pad:Holes:NetName", h = r36.pad_netname(i);
        if (u) {
          let m = r36.get_pad_orth_size(i), _ = m.x, b = m.y, f = -i.parent.at.rotation;
          m.x < m.y * 0.95 && (f += 90, _ = m.y, b = m.x), b = Math.min(b, 10);
          let N = i.at.rotation;
          for (; N + f > 90; ) f -= 180;
          for (; N + f <= -90; ) f += 180;
          let Z = 0, T = 0;
          h !== void 0 && i.number !== "" && (b = b / 3, T = b / 1.4, Z = b / 1.7), i.drill?.offset && this.gfx.state.matrix.translate_self(i.drill.offset.x, i.drill.offset.y);
          let x = F.rotation(P.deg_to_rad(f));
          this.gfx.state.multiply(x), i.number !== "" && this.draw_net_name(i.number, new d(0, -Z), _, b, s), h !== void 0 && this.draw_net_name(h, new d(0, T), _, b, s);
        } else if (c && i.drill != null) if (i.drill.oval) {
          let m = new d(i.drill.diameter / 2, (i.drill.width ?? 0) / 2), _ = Math.min(m.x, m.y), b = new d(m.x - _, m.y - _), f = a.add(i.drill.offset), N = f.sub(b), Z = f.add(b);
          this.gfx.line(new v([N, Z], _ * 2, s));
        } else {
          let m = a;
          this.gfx.circle(new A(m, i.drill.diameter / 2, s));
        }
        else {
          let m = i.shape;
          switch (m == "custom" && i.options?.anchor && (m = i.options.anchor), i.drill?.offset && this.gfx.state.matrix.translate_self(i.drill.offset.x, i.drill.offset.y), m) {
            case "circle":
              this.gfx.circle(new A(a, i.size.x / 2, s));
              break;
            case "rect":
              {
                let _ = [new d(-i.size.x / 2, -i.size.y / 2), new d(i.size.x / 2, -i.size.y / 2), new d(i.size.x / 2, i.size.y / 2), new d(-i.size.x / 2, i.size.y / 2)];
                this.gfx.polygon(new J(_, s));
              }
              break;
            case "roundrect":
            case "trapezoid":
              {
                let _ = Math.min(i.size.x, i.size.y) * (i.roundrect_rratio ?? 0), b = new d(i.size.x / 2, i.size.y / 2);
                b = b.sub(new d(_, _));
                let f = i.rect_delta ? i.rect_delta.copy() : new d(0, 0);
                f = f.multiply(0.5);
                let N = [new d(-b.x - f.y, b.y + f.x), new d(b.x + f.y, b.y - f.x), new d(b.x - f.y, -b.y + f.x), new d(-b.x + f.y, -b.y - f.x)];
                this.gfx.polygon(new J(N, s)), this.gfx.line(new v([...N, N[0]], _ * 2, s));
              }
              break;
            case "oval":
              {
                let _ = new d(i.size.x / 2, i.size.y / 2), b = Math.min(_.x, _.y), f = new d(_.x - b, _.y - b), N = a, Z = N.sub(f), T = N.add(f);
                Z.equals(T) ? this.gfx.circle(new A(N, b, s)) : this.gfx.line(new v([Z, T], b * 2, s));
              }
              break;
            default:
              n2(`Unknown pad shape "${i.shape}"`);
              break;
          }
          if (i.shape == "custom" && i.primitives) for (let _ of i.primitives) this.view_painter.paint_item(t, _);
        }
        this.gfx.state.pop();
      }
      static pad_netname(t) {
        return t.pintype !== void 0 && t.pintype.includes("no_connect") ? "X" : r36.displayed_netname(t.netname);
      }
      static get_pad_orth_size(t) {
        let i = t.size.copy();
        (t.parent.at.rotation + 36e3) % 180 !== 0 && ([i.x, i.y] = [i.y, i.x]);
        let n = Math.min(i.x, i.y) * 1.1;
        return i.x > n && i.y > n && (i.x = n, i.y = n), i;
      }
    };
    xr = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [Pt];
      }
      static {
        l(this, "GrTextPainter");
      }
      layers_for(t) {
        return [t.layer.name];
      }
      paint(t, i) {
        if (this.filter_net || i.hide || !i.shown_text) return;
        if (i.render_cache) {
          for (let n of i.render_cache.polygons) this.view_painter.paint_item(t, n);
          return;
        }
        let s = new $(i.shown_text);
        s.apply_effects(i.effects), s.apply_at(i.at), s.attributes.color = t.color, !Mn(t.name) && this.gfx.state.flipped, this.gfx.state.push(), w.default().draw(this.gfx, s.shown_text, s.text_pos, s.attributes), this.gfx.state.pop();
      }
    };
    Qr = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [De];
      }
      static {
        l(this, "FpTextPainter");
      }
      layers_for(t) {
        return t.hide ? [] : [t.layer.name];
      }
      paint(t, i) {
        if (this.filter_net || i.hide || !i.shown_text) return;
        if (i.render_cache) {
          this.gfx.state.push(), this.gfx.state.matrix = F.identity();
          for (let n of i.render_cache.polygons) this.view_painter.paint_item(t, n);
          this.gfx.state.pop();
          return;
        }
        let s = new $(i.shown_text);
        if (s.apply_effects(i.effects), s.apply_at(i.at), s.attributes.keep_upright = !i.at.unlocked, s.attributes.color = t.color, i.parent) {
          let n = P.from_degrees(i.parent.at.rotation), a = s.text_pos;
          a = n.rotate_point(a, new d(0, 0)), a = a.add(i.parent.at.position.multiply(1e4)), s.text_pos.set(a);
        }
        if (s.attributes.keep_upright) {
          for (; s.text_angle.degrees > 90; ) s.text_angle.degrees -= 180;
          for (; s.text_angle.degrees <= -90; ) s.text_angle.degrees += 180;
        }
        this.gfx.state.push(), this.gfx.state.matrix = F.identity(), w.default().draw(this.gfx, s.shown_text, s.text_pos, s.attributes), this.gfx.state.pop();
      }
    };
    wr = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [_t];
      }
      static {
        l(this, "PropertyTextPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        if (this.filter_net || i.hide || !i.shown_text || !i.has_symbol_prop) return;
        let s = new $(i.shown_text);
        if (s.apply_effects(i.effects), s.apply_at(i.at), s.attributes.color = t.color, s.attributes.keep_upright = !i.at.unlocked, s.attributes.keep_upright) {
          for (; s.text_angle.degrees > 90; ) s.text_angle.degrees -= 180;
          for (; s.text_angle.degrees <= -90; ) s.text_angle.degrees += 180;
        }
        if (i.parent) {
          let n = i.parent.at.rotation;
          s.text_angle.degrees -= n;
        }
        this.gfx.state.push(), w.default().draw(this.gfx, s.shown_text, s.text_pos, s.attributes), this.gfx.state.pop();
      }
    };
    Kr = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [p2];
      }
      static {
        l(this, "DimensionPainter");
      }
      layers_for(t) {
        return [t.layer];
      }
      paint(t, i) {
        switch (i.type) {
          case "orthogonal":
          case "aligned":
            this.paint_linear(t, i);
            break;
          case "center":
            this.paint_center(t, i);
            break;
          case "radial":
            this.paint_radial(t, i);
            break;
          case "leader":
            this.paint_leader(t, i);
            break;
        }
      }
      paint_center(t, i) {
        let s = i.style.thickness ?? 0.2, n = i.end.sub(i.start);
        this.gfx.line([i.start.sub(n), i.start.add(n)], s, t.color), n = P.from_degrees(90).rotate_point(n), this.gfx.line([i.start.sub(n), i.start.add(n)], s, t.color);
      }
      paint_radial(t, i) {
        let s = i.style.thickness ?? 0.2, n = i.start.copy(), a = new d(0, i.style.arrow_length);
        this.gfx.line([n.sub(a), n.add(a)], s, t.color), a = P.from_degrees(90).rotate_point(a), this.gfx.line([n.sub(a), n.add(a)], s, t.color);
        let c = i.end.sub(i.start);
        c = c.resize(i.leader_length);
        let u = this.make_text(t, i), h = u.get_text_box().scale(1 / 1e4), m = [i.end, i.end.add(c), i.gr_text.at.position], _ = h.intersect_segment(m[1], m[2]);
        _ && (m[2] = _), this.gfx.line(m, s, t.color);
        let b = P.from_degrees(27.5), f = c.angle.negative(), N = new d(i.style.arrow_length, 0), Z = f.add(b).rotate_point(N), T = f.sub(b).rotate_point(N);
        this.gfx.line([i.end.add(T), i.end, i.end.add(Z)], s, t.color), this.paint_text(u);
      }
      paint_leader(t, i) {
        let s = i.style.thickness ?? 0.2, n = this.make_text(t, i), a = n.get_text_box().grow(n.text_width / 2, n.get_effective_text_thickness() * 2).scale(1 / 1e4), c = i.start.add(i.end.sub(i.start).resize(i.style.extension_offset)), u = [c, i.end, i.gr_text.at.position], h = a.intersect_segment(u[1], u[2]);
        if (h && (u[2] = h), this.gfx.line(u, s, t.color), i.style.text_frame == 1 && this.gfx.line(v.from_BBox(a, s, t.color)), i.style.text_frame == 2) {
          let T = a.w / 2 - n.get_effective_text_thickness() / 1e4 / 2;
          this.gfx.arc(a.center, T, P.from_degrees(0), P.from_degrees(360), s, t.color);
        }
        let m = i.end.sub(i.start), _ = P.from_degrees(27.5), b = m.angle.negative(), f = new d(i.style.arrow_length, 0), N = b.add(_).rotate_point(f), Z = b.sub(_).rotate_point(f);
        this.gfx.line([c.add(Z), c, c.add(N)], s, t.color), this.paint_text(n);
      }
      paint_linear(t, i) {
        let s = i.style.thickness ?? 0.2, n = new d(), a = new d(), c = new d();
        if (i.type == "orthogonal") i.orientation == 0 ? (n = new d(0, i.height), a = i.start.add(n), c = new d(i.end.x, a.y)) : (n = new d(i.height, 0), a = i.start.add(n), c = new d(a.x, i.end.y));
        else {
          let Z = i.end.sub(i.start);
          i.height > 0 ? n = new d(-Z.y, Z.x) : n = new d(Z.y, -Z.x);
          let T = n.resize(i.height).multiply(Math.sign(i.height));
          a = i.start.add(T), c = i.end.add(T);
        }
        let u = Math.abs(i.height) - i.style.extension_offset + i.style.extension_height, h = i.start.add(n.resize(i.style.extension_offset)), m = h.add(n.resize(u));
        this.gfx.line([h, m], s, t.color), h = i.end.add(n.resize(i.style.extension_offset)), m = h.add(n.resize(u)), this.gfx.line([h, m], s, t.color), this.gfx.line([a, c], s, t.color);
        let _ = c.sub(a).angle.negative(), b = P.from_degrees(27.5), f = _.add(b).rotate_point(new d(i.style.arrow_length, 0)), N = _.sub(b).rotate_point(new d(i.style.arrow_length, 0));
        this.gfx.line([a.add(N), a, a.add(f)], s, t.color), this.gfx.line([c.sub(N), c, c.sub(f)], s, t.color), this.paint_text(this.make_text(t, i));
      }
      make_text(t, i) {
        let s = new $(i.gr_text.shown_text);
        return s.apply_effects(i.gr_text.effects), s.apply_at(i.gr_text.at), s.attributes.color = t.color, s;
      }
      paint_text(t) {
        this.gfx.state.push(), w.default().draw(this.gfx, t.shown_text, t.text_pos, t.attributes), this.gfx.state.pop();
      }
    };
    Yr = class extends Me {
      constructor() {
        super(...arguments);
        this.classes = [me];
      }
      static {
        l(this, "FootprintPainter");
      }
      layers_for(t) {
        let i = /* @__PURE__ */ new Set();
        for (let s of t.items()) {
          let n = this.view_painter.layers_for(s);
          for (let a of n) i.add(a);
        }
        return Array.from(i.values());
      }
      paint(t, i) {
        let s = F.translation(i.at.position.x, i.at.position.y).rotate_self(P.deg_to_rad(i.at.rotation));
        this.gfx.state.push(), this.gfx.state.multiply(s);
        for (let n of i.items()) {
          let a = this.view_painter.layers_for(n);
          (t.name == ":Overlay" || a.includes(t.name)) && this.view_painter.paint_item(t, n);
        }
        this.gfx.state.pop();
      }
    };
    U3 = class extends Ge {
      constructor(t, i, s) {
        super(t, i, s);
        this.filter_net = null;
        this.painter_list = [new Zr(this, t), new Sr(this, t), new Tr(this, t), new yr(this, t), new Lr(this, t), new Xr(this, t), new Or(this, t), new Fr(this, t), new Ur(this, t), new vr(this, t), new Yr(this, t), new xr(this, t), new Qr(this, t), new wr(this, t), new Kr(this, t)];
      }
      static {
        l(this, "BoardPainter");
      }
      paint_net(t, i) {
        let s = this.layers.overlay;
        this.filter_net = i, s.clear(), s.color = p.white, this.gfx.start_layer(s.name);
        for (let n of t.items()) this.painter_for(n) && this.paint_item(s, n);
        s.graphics = this.gfx.end_layer(), s.graphics.composite_operation = "overlay", this.filter_net = null;
      }
    };
    v3 = class extends vt {
      static {
        l(this, "BoardViewer");
      }
      #e = null;
      get board() {
        return this.document;
      }
      set contextMenuCallback(e) {
        this.#e = e;
      }
      create_renderer(e) {
        return new s3(e);
      }
      create_painter() {
        return new U3(this.renderer, this.layers, this.theme);
      }
      create_layer_set() {
        return new F3(this.board, this.theme);
      }
      get grid_origin() {
        return this.board.setup?.grid_origin ?? new d(0, 0);
      }
      on_pick(e, t) {
        let i = /* @__PURE__ */ new Map();
        for (let { bbox: s } of t) {
          let n = s.context;
          n instanceof me ? i.set(`Footprint: ${n.reference}`, n) : vi(n) ? i.set(`Net: ${n.netname}`, n) : console.log(n);
        }
        if (i.size === 0) this.select(null);
        else if (i.size === 1 || !this.#e) this.handleItemClick(i.values().next().value);
        else {
          let { x: s, y: n } = this.viewport.camera.world_to_screen(e);
          this.#e(s, n, i, (a) => {
            this.handleItemClick(a);
          });
        }
      }
      handleItemClick(e) {
        e instanceof me ? this.select(e) : vi(e) && this.highlight_net(rn(e));
      }
      select(e) {
        G(e) && (e = this.board.find_footprint(e)), e instanceof me && (e = e.bbox), super.select(e);
      }
      highlight_net(e) {
        this.painter.paint_net(this.board, e), this.draw();
      }
      set_layers_opacity(e, t) {
        for (let i of e) i.opacity = t;
        this.draw();
      }
      set track_opacity(e) {
        this.set_layers_opacity(this.layers.copper_layers(), e);
      }
      set via_opacity(e) {
        this.set_layers_opacity(this.layers.via_layers(), e);
      }
      set zone_opacity(e) {
        this.set_layers_opacity(this.layers.zone_layers(), e);
      }
      set pad_opacity(e) {
        this.set_layers_opacity(this.layers.pad_layers(), e);
      }
      set pad_hole_opacity(e) {
        this.set_layers_opacity(this.layers.pad_hole_layers(), e);
      }
      set grid_opacity(e) {
        this.set_layers_opacity(this.layers.grid_layers(), e);
      }
      set page_opacity(e) {
        this.layers.by_name(tt.drawing_sheet).opacity = e, this.draw();
      }
      zoom_to_board() {
        let t = this.layers.by_name("Edge.Cuts").bbox;
        this.viewport.camera.bbox = t.grow(t.w * 0.1);
      }
    };
    Le = class extends hn(g) {
      constructor() {
        super(...arguments);
        this.selected = [];
      }
      static {
        l(this, "KCViewerElement");
      }
      initialContentCallback() {
        (async () => (this.viewer = this.addDisposable(this.make_viewer()), await this.viewer.setup(), this.addDisposable(this.viewer.addEventListener(te.type, () => {
          this.loaded = true, this.dispatchEvent(new te());
        }))))();
      }
      async preferenceChangeCallback(t) {
        this.theme || !this.viewer || !this.viewer.loaded || (this.update_theme(), this.viewer.paint(), this.viewer.draw());
      }
      disconnectedCallback() {
        super.disconnectedCallback(), this.selected = [];
      }
      get themeObject() {
        return this.theme ? Te.by_name(this.theme) : ce.INSTANCE.theme;
      }
      async load(t) {
        this.loaded = false, await this.viewer.load(t.document);
      }
      render() {
        return this.canvas = M`<canvas></canvas>`, M`<style>
                :host {
                    display: block;
                    touch-action: none;
                    width: 100%;
                    height: 100%;
                }

                canvas {
                    width: 100%;
                    height: 100%;
                }
            </style>
            ${this.canvas}`;
      }
    };
    W([L({ type: Boolean })], Le.prototype, "loaded", 2), W([L({ type: String })], Le.prototype, "theme", 2), W([L({ type: Boolean })], Le.prototype, "disableinteraction", 2);
    Ko = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Er = class extends g {
      static {
        l(this, "KCContextMenuElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                position: fixed;
                z-index: 1000;
                display: none;
            }

            :host([visible]) {
                display: block;
            }

            .menu {
                background: var(--dropdown-bg);
                border-radius: 5px;
                overflow: hidden;
                min-width: 150px;
                max-width: 300px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }

            .menu-item {
                display: block;
                padding: 0.4em 0.8em;
                cursor: pointer;
                color: var(--dropdown-fg);
                user-select: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .menu-item:hover {
                background: var(--dropdown-hover-bg);
                color: var(--dropdown-hover-fg);
            }
        `];
      }
      #e = null;
      #t = null;
      #i = null;
      #r = null;
      show(e, t, i, s) {
        this.#e = i, this.#t = s, this.style.left = `${e}px`, this.style.top = `${t}px`, this.setAttribute("visible", ""), requestAnimationFrame(() => {
          this.updateMenuItems(), this.adjustPosition(), this.setupDismissListeners();
        });
      }
      hide() {
        this.removeAttribute("visible"), this.#e = null, this.#t = null, this.removeDismissListeners();
      }
      updateMenuItems() {
        let e = this.shadowRoot?.querySelector(".menu");
        e && (e.innerHTML = "", this.#e?.forEach((t, i) => {
          let s = document.createElement("div");
          s.className = "menu-item", s.textContent = i, e.appendChild(s);
        }));
      }
      adjustPosition() {
        let e = this.getBoundingClientRect(), t = window.innerWidth, i = window.innerHeight, s = parseFloat(this.style.left), n = parseFloat(this.style.top);
        s + e.width > t && (s = t - e.width - 10), n + e.height > i && (n = i - e.height - 10), this.style.left = `${Math.max(10, s)}px`, this.style.top = `${Math.max(10, n)}px`;
      }
      setupDismissListeners() {
        this.removeDismissListeners(), this.#i = (e) => {
          let t = this.getBoundingClientRect();
          e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top && e.clientY <= t.bottom || this.hide();
        }, this.#r = () => this.hide(), setTimeout(() => {
          this.#i && document.addEventListener("pointerdown", this.#i), this.#r && (window.addEventListener("resize", this.#r), window.addEventListener("scroll", this.#r, true));
        }, 100);
      }
      removeDismissListeners() {
        this.#i && (document.removeEventListener("pointerdown", this.#i), this.#i = null), this.#r && (window.removeEventListener("resize", this.#r), window.removeEventListener("scroll", this.#r, true), this.#r = null);
      }
      initialContentCallback() {
        super.initialContentCallback(), this.shadowRoot?.addEventListener("click", (e) => {
          let t = e.target;
          t.classList.contains("menu-item") && this.#e && (this.#t && this.#t(this.#e.get(t.textContent ?? "")), this.hide());
        });
      }
      render() {
        return M`<div class="menu"></div>`;
      }
    };
    Ko("kc-context-menu", Er);
    Yo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    K2 = class extends Le {
      static {
        l(this, "KCBoardViewerElement");
      }
      #e = null;
      update_theme() {
        this.viewer.theme = this.themeObject.board;
      }
      make_viewer() {
        let e = new v3(this.canvas, !this.disableinteraction, this.themeObject.board);
        return e.contextMenuCallback = (t, i, s, n) => {
          this.#e && this.#e.show(t, i, s, n);
        }, e;
      }
      render() {
        return this.canvas = M`<canvas></canvas>`, this.#e = M`<kc-context-menu></kc-context-menu>`, M`<style>
                :host {
                    display: block;
                    touch-action: none;
                    width: 100%;
                    height: 100%;
                    position: relative;
                }

                canvas {
                    width: 100%;
                    height: 100%;
                }
            </style>
            ${this.canvas} ${this.#e}`;
      }
    };
    Yo("kc-board-viewer", K2);
    Eo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Hr = class extends g {
      static {
        l(this, "KCHelpPanel");
      }
      static {
        this.styles = [...g.styles, y`
            p {
                margin: 0;
                padding: 0.5em;
            }

            a {
                color: var(--button-bg);
            }

            a:hover {
                color: var(--button-hover-bg);
            }
        `];
      }
      render() {
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Help"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <p>
                        You're using
                        <a href="https://kicanvas.org/home">KiCanvas</a>, an
                        interactive, browser-based viewer for KiCad schematics
                        and boards.
                    </p>
                    <p>
                        KiCanvas is very much in <strong>alpha</strong>, so
                        please
                        <a
                            href="https://github.com/theacodes/kicanvas/issues/new/choose"
                            target="_blank"
                            >file an issue on GitHub</a
                        >
                        if you run into any bugs.
                    </p>
                    <p>
                        KiCanvas is developed by
                        <a href="https://thea.codes" target="_blank"
                            >Thea Flowers</a
                        >
                        and supported by
                        <a
                            href="https://github.com/sponsors/theacodes"
                            target="_blank"
                            >community donations</a
                        >.
                    </p></kc-ui-panel-body
                >
            </kc-ui-panel>
        `;
      }
    };
    Eo("kc-help-panel", Hr);
    Ho = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Y2 = ce.INSTANCE;
    x3 = class extends g {
      static {
        l(this, "KCPreferencesPanel");
      }
      static {
        this.styles = [...g.styles, y`
            select {
                box-sizing: border-box;
                display: block;
                width: 100%;
                max-width: 100%;
                margin-top: 0.25em;
                font-family: inherit;
                font-size: inherit;
                font-weight: 300;
                margin-top: 0.25em;
                border-radius: 0.25em;
                text-align: left;
                padding: 0.25em;
                background: var(--input-bg);
                color: var(--input-fg);
                border: var(--input-border);
                transition:
                    color var(--transition-time-medium) ease,
                    box-shadow var(--transition-time-medium) ease,
                    outline var(--transition-time-medium) ease,
                    background var(--transition-time-medium) ease,
                    border var(--transition-time-medium) ease;
            }

            select::after {
                display: block;
                content: "▾";
                color: var(--input-fg);
            }

            select:hover {
                z-index: 10;
                box-shadow: var(--input-hover-shadow);
            }

            select:focus {
                z-index: 10;
                box-shadow: none;
                outline: var(--input-focus-outline);
            }
        `];
      }
      initialContentCallback() {
        this.renderRoot.addEventListener("input", (e) => {
          let t = e.target;
          t.name === "theme" && (Y2.theme = Te.by_name(this.theme_control.value)), t.name === "align-controls-kicad" && (Y2.alignControlsWithKiCad = t.checked), Y2.save();
        });
      }
      render() {
        let e = Te.list().map((t) => M`<option
                value="${t.name}"
                selected="${Y2.theme.name == t.name}">
                ${t.friendly_name}
            </option>`);
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Preferences"></kc-ui-panel-title>
                <kc-ui-panel-body padded>
                    <kc-ui-control-list>
                        <kc-ui-control>
                            <label>Theme</label>
                            <select name="theme" value="kicad">
                                ${e}
                            </select>
                        </kc-ui-control>
                    </kc-ui-control-list>
                    <kc-ui-control>
                        <label>
                            <input
                                type="checkbox"
                                name="align-controls-kicad"
                                checked="${Y2.alignControlsWithKiCad}" />
                            Align controls with KiCad
                        </label>
                    </kc-ui-control>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    W([Q("[name=theme]", true)], x3.prototype, "theme_control", 2);
    Ho("kc-preferences-panel", x3);
    Go = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Q3 = class extends g {
      static {
        l(this, "KCProjectPanelElement");
      }
      static {
        this.styles = [...g.styles, y`
            .page {
                display: flex;
                align-items: center;
            }

            .page span.name {
                margin-right: 1em;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
            }

            .page span.filename {
                flex: 1;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                margin-left: 1em;
                text-align: right;
                color: #aaa;
            }

            .page kc-ui-button {
                margin-left: 0.5em;
            }

            .page span.number {
                flex: 0;
                background: var(--dropdown-hover-bg);
                border: 1px solid transparent;
                border-radius: 0.5em;
                font-size: 0.8em;
                padding: 0px 0.3em;
                margin-right: 0.5em;
            }

            kc-ui-menu-item:hover span.number {
                background: var(--dropdown-bg);
            }

            kc-ui-menu-item[selected]:hover span.number {
                background: var(--dropdown-hover-bg);
            }
        `];
      }
      #e;
      connectedCallback() {
        (async () => (this.project = await this.requestContext("project"), super.connectedCallback()))();
      }
      initialContentCallback() {
        super.initialContentCallback(), this.addDisposable(I(this.project, "load", (e) => {
          this.update();
        })), this.addDisposable(I(this.project, "change", (e) => {
          this.selected = this.project.active_page?.project_path ?? null;
        })), this.addEventListener("kc-ui-menu:select", (e) => {
          let t = e.detail;
          this.selected = t?.name ?? null, this.change_current_project_page(this.selected);
        }), ue(this.renderRoot, "kc-ui-button", "click", (e, t) => {
          let i = t.closest("kc-ui-menu-item");
          this.project.download(i.name);
        });
      }
      get selected() {
        return this.#e.selected?.name ?? null;
      }
      set selected(e) {
        this.#e.selected = e;
      }
      change_current_project_page(e) {
        this.project.set_active_page(e);
      }
      render() {
        let e = [];
        if (!this.project) return M``;
        for (let t of this.project.pages()) {
          let i = t.type == "schematic" ? "svg:schematic_file" : "svg:pcb_file", s = t.page ? M`<span class="number">${t.page}</span>` : "";
          e.push(M`<kc-ui-menu-item
                    icon="${i}"
                    name="${t.project_path}">
                    <span class="page">
                        ${s}
                        <span class="name">
                            ${t.name ?? t.filename}
                        </span>
                        <span class="filename">
                            ${t.name && t.name !== t.filename ? t.filename : ""}
                        </span>
                        <kc-ui-button
                            variant="menu"
                            icon="download"
                            title="Download"></kc-ui-button>
                    </span>
                </kc-ui-menu-item>`);
        }
        return this.#e = M`<kc-ui-menu>
            ${e}
        </kc-ui-menu>`, M`<kc-ui-panel>
            <kc-ui-panel-title title="Project"></kc-ui-panel-title>
            <kc-ui-panel-body>${this.#e}</kc-ui-panel-body>
        </kc-ui-panel>`;
      }
    };
    W([lt], Q3.prototype, "change_current_project_page", 1);
    Go("kc-project-panel", Q3);
    Jo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Gr = class extends g {
      static {
        l(this, "KCViewerBottomToolbarElement");
      }
      static {
        this.styles = [...g.styles, y`
            output {
                width: unset;
                margin: unset;
                padding: 0.5em;
                color: var(--button-toolbar-fg);
                background: var(--button-toolbar-bg);
                border: 1px solid var(--button-toolbar-bg);
                border-radius: 0.25em;
                font-weight: 300;
                font-size: 0.9em;
                box-shadow: var(--input-hover-shadow);
                user-select: none;
            }
        `];
      }
      #e;
      #t;
      #i;
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.addDisposable(this.viewer.addEventListener(ct.type, () => {
          this.update_position();
        })), this.addDisposable(this.viewer.addEventListener(z.type, (e) => {
          this.#i.disabled = !e.detail.item;
        })), this.#t.addEventListener("click", (e) => {
          e.preventDefault(), this.viewer.zoom_to_page();
        }), this.#i.addEventListener("click", (e) => {
          e.preventDefault(), this.viewer.zoom_to_selection();
        })))();
      }
      update_position() {
        let e = this.viewer.mouse_position;
        this.#e.value = `${e.x.toFixed(2)}, ${e.y.toFixed(2)} mm`;
      }
      render() {
        return this.#e = M`<output
            slot="left"
            class="toolbar"></output>`, this.#t = M`<kc-ui-button
            slot="right"
            variant="toolbar"
            name="zoom_to_page"
            title="zoom to page"
            icon="svg:zoom_page">
        </kc-ui-button>`, this.#i = M` <kc-ui-button
            slot="right"
            variant="toolbar"
            name="zoom_to_selection"
            title="zoom to selection"
            icon="svg:zoom_footprint"
            disabled>
        </kc-ui-button>`, this.update_position(), M`<kc-ui-floating-toolbar location="bottom">
            ${this.#e} ${this.#i}
            ${this.#t}
        </kc-ui-floating-toolbar>`;
      }
    };
    Jo("kc-viewer-bottom-toolbar", Gr);
    Xe = class extends g {
      constructor() {
        super();
        this.viewerReady = new ge();
        this.provideLazyContext("viewer", () => this.viewer);
      }
      static {
        l(this, "KCViewerAppElement");
      }
      #e;
      #t;
      get viewer() {
        return this.#e.viewer;
      }
      connectedCallback() {
        this.hidden = true, (async () => (this.project = await this.requestContext("project"), await this.project.loaded, super.connectedCallback()))();
      }
      initialContentCallback() {
        this.project.active_page && this.load(this.project.active_page), this.addDisposable(I(this.project, "change", async (t) => {
          let i = this.project.active_page;
          i ? await this.load(i) : this.hidden = true;
        })), this.addDisposable(this.viewer.addEventListener(z.type, (t) => {
          this.on_viewer_select(t.detail.item, t.detail.previous);
        })), ue(this.renderRoot, "kc-ui-button", "click", (t) => {
          switch (t.target.name) {
            case "download":
              this.project.active_page && this.project.download(this.project.active_page.filename);
              break;
            case "flip_view":
              this.#e.viewer.flip_view();
              break;
            default:
              console.warn("Unknown button", t);
          }
        });
      }
      async load(t) {
        await this.viewerReady, this.can_load(t) ? (await this.#e.load(t), this.hidden = false) : this.hidden = true;
      }
      #i() {
        return Dt(this.project.pages()) > 1;
      }
      make_pre_activities() {
        let t = [];
        return this.#i() && t.push(M`<kc-ui-activity
                    slot="activities"
                    name="Project"
                    icon="folder">
                    <kc-project-panel></kc-project-panel>
                </kc-ui-activity>`), t;
      }
      make_post_activities() {
        return [M`<kc-ui-activity
                slot="activities"
                name="Preferences"
                icon="settings"
                button-location="bottom">
                <kc-preferences-panel></kc-preferences-panel>
            </kc-ui-activity>`, M` <kc-ui-activity
                slot="activities"
                name="Help"
                icon="help"
                button-location="bottom">
                <kc-help-panel></kc-help-panel>
            </kc-ui-activity>`];
      }
      change_activity(t) {
        this.#t?.change_activity(t);
      }
      render() {
        let t = this.controls ?? "none", i = Ys(this.controlslist ?? "", t == "none" ? { fullscreen: false, download: false, flipview: false } : { fullscreen: true, download: true, flipview: true });
        this.#e = this.make_viewer_element();
        let s = this.getRootNode().host?.getAttribute?.("theme");
        s && this.#e.setAttribute("theme", s), this.#e.disableinteraction = t == "none";
        let n = null;
        if (t == "full") {
          let h = this.make_pre_activities(), m = this.make_post_activities(), _ = this.make_activities();
          this.#t = M`<kc-ui-activity-side-bar
                collapsed="${this.sidebarcollapsed}">
                ${h} ${_} ${m}
            </kc-ui-activity-side-bar>`, n = M`<kc-ui-resizer></kc-ui-resizer>`;
        } else this.#t = null;
        let a = [];
        i.download && !this.#i() && a.push(M`<kc-ui-button
                    slot="right"
                    name="download"
                    title="download"
                    icon="download"
                    variant="toolbar-alt">
                </kc-ui-button>`), i.flipview && this.#e instanceof K2 && a.push(M`<kc-ui-button
                    slot="right"
                    name="flip_view"
                    title="flip view"
                    icon="flip"
                    variant="toolbar-alt">
                </kc-ui-button>`);
        let c = M`<kc-ui-floating-toolbar location="top">
            ${a}
        </kc-ui-floating-toolbar>`, u = null;
        return t != "none" && (u = M`<kc-viewer-bottom-toolbar></kc-viewer-bottom-toolbar>`), M`<kc-ui-split-view vertical>
            <kc-ui-view class="grow">
                ${c} ${this.#e} ${u}
            </kc-ui-view>
            ${n} ${this.#t}
        </kc-ui-split-view>`;
      }
      renderedCallback() {
        window.requestAnimationFrame(() => {
          this.viewerReady.resolve(true);
        });
      }
    };
    W([L({ type: String })], Xe.prototype, "controls", 2), W([L({ type: String })], Xe.prototype, "controlslist", 2), W([L({ type: Boolean })], Xe.prototype, "sidebarcollapsed", 2);
    w3 = class extends xe {
      constructor(t) {
        super(t);
        this.#e = [];
        this.state = new qt();
      }
      static {
        l(this, "Canvas2DRenderer");
      }
      #e;
      #t;
      async setup() {
        let t = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
        if (t == null) throw new Error("Unable to create Canvas2d context");
        this.ctx2d = t, this.update_canvas_size();
      }
      dispose() {
        this.ctx2d = void 0;
        for (let t of this.#e) t.dispose();
      }
      update_canvas_size() {
        let t = window.devicePixelRatio, i = this.canvas.getBoundingClientRect(), s = Math.round(i.width * t), n = Math.round(i.height * t);
        (this.canvas.width != s || this.canvas.height != n) && (this.canvas.width = s, this.canvas.height = n);
      }
      clear_canvas() {
        this.update_canvas_size(), this.ctx2d.setTransform(), this.ctx2d.scale(window.devicePixelRatio, window.devicePixelRatio), this.ctx2d.fillStyle = this.background_color.to_css(), this.ctx2d.fillRect(0, 0, this.canvas.width, this.canvas.height), this.ctx2d.lineCap = "round", this.ctx2d.lineJoin = "round";
      }
      start_layer(t) {
        this.#t = new Jr(this, t);
      }
      end_layer() {
        if (!this.#t) throw new Error("No active layer");
        return this.#e.push(this.#t), this.#t = null, this.#e.at(-1);
      }
      arc(t, i, s, n, a, c) {
        super.prep_arc(t, i, s, n, a, c);
      }
      circle(t, i, s) {
        let n = super.prep_circle(t, i, s);
        if (!n.color || n.color.is_transparent_black) return;
        let a = n.color.to_css(), c = new Path2D();
        c.arc(n.center.x, n.center.y, n.radius, 0, Math.PI * 2), this.#t.commands.push(new Qt(c, a, null, 0));
      }
      line(t, i, s) {
        let n = super.prep_line(t, i, s);
        if (!n.color || n.color.is_transparent_black) return;
        let a = n.color.to_css(), c = new Path2D(), u = false;
        for (let h of n.points) u ? c.lineTo(h.x, h.y) : (c.moveTo(h.x, h.y), u = true);
        this.#t.commands.push(new Qt(c, null, a, n.width));
      }
      polygon(t, i) {
        let s = super.prep_polygon(t, i);
        if (!s.color || s.color.is_transparent_black) return;
        let n = s.color.to_css(), a = new Path2D(), c = false;
        for (let u of s.points) c ? a.lineTo(u.x, u.y) : (a.moveTo(u.x, u.y), c = true);
        a.closePath(), this.#t.commands.push(new Qt(a, n, null, 0));
      }
      get layers() {
        let t = this.#e;
        return { *[Symbol.iterator]() {
          for (let i of t) yield i;
        } };
      }
      remove_layer(t) {
        let i = this.#e.indexOf(t);
        i != -1 && this.#e.splice(i, 1);
      }
    };
    Qt = class {
      constructor(e, t, i, s) {
        this.path = e;
        this.fill = t;
        this.stroke = i;
        this.stroke_width = s;
        this.path_count = 1;
      }
      static {
        l(this, "DrawCommand");
      }
      render(e) {
        e.fillStyle = this.fill ?? "black", e.strokeStyle = this.stroke ?? "black", e.lineWidth = this.stroke_width, this.fill && e.fill(this.path), this.stroke && e.stroke(this.path);
      }
    };
    Jr = class extends Qe {
      constructor(t, i, s = []) {
        super(t, i);
        this.renderer = t;
        this.name = i;
        this.commands = s;
      }
      static {
        l(this, "Canvas2dRenderLayer");
      }
      dispose() {
        this.clear();
      }
      clear() {
        this.commands = [];
      }
      push_path(t, i, s, n) {
        let a = this.commands.at(-1);
        a && (a.path_count < 20, a.fill == i && a.stroke == s && a.stroke_width == n) ? (a.path.addPath(t), a.path_count++) : this.commands.push(new Qt(t, i, s, n));
      }
      render(t, i, s = 1) {
        let n = this.renderer.ctx2d;
        if (!n) throw new Error("No CanvasRenderingContext2D!");
        n.save(), n.globalCompositeOperation = this.composite_operation, n.globalAlpha = s;
        let a = F.from_DOMMatrix(n.getTransform());
        a.multiply_self(t), n.setTransform(a.to_DOMMatrix());
        for (let c of this.commands) c.render(n);
        n.globalCompositeOperation = "source-over", n.globalAlpha = 1, n.restore();
      }
    };
    ke = ((f) => (f.interactive = ":Interactive", f.marks = ":Marks", f.symbol_field = ":Symbol:Field", f.label = ":Label", f.junction = ":Junction", f.wire = ":Wire", f.symbol_foreground = ":Symbol:Foreground", f.notes = ":Notes", f.bitmap = ":Bitmap", f.symbol_pin = ":Symbol:Pin", f.symbol_background = ":Symbol:Background", f[f.drawing_sheet = ":DrawingSheet"] = "drawing_sheet", f[f.grid = ":Grid"] = "grid", f))(ke || {});
    wt = class extends Ut {
      constructor(t) {
        super();
        this.theme = t;
        for (let i of Object.values(ke)) this.add(new ae(this, i));
        this.by_name(":Interactive").visible = false, this.by_name(":Interactive").interactive = true, this.by_name(ke.drawing_sheet).color = this.theme.worksheet ?? p.white;
      }
      static {
        l(this, "LayerSet");
      }
      *interactive_layers() {
        yield this.by_name(":Interactive");
      }
    };
    K3 = class extends Ge {
      static {
        l(this, "BaseSchematicPainter");
      }
    };
    K = class extends fe {
      static {
        l(this, "SchematicItemPainter");
      }
      get theme() {
        return this.view_painter.theme;
      }
      get is_dimmed() {
        return this.view_painter.current_symbol?.dnp ?? false;
      }
      dim_color(e) {
        return e = e.desaturate(), e.mix(this.theme.background, 0.5);
      }
      dim_if_needed(e) {
        return this.is_dimmed ? this.dim_color(e) : e;
      }
      determine_stroke(e, t) {
        let i = t.stroke?.width || this.gfx.state.stroke_width;
        if (i < 0) return { width: 0, color: null };
        if ((t.stroke?.type ?? "none") == "none") return { width: 0, color: null };
        let n = e.name == ":Symbol:Foreground" ? this.theme.component_outline : this.theme.note, a = this.dim_if_needed(t.stroke?.color ?? n);
        return { width: i, color: a };
      }
      determine_fill(e, t) {
        let i = t.fill?.type ?? "none";
        if (i == "none" || i == "background" && e.name != ":Symbol:Background") return null;
        let s;
        switch (i) {
          case "background":
            s = this.theme.component_body;
            break;
          case "outline":
            s = this.theme.component_outline;
            break;
          case "color":
            s = t.fill.color;
            break;
        }
        return this.dim_if_needed(s);
      }
    };
    E2 = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [];
      }
      static {
        l(this, "LabelPainter");
      }
      layers_for(t) {
        return [":Label"];
      }
      paint(t, i) {
        if (i.effects.hide) return;
        let s = new ze(i.shown_text);
        s.apply_at(i.at), s.apply_effects(i.effects), this.after_apply(i, s), i.at.rotation == 0 || i.at.rotation == 180 ? s.text_angle.degrees = 0 : (i.at.rotation == 90 || i.at.rotation == 270) && (s.text_angle.degrees = 90);
        let n = s.text_pos.add(this.get_schematic_text_offset(i, s));
        this.gfx.state.push(), this.gfx.state.stroke = this.color, this.gfx.state.fill = this.color, w.default().draw(this.gfx, s.shown_text, n, s.attributes);
        let a = this.create_shape(i, s);
        a && this.gfx.line(a, s.attributes.stroke_width / 1e4), this.gfx.state.pop();
      }
      create_shape(t, i) {
        return [];
      }
      get color() {
        return new p(1, 0, 1, 1);
      }
      after_apply(t, i) {
      }
      get_text_offset(t) {
        return Math.round(B.text_offset_ratio * t.text_size.x);
      }
      get_box_expansion(t) {
        return Math.round(B.label_size_ratio * t.text_size.y);
      }
      get_schematic_text_offset(t, i) {
        let s = Math.round(this.get_text_offset(i) + i.get_effective_text_thickness());
        return i.text_angle.is_vertical ? new d(-s, 0) : new d(0, -s);
      }
    };
    Y3 = class extends E2 {
      constructor() {
        super(...arguments);
        this.classes = [Z2];
      }
      static {
        l(this, "NetLabelPainter");
      }
      get color() {
        return this.theme.label_local;
      }
    };
    E3 = class extends E2 {
      constructor() {
        super(...arguments);
        this.classes = [S2];
      }
      static {
        l(this, "GlobalLabelPainter");
      }
      get color() {
        return this.theme.label_global;
      }
      get_schematic_text_offset(t, i) {
        let s = t, n = i.text_size.y, a = this.get_box_expansion(i), c = n * 0.0715;
        switch (["input", "bidirectional", "tri_state"].includes(s.shape) && (a += n * 0.75), a = Math.round(a), c = Math.round(c), t.at.rotation) {
          case 0:
            return new d(a, c);
          case 90:
            return new d(c, -a);
          case 180:
            return new d(-a, c);
          case 270:
            return new d(c, a);
          default:
            throw new Error(`Unexpected label rotation ${t.at.rotation}`);
        }
      }
      create_shape(t, i) {
        let s = t, n = i.text_pos, a = P.from_degrees(t.at.rotation + 180), c = i.text_size.y, u = this.get_box_expansion(i), h = c / 2 + u, m = i.get_text_box().w + 2 * u, _ = i.attributes.stroke_width, b = m + _ + 3, f = h + _ + 3, N = [new d(0, 0), new d(0, -f), new d(-b, -f), new d(-b, 0), new d(-b, f), new d(0, f), new d(0, 0)], Z = new d();
        switch (s.shape) {
          case "input":
            Z.x = -h, N[0].x += h, N[6].x += h;
            break;
          case "output":
            N[3].x -= h;
            break;
          case "bidirectional":
          case "tri_state":
            Z.x = -h, N[0].x += h, N[6].x += h, N[3].x -= h;
            break;
          default:
            break;
        }
        return N = N.map((T) => T.add(Z).rotate(a).add(n).multiply(1 / 1e4)), N;
      }
    };
    H3 = class extends E2 {
      constructor() {
        super(...arguments);
        this.classes = [$e];
      }
      static {
        l(this, "HierarchicalLabelPainter");
      }
      get color() {
        return this.theme.label_hier;
      }
      after_apply(t, i) {
        i.v_align = "center";
      }
      get_schematic_text_offset(t, i) {
        let s = Math.round(this.get_text_offset(i) + i.text_width);
        switch (t.at.rotation) {
          case 0:
            return new d(s, 0);
          case 90:
            return new d(0, -s);
          case 180:
            return new d(-s, 0);
          case 270:
            return new d(0, s);
          default:
            throw new Error(`Unexpected label rotation ${t.at.rotation}`);
        }
      }
      create_shape(t, i) {
        let s = i.text_pos, n = P.from_degrees(t.at.rotation), a = i.text_width, c;
        switch (t.shape) {
          case "output":
            c = [new d(0, a / 2), new d(a / 2, a / 2), new d(a, 0), new d(a / 2, -a / 2), new d(0, -a / 2), new d(0, a / 2)];
            break;
          case "input":
            c = [new d(a, a / 2), new d(a / 2, a / 2), new d(0, 0), new d(a / 2, -a / 2), new d(a, -a / 2), new d(a, a / 2)];
            break;
          case "bidirectional":
          case "tri_state":
            c = [new d(a / 2, a / 2), new d(a, 0), new d(a / 2, -a / 2), new d(0, 0), new d(a / 2, a / 2)];
            break;
          case "passive":
          default:
            c = [new d(0, a / 2), new d(a, a / 2), new d(a, -a / 2), new d(0, -a / 2), new d(0, a / 2)];
            break;
        }
        return c = c.map((u) => u.rotate(n).add(s).multiply(1 / 1e4)), c;
      }
    };
    G3 = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [T2];
      }
      static {
        l(this, "DirectiveLabelPainter");
      }
      get default_shape_color() {
        return this.theme.netclass_flag;
      }
      get default_property_color() {
        return this.theme.netclass_flag;
      }
      layers_for(t) {
        return [":Label"];
      }
      paint(t, i) {
        this.paint_shape(t, i);
        for (let s of i.properties) this.paint_property(t, s);
      }
      paint_shape(t, i) {
        let s = i.effects.font.color.is_transparent_black ? this.default_shape_color : i.effects.font.color, n = i.length, a = 20 * 0.0254;
        this.gfx.state.push(), this.gfx.state.matrix.translate_self(i.at.position.x, i.at.position.y), this.gfx.state.matrix.rotate_self(P.from_degrees(i.at.rotation)), this.gfx.state.stroke = s;
        let c = i.shape;
        if (c === "dot") {
          let u = a * 0.7;
          this.gfx.line([new d(0, 0), new d(0, -(n - u))]), this.gfx.circle(new A(new d(0, -n), u, s));
        } else if (c === "round") {
          let u = a, h = new d(0, -n), m = this.gfx.state.stroke_width;
          this.gfx.line([new d(0, 0), new d(0, -(n - u))]), this.gfx.arc(new he(h, u, new P(0), new P(Math.PI * 2), m, s));
        } else if (c === "diamond") {
          let u = a, m = [new d(0, 0), new d(0, n - u), new d(-2 * u, n), new d(0, n + u), new d(2 * u, n), new d(0, n - u), new d(0, 0)].map((_) => new d(_.x, -_.y));
          this.gfx.line(m);
        } else if (c === "rectangle") {
          let u = a * 0.8, m = [new d(0, 0), new d(0, n - u), new d(-2 * u, n - u), new d(-2 * u, n + u), new d(2 * u, n + u), new d(2 * u, n - u), new d(0, n - u), new d(0, 0)].map((_) => new d(_.x, -_.y));
          this.gfx.line(m);
        }
        this.gfx.state.pop();
      }
      paint_property(t, i) {
        let s = i.effects.font.color.is_transparent_black ? this.default_property_color : i.effects.font.color, n = new ze(i.shown_text);
        n.apply_at(i.at), n.apply_effects(i.effects), i.at.rotation == 0 || i.at.rotation == 180 ? n.text_angle.degrees = 0 : (i.at.rotation == 90 || i.at.rotation == 270) && (n.text_angle.degrees = 90), this.gfx.state.push(), this.gfx.state.stroke = s, this.gfx.state.fill = s, w.default().draw(this.gfx, n.shown_text, n.text_pos, n.attributes), this.gfx.state.pop();
      }
    };
    J3 = class r37 extends K {
      constructor() {
        super(...arguments);
        this.classes = [L2];
      }
      static {
        l(this, "PinPainter");
      }
      layers_for(t) {
        return [":Symbol:Pin", ":Symbol:Foreground", ":Interactive"];
      }
      paint(t, i) {
        if (i.definition.hide) return;
        let s = { pin: i, def: i.definition, position: i.definition.at.position.copy(), orientation: ko(i.definition.at.rotation) }, n = this.view_painter.current_symbol_transform, a = this.dim_if_needed(this.theme.pin);
        r37.apply_symbol_transformations(s, n), this.gfx.state.push(), this.gfx.state.matrix = F.identity(), this.gfx.state.stroke = a, (t.name == ":Symbol:Pin" || t.name == ":Interactive") && this.draw_pin_shape(this.gfx, s), t.name == ":Symbol:Foreground" && this.draw_name_and_number(this.gfx, s), this.gfx.state.pop();
      }
      static apply_symbol_transformations(t, i) {
        for (let n = 0; n < i.rotations; n++) this.rotate(t, new d(0, 0), true);
        i.mirror_x && this.mirror_vertically(t, new d(0, 0)), i.mirror_y && this.mirror_horizontally(t, new d(0, 0));
        let s = i.position.multiply(new d(1, -1));
        t.position = t.position.add(s).multiply(new d(1, -1));
      }
      static rotate(t, i, s = false) {
        let n = P.from_degrees(s ? -90 : 90);
        if (t.position = n.rotate_point(t.position, i), s) switch (t.orientation) {
          case "right":
            t.orientation = "up";
            break;
          case "up":
            t.orientation = "left";
            break;
          case "left":
            t.orientation = "down";
            break;
          case "down":
            t.orientation = "right";
            break;
        }
        else switch (t.orientation) {
          case "right":
            t.orientation = "down";
            break;
          case "down":
            t.orientation = "left";
            break;
          case "left":
            t.orientation = "up";
            break;
          case "up":
            t.orientation = "right";
            break;
        }
      }
      static mirror_horizontally(t, i) {
        t.position.x -= i.x, t.position.x *= -1, t.position.x += i.x, t.orientation == "right" ? t.orientation = "left" : t.orientation == "left" && (t.orientation = "right");
      }
      static mirror_vertically(t, i) {
        t.position.y -= i.y, t.position.y *= -1, t.position.y += i.y, t.orientation == "up" ? t.orientation = "down" : t.orientation == "down" && (t.orientation = "up");
      }
      draw_pin_shape(t, i) {
        let { p0: s, dir: n } = gn.stem(i.position, i.orientation, i.def.length);
        gn.draw(t, i.def.type, i.def.shape, i.position, s, n);
      }
      draw_name_and_number(t, i) {
        let s = i.def, n = i.pin.parent.lib_symbol, a = i.pin.alternate ?? s.name.text, c = s.number.text, u = s.length, h = n.pin_names.hide || !a || a == "~", m = n.pin_numbers.hide || !c || c == "~", _ = B.line_width, b = n.pin_names.offset, f = 0.6096 * B.text_offset_ratio, N = s.number.effects.font.thickness || _, Z = s.number.effects.font.thickness || _, T, x;
        b > 0 ? (T = h ? void 0 : Kt.place_inside(b, Z, u, i.orientation), x = m ? void 0 : Kt.place_above(f, _, N, u, i.orientation)) : (T = h ? void 0 : Kt.place_above(f, _, Z, u, i.orientation), x = m ? void 0 : Kt.place_below(f, _, Z, u, i.orientation)), T && Kt.draw(t, a, i.position, T, s.name.effects, t.state.stroke), x && Kt.draw(t, c, i.position, x, s.number.effects, t.state.stroke);
      }
    };
    l(ko, "angle_to_orientation");
    gn = { stem(r40, e, t) {
      let i = new d(), s = new d();
      switch (e) {
        case "up":
          i.set(r40.x, r40.y - t), s.set(0, 1);
          break;
        case "down":
          i.set(r40.x, r40.y + t), s.set(0, -1);
          break;
        case "left":
          i.set(r40.x - t, r40.y), s.set(1, 0);
          break;
        case "right":
          i.set(r40.x + t, r40.y), s.set(-1, 0);
          break;
      }
      return { p0: i, dir: s };
    }, draw(r40, e, t, i, s, n) {
      let a = B.pinsymbol_size, c = a * 2, u = B.target_pin_radius;
      if (e == "no_connect") {
        r40.line([s, i]), r40.line([i.add(new d(-u, -u)), i.add(new d(u, u))]), r40.line([i.add(new d(u, -u)), i.add(new d(-u, u))]);
        return;
      }
      let h = l(() => {
        n.y ? r40.line([s.add(new d(a, 0)), s.add(new d(0, -n.y * a)), s.add(new d(-a, 0))]) : r40.line([s.add(new d(0, a)), s.add(new d(-n.x * a, 0)), s.add(new d(0, -a))]);
      }, "clock_notch"), m = l(() => {
        n.y ? r40.line([s.add(new d(0, n.y).multiply(c)), s.add(new d(-1, n.y).multiply(c)), s]) : r40.line([s.add(new d(n.x, 0).multiply(c)), s.add(new d(n.x, -1).multiply(c)), s]);
      }, "low_in_tri");
      switch (t) {
        case "line":
          r40.line([s, i]);
          return;
        case "inverted":
          r40.arc(s.add(n.multiply(a)), a), r40.line([s.add(n.multiply(c)), i]);
          return;
        case "inverted_clock":
          r40.arc(s.add(n.multiply(a)), a), r40.line([s.add(n.multiply(c)), i]), h();
          return;
        case "clock":
          r40.line([s, i]), h();
          return;
        case "clock_low":
        case "edge_clock_high":
          r40.line([s, i]), h(), m();
          break;
        case "input_low":
          r40.line([s, i]), m();
          break;
        case "output_low":
          r40.line([s, i]), n.y ? r40.line([s.sub(new d(c, 0)), s.add(new d(0, n.y * c))]) : r40.line([s.sub(new d(0, c)), s.add(new d(n.x * c, 0))]);
          break;
        case "non_logic":
          r40.line([s, i]), r40.line([s.sub(new d(n.x + n.y, n.y - n.x).multiply(a)), s.add(new d(n.x + n.y, n.y - n.x).multiply(a))]), r40.line([s.sub(new d(n.x - n.y, n.y + n.x).multiply(a)), s.add(new d(n.x - n.y, n.y + n.x).multiply(a))]);
          break;
      }
    } };
    Kt = { orient_label(r40, e, t, i) {
      switch (e) {
        case "right":
          break;
        case "left":
          r40.x *= -1, t == "left" && (t = "right");
          break;
        case "up":
          r40 = new d(r40.y, -r40.x);
          break;
        case "down":
          r40 = new d(r40.y, r40.x), t == "left" && (t = "right");
          break;
      }
      return { offset: r40, h_align: t, v_align: i, orientation: e };
    }, place_inside(r40, e, t, i) {
      let s = new d(r40 - e / 2 + t, 0);
      return this.orient_label(s, i, "left", "center");
    }, place_above(r40, e, t, i, s) {
      let n = new d(i / 2, -(r40 + e / 2 + t / 2));
      return this.orient_label(n, s, "center", "bottom");
    }, place_below(r40, e, t, i, s) {
      let n = new d(i / 2, r40 + e / 2 + t / 2);
      return this.orient_label(n, s, "center", "top");
    }, draw(r40, e, t, i, s, n) {
      let a = new $(e);
      switch (a.apply_effects(s), a.attributes.h_align = i.h_align, a.attributes.v_align = i.v_align, a.attributes.color = n, a.text_pos = t.add(i.offset).multiply(1e4), i.orientation) {
        case "up":
        case "down":
          a.text_angle = P.from_degrees(90);
          break;
        case "left":
        case "right":
          a.text_angle = P.from_degrees(0);
          break;
      }
      w.default().draw(r40, a.shown_text, a.text_pos, a.attributes);
    } };
    kr = class extends Qe {
      constructor() {
        super(...arguments);
        this.shapes = [];
      }
      static {
        l(this, "NullRenderLayer");
      }
      dispose() {
        this.clear();
      }
      clear() {
        this.shapes = [];
      }
      render(t) {
      }
    };
    k3 = class extends xe {
      static {
        l(this, "NullRenderer");
      }
      #e;
      constructor() {
        super(null);
      }
      set background_color(e) {
      }
      async setup() {
      }
      async dispose() {
      }
      update_canvas_size() {
      }
      clear_canvas() {
      }
      start_layer(e) {
        this.#e = new kr(this, e);
      }
      end_layer() {
        return this.#e;
      }
      get layers() {
        return [];
      }
      circle(e, t, i) {
        this.#e.shapes.push(super.prep_circle(e, t, i));
      }
      arc(e, t, i, s, n, a) {
        this.#e.shapes.push(super.prep_arc(e, t, i, s, n, a));
      }
      line(e, t, i) {
        this.#e.shapes.push(super.prep_line(e, t, i));
      }
      polygon(e, t) {
        this.#e.shapes.push(super.prep_polygon(e, t));
      }
      remove_layer(e) {
      }
    };
    I3 = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [yt];
      }
      static {
        l(this, "LibSymbolPainter");
      }
      layers_for(t) {
        return [":Symbol:Background", ":Symbol:Foreground", ":Symbol:Field"];
      }
      paint(t, i, s = 1) {
        if (![":Symbol:Background", ":Symbol:Foreground", ":Interactive"].includes(t.name)) return;
        let n = i.units.get(0);
        n && this.#e(t, n, s);
        let a = this.view_painter.current_symbol, c = i.units.get(a?.unit || 1);
        c && this.#e(t, c, s);
      }
      #e(t, i, s = 1) {
        for (let n of i) if (!(n.style > 0 && s != n.style)) for (let a of n.drawings) this.view_painter.paint_item(t, a);
      }
    };
    A3 = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [re];
      }
      static {
        l(this, "SchematicSymbolPainter");
      }
      layers_for(t) {
        let i = [":Interactive", ":Symbol:Foreground", ":Symbol:Background", ":Symbol:Field", ":Symbol:Pin"];
        return t.dnp && i.push(":Marks"), i;
      }
      paint(t, i) {
        if (t.name == ":Interactive" && i.lib_symbol.power) return;
        let s = Io(i);
        this.view_painter.current_symbol = i, this.view_painter.current_symbol_transform = s, this.gfx.state.push(), this.gfx.state.matrix = F.translation(i.at.position.x, i.at.position.y), this.gfx.state.multiply(s.matrix);
        let n = i.convert ?? 1;
        if (this.view_painter.paint_item(t, i.lib_symbol, n), this.gfx.state.pop(), [":Symbol:Pin", ":Symbol:Foreground", ":Interactive"].includes(t.name)) for (let a of i.unit_pins) this.view_painter.paint_item(t, a);
        if (t.name == ":Symbol:Field" || t.name == ":Interactive") for (let [a, c] of i.properties) this.view_painter.paint_item(t, c);
        if (i.dnp && t.name == ":Marks") {
          let a = Ao(this.theme, i), c = B.line_width * 3, u = this.theme.erc_error;
          this.gfx.line([a.top_left, a.bottom_right], c, u), this.gfx.line([a.bottom_left, a.top_right], c, u);
        }
        this.view_painter.current_symbol = void 0, this.view_painter.current_symbol_transform = void 0;
      }
    };
    l(Io, "get_symbol_transform");
    l(Ao, "get_symbol_body_and_pins_bbox");
    Ir = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [St];
      }
      static {
        l(this, "RectanglePainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        let s = [i.start, new d(i.end.x, i.start.y), i.end, new d(i.start.x, i.end.y), i.start];
        this.#t(t, i, s), this.#e(t, i, s);
      }
      #e(t, i, s) {
        let { width: n, color: a } = this.determine_stroke(t, i);
        !n || !a || this.gfx.line(new v(s, i.stroke?.width || this.gfx.state.stroke_width, a));
      }
      #t(t, i, s) {
        let n = this.determine_fill(t, i);
        n && this.gfx.polygon(new J(s, n));
      }
    };
    Ar = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [Be];
      }
      static {
        l(this, "PolylinePainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        this.#t(t, i), this.#e(t, i);
      }
      #e(t, i) {
        let { width: s, color: n } = this.determine_stroke(t, i);
        if (!s || !n) return;
        let a = l((c) => {
          this.gfx.line(c, s, n);
        }, "draw_line");
        qe.line(i.pts, s, i.stroke_params, a);
      }
      #t(t, i) {
        let s = this.determine_fill(t, i);
        s && this.gfx.polygon(new J(i.pts, s));
      }
    };
    Cr = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [y2];
      }
      static {
        l(this, "RuleAreaPainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        let s = [...i.polyline.pts, i.polyline.pts[0].copy()], n = this.determine_fill(t, i.polyline);
        n && this.gfx.polygon(new J(s, n));
        let a = i.polyline.stroke?.width || this.gfx.state.stroke_width, c = i.polyline.stroke?.color || this.theme.rule_area;
        if (a && c) {
          let u = l((h) => {
            this.gfx.line(h, a, c);
          }, "draw_line");
          qe.line(s, a, i.polyline.stroke_params, u);
        }
      }
    };
    Dr = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [M2];
      }
      static {
        l(this, "WirePainter");
      }
      layers_for(t) {
        return [":Wire"];
      }
      paint(t, i) {
        this.gfx.line(new v(i.pts, this.gfx.state.stroke_width, this.theme.wire));
      }
    };
    Br = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [N2];
      }
      static {
        l(this, "BusPainter");
      }
      layers_for(t) {
        return [":Wire"];
      }
      paint(t, i) {
        this.gfx.line(new v(i.pts, B.bus_width, this.theme.bus));
      }
    };
    $r = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [g2];
      }
      static {
        l(this, "BusEntryPainter");
      }
      layers_for(t) {
        return [":Junction"];
      }
      paint(t, i) {
        this.gfx.line(new v([i.at.position, i.at.position.add(i.size)], B.wire_width, this.theme.wire));
      }
    };
    jr = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [Zt];
      }
      static {
        l(this, "CirclePainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        this.#t(t, i), this.#e(t, i);
      }
      #e(t, i) {
        let { width: s, color: n } = this.determine_stroke(t, i);
        !s || !n || this.gfx.arc(new he(i.center, i.radius, new P(0), new P(Math.PI * 2), s, n));
      }
      #t(t, i) {
        let s = this.determine_fill(t, i);
        s && this.gfx.circle(new A(i.center, i.radius, s));
      }
    };
    zr = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [Wt];
      }
      static {
        l(this, "ArcPainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        let s = q.from_three_points(i.start, i.mid, i.end, i.stroke?.width);
        this.#t(t, i, s), this.#e(t, i, s);
      }
      #e(t, i, s) {
        let { width: n, color: a } = this.determine_stroke(t, i);
        !n || !a || this.gfx.arc(new he(s.center, s.radius, s.start_angle, s.end_angle, n, a));
      }
      #t(t, i, s) {
        let n = this.determine_fill(t, i);
        n && this.gfx.polygon(new J(s.to_polygon(), n));
      }
    };
    qr = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [V2];
      }
      static {
        l(this, "JunctionPainter");
      }
      layers_for(t) {
        return [":Junction"];
      }
      paint(t, i) {
        let s = this.theme.junction;
        this.gfx.circle(new A(i.at.position, (i.diameter || 1) / 2, s));
      }
    };
    es = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [P2];
      }
      static {
        l(this, "NoConnectPainter");
      }
      layers_for(t) {
        return [":Junction"];
      }
      paint(t, i) {
        let s = this.theme.no_connect, n = B.line_width, a = B.noconnect_size / 2;
        this.gfx.state.push(), this.gfx.state.matrix.translate_self(i.at.position.x, i.at.position.y), this.gfx.line(new v([new d(-a, -a), new d(a, a)], n, s)), this.gfx.line(new v([new d(a, -a), new d(-a, a)], n, s)), this.gfx.state.pop();
      }
    };
    ts = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [Tt];
      }
      static {
        l(this, "TextPainter");
      }
      layers_for(t) {
        return [":Notes"];
      }
      paint(t, i) {
        if (i.effects.hide || !i.text) return;
        let s = new ze(i.shown_text);
        s.apply_at(i.at), s.apply_effects(i.effects);
        let n = i.effects.font.color;
        if (n.is_transparent_black) {
          let a = this.theme.note;
          s.attributes.color = this.dim_if_needed(a);
        } else s.attributes.color = this.dim_if_needed(n);
        this.gfx.state.push(), w.default().draw(this.gfx, s.shown_text, s.text_pos, s.attributes), this.gfx.state.pop();
      }
    };
    is = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [Ze];
      }
      static {
        l(this, "PropertyPainter");
      }
      layers_for(t) {
        return [":Symbol:Field", ":Interactive"];
      }
      paint(t, i) {
        if (i.hide || !i.text) return;
        let s = this.theme.fields;
        i.parent instanceof ne && (s = this.theme.sheet_fields);
        let n = i.effects.font.color;
        if (n.is_transparent_black) {
          switch (i.name) {
            case "Reference":
              s = this.theme.reference;
              break;
            case "Value":
              s = this.theme.value;
              break;
            case "Sheet name":
              s = this.theme.sheet_name;
              break;
            case "Sheet file":
              s = this.theme.sheet_filename;
              break;
          }
          s = this.dim_if_needed(s);
        } else s = this.dim_if_needed(n);
        let a = i.parent, u = this.view_painter.current_symbol_transform?.matrix ?? F.identity(), h = i.shown_text;
        i.name == "Reference" && a.unit && (h += a.unit_suffix);
        let m = new g3(h, { position: a.at.position.multiply(1e4), transform: u, is_symbol: a instanceof re });
        m.apply_effects(i.effects), m.attributes.angle = P.from_degrees(i.at.rotation);
        let _ = i.at.position.multiply(1e4).sub(m.parent.position);
        _ = u.inverse().transform(_), _ = _.add(m.parent.position), m.text_pos = _;
        let b = m.draw_rotation, f = m.bounding_box, N = f.center;
        m.attributes.angle = b, m.attributes.h_align = "center", m.attributes.v_align = "center", m.attributes.stroke_width = m.get_effective_text_thickness(B.line_width * 1e4), m.attributes.color = s;
        let Z = F.scaling(1e-4, 1e-4).transform_all([f.top_left, f.top_right, f.bottom_right, f.bottom_left, f.top_left]);
        t.name == ":Interactive" ? this.gfx.line(new v(Array.from(Z), 0.1, p.white)) : (this.gfx.state.push(), w.default().draw(this.gfx, m.shown_text, N, m.attributes), this.gfx.state.pop());
      }
    };
    rs = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [W2];
      }
      static {
        l(this, "LibTextPainter");
      }
      layers_for(t) {
        return [":Symbol:Foreground"];
      }
      paint(t, i) {
        if (i.effects.hide || !i.text) return;
        let s = this.view_painter.current_symbol_transform, n = new N3(i.shown_text);
        n.apply_effects(i.effects), n.apply_at(i.at), n.apply_symbol_transformations(s), n.attributes.color = this.dim_if_needed(this.theme.component_outline);
        let a = n.world_pos;
        n.attributes.v_align = "center", this.gfx.state.push(), this.gfx.state.matrix = F.identity(), w.default().draw(this.gfx, n.shown_text, a, n.attributes), this.gfx.state.pop();
      }
      paint_debug(t) {
        this.gfx.line(v.from_BBox(t.scale(1 / 1e4), 0.127, new p(0, 0, 1, 1))), this.gfx.circle(new A(t.center.multiply(1 / 1e4), 0.2, new p(0, 1, 0, 1)));
      }
    };
    ss = class extends K {
      constructor() {
        super(...arguments);
        this.classes = [ne];
      }
      static {
        l(this, "SchematicSheetPainter");
      }
      layers_for(t) {
        return [":Interactive", ":Label", ":Symbol:Foreground", ":Symbol:Background", ":Symbol:Field"];
      }
      paint(t, i) {
        let s = this.theme.sheet, n = this.theme.sheet_background, a = new O(i.at.position.x, i.at.position.y, i.size.x, i.size.y);
        if (t.name == ":Interactive" && this.gfx.polygon(J.from_BBox(a.grow(3), n)), t.name == ":Symbol:Background" && this.gfx.polygon(J.from_BBox(a, n)), t.name == ":Symbol:Foreground" && this.gfx.line(v.from_BBox(a, this.gfx.state.stroke_width, s)), t.name == ":Symbol:Field") for (let c of i.properties.values()) this.view_painter.paint_item(t, c);
        if (t.name == ":Label") for (let c of i.pins) {
          let u = new $e();
          switch (u.at = c.at.copy(), u.effects = c.effects, u.text = c.name, u.shape = c.shape, u.at.rotation) {
            case 0:
              u.at.rotation = 180;
              break;
            case 180:
              u.at.rotation = 0;
              break;
            case 90:
              u.at.rotation = 270;
              break;
            case 270:
              u.at.rotation = 90;
              break;
          }
          c.shape == "input" ? u.shape = "output" : c.shape == "output" && (u.shape = "input"), this.view_painter.paint_item(t, u);
        }
      }
    };
    Yt = class extends K3 {
      static {
        l(this, "SchematicPainter");
      }
      constructor(e, t, i) {
        super(e, t, i), this.painter_list = [new Ir(this, e), new Ar(this, e), new Cr(this, e), new Dr(this, e), new Br(this, e), new $r(this, e), new jr(this, e), new zr(this, e), new qr(this, e), new es(this, e), new ts(this, e), new rs(this, e), new J3(this, e), new I3(this, e), new is(this, e), new A3(this, e), new Y3(this, e), new G3(this, e), new E3(this, e), new H3(this, e), new ss(this, e)];
      }
    };
    C3 = class extends vt {
      static {
        l(this, "SchematicViewer");
      }
      get schematic() {
        return this.document;
      }
      create_renderer(e) {
        let t = new w3(e);
        return t.state.fill = this.theme.note, t.state.stroke = this.theme.note, t.state.stroke_width = 0.1524, t;
      }
      async load(e) {
        if (e instanceof _e) return await super.load(e);
        this.document = null;
        let t = e.document;
        return t.update_hierarchical_data(e.sheet_path), await super.load(t);
      }
      create_painter() {
        return new Yt(this.renderer, this.layers, this.theme);
      }
      create_layer_set() {
        return new wt(this.theme);
      }
      select(e) {
        if (G(e) && (e = this.schematic.find_symbol(e) ?? this.schematic.find_sheet(e)), e instanceof re || e instanceof ne) {
          let t = this.layers.query_item_bboxes(e);
          e = Ct(t) ?? null;
        }
        super.select(e);
      }
    };
    Co = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    ns = class extends Le {
      static {
        l(this, "KCSchematicViewerElement");
      }
      update_theme() {
        this.viewer.theme = this.themeObject.schematic;
      }
      make_viewer() {
        return new C3(this.canvas, !this.disableinteraction, this.themeObject.schematic);
      }
    };
    Co("kc-schematic-viewer", ns);
    Do = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    os = class extends g {
      static {
        l(this, "KCSchematicInfoPanel");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.addDisposable(this.viewer.addEventListener(te.type, (e) => {
          this.update();
        }))))();
      }
      render() {
        let e = this.viewer.drawing_sheet, t = this.viewer.schematic, i = l((a) => M`<kc-ui-property-list-item
                class="label"
                name="${a}"></kc-ui-property-list-item>`, "header"), s = l((a, c, u = "") => M`<kc-ui-property-list-item name="${a}">
                ${c} ${u}
            </kc-ui-property-list-item>`, "entry"), n = Object.entries(t.title_block?.comment || {}).map(([a, c]) => s(`Comment ${a}`, c));
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Info"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-property-list>
                        ${i("Page properties")}
                        ${s("Size", e.paper?.size)}
                        ${s("Width", e.width, "mm")}
                        ${s("Height", e.height, "mm")}
                        ${i("Schematic properties")}
                        ${s("KiCad version", t.version)}
                        ${s("Generator", t.generator)}
                        ${s("Title", t.title_block?.title)}
                        ${s("Date", t.title_block?.date)}
                        ${s("Revision", t.title_block?.rev)}
                        ${s("Company", t.title_block?.company)}
                        ${n}
                        ${s("Symbols", t.symbols.size)}
                        ${s("Unique symbols", t.lib_symbols?.symbols.length ?? 0)}
                        ${s("Wires", t.wires.length)}
                        ${s("Buses", t.buses.length)}
                        ${s("Junctions", t.junctions.length)}
                        ${s("Net labels", t.net_labels.length)}
                        ${s("Global labels", t.global_labels.length)}
                        ${s("Hierarchical labels", t.hierarchical_labels.length)}
                        ${s("No connects", t.no_connects.length)}
                    </dl>
                </kc-ui-property-list>
            </kc-ui-panel>
        `;
      }
    };
    Do("kc-schematic-info-panel", os);
    Bo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    as = class extends g {
      static {
        l(this, "KCSchematicPropertiesPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.setup_events()))();
      }
      setup_events() {
        this.addDisposable(this.viewer.addEventListener(z.type, (e) => {
          this.selected_item = e.detail.item, this.update();
        })), this.addDisposable(this.viewer.addEventListener(te.type, (e) => {
          this.selected_item = void 0, this.update();
        }));
      }
      render() {
        let e = l((a) => M`<kc-ui-property-list-item
                class="label"
                name="${a}"></kc-ui-property-list-item>`, "header"), t = l((a, c, u = "") => M`<kc-ui-property-list-item name="${a}">
                ${c ?? ""} ${u}
            </kc-ui-property-list-item>`, "entry"), i = l((a) => a ? M`<kc-ui-icon>check</kc-ui-icon>` : M`<kc-ui-icon>close</kc-ui-icon>`, "checkbox"), s, n = this.selected_item;
        if (!n) s = e("No item selected");
        else if (n instanceof re) {
          let a = n.lib_symbol, c = Array.from(n.properties.values()).map((h) => t(h.name, h.text)), u = Re(n.unit_pins, (h) => h.number).map((h) => t(h.number, h.definition.name.text));
          s = M`
                ${e("Basic properties")}
                ${t("X", n.at.position.x.toFixed(4), "mm")}
                ${t("Y", n.at.position.y.toFixed(4), "mm")}
                ${t("Orientation", n.at.rotation, "\xB0")}
                ${t("Mirror", n.mirror == "x" ? "Around X axis" : n.mirror == "y" ? "Around Y axis" : "Not mirrored")}
                ${e("Instance properties")}
                ${t("Library link", n.lib_name ?? n.lib_id)}
                ${n.unit ? t("Unit", String.fromCharCode(65 + n.unit - 1)) : ""}
                ${t("In BOM", i(n.in_bom))}
                ${t("On board", i(n.in_bom))}
                ${t("Populate", i(!n.dnp))} ${e("Fields")}
                ${c} ${e("Symbol properties")}
                ${t("Name", a.name)}
                ${t("Description", a.description)}
                ${t("Keywords", a.keywords)}
                ${t("Power", i(a.power))}
                ${t("Units", a.unit_count)}
                ${t("Units are interchangeable", i(a.units_interchangable))}
                ${e("Pins")} ${u}
            `;
        } else if (n instanceof ne) {
          let a = Array.from(n.properties.values()).map((u) => t(u.name, u.text)), c = Re(n.pins, (u) => u.name).map((u) => t(u.name, u.shape));
          s = M`
                ${e("Basic properties")}
                ${t("X", n.at.position.x.toFixed(4), "mm")}
                ${t("Y", n.at.position.y.toFixed(4), "mm")}
                ${e("Fields")} ${a} ${e("Pins")} ${c}
            `;
        }
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Properties"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-property-list>${s}</kc-ui-property-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    Bo("kc-schematic-properties-panel", as);
    $o = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Et = class extends g {
      static {
        l(this, "KCSchematicSymbolsPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.setup_initial_events()))();
      }
      setup_initial_events() {
        let e = false;
        this.addEventListener("kc-ui-menu:select", (t) => {
          if (e) return;
          let i = t.detail;
          i.name && this.viewer.select(i.name);
        }), this.addDisposable(this.viewer.addEventListener(z.type, () => {
          e = true, this.menu.selected = this.viewer.selected?.context.uuid ?? null, e = false;
        })), this.addDisposable(this.viewer.addEventListener(te.type, () => {
          this.update();
        }));
      }
      renderedCallback() {
        this.search_input_elm.addEventListener("input", (e) => {
          this.item_filter_elem.filter_text = this.search_input_elm.value ?? null;
        });
      }
      render() {
        let e = this.viewer.schematic, t = [], i = [], s = [], n = Re(Array.from(e.symbols.values()), (c) => c.reference);
        for (let c of n) {
          let u = `${c.reference} ${c.value} ${c.id} ${c.lib_symbol.name}`, h = M`<kc-ui-menu-item
                name="${c.uuid}"
                data-match-text="${u}">
                <span class="narrow"> ${c.reference} </span>
                <span> ${c.value} </span>
            </kc-ui-menu-item>`;
          c.lib_symbol.power ? i.push(h) : t.push(h);
        }
        let a = Re(e.sheets, (c) => c.sheetname ?? c.sheetfile ?? "");
        for (let c of a) {
          let u = `${c.sheetname} ${c.sheetfile}`;
          s.push(M`<kc-ui-menu-item
                    name="${c.uuid}"
                    data-match-text="${u}">
                    <span class="narrow"> ${c.sheetname}</span>
                    <span>${c.sheetfile}</span>
                </kc-ui-menu-item>`);
        }
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Symbols"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-text-filter-input></kc-ui-text-filter-input>
                    <kc-ui-filtered-list>
                        <kc-ui-menu class="outline">
                            ${t}
                            ${i.length ? M`<kc-ui-menu-label
                                      >Power symbols</kc-ui-menu-label
                                  >` : null}
                            ${i}
                            ${s.length ? M`<kc-ui-menu-label
                                      >Sheets</kc-ui-menu-label
                                  >` : null}
                            ${s}
                        </kc-ui-menu>
                    </kc-ui-filtered-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    W([Q("kc-ui-menu")], Et.prototype, "menu", 2), W([Q("kc-ui-text-filter-input", true)], Et.prototype, "search_input_elm", 2), W([Q("kc-ui-filtered-list", true)], Et.prototype, "item_filter_elem", 2);
    $o("kc-schematic-symbols-panel", Et);
    jo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    ls = class extends Xe {
      static {
        l(this, "KCSchematicAppElement");
      }
      on_viewer_select(e, t) {
        if (!(!e || e != t)) {
          if (e instanceof ne) {
            this.project.set_active_page(`${e.sheetfile}:${e.path}/${e.uuid}`);
            return;
          }
          this.change_activity("properties");
        }
      }
      can_load(e) {
        return e.document instanceof _e;
      }
      make_viewer_element() {
        return M`<kc-schematic-viewer></kc-schematic-viewer>`;
      }
      make_activities() {
        return [M`<kc-ui-activity
                slot="activities"
                name="Symbols"
                icon="interests">
                <kc-schematic-symbols-panel></kc-schematic-symbols-panel>
            </kc-ui-activity>`, M`<kc-ui-activity
                slot="activities"
                name="Properties"
                icon="list">
                <kc-schematic-properties-panel></kc-schematic-properties-panel>
            </kc-ui-activity>`, M`<kc-ui-activity slot="activities" name="Info" icon="info">
                <kc-schematic-info-panel></kc-schematic-info-panel>
            </kc-ui-activity>`];
      }
    };
    jo("kc-schematic-app", ls);
    zo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Ht = class extends g {
      static {
        l(this, "KCBoardFootprintsPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, this.sort_footprints(), super.connectedCallback()))();
      }
      sort_footprints() {
        this.sorted_footprints = Re(this.viewer.board.footprints, (e) => e.reference || "REF");
      }
      initialContentCallback() {
        this.addEventListener("kc-ui-menu:select", (e) => {
          let t = e.detail;
          t.name && this.viewer.select(t.name);
        }), this.addDisposable(this.viewer.addEventListener(z.type, () => {
          this.menu.selected = this.viewer.selected?.context.uuid_text ?? null;
        })), this.search_input_elm.addEventListener("input", (e) => {
          this.item_filter_elem.filter_text = this.search_input_elm.value ?? null;
        });
      }
      render() {
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Footprints"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-text-filter-input></kc-ui-text-filter-input>
                    <kc-ui-filtered-list>
                        <kc-ui-menu class="outline">
                            ${this.render_list()}
                        </kc-ui-menu>
                    </kc-ui-filtered-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
      render_list() {
        let e = [], t = [];
        for (let i of this.sorted_footprints) {
          let s = i.reference || "REF", n = i.value || "VAL", a = `${i.library_link} ${i.descr} ${i.layer} ${s} ${n} ${i.tags}`, c = M`<kc-ui-menu-item
                name="${i.unique_id}"
                data-match-text="${a}">
                <span class="narrow">${s}</span><span>${n}</span>
            </kc-ui-menu-item>`;
          i.layer == "F.Cu" ? e.push(c) : t.push(c);
        }
        return M`<kc-ui-menu-label>Front</kc-ui-menu-label>
            ${e}
            <kc-ui-menu-label>Back</kc-ui-menu-label>
            ${t}`;
      }
    };
    W([Q("kc-ui-menu", true)], Ht.prototype, "menu", 2), W([Q("kc-ui-text-filter-input", true)], Ht.prototype, "search_input_elm", 2), W([Q("kc-ui-filtered-list", true)], Ht.prototype, "item_filter_elem", 2);
    zo("kc-board-footprints-panel", Ht);
    qo = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    cs = class extends g {
      static {
        l(this, "KCBoardInfoPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback()))();
      }
      render() {
        let e = this.viewer.drawing_sheet, t = this.viewer.board, i = t.edge_cuts_bbox, s = l((c) => M`<kc-ui-property-list-item
                name="${c}"
                class="label"></kc-ui-property-list-item>`, "header"), n = l((c, u, h = "") => M` <kc-ui-property-list-item name="${c}">
                ${u} ${h}
            </kc-ui-property-list-item>`, "entry"), a = Object.entries(t.title_block?.comment || {}).map(([c, u]) => n(`Comment ${c}`, u));
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Info"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-property-list>
                        ${s("Page properties")}
                        ${n("Size", e.paper?.size)}
                        ${n("Width", e.width, "mm")}
                        ${n("Height", e.height, "mm")}
                        ${s("Board properties")}
                        ${n("KiCad version", t.version)}
                        ${n("Generator", t.generator)}
                        ${n("Thickness", t.general?.thickness ?? 1.6, "mm")}
                        ${n("Title", t.title_block?.title)}
                        ${n("Date", t.title_block?.date)}
                        ${n("Revision", t.title_block?.rev)}
                        ${n("Company", t.title_block?.company)}
                        ${a}
                        ${n("Dimensions", `${i.w.toFixed(1)} x
                            ${i.h.toFixed(1)} mm`)}
                        ${n("Footprints", t.footprints.length)}
                        ${n("Nets", t.nets.length)}
                        ${n("Track segments", t.segments.length)}
                        ${n("Vias", t.vias.length)}
                        ${n("Zones", t.zones.length)}
                        ${n("Pad to mask clearance", t.setup?.pad_to_mask_clearance ?? 0, "mm")}
                        ${n("Soldermask min width", t.setup?.solder_mask_min_width ?? 0, "mm")}
                        ${n("Pad to paste clearance", t.setup?.pad_to_paste_clearance ?? 0, "mm")}
                        ${n("Pad to paste clearance ratio", t.setup?.pad_to_paste_clearance_ratio ?? 0)}
                        ${n("Grid origin", `${t.setup?.grid_origin?.x ?? 0}, ${t.setup?.grid_origin?.y ?? 0}`)}
                    </kc-ui-property-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    qo("kc-board-info-panel", cs);
    Vn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    H2 = class extends g {
      static {
        l(this, "KCBoardLayersPanelElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                display: block;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                user-select: none;
            }

            kc-ui-panel-title button {
                all: unset;
                flex-shrink: 0;
                margin-left: 1em;
                color: white;
                border: 0 none;
                background: transparent;
                padding: 0 0.25em 0 0.25em;
                margin-right: -0.25em;
                display: flex;
                align-items: center;
            }
        `];
      }
      get items() {
        return Array.from(this.panel_body.querySelectorAll("kc-board-layer-control") ?? []);
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback()))();
      }
      initialContentCallback() {
        this.panel_body.addEventListener(G2.select_event, (e) => {
          let t = e.detail;
          for (let s of this.items) s.layer_highlighted = false;
          let i = this.viewer.layers.by_name(t.layer_name);
          i.highlighted ? this.viewer.layers.highlight(null) : (this.viewer.layers.highlight(i), i.visible = true, t.layer_visible = true, t.layer_highlighted = true), this.viewer.draw();
        }), this.panel_body.addEventListener(G2.visibility_event, (e) => {
          let t = e.detail, i = this.viewer.layers.by_name(t.layer_name);
          i.visible = !i.visible, t.layer_visible = i.visible, this.presets_menu.deselect(), this.viewer.draw();
        }), this.renderRoot.querySelector("button")?.addEventListener("click", (e) => {
          e.stopPropagation();
          let t = this.viewer.layers.in_ui_order();
          if (this.items.some((i) => i.layer_visible)) for (let i of t) i.visible = false;
          else for (let i of t) i.visible = true;
          this.viewer.draw(), this.presets_menu.deselect(), this.update_item_states();
        }), this.presets_menu.addEventListener("kc-ui-menu:select", (e) => {
          let t = e.detail, i = this.viewer.layers.in_ui_order();
          switch (t.name) {
            case "all":
              for (let s of i) s.visible = true;
              break;
            case "front":
              for (let s of i) s.visible = s.name.startsWith("F.") || s.name == "Edge.Cuts";
              break;
            case "back":
              for (let s of i) s.visible = s.name.startsWith("B.") || s.name == "Edge.Cuts";
              break;
            case "copper":
              for (let s of i) s.visible = s.name.includes(".Cu") || s.name == "Edge.Cuts";
              break;
            case "outer-copper":
              for (let s of i) s.visible = s.name == "F.Cu" || s.name == "B.Cu" || s.name == "Edge.Cuts";
              break;
            case "inner-copper":
              for (let s of i) s.visible = s.name.includes(".Cu") && !(s.name == "F.Cu" || s.name == "B.Cu") || s.name == "Edge.Cuts";
              break;
            case "drawings":
              for (let s of i) s.visible = !s.name.includes(".Cu") && !s.name.includes(".Mask") && !s.name.includes(".Paste") && !s.name.includes(".Adhes");
          }
          this.viewer.draw(), this.update_item_states();
        });
      }
      update_item_states() {
        for (let e of this.items) {
          let t = this.viewer.layers.by_name(e.layer_name);
          e.layer_visible = t?.visible ?? false, e.layer_highlighted = t?.highlighted ?? false;
        }
      }
      render() {
        let e = this.viewer.layers, t = [];
        for (let i of e.in_ui_order()) {
          let s = i.visible ? "" : void 0, n = i.color.to_css();
          t.push(M`<kc-board-layer-control
                    layer-name="${i.name}"
                    layer-color="${n}"
                    layer-visible="${s}"></kc-board-layer-control>`);
        }
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Layers">
                    <button slot="actions" type="button">
                        <kc-ui-icon>visibility</kc-ui-icon>
                    </button>
                </kc-ui-panel-title>
                <kc-ui-panel-body>
                    ${t}
                    <kc-ui-panel-label>Presets</kc-ui-panel-label>
                    <kc-ui-menu id="presets" class="outline">
                        <kc-ui-menu-item name="all">All</kc-ui-menu-item>
                        <kc-ui-menu-item name="front">Front</kc-ui-menu-item>
                        <kc-ui-menu-item name="back">Back</kc-ui-menu-item>
                        <kc-ui-menu-item name="copper">Copper</kc-ui-menu-item>
                        <kc-ui-menu-item name="outer-copper">
                            Outer copper
                        </kc-ui-menu-item>
                        <kc-ui-menu-item name="inner-copper">
                            Inner copper
                        </kc-ui-menu-item>
                        <kc-ui-menu-item name="drawings">
                            Drawings
                        </kc-ui-menu-item>
                    </kc-ui-menu>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    W([Q("kc-ui-panel-body", true)], H2.prototype, "panel_body", 2), W([Q("#presets", true)], H2.prototype, "presets_menu", 2);
    Ie = class Ie2 extends g {
      static {
        l(this, "KCBoardLayerControlElement");
      }
      static {
        this.styles = [...g.styles, y`
            :host {
                box-sizing: border-box;
                padding: 0.1em 0.8em 0.1em 0.4em;
                color: white;
                text-align: left;
                display: flex;
                flex-direction: row;
                width: 100%;
                align-items: center;
            }

            button {
                all: unset;
                cursor: pointer;
                flex-shrink: 0;
                margin-left: 1em;
                color: white;
                border: 0 none;
                background: transparent;
                padding: 0 0.25em 0 0.25em;
                margin-right: -0.25em;
                display: flex;
                align-items: center;
            }

            .color {
                flex-shrink: 0;
                display: block;
                width: 1em;
                height: 1em;
                margin-right: 0.5em;
            }

            .name {
                display: block;
                flex-grow: 1;
            }

            .for-hidden {
                color: #888;
            }

            :host {
                background: var(--list-item-disabled-bg);
                color: var(--list-item-disabled-fg);
            }

            :host(:hover) {
                background: var(--list-item-hover-bg);
                color: var(--list-item-hover-fg);
            }

            :host(:hover) button {
                color: var(--list-item-bg);
            }

            :host(:hover) button:hover {
                color: var(--list-item-fg);
            }

            :host([layer-visible]) {
                background: var(--list-item-bg);
                color: var(--list-item-fg);
            }

            :host([layer-highlighted]) {
                background: var(--list-item-active-bg);
                color: var(--list-item-active-fg);
            }

            :host([layer-highlighted]:hover) button {
                color: var(--list-item-fg);
            }

            :host kc-ui-icon.for-visible,
            :host([layer-visible]) kc-ui-icon.for-hidden {
                display: none;
            }

            :host kc-ui-icon.for-hidden,
            :host([layer-visible]) kc-ui-icon.for-visible {
                display: revert;
            }
        `];
      }
      static {
        this.select_event = "kicanvas:layer-control:select";
      }
      static {
        this.visibility_event = "kicanvas:layer-control:visibility";
      }
      initialContentCallback() {
        super.initialContentCallback(), this.renderRoot.addEventListener("click", (e) => {
          e.stopPropagation();
          let t = e.target?.closest("button"), i;
          t ? i = Ie2.visibility_event : i = Ie2.select_event, this.dispatchEvent(new CustomEvent(i, { detail: this, bubbles: true }));
        });
      }
      render() {
        return M`<span
                class="color"
                style="background: ${this.layer_color};"></span>
            <span class="name">${this.layer_name}</span>
            <button type="button" name="${this.layer_name}">
                <kc-ui-icon class="for-visible">visibility</kc-ui-icon>
                <kc-ui-icon class="for-hidden">visibility_off</kc-ui-icon>
            </button>`;
      }
    };
    W([L({ type: String })], Ie.prototype, "layer_name", 2), W([L({ type: String })], Ie.prototype, "layer_color", 2), W([L({ type: Boolean })], Ie.prototype, "layer_highlighted", 2), W([L({ type: Boolean })], Ie.prototype, "layer_visible", 2);
    G2 = Ie;
    Vn("kc-board-layer-control", G2);
    Vn("kc-board-layers-panel", H2);
    ea = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    J2 = class extends g {
      static {
        l(this, "KCBoardNetsPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback()))();
      }
      initialContentCallback() {
        this.addEventListener("kc-ui-menu:select", (e) => {
          let t = e.detail, i = parseInt(t?.name, 10);
          i && this.viewer.highlight_net(i);
        }), this.search_input_elm.addEventListener("input", (e) => {
          this.item_filter_elem.filter_text = this.search_input_elm.value ?? null;
        });
      }
      render() {
        let e = this.viewer.board, t = [];
        for (let i of e.nets) t.push(M`<kc-ui-menu-item
                    name="${i.number}"
                    data-match-text="${i.number} ${i.name}">
                    <span class="very-narrow"> ${i.number} </span>
                    <span>${i.name}</span>
                </kc-ui-menu-item>`);
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Nets"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-text-filter-input></kc-ui-text-filter-input>
                    <kc-ui-filtered-list>
                        <kc-ui-menu class="outline">${t}</kc-ui-menu>
                    </kc-ui-filtered-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    W([Q("kc-ui-text-filter-input", true)], J2.prototype, "search_input_elm", 2), W([Q("kc-ui-filtered-list", true)], J2.prototype, "item_filter_elem", 2);
    ea("kc-board-nets-panel", J2);
    ta = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    Rs = class extends g {
      static {
        l(this, "KCBoardObjectsPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.setup_events()))();
      }
      setup_events() {
        ue(this.renderRoot, "kc-ui-range", "kc-ui-range:input", (e) => {
          let t = e.target, i = t.valueAsNumber;
          switch (t.name) {
            case "tracks":
              this.viewer.track_opacity = i;
              break;
            case "vias":
              this.viewer.via_opacity = i;
              break;
            case "pads":
              this.viewer.pad_opacity = i;
              break;
            case "holes":
              this.viewer.pad_hole_opacity = i;
              break;
            case "zones":
              this.viewer.zone_opacity = i;
              break;
            case "grid":
              this.viewer.grid_opacity = i;
              break;
            case "page":
              this.viewer.page_opacity = i;
              break;
          }
        });
      }
      render() {
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Objects"></kc-ui-panel-title>
                <kc-ui-panel-body padded>
                    <kc-ui-control-list>
                        <kc-ui-control>
                            <label>Tracks</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="tracks"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Vias</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="vias"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Pads</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="pads"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Through holes</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="holes"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Zones</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="zones"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Grid</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="grid"></kc-ui-range>
                        </kc-ui-control>
                        <kc-ui-control>
                            <label>Page</label>
                            <kc-ui-range
                                min="0"
                                max="1.0"
                                step="0.01"
                                value="1"
                                name="page"></kc-ui-range>
                        </kc-ui-control>
                    </kc-ui-control-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    ta("kc-board-objects-panel", Rs);
    ia = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    us = class extends g {
      static {
        l(this, "KCBoardPropertiesPanelElement");
      }
      connectedCallback() {
        (async () => (this.viewer = await this.requestLazyContext("viewer"), await this.viewer.loaded, super.connectedCallback(), this.setup_events()))();
      }
      setup_events() {
        this.addDisposable(this.viewer.addEventListener(z.type, (e) => {
          this.selected_item = e.detail.item, this.update();
        }));
      }
      render() {
        let e = l((n) => M`<kc-ui-property-list-item class="label" name="${n}">
            </kc-ui-property-list-item>`, "header"), t = l((n, a, c = "") => M`<kc-ui-property-list-item name="${n}">
                ${a ?? ""} ${c}
            </kc-ui-property-list-item>`, "entry"), i = l((n) => n ? M`<kc-ui-icon>check</kc-ui-icon>` : M`<kc-ui-icon>close</kc-ui-icon>`, "checkbox"), s;
        if (!this.selected_item) s = e("No item selected");
        else {
          let n = this.selected_item, a = Object.entries(n.properties).map(([c, u]) => t(c, u.value));
          s = M`
                ${e("Basic properties")}
                ${t("X", n.at.position.x.toFixed(4), "mm")}
                ${t("Y", n.at.position.y.toFixed(4), "mm")}
                ${t("Orientation", n.at.rotation, "\xB0")}
                ${t("Layer", n.layer)} ${e("Footprint properties")}
                ${t("Reference", n.reference)}
                ${t("Value", n.value)}
                ${t("Type", n.attr.through_hole ? "through hole" : n.attr.smd ? "smd" : "unspecified")}
                ${t("Pads", n.pads.length)}
                ${t("Library link", n.library_link)}
                ${t("Description", n.descr)}
                ${t("Keywords", n.tags)} ${a}
                ${e("Fabrication attributes")}
                ${t("Not in schematic", i(n.attr.board_only))}
                ${t("Exclude from position files", i(n.attr.exclude_from_pos_files))}
                ${t("Exclude from BOM", i(n.attr.exclude_from_bom))}
                ${e("Overrides")}
                ${t("Exempt from courtyard requirement", i(n.attr.allow_missing_courtyard))}
                ${t("Clearance", n.clearance ?? 0, "mm")}
                ${t("Solderpaste margin", n.solder_paste_margin ?? 0, "mm")}
                ${t("Solderpaste margin ratio", n.solder_paste_ratio ?? 0)}
                ${t("Zone connection", n.zone_connect ?? "inherited")}
            `;
        }
        return M`
            <kc-ui-panel>
                <kc-ui-panel-title title="Properties"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <kc-ui-property-list> ${s} </kc-ui-property-list>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
      }
    };
    ia("kc-board-properties-panel", us);
    ra = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    ps = class extends Xe {
      static {
        l(this, "KCBoardAppElement");
      }
      on_viewer_select(e, t) {
        e && e == t && this.change_activity("properties");
      }
      can_load(e) {
        return e.document instanceof de;
      }
      make_viewer_element() {
        return M`<kc-board-viewer></kc-board-viewer>`;
      }
      make_activities() {
        return [M`<kc-ui-activity slot="activities" name="Layers" icon="layers">
                <kc-board-layers-panel></kc-board-layers-panel>
            </kc-ui-activity>`, M`<kc-ui-activity
                slot="activities"
                name="Objects"
                icon="category">
                <kc-board-objects-panel></kc-board-objects-panel>
            </kc-ui-activity>`, M`<kc-ui-activity
                slot="activities"
                name="Footprints"
                icon="memory">
                <kc-board-footprints-panel></kc-board-footprints-panel>
            </kc-ui-activity>`, M`<kc-ui-activity slot="activities" name="Nets" icon="hub">
                <kc-board-nets-panel></kc-board-nets-panel>
            </kc-ui-activity>`, M`<kc-ui-activity
                slot="activities"
                name="Properties"
                icon="list">
                <kc-board-properties-panel></kc-board-properties-panel>
            </kc-ui-activity>`, M`<kc-ui-activity
                slot="activities"
                name="Board info"
                icon="info">
                <kc-board-info-panel></kc-board-info-panel>
            </kc-ui-activity>`];
      }
    };
    ra("kc-board-app", ps);
    Pn = `:host{font-size:var(--font-size, 16px);--transition-time-very-short: .1s;--transition-time-short: .2s;--transition-time-medium: .5s;--bg: #131218;--fg: #f8f8f0;--tooltip-bg: #8864cb;--tooltip-fg: #f8f8f0;--tooltip-border: 1px solid #131218;--scrollbar-bg: #131218;--scrollbar-fg: #ae81ff66;--scrollbar-active-fg: #ae81ff;--scrollbar-hover-bg: #ae81ffbb;--activity-bar-bg: #282634;--activity-bar-fg: #f8f8f0;--activity-bar-active-bg: #131218;--activity-bar-active-fg: #f8f8f0;--resizer-bg: #ae81ff;--resizer-active-bg: #ae81ffbb;--panel-bg: #131218;--panel-fg: #f8f8f0;--panel-border: 2px solid #282634;--panel-title-bg: #8077a8;--panel-title-fg: #f8f8f0;--panel-title-border: 1px solid #634e89;--panel-title-button-bg: transparent;--panel-title-button-fg: #dcc8ff;--panel-title-button-hover-bg: #ae81ff;--panel-title-button-hover-fg: inherit;--panel-title-button-disabled-bg: inherit;--panel-title-button-disabled-fg: #888;--panel-subtitle-bg: #634e89;--panel-subtitle-fg: var(--panel-fg);--dropdown-bg: #464258;--dropdown-fg: #f8f8f0;--button-bg: #81eeff;--button-fg: #131218;--button-hover-bg: #a3f3ff;--button-hover-fg: #131218;--button-focus-outline: 1px solid #ae81ff;--button-selected-bg: #ae81ff;--button-selected-fg: #131218;--button-disabled-bg: #131218;--button-disabled-fg: #888;--button-success-bg: #64cb96;--button-success-fg: #131218;--button-success-hover-bg: #81ffbe;--button-success-hover-fg: #131218;--button-danger-bg: #cb6488;--button-danger-fg: #131218;--button-danger-hover-bg: #ff81ad;--button-danger-hover-fg: #131218;--button-outline-bg: #282634;--button-outline-fg: #f8f8f0;--button-outline-hover-bg: #282634;--button-outline-hover-fg: #81eeff;--button-outline-disabled-bg: #131218;--button-outline-disabled-fg: #888;--button-toolbar-bg: #282634;--button-toolbar-fg: #f8f8f0;--button-toolbar-hover-bg: #282634;--button-toolbar-hover-fg: #81eeff;--button-toolbar-disabled-bg: #131218;--button-toolbar-disabled-fg: #888;--button-menu-bg: transparent;--button-menu-fg: #f8f8f0;--button-menu-hover-bg: transparent;--button-menu-hover-fg: #81eeff;--button-menu-disabled-bg: transparent;--button-menu-disabled-fg: #888;--input-bg: #131218;--input-fg: #f8f8f0;--input-border: 1px solid #8077a8;--input-accent: #ae81ff;--input-hover-shadow: 1px 1px 10px 5px rgba(0, 0, 0, .2);--input-focus-outline: 1px solid #ae81ff;--input-placeholder: #8077a8;--input-disabled-bg: #131218;--input-disabled-fg: #888;--input-range-bg: #8077a8;--input-range-fg: #f8f8f0;--input-range-hover-bg: #ae81ff;--input-range-disabled-bg: #131218;--input-range-hover-shadow: 1px 1px 10px 5px rgba(0, 0, 0, .2);--input-range-handle-shadow: 1px 1px 5px 5px rgba(180, 180, 180, .2);--list-item-bg: var(--panel-bg);--list-item-fg: var(--panel-fg);--list-item-active-bg: #634e89;--list-item-active-fg: var(--list-item-fg);--list-item-hover-bg: #64cb96;--list-item-hover-fg: var(--list-item-bg);--list-item-disabled-bg: var(--list-item-bg);--list-item-disabled-fg: #888;--grid-outline: #433e56}:host{--gradient-purple-green-light: linear-gradient( 190deg, hsl(261deg 27% 42%) 0%, hsl(243deg 27% 42%) 17%, hsl(224deg 27% 42%) 33%, hsl(205deg 27% 42%) 50%, hsl(187deg 27% 42%) 67%, hsl(168deg 27% 42%) 83%, hsl(149deg 27% 42%) 100% ) 0 0 fixed;--gradient-purple-blue-medium: linear-gradient( 190deg, hsl(261deg 28% 30%) 0%, hsl(248deg 30% 31%) 17%, hsl(235deg 32% 32%) 33%, hsl(222deg 34% 33%) 50%, hsl(209deg 35% 34%) 67%, hsl(197deg 37% 35%) 83%, hsl(183deg 38% 36%) 100% ) 0 0 fixed;--gradient-purple-blue-dark: linear-gradient(10deg, #111928, #1d162a) 0 0 fixed;--gradient-cyan-blue-light: linear-gradient( 190deg, hsl(183deg 63% 33%) 0%, hsl(189deg 69% 30%) 17%, hsl(194deg 74% 27%) 33%, hsl(199deg 79% 24%) 50%, hsl(203deg 85% 21%) 67%, hsl(209deg 89% 18%) 83%, hsl(214deg 95% 15%) 100% ) 0 0 fixed;--gradient-purple-green-highlight: linear-gradient( 190deg, hsl(261deg 27% 53%) 0%, hsl(243deg 27% 52%) 17%, hsl(224deg 27% 52%) 33%, hsl(205deg 27% 51%) 50%, hsl(186deg 27% 51%) 67%, hsl(168deg 27% 50%) 83%, hsl(149deg 27% 50%) 100% ) 0 0 fixed;--gradient-purple-red: linear-gradient(90deg, #8864cb, #cb6488) 0 0 fixed;--gradient-purple-red-highlight: linear-gradient(90deg, #b187ff, #ff80ac) 0 0 fixed;--scrollbar-bg: var(--gradient-purple-blue-dark);--scrollbar-fg: var(--gradient-purple-green-light);--scrollbar-hover-fg: var(--scrollbar-fg);--scrollbar-active-fg: var(--scrollbar-fg);--activity-bar-bg: var(--gradient-purple-green-light);--resizer-bg: var(--gradient-purple-blue-medium);--resizer-active-bg: var(--gradient-purple-green-highlight);--panel-bg: var(--gradient-purple-blue-dark);--panel-title-bg: var(--gradient-purple-green-light);--panel-subtitle-bg: var(--gradient-purple-blue-medium);--button-toolbar-bg: var(--gradient-purple-blue-dark);--button-toolbar-hover-bg: var(--gradient-purple-green-light);--button-toolbar-hover-fg: #f8f8f0;--button-toolbar-disabled-bg: var(--gradient-purple-blue-dark);--button-toolbar-alt-bg: var(--gradient-purple-green-light);--button-toolbar-alt-hover-bg: var(--gradient-purple-green-highlight);--button-toolbar-alt-hover-fg: #f8f8f0;--button-toolbar-alt-disabled-bg: var(--gradient-purple-blue-dark);--dropdown-bg: var(--gradient-purple-green-light);--dropdown-fg: #f8f8f0;--dropdown-hover-bg: var(--gradient-purple-green-highlight);--dropdown-hover-fg: #f8f8f0;--dropdown-active-bg: var(--gradient-purple-blue-dark);--dropdown-active-fg: #f8f8f0;--input-range-bg: var(--gradient-purple-green-light);--list-item-hover-bg: var(--gradient-purple-green-highlight);--list-item-active-bg: var(--gradient-cyan-blue-light);--focus-overlay-bg: var(--gradient-purple-green-light);--focus-overlay-opacity: .5;--focus-overlay-fg: #f8f8f0}::-webkit-scrollbar{position:absolute;width:6px;height:6px;margin-left:-6px;background:var(--scrollbar-bg)}::-webkit-scrollbar-thumb{position:absolute;background:var(--scrollbar-fg)}::-webkit-scrollbar-thumb:hover{background:var(--scrollbar-hover-fg)}::-webkit-scrollbar-thumb:active{background:var(--scrollbar-active-fg)}kc-ui-app{width:100%;height:100%;flex-grow:1;display:flex;flex-direction:row;overflow:hidden}label{display:block;width:100%;margin-top:.75em}input,select,textarea{all:unset;box-sizing:border-box;display:block;width:100%;max-width:100%;margin-top:.5em;font-family:inherit;border-radius:.25em;text-align:center;padding:.25em;background:var(--input-bg);color:var(--input-fg);transition:color var(--transition-time-medium) ease,box-shadow var(--transition-time-medium) ease,outline var(--transition-time-medium) ease,background var(--transition-time-medium) ease,border var(--transition-time-medium) ease}input:hover,select:hover,textarea:hover{z-index:10;box-shadow:var(--input-hover-shadow)}input:focus,select:focus,textarea:focus{z-index:10;box-shadow:none;outline:var(--input-focus-outline)}input:disabled,select:disabled,textarea:disabled{background:var(--input-disabled-bg);color:var(--input-disabled-fg)}input:disabled:hover,select:disabled:hover,textarea:disabled:hover{z-index:10;cursor:unset}input[type=color]::-webkit-color-swatch{border:1px solid transparent;border-radius:.25em}textarea{text-align:left;padding:.5em}
`;
    l(D3, "dirname");
    l(B3, "basename");
    l(Wn, "extension");
    l(hs, "normalize_join");
    Gt = new ie("kicanvas:project");
    $3 = class extends EventTarget {
      constructor() {
        super(...arguments);
        this.#t = /* @__PURE__ */ new Map();
        this.#i = /* @__PURE__ */ new Map();
        this.loaded = new Ve();
        this.settings = new je();
        this.#a = null;
      }
      static {
        l(this, "Project");
      }
      #e;
      #t;
      #i;
      #r;
      dispose() {
        this.#t.clear(), this.#i.clear();
      }
      async load(t) {
        Gt.info(`Loading project from ${t.constructor.name}`), this.settings = new je(), this.#t.clear(), this.#i.clear(), this.#e = t;
        let i = [];
        for (let a of this.#e.list()) i.push(this.#s(a));
        await Promise.all(i);
        let s = true, n = [];
        for (; s; ) {
          s = false;
          let a = [];
          for (let c of this.schematics()) {
            let u = D3(c.filename);
            for (let h of c.sheets) {
              if (!h.sheetfile) continue;
              let m = hs(u, h.sheetfile);
              n.includes(m) || (s = true, n.push(m), await this.#e.has(m) ? a.push(this.#s(m)) : Gt.warn(`file "${m}" is not existed, skip it.`));
            }
          }
          await Promise.all(a);
        }
        this.#c(), this.loaded.open(), this.dispatchEvent(new CustomEvent("load", { detail: this }));
      }
      async #s(t) {
        if (Gt.info(`Loading file ${t}`), t.endsWith(".kicad_sch")) return await this.#n(_e, t);
        if (t.endsWith(".kicad_pcb")) return await this.#n(de, t);
        if (t.endsWith(".kicad_pro")) return this.#l(t);
        Gt.warn(`Couldn't load ${t}: unknown file type`);
      }
      async #n(t, i) {
        if (this.#t.has(i)) return this.#t.get(i);
        let s = await this.#o(i), n = new t(i, s);
        if (n.project = this, this.#t.set(i, n), n instanceof de) {
          let a = new Jt(this, "pcb", n.filename, "", "Board", "");
          this.#i.set(a.project_path, a);
        }
        return n;
      }
      async #l(t) {
        let i = await this.#o(t), s = JSON.parse(i);
        this.settings = je.load(s);
      }
      async #o(t) {
        return await (await this.#e.get(t)).text();
      }
      #c() {
        Gt.info("Determining schematic hierarchy");
        let t = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
        for (let u of this.schematics()) {
          t.set(`/${u.uuid}`, u);
          for (let h of u.sheets) if (this.#t.get(h.sheetfile ?? "")) for (let _ of h.instances.values()) t.set(_.path, u), i.set(`${_.path}/${h.uuid}`, { sheet: h, instance: _ });
        }
        let s = Array.from(i.keys()).sort((u, h) => u.length - h.length), n;
        for (let u of s) {
          let h = u.split("/").slice(0, -1).join("/");
          if (h && (n = t.get(h), n)) break;
        }
        let a = [];
        if (n) {
          this.#r = new Jt(this, "schematic", n.filename, `/${n.uuid}`, "Root", "1"), a.push(this.#r);
          for (let [u, h] of i.entries()) a.push(new Jt(this, "schematic", h.sheet.sheetfile, u, h.sheet.sheetname ?? h.sheet.sheetfile, h.instance.page ?? ""));
        }
        a = Re(a, (u) => u.page);
        for (let u of a) this.#i.set(u.project_path, u);
        let c = new Set(Ks(this.#i.values(), (u) => u.filename));
        for (let u of this.schematics()) if (!c.has(u.filename)) {
          let h = new Jt(this, "schematic", u.filename, `/${u.uuid}`, u.filename);
          this.#i.set(h.project_path, h);
        }
        this.#r = Ct(this.#i.values()), this.#r || Gt.error("No vaild root schematic was found.");
      }
      *files() {
        yield* this.#t.values();
      }
      file_by_name(t) {
        return this.#t.get(t);
      }
      *boards() {
        for (let t of this.#t.values()) t instanceof de && (yield t);
      }
      get has_boards() {
        return Dt(this.boards()) > 0;
      }
      *schematics() {
        for (let t of this.#t.values()) t instanceof _e && (yield t);
      }
      get has_schematics() {
        return Dt(this.schematics()) > 0;
      }
      *pages() {
        yield* this.#i.values();
      }
      get first_page() {
        return Ct(this.pages());
      }
      get root_schematic_page() {
        return this.#r;
      }
      page_by_path(t) {
        return this.#i.get(t);
      }
      async download(t) {
        return this.#i.has(t) && (t = this.#i.get(t).filename), await this.#e.download(t);
      }
      #a;
      get active_page() {
        return this.#a;
      }
      set_active_page(t) {
        let i;
        if (G(t) ? i = this.page_by_path(t) : i = t, i || (i = this.first_page), !i) throw new Error(`Unable to find ${t}`);
        this.#a = i, this.dispatchEvent(new CustomEvent("change", { detail: this }));
      }
    };
    Jt = class {
      constructor(e, t, i, s, n, a) {
        this.project = e;
        this.type = t;
        this.filename = i;
        this.sheet_path = s;
        this.name = n;
        this.page = a;
      }
      static {
        l(this, "ProjectPage");
      }
      get project_path() {
        return this.sheet_path ? `${this.filename}:${this.sheet_path}` : this.filename;
      }
      get document() {
        return this.project.file_by_name(this.filename);
      }
    };
    l(Zn, "initiate_download");
    j3 = class r38 {
      static {
        l(this, "FileSystemBase");
      }
      constructor(e = /* @__PURE__ */ new Map()) {
        this.entries = e;
      }
      *list() {
        for (let [e, t] of this.entries) t.type === "file" && (yield e);
      }
      async setup() {
        await this.walk("");
      }
      async get(e) {
        if (!await this.has(e)) throw new Error(`File ${e} not found`);
        return await this.load_file(e);
      }
      async has(e) {
        let t = D3(e);
        if (!this.entries.has(t) && !this.entries.has(e)) return false;
        await this.walk(t);
        let i = this.entries.get(e);
        return !!i && i.type === "file";
      }
      async download(e) {
        Zn(await this.get(e));
      }
      static is_kicad_file(e) {
        return ["kicad_pcb", "kicad_pro", "kicad_sch"].includes(Wn(e));
      }
      async walk(e) {
        if (this.entries.get(e)?.type === "visited-directory") return;
        let t = await this.enumerate(e);
        this.entries.set(e, { path: e, type: "visited-directory" });
        for (let i of t) i.type === "file" && !r38.is_kicad_file(i.path) || this.entries.set(i.path, i);
      }
    };
    z3 = class {
      static {
        l(this, "MergedFileSystem");
      }
      constructor(e) {
        this.fs_list = e.filter((t) => t !== null);
      }
      *list() {
        for (let e of this.fs_list) yield* e.list();
      }
      async setup() {
        for (let e of this.fs_list) await e.setup();
      }
      async has(e) {
        for (let t of this.fs_list) if (await t.has(e)) return true;
        return false;
      }
      async get(e) {
        for (let t of this.fs_list) if (await t.has(e)) return await t.get(e);
        throw new Error(`File ${e} not found`);
      }
      async download(e) {
        for (let t of this.fs_list) if (await t.has(e)) return await t.download(e);
        throw new Error(`File ${e} not found`);
      }
    };
    ds = class r39 extends j3 {
      constructor(t) {
        super(r39.into_entries(t));
        this.file_list = t;
      }
      static {
        l(this, "LocalFileSystemBase");
      }
      async load_file(t) {
        let i = this.file_list.get(t);
        if (!i) throw new Error(`File ${t} not found!`);
        return i;
      }
      async enumerate(t) {
        return [];
      }
      static into_entries(t) {
        let i = /* @__PURE__ */ new Map();
        for (let s of t.keys()) i.set(s, { path: s, type: "file" });
        return i;
      }
    };
    q3 = class extends j3 {
      constructor(t, i = null) {
        super();
        this.urls = /* @__PURE__ */ new Map();
        this.resolver = i ?? this.#e;
        for (let s of t) this.#t(s);
      }
      static {
        l(this, "FetchFileSystem");
      }
      #e(t) {
        return new URL(t, window.location.toString());
      }
      #t(t) {
        if (typeof t == "string") {
          let i = this.urls.get(t);
          if (i) return i;
          {
            let s = this.resolver(t), n = B3(s);
            return this.urls.set(n, s), s;
          }
        }
        return t;
      }
      async load_file(t) {
        let i = this.#t(t);
        if (!i) throw new Error(`File ${t} not found!`);
        let s = new Request(i, { method: "GET" }), n = await fetch(s);
        if (!n.ok) throw new Error(`Unable to load ${i}: ${n.status} ${n.statusText}`);
        let a = await n.blob();
        return new File([a], t);
      }
      async enumerate(t) {
        return Array.from(this.urls.keys()).map((i) => ({ path: i, type: "file" }));
      }
    };
    ei = class extends ds {
      static {
        l(this, "LocalFileSystem");
      }
      constructor(e) {
        super(new Map(e.map((t) => [t.name, t])));
      }
    };
    Sn = l((r40, e, t) => {
      customElements.get(r40) || customElements.define(r40, e, t);
    }, "__dshKicanvasDefine");
    k2 = new ie("kicanvas:embedtag");
    Ne = class extends g {
      constructor() {
        super();
        this.#e = new $3();
        this.custom_resolver = null;
        this.provideContext("project", this.#e);
      }
      static {
        l(this, "KiCanvasEmbedElement");
      }
      static {
        this.styles = [...g.styles, new nt(Pn), y`
            :host {
                margin: 0;
                display: flex;
                position: relative;
                width: 100%;
                max-height: 100%;
                aspect-ratio: 1.414;
                background-color: aqua;
                color: var(--fg);
                font-family:
                    "Nunito", ui-rounded, "Hiragino Maru Gothic ProN",
                    Quicksand, Comfortaa, Manjari, "Arial Rounded MT Bold",
                    Calibri, source-sans-pro, sans-serif;
                contain: layout paint;
            }

            main {
                display: contents;
            }

            kc-board-app,
            kc-schematic-app {
                width: 100%;
                height: 100%;
                flex: 1;
            }
        `];
      }
      #e;
      dsh_get_camera() {
        let i = (this.#t ?? this.#i)?.viewer?.viewport?.camera;
        return i ? { x: i.center.x, y: i.center.y, zoom: i.zoom } : null;
      }
      dsh_set_camera(t) {
        let i = (this.#t ?? this.#i)?.viewer, s = i?.viewport?.camera;
        return s ? (s.center.set(t.x, t.y), s.zoom = t.zoom, i.draw(), true) : false;
      }
      #t;
      #i;
      initialContentCallback() {
        this.#r(), Fe(() => {
          this.#s();
        });
      }
      async #r() {
      }
      async #s() {
        let t = [], i = [];
        this.src && t.push(this.src);
        let s = 0;
        for (let u of this.querySelectorAll("kicanvas-source")) if (u.src) t.push(u.src);
        else if (u.is_inline_source()) {
          let h = `inline_${s}`;
          s += 1;
          let m = u.load_inline_source(h);
          m && (k2.info(`Determined inline source ${m.name}, ${m.size} bytes`), i.push(m));
        }
        let n = t.length === 0 ? null : new q3(t, this.custom_resolver), a = i.length === 0 ? null : new ei(i);
        if (n === null && a === null) {
          k2.warn("No valid sources specified");
          return;
        }
        let c = new z3([n, a]);
        await this.#n(c);
      }
      async #n(t) {
        this.loaded = false, this.loading = true;
        try {
          await t.setup(), await this.#e.load(t), this.loaded = true, await this.update(), this.#e.set_active_page(this.#e.root_schematic_page);
        } finally {
          this.loading = false;
        }
      }
      render() {
        if (!this.loaded) return M``;
        this.#e.has_schematics && !this.#t && (this.#t = M`<kc-schematic-app
                sidebarcollapsed
                controls="${this.controls}"
                controlslist="${this.controlslist}">
            </kc-schematic-app>`), this.#e.has_boards && !this.#i && (this.#i = M`<kc-board-app
                sidebarcollapsed
                controls="${this.controls}"
                controlslist="${this.controlslist}">
            </kc-board-app>`);
        let t = (this.controls ?? "none") == "none" || this.controlslist?.includes("nooverlay") ? null : M`<kc-ui-focus-overlay></kc-ui-focus-overlay>`;
        return M`<main>
            ${this.#t} ${this.#i} ${t}
        </main>`;
      }
    };
    W([L({ type: String })], Ne.prototype, "src", 2), W([L({ type: Boolean })], Ne.prototype, "loading", 2), W([L({ type: Boolean })], Ne.prototype, "loaded", 2), W([L({ type: String })], Ne.prototype, "controls", 2), W([L({ type: String })], Ne.prototype, "controlslist", 2), W([L({ type: String })], Ne.prototype, "theme", 2), W([L({ type: String })], Ne.prototype, "zoom", 2);
    Sn("kicanvas-embed", Ne);
    rt = class rt2 extends Ue {
      static {
        l(this, "KiCanvasSourceElement");
      }
      constructor() {
        super();
      }
      connectedCallback() {
        this.ariaHidden = "true", this.hidden = true, this.style.display = "none", super.connectedCallback();
      }
      is_inline_source() {
        return this.src === null && this.childNodes.length > 0;
      }
      load_inline_source(e = null) {
        let t = "";
        for (let a of this.childNodes) a.nodeType === Node.TEXT_NODE ? t += a.nodeValue ?? "" : k2.warn(`kicanvas-source children ${a.nodeType} are invaild.`);
        t = t.trimStart();
        let i;
        if (this.name) i = this.name;
        else {
          let a = this.type ?? rt2.determine_file_type(t);
          if (a === void 0) {
            k2.warn(`Unknown file type, content: ${t.slice(0, 64)}...`);
            return;
          }
          let c = rt2.get_file_ext(a);
          i = (e ?? "noname") + c;
        }
        if (t.length === 0) {
          k2.warn(`kicanvas-source content ${i} is empty.`);
          return;
        }
        let s = new Blob([t], { type: "text/plain" });
        return new File([s], i);
      }
      static determine_file_type(e) {
        if (e.startsWith("(kicad_sch")) return "schematic";
        if (e.startsWith("(kicad_pcb")) return "board";
        if (e.startsWith("(kicad_wks")) return "worksheet";
        if (e.startsWith("{")) return "project";
      }
      static get_file_ext(e) {
        switch (e) {
          case "schematic":
            return ".kicad_sch";
          case "board":
            return ".kicad_pcb";
          case "worksheet":
            return ".kicad_wks";
          case "project":
            return ".kicad_prj";
        }
      }
    };
    W([L({ type: String })], rt.prototype, "src", 2), W([L({ type: String })], rt.prototype, "type", 2), W([L({ type: String })], rt.prototype, "name", 2);
    ms = rt;
    Sn("kicanvas-source", ms);
    At.sprites_url = ws;
  }
});

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  BUNDLES: () => BUNDLES,
  KICAD_MISSING: () => KICAD_MISSING,
  TAB_ID: () => TAB_ID,
  apply: () => apply,
  inject: () => inject,
  orderPages: () => orderPages,
  parseFileAddress: () => parseFileAddress,
  pickSession: () => pickSession,
  readCheckMeta: () => readCheckMeta,
  readReport: () => readReport,
  renderDir: () => renderDir,
  sessionFileAddress: () => sessionFileAddress,
  toOps: () => toOps
});
module.exports = __toCommonJS(index_exports);

// src/client/address.ts
var PREFIX = "dsh-resource://file/";
function parseFileAddress(address) {
  if (!address.startsWith(PREFIX)) return void 0;
  const rest = address.slice(PREFIX.length).split("?")[0].split("#")[0];
  const parts = rest.split("/").map(decodeURIComponent);
  if (parts[0] === "session" && parts.length >= 3 && parts[1]) {
    return { scope: "session", sessionId: parts[1], path: parts.slice(2).join("/") };
  }
  if (parts[0] === "absolute" && parts.length >= 2) {
    const joined = parts.slice(1).join("/");
    return { scope: "absolute", path: /^[A-Za-z]:/.test(joined) ? joined : `/${joined}` };
  }
  return void 0;
}
var enc = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ":");
function sessionFileAddress(sessionId, relativePath) {
  return `${PREFIX}session/${enc(sessionId)}/${relativePath.split("/").filter(Boolean).map(enc).join("/")}`;
}
function basename(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}
function dirname(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}
function stem(path) {
  return basename(path).replace(/\.kicad_(sch|pcb)$/, "");
}
function renderDir(designPath) {
  const dir = dirname(designPath);
  return `${dir ? `${dir}/` : ""}.dsh-kicad/render/${stem(designPath)}`;
}
function orderPages(designPath, names) {
  const root = `${stem(designPath)}.svg`;
  return names.filter((n) => n.endsWith(".svg")).sort((a, b) => a === root ? -1 : b === root ? 1 : a.localeCompare(b));
}
function isDesignFile(path) {
  return /\.kicad_(sch|pcb)$/i.test(path);
}

// src/client/Cards.tsx
var import_react3 = require("react");

// src/client/Doctor.tsx
var import_react = require("react");

// src/client/locales.ts
var NS = "kicad";
var en = {
  "viewer.render": "Render",
  "viewer.updating": "Updating\u2026",
  "viewer.liveUpdated": "Live \xB7 updated {time}",
  "viewer.liveStale": "the latest change could not be displayed yet",
  "viewer.follow": "Follow agent",
  "viewer.followHint": "Open designs here automatically when the agent creates or edits them",
  "viewer.interactive": "Interactive",
  "viewer.svg": "SVG",
  "viewer.theme": "Theme",
  "viewer.loading": "Loading the design\u2026",
  "viewer.kicanvasFailed": "the interactive viewer could not open this file",
  "viewer.fellBack": "Showing the kicad-cli render because {message}.",
  "viewer.rendering": "Rendering\u2026",
  "viewer.fit": "Fit",
  "viewer.zoomIn": "Zoom in",
  "viewer.zoomOut": "Zoom out",
  "viewer.page": "Sheet",
  "viewer.empty": "No render yet. Render this design with KiCad (kicad-cli) to view it here.",
  "viewer.stale": "The design changed since this render.",
  "viewer.noSession": "Open a KiCad file from a session workspace to view it.",
  "viewer.failed": "Could not load the render: {message}",
  "viewer.renderFailed": "Render failed: {message}",
  "card.erc": "ERC",
  "card.drc": "DRC",
  "card.running": "Running KiCad {kind}\u2026",
  "card.passed": "passed",
  "card.failed": "failed",
  "card.counts": "{errors} errors \xB7 {warnings} warnings",
  "card.more": "{count} more in the tool result",
  "card.edit": "Schematic edit",
  "card.create": "New schematic",
  "card.creating": "Creating {file}\u2026",
  "card.created": "{file} created",
  "card.rendered": "Rendered {file} ({count} page(s))",
  "card.commandRunning": "running\u2026",
  "card.commandFailed": "failed",
  "card.editing": "Editing {file}\u2026",
  "card.changes": "{count} changes",
  "card.autoErc": "Automatic ERC",
  "settings.bridge": "KiCad sidecar",
  "settings.kicadCli": "kicad-cli path",
  "settings.kicadCliHint": "Empty: $KICAD_CLI, PATH, then standard install locations",
  "settings.python": "Python interpreter",
  "settings.pythonHint": "Python 3.10+; empty uses python3 (python on Windows)",
  "settings.policy": "KiCad edit policy",
  "settings.approval": "Ask before every schematic edit (otherwise edits follow the session permissions)",
  "settings.autoErc": "Run ERC after every schematic edit",
  "settings.autoDrc": "Run DRC after every board edit",
  "settings.autoRender": "Refresh the sidebar render after every edit",
  "settings.save": "Save",
  "settings.saved": "Saved",
  "settings.rejected": "The Host refused the change",
  "settings.summaryBridge": "kicad-cli: {cli}",
  "settings.summaryPolicy": "Approval: {approval} \xB7 auto ERC: {erc} \xB7 auto DRC: {drc}",
  "doctor.title": "KiCad environment",
  "doctor.recheck": "Check again",
  "doctor.checking": "Checking\u2026",
  "doctor.fix": "Fix",
  "doctor.open": "Details",
  "doctor.noSession": "The check runs through a conversation: open or start one, then check again.",
  "doctor.status.ok": "Ready",
  "doctor.status.missing": "KiCad not installed",
  "doctor.status.outdated": "KiCad too old",
  "doctor.status.error": "Problems found",
  "doctor.status.unavailable": "Sidecar not running",
  "doctor.card": "KiCad check",
  "install.title": "Install KiCad",
  "install.intro": "Pick one. Nothing runs until you confirm; commands that need administrator rights are only shown for you to run.",
  "install.install": "Install\u2026",
  "install.openButton": "Install KiCad",
  "install.recommended": "recommended",
  "install.needsRoot": "needs sudo",
  "install.rootHint": 'Needs administrator rights, so dsh will not run it. Run it in a terminal, then click "Check again".',
  "install.copy": "Copy command",
  "install.copied": "Copied",
  "install.download": "Open download page",
  "install.confirm": "dsh will run these commands on this computer as your user (no sudo):",
  "install.run": "Run now",
  "install.back": "Cancel",
  "install.cancel": "Stop",
  "install.job": "Installing: {label}",
  "install.step": "step {step}/{steps}",
  "install.state.running": "running",
  "install.state.succeeded": "finished",
  "install.state.failed": "failed",
  "install.state.cancelled": "stopped",
  "card.kicadMissing": "KiCad is missing or too old for this tool.",
  "common.default": "default",
  "common.on": "on",
  "common.off": "off"
};
var zh = {
  "viewer.render": "\u6E32\u67D3",
  "viewer.updating": "\u66F4\u65B0\u4E2D\u2026",
  "viewer.liveUpdated": "\u5B9E\u65F6 \xB7 \u66F4\u65B0\u4E8E {time}",
  "viewer.liveStale": "\u6700\u65B0\u4FEE\u6539\u6682\u65F6\u65E0\u6CD5\u663E\u793A",
  "viewer.follow": "\u8DDF\u968F agent",
  "viewer.followHint": "agent \u521B\u5EFA\u6216\u4FEE\u6539\u8BBE\u8BA1\u65F6\uFF0C\u81EA\u52A8\u5728\u8FD9\u91CC\u6253\u5F00",
  "viewer.interactive": "\u4EA4\u4E92",
  "viewer.svg": "SVG",
  "viewer.theme": "\u4E3B\u9898",
  "viewer.loading": "\u6B63\u5728\u52A0\u8F7D\u8BBE\u8BA1\u2026",
  "viewer.kicanvasFailed": "\u4EA4\u4E92\u67E5\u770B\u5668\u65E0\u6CD5\u6253\u5F00\u6B64\u6587\u4EF6",
  "viewer.fellBack": "\u5DF2\u6539\u4E3A\u663E\u793A kicad-cli \u6E32\u67D3\u7ED3\u679C\uFF0C\u539F\u56E0\uFF1A{message}\u3002",
  "viewer.rendering": "\u6E32\u67D3\u4E2D\u2026",
  "viewer.fit": "\u9002\u5E94",
  "viewer.zoomIn": "\u653E\u5927",
  "viewer.zoomOut": "\u7F29\u5C0F",
  "viewer.page": "\u56FE\u7EB8",
  "viewer.empty": "\u5C1A\u672A\u6E32\u67D3\u3002\u4F7F\u7528 KiCad\uFF08kicad-cli\uFF09\u6E32\u67D3\u540E\u5373\u53EF\u5728\u6B64\u67E5\u770B\u3002",
  "viewer.stale": "\u8BBE\u8BA1\u6587\u4EF6\u5728\u672C\u6B21\u6E32\u67D3\u4E4B\u540E\u5DF2\u4FEE\u6539\u3002",
  "viewer.noSession": "\u8BF7\u4ECE\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u6253\u5F00 KiCad \u6587\u4EF6\u3002",
  "viewer.failed": "\u65E0\u6CD5\u52A0\u8F7D\u6E32\u67D3\u7ED3\u679C\uFF1A{message}",
  "viewer.renderFailed": "\u6E32\u67D3\u5931\u8D25\uFF1A{message}",
  "card.erc": "ERC",
  "card.drc": "DRC",
  "card.running": "\u6B63\u5728\u8FD0\u884C KiCad {kind}\u2026",
  "card.passed": "\u901A\u8FC7",
  "card.failed": "\u672A\u901A\u8FC7",
  "card.counts": "{errors} \u4E2A\u9519\u8BEF \xB7 {warnings} \u4E2A\u8B66\u544A",
  "card.more": "\u53E6\u6709 {count} \u9879\u89C1\u5DE5\u5177\u7ED3\u679C",
  "card.edit": "\u539F\u7406\u56FE\u4FEE\u6539",
  "card.create": "\u65B0\u5EFA\u539F\u7406\u56FE",
  "card.creating": "\u6B63\u5728\u521B\u5EFA {file}\u2026",
  "card.created": "\u5DF2\u521B\u5EFA {file}",
  "card.rendered": "\u5DF2\u6E32\u67D3 {file}\uFF08{count} \u9875\uFF09",
  "card.commandRunning": "\u8FD0\u884C\u4E2D\u2026",
  "card.commandFailed": "\u5931\u8D25",
  "card.editing": "\u6B63\u5728\u4FEE\u6539 {file}\u2026",
  "card.changes": "{count} \u9879\u6539\u52A8",
  "card.autoErc": "\u81EA\u52A8 ERC",
  "settings.bridge": "KiCad sidecar",
  "settings.kicadCli": "kicad-cli \u8DEF\u5F84",
  "settings.kicadCliHint": "\u7559\u7A7A\uFF1A\u4F9D\u6B21\u67E5\u627E $KICAD_CLI\u3001PATH \u548C\u6807\u51C6\u5B89\u88C5\u4F4D\u7F6E",
  "settings.python": "Python \u89E3\u91CA\u5668",
  "settings.pythonHint": "Python 3.10+\uFF1B\u7559\u7A7A\u4F7F\u7528 python3\uFF08Windows \u4E3A python\uFF09",
  "settings.policy": "KiCad \u4FEE\u6539\u7B56\u7565",
  "settings.approval": "\u6BCF\u6B21\u4FEE\u6539\u539F\u7406\u56FE\u524D\u90FD\u8BF7\u6C42\u5BA1\u6279\uFF08\u5173\u95ED\u65F6\u8DDF\u968F\u4F1A\u8BDD\u7684\u6743\u9650\u8BBE\u7F6E\uFF09",
  "settings.autoErc": "\u6BCF\u6B21\u4FEE\u6539\u539F\u7406\u56FE\u540E\u8FD0\u884C ERC",
  "settings.autoDrc": "\u6BCF\u6B21\u4FEE\u6539\u7535\u8DEF\u677F\u540E\u8FD0\u884C DRC",
  "settings.autoRender": "\u6BCF\u6B21\u4FEE\u6539\u540E\u5237\u65B0\u4FA7\u8FB9\u680F\u6E32\u67D3",
  "settings.save": "\u4FDD\u5B58",
  "settings.saved": "\u5DF2\u4FDD\u5B58",
  "settings.rejected": "Host \u62D2\u7EDD\u4E86\u8BE5\u4FEE\u6539",
  "settings.summaryBridge": "kicad-cli\uFF1A{cli}",
  "settings.summaryPolicy": "\u5BA1\u6279\uFF1A{approval} \xB7 \u81EA\u52A8 ERC\uFF1A{erc} \xB7 \u81EA\u52A8 DRC\uFF1A{drc}",
  "doctor.title": "KiCad \u73AF\u5883",
  "doctor.recheck": "\u91CD\u65B0\u68C0\u67E5",
  "doctor.checking": "\u68C0\u67E5\u4E2D\u2026",
  "doctor.fix": "\u4FEE\u590D",
  "doctor.open": "\u8BE6\u60C5",
  "doctor.noSession": "\u68C0\u67E5\u9700\u8981\u901A\u8FC7\u4E00\u4E2A\u4F1A\u8BDD\u6267\u884C\uFF1A\u8BF7\u5148\u6253\u5F00\u6216\u65B0\u5EFA\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u518D\u70B9\u201C\u91CD\u65B0\u68C0\u67E5\u201D\u3002",
  "doctor.status.ok": "\u6B63\u5E38",
  "doctor.status.missing": "\u672A\u5B89\u88C5 KiCad",
  "doctor.status.outdated": "KiCad \u7248\u672C\u8FC7\u4F4E",
  "doctor.status.error": "\u6709\u95EE\u9898",
  "doctor.status.unavailable": "sidecar \u65E0\u6CD5\u542F\u52A8",
  "doctor.card": "KiCad \u73AF\u5883\u68C0\u67E5",
  "install.title": "\u5B89\u88C5 KiCad",
  "install.intro": "\u9009\u62E9\u4E00\u79CD\u65B9\u5F0F\u3002\u786E\u8BA4\u4E4B\u524D\u4E0D\u4F1A\u6267\u884C\u4EFB\u4F55\u547D\u4EE4\uFF1B\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650\u7684\u547D\u4EE4\u53EA\u5C55\u793A\u7ED9\u4F60\u81EA\u5DF1\u6267\u884C\u3002",
  "install.install": "\u5B89\u88C5\u2026",
  "install.openButton": "\u5B89\u88C5 KiCad",
  "install.recommended": "\u63A8\u8350",
  "install.needsRoot": "\u9700\u8981 sudo",
  "install.rootHint": "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650\uFF0Cdsh \u4E0D\u4F1A\u4EE3\u4E3A\u6267\u884C\u3002\u8BF7\u5728\u7EC8\u7AEF\u4E2D\u8FD0\u884C\uFF0C\u7136\u540E\u70B9\u201C\u91CD\u65B0\u68C0\u67E5\u201D\u3002",
  "install.copy": "\u590D\u5236\u547D\u4EE4",
  "install.copied": "\u5DF2\u590D\u5236",
  "install.download": "\u6253\u5F00\u4E0B\u8F7D\u9875",
  "install.confirm": "dsh \u5C06\u4EE5\u5F53\u524D\u7528\u6237\u8EAB\u4EFD\uFF08\u4E0D\u4F7F\u7528 sudo\uFF09\u5728\u672C\u673A\u6267\u884C\u4EE5\u4E0B\u547D\u4EE4\uFF1A",
  "install.run": "\u7ACB\u5373\u6267\u884C",
  "install.back": "\u53D6\u6D88",
  "install.cancel": "\u505C\u6B62",
  "install.job": "\u6B63\u5728\u5B89\u88C5\uFF1A{label}",
  "install.step": "\u7B2C {step}/{steps} \u6B65",
  "install.state.running": "\u8FDB\u884C\u4E2D",
  "install.state.succeeded": "\u5DF2\u5B8C\u6210",
  "install.state.failed": "\u5931\u8D25",
  "install.state.cancelled": "\u5DF2\u505C\u6B62",
  "card.kicadMissing": "KiCad \u672A\u5B89\u88C5\u6216\u7248\u672C\u8FC7\u4F4E\uFF0C\u65E0\u6CD5\u8FD0\u884C\u6B64\u5DE5\u5177\u3002",
  "common.default": "\u9ED8\u8BA4",
  "common.on": "\u5F00",
  "common.off": "\u5173"
};
function translate(t, key, vars = {}) {
  const fromHost = t?.(key, vars);
  if (fromHost && fromHost !== key) return fromHost;
  return en[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

// src/client/styles.ts
var CSS = `
.dshk-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px}
.dshk-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}
.dshk-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 8px;font:inherit;cursor:pointer;line-height:20px}
.dshk-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshk-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dshk-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 4px;font:inherit}
.dshk-spacer{flex:1}
.dshk-segmented{display:inline-flex;gap:0}
.dshk-segmented .dshk-btn{border-radius:0}
.dshk-segmented .dshk-btn:first-child{border-radius:6px 0 0 6px}
.dshk-segmented .dshk-btn:last-child{border-radius:0 6px 6px 0;border-left:0}
.dshk-segmented .dshk-btn[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);font-weight:600}
.dshk-kicanvas{cursor:default}
.dshk-live{position:absolute;left:8px;top:8px;z-index:2;display:flex;align-items:center;gap:6px;padding:2px 8px;border-radius:10px;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);pointer-events:none}
.dshk-live-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dshk-live-busy{background:var(--dsw-alias-state-warn-primary);animation:dshk-pulse 1s ease-in-out infinite}
.dshk-live-stale{color:var(--dsw-alias-state-warn-label)}
@keyframes dshk-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.dshk-overlay{position:absolute;left:0;top:0;z-index:1}
.dshk-note{padding:6px 10px;color:var(--dsw-alias-label-secondary)}
.dshk-warn{padding:4px 10px;color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}
.dshk-error{padding:6px 10px;color:var(--dsw-alias-state-error-primary)}
.dshk-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);cursor:grab;touch-action:none}
.dshk-stage:active{cursor:grabbing}
.dshk-stage img{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;background:#fff;box-shadow:0 0 0 1px var(--dsw-alias-border-l1)}
.dshk-card{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);margin:4px 0;overflow:hidden}
.dshk-card-head{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshk-card-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshk-badge{border-radius:10px;padding:0 8px;font-size:12px;line-height:18px}
.dshk-pass{color:var(--dsw-alias-state-success-primary);border:1px solid var(--dsw-alias-state-success-primary)}
.dshk-fail{color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary)}
.dshk-muted{color:var(--dsw-alias-label-tertiary)}
.dshk-list{margin:0;padding:4px 10px 8px 10px;list-style:none;border-top:1px solid var(--dsw-alias-border-l1)}
.dshk-list li{padding:3px 0;line-height:18px}
.dshk-sev-error{color:var(--dsw-alias-state-error-primary)}
.dshk-sev-warning{color:var(--dsw-alias-state-warn-primary)}
.dshk-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
.dshk-form{display:flex;flex-direction:column;gap:12px;padding:4px 0}
.dshk-field{display:flex;flex-direction:column;gap:4px}
.dshk-field input[type=text]{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 8px;font:inherit}
.dshk-check{display:flex;align-items:center;gap:8px}
.dshk-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dshk-sev-ok{color:var(--dsw-alias-state-success-primary)}
.dshk-doctor{display:flex;flex-direction:column;gap:6px;padding:6px 0;color:var(--dsw-alias-label-primary)}
.dshk-notice-open{padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:60%;overflow:auto}
.dshk-doctor .dshk-list{border-top:0;padding:0 2px}
.dshk-install{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:6px}
.dshk-option{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px}
.dshk-cmd{margin:0;padding:4px 6px;border-radius:4px;background:var(--dsw-alias-bg-base);white-space:pre-wrap;word-break:break-all;user-select:all}
.dshk-confirm{display:flex;flex-direction:column;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}
.dshk-primary{font-weight:600;border-color:var(--dsw-alias-state-warn-primary)}
.dshk-log{margin:0;max-height:220px;overflow:auto;padding:4px 6px;border-radius:4px;background:var(--dsw-alias-bg-base);white-space:pre-wrap}
a.dshk-btn{text-decoration:none}
`;

// src/client/Doctor.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function readReport(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const r40 = value;
  if (typeof r40.status !== "string" || typeof r40.summary !== "string" || !Array.isArray(r40.checks)) return void 0;
  return { ...r40, install: Array.isArray(r40.install) ? r40.install : [] };
}
var KICAD_MISSING = /KiCad is not installed|kicad-cli was not found|kicad-cli could not be started|need KiCad \d+ or newer|executable "[^"]*" was not found|needs Python 3\.10/;
async function pickSession(remote, preferred) {
  if (preferred) return preferred;
  const listed = await remote.session?.list({});
  if (!listed?.ok) return void 0;
  const rows = listed.value.items.filter((s) => s.origin !== "subagent");
  rows.sort((a, b) => Number(b.agentAvailable) - Number(a.agentAvailable) || b.updatedAt - a.updatedAt);
  return rows[0]?.sessionId;
}
function createRunner(remote, sessionId) {
  let session;
  return async (line) => {
    session ??= pickSession(remote, sessionId);
    const id = await session;
    if (!id) {
      session = void 0;
      throw new NoSessionError();
    }
    const result = await remote.commands.execute(id, line, []);
    if (!result.ok) throw new Error(result.error.message);
    const outcome = result.value?.result;
    if (!outcome) throw new Error(`${line.split(" ")[0]} is not available (is the KiCad plugin enabled?)`);
    if (outcome.kind === "error") throw new Error(outcome.text);
    return outcome.text ?? "";
  };
}
var NoSessionError = class extends Error {
  constructor() {
    super("no session");
    this.name = "NoSessionError";
  }
};
var cache = /* @__PURE__ */ new Map();
var TTL = 5 * 6e4;
function cachedDoctor(key, run, force = false) {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.report;
  const report = run("/kicad-doctor --json").then((text) => {
    const parsed = readReport(JSON.parse(text));
    if (!parsed) throw new Error("unexpected /kicad-doctor output");
    return parsed;
  });
  cache.set(key, { at: Date.now(), report });
  report.catch(() => cache.delete(key));
  return report;
}
function forgetDoctor() {
  cache.clear();
}
var STATUS_KEY = {
  ok: "doctor.status.ok",
  missing: "doctor.status.missing",
  outdated: "doctor.status.outdated",
  error: "doctor.status.error",
  unavailable: "doctor.status.unavailable"
};
var MARK = { ok: "\u2713", warn: "!", error: "\u2717" };
function StatusBadge(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dshk-badge ${props.report.status === "ok" ? "dshk-pass" : "dshk-fail"}`, "data-kicad-doctor-status": props.report.status, children: props.tr(STATUS_KEY[props.report.status]) });
}
function CheckList(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dshk-list", "data-kicad-checks": true, children: props.report.checks.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { "data-kicad-check": c.id, "data-status": c.status, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dshk-code dshk-sev-${c.status === "ok" ? "ok" : c.status === "warn" ? "warning" : "error"}`, children: MARK[c.status] }),
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: c.label }),
    ": ",
    c.summary,
    c.fix && c.status !== "ok" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-muted", children: [
      props.tr("doctor.fix"),
      ": ",
      c.fix
    ] })
  ] }, c.id)) });
}
function DoctorPanel(props) {
  const tr2 = (key2, vars) => translate(props.t, key2, vars);
  const runner = (0, import_react.useRef)(void 0);
  runner.current ??= createRunner(props.remote, props.sessionId);
  const key = props.sessionId ?? "*";
  const [report, setReport] = (0, import_react.useState)(props.initial);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [noSession, setNoSession] = (0, import_react.useState)(false);
  const [job, setJob] = (0, import_react.useState)(void 0);
  const [confirming, setConfirming] = (0, import_react.useState)(void 0);
  const [copied, setCopied] = (0, import_react.useState)(void 0);
  const live = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => () => {
    live.current = false;
  }, []);
  const accept = (next) => {
    setReport(next);
    props.onReport?.(next);
  };
  const fail = (cause) => {
    if (cause instanceof NoSessionError) setNoSession(true);
    else setError(String(cause?.message ?? cause));
  };
  const check = async (force) => {
    setBusy(true);
    setError(void 0);
    try {
      const next = await cachedDoctor(key, runner.current, force);
      if (!live.current) return;
      setNoSession(false);
      accept(next);
      const status = JSON.parse(await runner.current("/kicad-install status --json"));
      if (live.current && status.job && status.job.phase !== "done") setJob(status.job);
    } catch (cause) {
      if (live.current) fail(cause);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  (0, import_react.useEffect)(() => {
    if (!props.initial) void check(props.fresh === true);
  }, []);
  const running = job !== void 0 && job.phase !== "done";
  (0, import_react.useEffect)(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void runner.current("/kicad-install status --json").then((text) => {
        if (!live.current) return;
        const next = JSON.parse(text).job;
        if (!next) return;
        setJob(next);
        if (next.phase === "done") {
          forgetDoctor();
          const fresh = readReport(next.doctor);
          if (fresh) {
            cache.set(key, { at: Date.now(), report: Promise.resolve(fresh) });
            accept(fresh);
          }
        }
      }, (cause) => live.current && fail(cause));
    }, props.pollMs ?? 1e3);
    return () => clearInterval(timer);
  }, [running]);
  const start = async (option) => {
    setConfirming(void 0);
    setError(void 0);
    try {
      const text = await runner.current(`/kicad-install ${option.id} --yes --json`);
      if (live.current) setJob(JSON.parse(text).job);
    } catch (cause) {
      if (live.current) fail(cause);
    }
  };
  const cancel = async () => {
    try {
      await runner.current("/kicad-install cancel --json");
    } catch (cause) {
      fail(cause);
    }
  };
  const copy = (option) => {
    void navigator.clipboard?.writeText(option.command).then(() => setCopied(option.id), () => setCopied(void 0));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-doctor", "data-kicad-doctor": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-check", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tr2("doctor.title") }),
      report && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBadge, { report, tr: tr2 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", disabled: busy || running, onClick: () => void check(true), "data-kicad-action": "recheck", children: busy ? tr2("doctor.checking") : tr2("doctor.recheck") })
    ] }),
    noSession && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-note", "data-kicad-state": "no-session", children: tr2("doctor.noSession") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-error", "data-kicad-state": "error", children: error }),
    !report && busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-note", children: tr2("doctor.checking") }),
    report && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-hint", "data-kicad-summary": true, children: report.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckList, { report, tr: tr2 })
    ] }),
    job && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-install-job", "data-kicad-job": job.state, "data-kicad-job-phase": job.phase, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tr2("install.job", { label: job.label }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshk-muted", children: [
          tr2(`install.state.${job.state}`),
          job.phase === "checking" ? ` \xB7 ${tr2("doctor.checking")}` : "",
          " \xB7 ",
          tr2("install.step", { step: job.step, steps: job.steps })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-spacer" }),
        job.state === "running" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => void cancel(), "data-kicad-action": "cancel-install", children: tr2("install.cancel") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshk-log dshk-code", "data-kicad-log": true, children: job.log.slice(-40).join("\n") }),
      job.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-error", children: job.error })
    ] }),
    report && report.install.length > 0 && !running && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-install", "data-kicad-install": true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tr2("install.title") }),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-hint", children: tr2("install.intro") })
      ] }),
      report.install.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-option", "data-kicad-option": option.id, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: option.label }),
          option.recommended && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-badge dshk-pass", children: tr2("install.recommended") }),
          option.needs_root && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-badge dshk-muted", children: tr2("install.needsRoot") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-spacer" }),
          option.runnable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => setConfirming(option), "data-kicad-action": "install", children: tr2("install.install") }),
          !option.runnable && option.command && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => copy(option), "data-kicad-action": "copy", children: copied === option.id ? tr2("install.copied") : tr2("install.copy") }),
          option.url && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "dshk-btn", href: option.url, target: "_blank", rel: "noreferrer", "data-kicad-action": "download", children: tr2("install.download") })
        ] }),
        option.command && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshk-cmd dshk-code", children: option.command }),
        option.needs_root && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-hint", children: tr2("install.rootHint") }),
        option.note && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshk-hint", children: option.note }),
        confirming?.id === option.id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-confirm", role: "alertdialog", "data-kicad-confirm": option.id, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: tr2("install.confirm") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshk-cmd dshk-code", children: option.command }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-check", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn dshk-primary", onClick: () => void start(option), "data-kicad-action": "confirm-install", children: tr2("install.run") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => setConfirming(void 0), "data-kicad-action": "cancel-confirm", children: tr2("install.back") })
          ] })
        ] })
      ] }, option.id))
    ] })
  ] });
}
function KiCadNotice(props) {
  const tr2 = (key, vars) => translate(props.t, key, vars);
  const [report, setReport] = (0, import_react.useState)(void 0);
  const [open, setOpen] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    let live = true;
    void cachedDoctor(props.sessionId, createRunner(props.remote, props.sessionId), props.force).then((r40) => live && setReport(r40), () => void 0);
    return () => {
      live = false;
    };
  }, [props.sessionId, props.force]);
  const update = (next) => {
    if (next.status === "ok" && report?.status !== "ok") props.onReady?.();
    setReport(next);
  };
  if (!report || report.status === "ok" && !open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: open ? "dshk-notice-open" : "dshk-warn", "data-kicad-notice": report.status, children: [
    !open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshk-check", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: report.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshk-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => setOpen(true), "data-kicad-action": "open-doctor", children: report.install.length ? tr2("install.openButton") : tr2("doctor.open") })
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DoctorPanel, { remote: props.remote, sessionId: props.sessionId, t: props.t, initial: report, onReport: update })
  ] });
}

// src/client/follow.ts
var import_react2 = require("react");
var FOLLOW_KEY = "dsh-kicad:follow-agent";
var LIVE_WINDOW_MS = 12e4;
function followEnabled() {
  try {
    return globalThis.localStorage?.getItem(FOLLOW_KEY) !== "off";
  } catch {
    return true;
  }
}
function setFollowEnabled(on2) {
  try {
    globalThis.localStorage?.setItem(FOLLOW_KEY, on2 ? "on" : "off");
  } catch {
  }
}
var opened = /* @__PURE__ */ new Set();
function shouldFollow(input) {
  if (!input.path || !isDesignFile(input.path)) return false;
  if (basename(input.path).startsWith(".")) return false;
  if (input.time === void 0 || input.now - input.time > LIVE_WINDOW_MS) return false;
  if (input.isError) return false;
  if (input.toolName === "kicad_create_schematic") return input.phase === "result";
  return input.phase === "start" || input.phase === "result";
}
function useFollowAgent(props, path) {
  const { toolName, phase, block, openFile } = props;
  (0, import_react2.useEffect)(() => {
    if (!openFile || !followEnabled()) return;
    if (!shouldFollow({ toolName, phase, time: block.time, isError: block.isError, path, now: Date.now() })) return;
    const key = `${props.cwd ?? ""}::${path}`;
    if (opened.has(key)) return;
    opened.add(key);
    openFile(path);
  }, [toolName, phase, block.time, block.isError, path, openFile]);
}

// src/client/Cards.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function readCheckMeta(meta) {
  if (typeof meta !== "object" || meta === null) return void 0;
  const m = meta;
  if (m.kind !== "erc" && m.kind !== "drc" || typeof m.passed !== "boolean" || typeof m.counts !== "object" || !Array.isArray(m.violations)) return void 0;
  return m;
}
function argPath(props) {
  try {
    const live = props.block.args?.text?.("path");
    if (typeof live === "string" && live) return live;
    const raw = props.block.call?.argsRaw ?? props.block.argsRaw;
    const args = raw ? JSON.parse(raw) : void 0;
    return typeof args?.path === "string" ? args.path : "";
  } catch {
    return "";
  }
}
function resultText(props) {
  return (props.block.content ?? []).map((b) => b.text ?? "").join("\n");
}
function CheckCard(props) {
  const tr2 = (key, vars) => translate(props.t, key, vars);
  const [open, setOpen] = (0, import_react3.useState)(false);
  const kind = props.toolName === "kicad_drc" ? "drc" : "erc";
  const label = tr2(kind === "drc" ? "card.drc" : "card.erc");
  const file = basename(argPath(props));
  if (props.phase !== "result") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card-head dshk-muted", children: [
        tr2("card.running", { kind: label }),
        " ",
        file
      ] })
    ] });
  }
  const meta = readCheckMeta(props.block.meta);
  if (props.block.isError || !meta) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "check-text", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card-head", children: [
        label,
        " ",
        file
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dshk-list dshk-code", style: { whiteSpace: "pre-wrap" }, children: resultText(props) })
    ] });
  }
  const hidden = meta.counts.total - meta.violations.length;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": kind, "data-kicad-passed": meta.passed, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dshk-card-head", "aria-expanded": open, onClick: () => setOpen((o4) => !o4), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dshk-badge ${meta.passed ? "dshk-pass" : "dshk-fail"}`, children: tr2(meta.passed ? "card.passed" : "card.failed") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted", children: tr2("card.counts", { errors: meta.counts.error, warnings: meta.counts.warning }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted dshk-code", children: file })
    ] }),
    open && meta.violations.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("ul", { className: "dshk-list", children: [
      meta.violations.map((v4, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dshk-code dshk-sev-${v4.severity}`, children: v4.severity }),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-code", children: v4.type }),
        " \u2014 ",
        v4.description,
        v4.items.map((item, j) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-muted", children: [
          item.description,
          item.pos ? ` @ (${round(item.pos.x)}, ${round(item.pos.y)}) mm` : ""
        ] }, j))
      ] }, i)),
      hidden > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { className: "dshk-muted", children: tr2("card.more", { count: hidden }) })
    ] })
  ] });
}
function EditCard(props) {
  const tr2 = (key, vars) => translate(props.t, key, vars);
  const [open, setOpen] = (0, import_react3.useState)(false);
  const path = argPath(props);
  useFollowAgent(props, path);
  if (props.phase !== "result") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshk-card-head dshk-muted", children: tr2("card.editing", { file: basename(path) }) })
    ] });
  }
  const text = resultText(props);
  const meta = props.block.meta;
  const changes = Array.isArray(meta?.changes) ? meta.changes.filter((c) => typeof c === "string") : [];
  const erc = /^Automatic (ERC by KiCad[^\n]*)$/m.exec(text)?.[1];
  const passed = erc ? /: PASSED/.test(erc) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "edit", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dshk-card-head", "aria-expanded": open, onClick: () => setOpen((o4) => !o4), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: tr2("card.edit") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted", children: props.block.isError ? text.split("\n")[0] : tr2("card.changes", { count: changes.length }) }),
      passed !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `dshk-badge ${passed ? "dshk-pass" : "dshk-fail"}`, title: erc, children: [
        tr2("card.autoErc"),
        " \xB7 ",
        tr2(passed ? "card.passed" : "card.failed")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-spacer" }),
      path && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted dshk-code", role: "link", onClick: (e) => {
        e.stopPropagation();
        props.openFile?.(path);
      }, children: basename(path) })
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("ul", { className: "dshk-list", children: [
      changes.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { className: "dshk-code", children: c }, i)),
      erc && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { className: "dshk-code", style: { whiteSpace: "pre-wrap" }, children: text.slice(text.indexOf("Automatic ERC")) })
    ] })
  ] });
}
function createDoctorCard(remote) {
  return function DoctorCard(props) {
    const tr2 = (key, vars) => translate(props.t, key, vars);
    const meta = readReport(props.block.meta);
    const [open, setOpen] = (0, import_react3.useState)(false);
    const [installing, setInstalling] = (0, import_react3.useState)(false);
    if (props.phase !== "result") {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshk-card-head dshk-muted", children: tr2("doctor.checking") })
      ] });
    }
    if (!meta) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "doctor-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshk-card-head", children: tr2("doctor.card") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dshk-list dshk-code", style: { whiteSpace: "pre-wrap" }, children: resultText(props) })
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "doctor", "data-kicad-doctor-status": meta.status, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dshk-card-head", "aria-expanded": open, onClick: () => setOpen((o4) => !o4), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: tr2("doctor.card") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StatusBadge, { report: meta, tr: tr2 }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted", children: meta.summary })
      ] }),
      open && !installing && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckList, { report: meta, tr: tr2 }),
      meta.install.length > 0 && !installing && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshk-list", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => setInstalling(true), "data-kicad-action": "open-doctor", children: tr2("install.openButton") }) }),
      installing && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshk-list", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DoctorPanel, { remote, sessionId: props.sessionId, t: props.t, initial: meta }) })
    ] });
  };
}
function withKiCadHint(remote, Card) {
  return function KiCadCard(props) {
    const tr2 = (key, vars) => translate(props.t, key, vars);
    const [open, setOpen] = (0, import_react3.useState)(false);
    const missing = props.phase === "result" && props.block.isError === true && KICAD_MISSING.test(resultText(props));
    if (!missing) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { ...props });
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "data-kicad-missing": true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { ...props }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-warn", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: tr2("card.kicadMissing") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-spacer" }),
          !open && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => setOpen(true), "data-kicad-action": "open-doctor", children: tr2("install.openButton") })
        ] }),
        open && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DoctorPanel, { remote, sessionId: props.sessionId, t: props.t })
      ] })
    ] });
  };
}
function round(n) {
  return Math.round(n * 100) / 100;
}
function CreateCard(props) {
  const tr2 = (key, vars) => translate(props.t, key, vars);
  const path = argPath(props);
  useFollowAgent(props, path);
  const done = props.phase === "result" && !props.block.isError;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "create", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: tr2("card.create") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted", children: props.phase === "result" ? done ? tr2("card.created", { file: basename(path) }) : resultText(props).split("\n")[0] : tr2("card.creating", { file: basename(path) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-spacer" }),
      done && path && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted dshk-code", role: "link", onClick: () => props.openFile?.(path), children: basename(path) })
    ] })
  ] });
}
var KICAD_COMMANDS = ["kicad-doctor", "kicad-install", "kicad-render"];
function CommandRow(props) {
  const tr2 = (key, vars) => translate(props.t, key, vars);
  const [open, setOpen] = (0, import_react3.useState)(false);
  const { name, args, outcome } = props.node;
  if (/(^|\s)--json(\s|$)/.test(args ?? "")) return null;
  let text = outcome?.text ?? "";
  if (name === "kicad-render" && outcome?.kind === "success") {
    try {
      const out = JSON.parse(text);
      text = tr2("card.rendered", { file: basename(out.path ?? ""), count: out.svg?.length ?? 0 });
    } catch {
    }
  }
  const status = outcome === null ? tr2("card.commandRunning") : outcome.kind === "error" ? tr2("card.commandFailed") : "";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshk-card", "data-kicad-card": "command", "data-kicad-command": name ?? "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "dshk-card-head", "aria-expanded": open, onClick: () => setOpen((o4) => !o4), disabled: !text, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
        "/",
        name
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-muted dshk-code", children: (args ?? "").trim() }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshk-spacer" }),
      status && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: outcome?.kind === "error" ? "dshk-badge dshk-fail" : "dshk-muted", children: status })
    ] }),
    open && text && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dshk-list dshk-code", style: { whiteSpace: "pre-wrap" }, children: text })
  ] });
}

// src/client/Settings.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var BRIDGE_FIELDS = [
  { key: "kicadCli", label: "settings.kicadCli", hint: "settings.kicadCliHint", kind: "text" },
  { key: "python", label: "settings.python", hint: "settings.pythonHint", kind: "text" }
];
var POLICY_FIELDS = [
  { key: "approval", label: "settings.approval", kind: "check", on: "ask", off: "follow" },
  { key: "autoErc", label: "settings.autoErc", kind: "check" },
  { key: "autoDrc", label: "settings.autoDrc", kind: "check" },
  { key: "autoRender", label: "settings.autoRender", kind: "check" }
];
function toOps(fields, draft, current) {
  const ops = [];
  for (const f of fields) {
    const next = draft[f.key];
    if (next === current[f.key]) continue;
    if (f.kind === "text" && (next === "" || next === void 0)) ops.push({ op: "unset", path: [f.key] });
    else ops.push({ op: "set", path: [f.key], value: next });
  }
  return ops;
}
function createSettingsCard(fields, summary, extra) {
  return function KiCadSettings(props) {
    const tr2 = (key, vars) => translate(props.t, key, vars);
    const value = props.form?.state.value ?? {};
    const [draft, setDraft] = (0, import_react4.useState)(value);
    const [status, setStatus] = (0, import_react4.useState)("idle");
    (0, import_react4.useEffect)(() => setDraft(props.form?.state.value ?? {}), [props.form?.state.revision]);
    if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: summary(value, tr2) });
    if (!props.form || props.form.state.status !== "ready") return null;
    const form = props.form;
    const ops = toOps(fields, draft, value);
    const save = async () => {
      setStatus("saving");
      const ok = await form.mutate(ops, form.state.revision).catch(() => false);
      setStatus(ok ? "saved" : "rejected");
    };
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshk-form", "data-kicad-settings": true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: CSS }),
      fields.map((f) => f.kind === "text" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dshk-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: tr2(f.label) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "text",
            value: String(draft[f.key] ?? ""),
            disabled: !form.state.writable,
            onChange: (e) => {
              setStatus("idle");
              setDraft((d4) => ({ ...d4, [f.key]: e.target.value }));
            }
          }
        ),
        f.hint && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshk-hint", children: tr2(f.hint) })
      ] }, f.key) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dshk-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "checkbox",
            role: "switch",
            disabled: !form.state.writable,
            checked: "on" in f && f.on !== void 0 ? draft[f.key] === f.on : draft[f.key] === true,
            "aria-checked": "on" in f && f.on !== void 0 ? draft[f.key] === f.on : draft[f.key] === true,
            onChange: (e) => {
              setStatus("idle");
              setDraft((d4) => ({ ...d4, [f.key]: "on" in f && f.on !== void 0 ? e.target.checked ? f.on : f.off : e.target.checked }));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: tr2(f.label) })
      ] }, f.key)),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshk-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dshk-btn", disabled: ops.length === 0 || status === "saving" || !form.state.writable, onClick: () => void save(), children: tr2("settings.save") }),
        status === "saved" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshk-hint", children: tr2("settings.saved") }),
        status === "rejected" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshk-error", children: tr2("settings.rejected") })
      ] }),
      extra?.(props)
    ] });
  };
}
var bridgeSummary = (v4, tr2) => tr2("settings.summaryBridge", { cli: String(v4.kicadCli || tr2("common.default")) });
function createBridgeSettings(remote) {
  return createSettingsCard(BRIDGE_FIELDS, bridgeSummary, (props) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DoctorPanel, { remote, t: props.t, fresh: true }, props.form?.state.revision ?? 0));
}
var BridgeSettings = createSettingsCard(BRIDGE_FIELDS, bridgeSummary);
var PolicySettings = createSettingsCard(POLICY_FIELDS, (v4, tr2) => tr2("settings.summaryPolicy", {
  approval: v4.approval === "ask" ? tr2("common.on") : tr2("common.off"),
  erc: v4.autoErc === false ? tr2("common.off") : tr2("common.on"),
  drc: v4.autoDrc === false ? tr2("common.off") : tr2("common.on")
}));

// src/client/Viewer.tsx
var import_react6 = require("react");

// src/client/InteractiveView.tsx
var import_react5 = require("react");

// src/client/kicanvas.ts
var loading;
function loadKiCanvas() {
  loading ??= Promise.resolve().then(() => (init_kicanvas(), kicanvas_exports)).then(() => void 0);
  return loading;
}
function createEmbed(files, theme) {
  const embed = document.createElement("kicanvas-embed");
  embed.setAttribute("controls", "full");
  embed.setAttribute("theme", theme);
  embed.style.display = "block";
  embed.style.width = "100%";
  embed.style.height = "100%";
  for (const file of files) {
    const source = document.createElement("kicanvas-source");
    source.setAttribute("name", file.name);
    source.textContent = file.text;
    embed.append(source);
  }
  return embed;
}
var MAX_SHEETS = 64;
var MAX_BYTES = 16 * 1024 * 1024;
function pickFiles(designName, entries) {
  const files = entries.filter((e) => e.type === "file" && (e.size ?? 0) <= MAX_BYTES).map((e) => e.name);
  const project = files.filter((n) => n.endsWith(".kicad_pro"));
  if (designName.endsWith(".kicad_pcb")) return [designName, ...project];
  const sheets = files.filter((n) => n.endsWith(".kicad_sch") && n !== designName).sort().slice(0, MAX_SHEETS - 1);
  return [designName, ...sheets, ...project];
}

// src/client/InteractiveView.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var LOAD_TIMEOUT_MS = 2e4;
async function readDesignFiles(remote, sessionId, designPath, signal) {
  const dir = dirname(designPath);
  const listing = await remote.workspaceFiles.list(sessionId, dir || ".", signal);
  if (!listing.ok) throw new Error(listing.error.message);
  const decoder = new TextDecoder();
  const files = [];
  for (const name of pickFiles(basename(designPath), listing.value.entries)) {
    const read = await remote.workspaceFiles.readBytes(sessionId, dir ? `${dir}/${name}` : name, {}, signal);
    if (!read.ok) {
      if (name === basename(designPath)) throw new Error(read.error.message);
      continue;
    }
    files.push({ name, text: decoder.decode(read.value.data) });
  }
  return files;
}
function waitLoaded(embed, signal) {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (signal.aborted) return resolve(false);
      if (embed.hasAttribute("loaded")) return resolve(true);
      if (Date.now() - started > LOAD_TIMEOUT_MS || !embed.hasAttribute("loading") && Date.now() - started > 3e3) return resolve(false);
      setTimeout(poll, 200);
    };
    poll();
  });
}
function InteractiveView(props) {
  const host = (0, import_react5.useRef)(null);
  const shown = (0, import_react5.useRef)(null);
  const [status, setStatus] = (0, import_react5.useState)("loading");
  const [updatedAt, setUpdatedAt] = (0, import_react5.useState)(void 0);
  const [reloads, setReloads] = (0, import_react5.useState)(0);
  const [stale, setStale] = (0, import_react5.useState)(false);
  const { remote, sessionId, designPath, version, theme, tr: tr2, onFailed } = props;
  (0, import_react5.useEffect)(() => () => {
    shown.current = null;
    host.current?.replaceChildren();
  }, [sessionId, designPath]);
  (0, import_react5.useEffect)(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let staged;
    const first = shown.current === null;
    setStatus(first ? "loading" : "updating");
    void (async () => {
      const files = await readDesignFiles(remote, sessionId, designPath, signal);
      await loadKiCanvas();
      if (signal.aborted || !host.current) return;
      const embed = createEmbed(files, theme);
      embed.style.position = "absolute";
      embed.style.inset = "0";
      embed.style.visibility = "hidden";
      staged = embed;
      host.current.append(embed);
      const ok = await waitLoaded(embed, signal);
      if (signal.aborted) return;
      if (!ok) {
        embed.remove();
        if (first) {
          setStatus("failed");
          onFailed(tr2("viewer.kicanvasFailed"));
        } else {
          setStatus("ready");
          setStale(true);
        }
        return;
      }
      const camera = shown.current?.dsh_get_camera?.();
      if (camera) embed.dsh_set_camera?.(camera);
      embed.style.visibility = "visible";
      shown.current?.remove();
      shown.current = embed;
      staged = void 0;
      setStale(false);
      setStatus("ready");
      setUpdatedAt(Date.now());
      if (!first) setReloads((n) => n + 1);
    })().catch((cause) => {
      if (signal.aborted) return;
      if (first) {
        setStatus("failed");
        onFailed(cause instanceof Error ? cause.message : String(cause));
      } else {
        setStatus("ready");
        setStale(true);
      }
    });
    return () => {
      controller.abort();
      staged?.remove();
    };
  }, [sessionId, designPath, version, theme]);
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString() : "";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dshk-stage dshk-kicanvas", "data-kicad-state": `kicanvas-${status}`, "data-kicad-reloads": reloads, children: [
    status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dshk-note dshk-overlay", children: tr2("viewer.loading") }),
    (status === "ready" || status === "updating") && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dshk-live", "data-kicad-live": status, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: `dshk-live-dot${status === "updating" ? " dshk-live-busy" : ""}` }),
      status === "updating" ? tr2("viewer.updating") : tr2("viewer.liveUpdated", { time }),
      stale && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dshk-live-stale", children: [
        " \xB7 ",
        tr2("viewer.liveStale")
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: host, style: { position: "absolute", inset: 0 } })
  ] });
}

// src/client/Viewer.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var MODE_KEY = "dsh-kicad:viewer-mode";
var THEME_KEY = "dsh-kicad:viewer-theme";
function stored(key, allowed, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function remember(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
  }
}
var SELF_RENDER_DELAY_MS = 1500;
function rendersItself(path) {
  return /\.kicad_pcb$/i.test(path);
}
function createViewer(remote) {
  const SvgView = createSvgView(remote);
  return function KiCadViewer(props) {
    const tr2 = (key, vars) => translate(props.t, key, vars);
    const [mode, setMode] = (0, import_react6.useState)(() => stored(MODE_KEY, ["interactive", "svg"], "interactive"));
    const [follow, setFollow] = (0, import_react6.useState)(followEnabled);
    const [theme, setTheme] = (0, import_react6.useState)(() => stored(THEME_KEY, ["kicad", "witchhazel"], "kicad"));
    const [fallback, setFallback] = (0, import_react6.useState)(void 0);
    const { tab } = props.useTabInfo();
    const file = (0, import_react6.useMemo)(() => parseFileAddress(tab.contentId ?? ""), [tab.contentId]);
    const sourceVersion = props.useResource?.(tab.contentId ?? "none:")?.value?.version;
    const choose = (next) => {
      setFallback(void 0);
      setMode(next);
      remember(MODE_KEY, next);
    };
    const effective = mode === "interactive" && fallback === void 0 ? "interactive" : "svg";
    const modeSwitch = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dshk-segmented", role: "group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", "aria-pressed": effective === "interactive", "data-kicad-mode": "interactive", onClick: () => choose("interactive"), children: tr2("viewer.interactive") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", "aria-pressed": effective === "svg", "data-kicad-mode": "svg", onClick: () => choose("svg"), children: tr2("viewer.svg") })
    ] });
    const followToggle = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "dshk-check dshk-follow", title: tr2("viewer.followHint"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: follow, "data-kicad-follow": true, onChange: (e) => {
        setFollow(e.target.checked);
        setFollowEnabled(e.target.checked);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: tr2("viewer.follow") })
    ] });
    if (effective === "svg" || file?.scope !== "session" || !file.sessionId) {
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SvgView, { ...props, modeSwitch: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        modeSwitch,
        followToggle
      ] }), notice: fallback ? tr2("viewer.fellBack", { message: fallback }) : void 0 });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dshk-root", "data-kicad-viewer": file.path, "data-kicad-mode-active": "interactive", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dshk-bar", children: [
        modeSwitch,
        followToggle,
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dshk-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
          tr2("viewer.theme"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { className: "dshk-select", value: theme, onChange: (e) => {
            setTheme(e.target.value);
            remember(THEME_KEY, e.target.value);
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "kicad", children: "KiCad" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "witchhazel", children: "Witch Hazel" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(KiCadNotice, { remote, sessionId: file.sessionId, t: props.t }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(InteractiveView, { remote, sessionId: file.sessionId, designPath: file.path, version: sourceVersion, theme, tr: tr2, onFailed: setFallback })
    ] });
  };
}
function createSvgView(remote) {
  return function KiCadSvgView(props) {
    const tr2 = (key, vars) => translate(props.t, key, vars);
    const { tab } = props.useTabInfo();
    const file = (0, import_react6.useMemo)(() => parseFileAddress(tab.contentId ?? ""), [tab.contentId]);
    const sessionId = file?.scope === "session" ? file.sessionId : void 0;
    const designPath = file?.path ?? "";
    const dir = renderDir(designPath);
    const [pages, setPages] = (0, import_react6.useState)(void 0);
    const [pageIndex, setPageIndex] = (0, import_react6.useState)(0);
    const [listing, setListing] = (0, import_react6.useState)(0);
    const [svgUrl, setSvgUrl] = (0, import_react6.useState)(void 0);
    const [error, setError] = (0, import_react6.useState)(void 0);
    const [rendering, setRendering] = (0, import_react6.useState)(false);
    const [kicadFailed, setKicadFailed] = (0, import_react6.useState)(false);
    const [view, setView] = (0, import_react6.useState)({ scale: 1, x: 0, y: 0 });
    const stageRef = (0, import_react6.useRef)(null);
    const imgRef = (0, import_react6.useRef)(null);
    const drag = (0, import_react6.useRef)(void 0);
    const page = pages?.[Math.min(pageIndex, pages.length - 1)];
    const pagePath = page ? `${dir}/${page}` : void 0;
    const svgState = props.useResource?.(sessionId && pagePath ? sessionFileAddress(sessionId, pagePath) : "none:");
    const sourceState = props.useResource?.(tab.contentId ?? "none:");
    const svgVersion = svgState?.value?.version;
    const sourceVersion = sourceState?.value?.version;
    const [sourceAtLoad, setSourceAtLoad] = (0, import_react6.useState)(void 0);
    const sourceAtOpen = (0, import_react6.useRef)(void 0);
    const renderedFrom = (0, import_react6.useRef)(void 0);
    const selfRendered = (0, import_react6.useRef)(void 0);
    (0, import_react6.useEffect)(() => {
      if (!sessionId) return;
      let live = true;
      void remote.workspaceFiles.list(sessionId, dir).then((result) => {
        if (!live) return;
        setPages(result.ok ? orderPages(designPath, result.value.entries.filter((e) => e.type === "file").map((e) => e.name)) : []);
      }, () => live && setPages([]));
      return () => {
        live = false;
      };
    }, [sessionId, dir, designPath, listing, svgVersion === void 0]);
    (0, import_react6.useEffect)(() => {
      if (!sessionId || !pagePath) {
        setSvgUrl(void 0);
        return;
      }
      const controller = new AbortController();
      let url;
      void remote.workspaceFiles.readBytes(sessionId, pagePath, {}, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setError(tr2("viewer.failed", { message: result.error.message }));
          return;
        }
        url = URL.createObjectURL(new Blob([result.value.data], { type: "image/svg+xml" }));
        setSourceAtLoad(renderedFrom.current ?? sourceVersion);
        renderedFrom.current = void 0;
        setError(void 0);
        setSvgUrl(url);
      }, (cause) => !controller.signal.aborted && setError(tr2("viewer.failed", { message: String(cause) })));
      return () => {
        controller.abort();
        if (url) URL.revokeObjectURL(url);
      };
    }, [sessionId, pagePath, svgVersion]);
    const fit = (0, import_react6.useCallback)(() => {
      const stage = stageRef.current;
      const img = imgRef.current;
      if (!stage || !img || !img.naturalWidth) return;
      const scale = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight) * 0.96 || 1;
      setView({ scale, x: (stage.clientWidth - img.naturalWidth * scale) / 2, y: (stage.clientHeight - img.naturalHeight * scale) / 2 });
    }, []);
    const zoom = (factor, cx, cy) => {
      const stage = stageRef.current;
      const px = cx ?? (stage ? stage.clientWidth / 2 : 0);
      const py = cy ?? (stage ? stage.clientHeight / 2 : 0);
      setView((v4) => {
        const scale = Math.min(40, Math.max(0.02, v4.scale * factor));
        const k4 = scale / v4.scale;
        return { scale, x: px - (px - v4.x) * k4, y: py - (py - v4.y) * k4 };
      });
    };
    const onWheel = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
    };
    const onPointerDown = (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    };
    const onPointerMove = (event) => {
      const d4 = drag.current;
      if (d4) setView((v4) => ({ ...v4, x: d4.vx + event.clientX - d4.x, y: d4.vy + event.clientY - d4.y }));
    };
    const onPointerUp = () => {
      drag.current = void 0;
    };
    const render = async (background = false) => {
      if (!sessionId) return;
      setRendering(true);
      setError(void 0);
      renderedFrom.current = sourceVersion;
      let failure;
      try {
        const result = await remote.commands.execute(sessionId, `/kicad-render ${designPath}${background ? " --json" : ""}`, []);
        if (!result.ok) failure = result.error.message;
        else if (result.value?.result.kind === "error") {
          failure = result.value.result.text;
          if (KICAD_MISSING.test(failure)) setKicadFailed(true);
        } else setListing((n) => n + 1);
      } catch (cause) {
        failure = String(cause);
      } finally {
        setRendering(false);
      }
      if (failure !== void 0) {
        renderedFrom.current = void 0;
        setError(tr2("viewer.renderFailed", { message: failure }));
      }
    };
    (0, import_react6.useEffect)(() => {
      if (sourceAtOpen.current?.path !== designPath) sourceAtOpen.current = { path: designPath, version: sourceVersion };
      else sourceAtOpen.current.version ??= sourceVersion;
    }, [designPath, sourceVersion]);
    (0, import_react6.useEffect)(() => {
      if (!sessionId || !rendersItself(designPath) || tab.visible === false || rendering || sourceVersion === void 0) return;
      const shown = svgUrl !== void 0 ? sourceAtLoad : sourceAtOpen.current?.version;
      if (shown === void 0 || shown === sourceVersion || selfRendered.current === sourceVersion) return;
      const timer = setTimeout(() => {
        selfRendered.current = sourceVersion;
        void render(true);
      }, SELF_RENDER_DELAY_MS);
      return () => clearTimeout(timer);
    }, [sessionId, designPath, sourceVersion, svgUrl, sourceAtLoad, rendering, tab.visible]);
    if (!sessionId) {
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dshk-root", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("style", { children: CSS }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dshk-note", children: tr2("viewer.noSession") })
      ] });
    }
    const stale = svgUrl !== void 0 && sourceAtLoad !== void 0 && sourceVersion !== void 0 && sourceVersion !== sourceAtLoad;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dshk-root", "data-kicad-viewer": designPath, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("style", { children: CSS }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dshk-bar", children: [
        props.modeSwitch,
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", onClick: () => void render(), disabled: rendering, "data-kicad-action": "render", children: rendering ? tr2("viewer.rendering") : tr2("viewer.render") }),
        pages && pages.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
          tr2("viewer.page"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("select", { className: "dshk-select", value: Math.min(pageIndex, pages.length - 1), onChange: (e) => setPageIndex(Number(e.target.value)), children: pages.map((p4, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: i, children: p4.replace(/\.svg$/, "") }, p4)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dshk-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", "aria-label": tr2("viewer.zoomOut"), onClick: () => zoom(1 / 1.25), children: "\u2212" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", "aria-label": tr2("viewer.zoomIn"), onClick: () => zoom(1.25), children: "+" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dshk-btn", onClick: fit, children: tr2("viewer.fit") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(KiCadNotice, { remote, sessionId, t: props.t, force: kicadFailed, onReady: () => {
        if (!kicadFailed) return;
        setKicadFailed(false);
        void render();
      } }),
      props.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dshk-warn", "data-kicad-state": "fallback", children: props.notice }),
      stale && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dshk-warn", "data-kicad-state": "stale", children: tr2("viewer.stale") }),
      error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dshk-error", "data-kicad-state": "error", children: error }),
      pages !== void 0 && pages.length === 0 && !rendering && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dshk-note", "data-kicad-state": "empty", children: tr2("viewer.empty") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "div",
        {
          ref: stageRef,
          className: "dshk-stage",
          onWheel,
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onDoubleClick: fit,
          children: svgUrl && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "img",
            {
              ref: imgRef,
              src: svgUrl,
              alt: page ?? "",
              draggable: false,
              onLoad: fit,
              "data-kicad-state": "image",
              style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
            }
          )
        }
      )
    ] });
  };
}

// src/client/index.tsx
var TAB_ID = "dsh-client-ui-kicad";
var BUNDLES = ["dsh-kicad-bundle", "dsh-kicad"];
var inject = ["slots", "locale", "sidebarRightTabs", "remote", "remote.workspaceFiles", "remote.commands", "remote.session"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "kicad: dictionaries");
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: "kicad",
    patterns: ["*.kicad_sch", "*.kicad_pcb"],
    priority: "extension",
    canOpen: (address) => parseFileAddress(address)?.scope === "session" && isDesignFile(address),
    title: (address) => basename(parseFileAddress(address)?.path ?? address)
  }), "kicad: tab type");
  const Viewer = createViewer(ctx.remote);
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab", key: TAB_ID, locale: NS },
    Viewer
  )), "kicad: viewer body");
  const cards = [
    ["kicad_doctor", createDoctorCard(ctx.remote)],
    ["kicad_erc", withKiCadHint(ctx.remote, CheckCard)],
    ["kicad_drc", withKiCadHint(ctx.remote, CheckCard)],
    ["kicad_edit_schematic", withKiCadHint(ctx.remote, EditCard)],
    ["kicad_create_schematic", withKiCadHint(ctx.remote, CreateCard)]
  ];
  for (const [tool, view] of cards) {
    ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register(
      { name: "tool.call.toolview", key: tool, locale: NS },
      view
    )), `kicad: ${tool} row`);
  }
  for (const command of KICAD_COMMANDS) {
    ctx.effect(() => ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register(
      { name: "conversation.chat.commandview", key: command, locale: NS },
      CommandRow
    )), `kicad: /${command} row`);
  }
  const BridgeSettings2 = createBridgeSettings(ctx.remote);
  for (const bundle of BUNDLES) {
    for (const [row, view] of [["kicad-bridge", BridgeSettings2], ["kicad-policy", PolicySettings]]) {
      ctx.effect(() => ctx.slots.inject("plugins.row.config", () => ctx.slots.register(
        { name: "plugins.row.config", key: `${bundle}#${row}`, locale: NS },
        view
      )), `kicad: ${bundle}#${row} settings`);
    }
  }
}

		return module.exports;
	}
});
