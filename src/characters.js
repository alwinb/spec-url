const log = console.log.bind (console)
const { assign } = Object
const intsInto = (map, i = 0) => new Proxy ({}, { get:($,k) => (map [k] = i, i++) })
function* range (a, z = Infinity) { while (a <= z) yield a++ }

// Component Characters
// ====================

// Components are validated and normalised according to their component type.
// Depending on the component type, code-points may be:

// V = 0 0 0 0 0 // Valid, ASCII
// E = 0 0 0 0 1 // Valid, escaped
// U = 0 0 0 1 0 // Valid, unicode
// T = 0 0 1 0 0 // Invalid
// F = 0 0 1 1 1 // Invalid, escaped
// R = 0 1 1 1 1 // Invalid, escaped and/or rejected
// I = 1 0 1 0 1 // Invalid, escaped and/or skipped
// --|---------- //
//   | s r w u e // skip, reject, warn, valid-unicode, escape

// The bit patterns used in the categorisation are (so far)
// merely an implementation detail used in the encoding algorithm.

const V = 0b00000
const E = 0b00001
const U = 0b00010
const T = 0b00100
const F = 0b00111
const R = 0b01111
const I = 0b10101

// Rather than specifying this per individual codepoint, we partition
// the set of all codepoints into non-overlapping equivalence classes
// that are subdivisions of gen-delims -- excluding [ and ],
// sub-delims, unreserved ASCII, controls, other unicode, and the
// percent character.

// The following table maps ascii + c1-control code points to their
// character class id; Higher code points are handled in code.

const _eqs = '\
moooooooonnoonoo\
oooooooooooooooo\
pjtfjgjhjjjjjkkc\
kkkkkkkkkkairire\
bkkkkkkkkkkkkkkk\
kkkkkkkkkkkqdqqk\
ukkkkkkkkkkkkkkk\
kkkkkkkkkkksqsko\
oooooooooooooooo\
oooooooooooooooo'

const cctable = _eqs.split ('') .map (n =>
  n.charCodeAt(0) - 'a'.charCodeAt (0))

// Naming a mere few of all of the classes:

const cc_pct = 6 // g
const cc_unreserved = 10 // k
const cc_other_unicode = 11 // l
const cc_control = 14 // o


// We specify per component type, per class, how the
// code point should be validated and/or normalised. 

// Action table

const _ = V
const whatwg = new Uint8Array ([
//0, 1, 2, 3, 4, 5, 6
//------------ gen-delims ----
  F, F, _, _, _, _, _,    // a) :
  F, R, _, _, _, _, _,    // b) @
  F, F, F, T, _, _, _,    // c) /
  F, R, T, T, T, T, T,    // d) \
  F, F, F, F, _, _, _,    // e) ?
  F, F, F, F, F, F, T,    // f) #
//-------------- percent ---
  E, E, E, E, E, E, E,    // g) % // Unless incremental=true
//------------ sub-delims --
  _, _, _, _, _, E, _,    // h) '
  E, _, _, _, _, _, _,    // i) ; =
  _, _, _, _, _, _, _,    // j) ! $ & ( ) * + ,
//------------ unreserved ----
  _, _, _, _, _, _, _,    // k) alhpa digit - . _ ~
  U, U, U, U, U, U, U,    // l) other unicode
//--------- non-component ----
  F, R, F, F, F, F, F,    // m) nul
  I, I, I, I, I, I, I,    // n) HT, LF, CR
  F, F, F, F, F, F, F,    // o) control
  F, R, F, T, F, F, F,    // p) SP
  F, R, T, T, T, T, T,    // q) [ ] | ^
  F, R, F, T, F, F, F,    // r) < >
  F, T, F, T, T, T, T,    // s) { }
  F, T, F, T, F, F, F,    // t) "
  F, T, F, T, T, T, F,    // u) `
// ---------------------------
//0, 1, 2, 3, 4, 5, 6
])

// The rows correspond to character classes.
// The columns correspond to encode/ action sets:

const encodeSets = {
  userInfo: 0, user:0, pass:0,
  opaqueHost: 1, host: 1,
  pathSegment: 2, dir:2, file:2,
  opaquePath: 3,
  query: 4,
  specialQuery: 5,
  fragment: 6, hash:6,
}

const descriptiveNames = [
  'userinfo',
  'opaque hostname',
  'path segment',
  'opaque path',
  'query',
  'special query',
  'fragment',
]


// Percent Coding
// --------------

// Settings

const _FailStrict = 0b11100
const _FailSome = 0b01000
const _FailNone = 0
const _shouldSkip = 0b10000

function percentEncode (value, encodeSet, _options = {}) {
  if (typeof encodeSet !== 'number') throw new Error ('percentEncode: Invalid encodeSet Id')
  const { incremental = true, unicode = true, strict = false, fixup = true } = _options
  
  const escapeSetting = unicode ? 1 : 0b11
  const strictnessSetting = _FailSome

  const out = []
  let anchor = 0, pos = 0, end = pos
  let flags = 0

  for (let c of value) {
    let cp = c.codePointAt (0)

    // JS specific - replace unmatched surrogates with u+FFFD
    if (cp >> 11 === 0x1B) cp = 0xFFFD // Is that the same?

    // Determine the character class
    const cc
      = cp === 0x25 ? (incremental ? cc_unreserved : cc_pct)
      : cp  <  0xA0 ? cctable[cp]          // Lookup table for ASCII-C1
      : (cp >> 11 === 0x1B)                // surrogate
        || 0xFDD0 <= cp && cp <= 0xFDEF    // non-char
        || ((cp >> 1) & 0x7FFF) === 0x7FFF // non-char
        ? cc_control : cc_other_unicode

    // look up the action/flags in the actions table
    const action = whatwg[cc * 7 + encodeSet]

    flags |= action
    if (action & _shouldSkip) continue
    if (action & escapeSetting)
      for (let byte of utf8.encode (cp)) {
        let h1 = byte >> 4
        let h2 = byte & 0b1111
        h1 = (h1 < 10 ? 48 : 55) + h1 // single hex digit
        h2 = (h2 < 10 ? 48 : 55) + h2 // single hex digit
        out.push (0x25, h1, h2) // %xx code
      }
    else out.push (cp)
  }

  if (flags & strictnessSetting) {
    throw new Error (`Rejected codepoints in ${descriptiveNames[encodeSet]}`)
  }

  return String.fromCodePoint (...out)
}


// Percent Coding
// --------------

const S = encodeSets
const pct = {
  
  encode: percentEncode,

  decode (input) {
    return input.replace (_pcts, _decode)
  }

}


// UTF8 Coding
// -----------

const [h2, h3, h4, h5] = [ 0b10<<6, 0b110<<5, 0b1110<<4, 0b11110<<3  ]
const [t6, t5, t4, t3] = [ ~(-1<<6), ~(-1<<5),  ~(-1<<4),   ~(-1<<3) ]

const utf8 = {

  encode (code) {
    if (code < 0x80) return [code]
    else if (code < 0x800) {
      const [c1, c2] = [code >> 6, code & t6]
      return [h3|(t5 & c1), h2|(t6 & c2)]
    }
    else if (code < 0x10000) {
      const [c1, c2, c3] = [code >> 12, code >> 6, code & t6]
      return [h4|(t4 & c1), h2|(t6 & c2), h2|(t6 & c3)]
    }
    else {
      const [c1, c2, c3, c4] = [code >> 18, code >> 12, code >> 6, code & t6]
      return [h5|(t3 & c1), h2|(t6 & c2), h2|(t6 & c3), h2|(t6 & c4)]
    }
  },

  decode (bytes) {
    const codes = []
    let n = 0, code = 0, err = false
    for (let i=0,l=bytes.length; i<l; i++) {
      const b = bytes[i]

      ;[err, n, code]
        = b >= 0xf8 ? [  1, 0, 0 ]
        : b >= 0xf0 ? [  n, 3, b & 7  ]
        : b >= 0xe0 ? [  n, 2, b & 15 ]
        : b >= 0xc0 ? [  n, 1, b & 31 ]
        : b >= 0x80 ? [ !n, n-1, code<<6 | b & 63 ]
        : [ n, 0, b ]

      if (err) throw new Error (`Invalid UTF8, at index ${i}`)
      if (n === 0) codes [codes.length] = code
      // TODO code must be <= 0x10FFFF
      // and err on overlong encodings too
    }
    if (n) throw new Error (`Incomplete UTF8 byte sequence`)
    return codes
  }

}


// private

const _pcts = /(%[0-9A-Fa-f]{2})+/g
const _decode = input => {
  const bytes = []
  for (let i=0, l = input.length; i<l; i+=3)
    bytes[bytes.length] = parseInt (input.substr (i+1, 2), 16)
  return String.fromCodePoint (... utf8.decode (bytes))  
}


// Exports
// -------

const _private = { whatwg, encodeSets, descriptiveNames  }
export { pct, utf8, encodeSets as _encodeSets, _private }