const log = console.log.bind (console)
const { assign } = Object
function* range (a, z = Infinity) { while (a <= z) yield a++ }


// Component Code Points
// ---------------------

// Non-overlapping sets of code points.
// These are subdivisions of the set of
// gen-delims, sub-delims, unreserved,
// non-component-codepoints and percent.

const [
  // Gen-delims excluding []
  // :  @   /  \   ?    #
  COL, AT, SL, BS, QU, HSH,

  // Percent
  PCT,

  // Sub-delims
  APO, // Apostrophe '
  USD, // Userinfo escaped sub delims ; =
  SUB, // Other sub delims ! $ & ( ) * + ,

  // Unreserved
  Unreserved, // 0-9 A-Z a-z - . _ ~
  OtherUnicode, //

  // Non-component chars
  NUL,
  Control, // control-c0, del-c1, surrogates and non-chars
  SP,  // space
  NC1, // [ ] | ^
  NC2, // < >
  NC3, // { }
  NC4, // "
  NC5, // `
] = range (0)


// Lookup table from char-code to equivalence class

const ___ = Unreserved
const CTL = Control
const cctable = new Uint8Array ([
//NUL  SOH  STX  ETX  EOT  ENQ  ACK  BEL  BS   HT   LF   VT   FF   CR   SO   SI
  NUL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL,
//DLE  DC1  DC2  DC3  DC4  NAK  SYN  ETB  CAN  EM   SUB  ESC  FS   GS   RS   US
  CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL,
//SP    !    "    #    $    %    &    '    (    )    *    +    ,    -    .    /
  SP,  SUB, NC4, HSH, SUB, PCT, SUB, APO, SUB, SUB, SUB, SUB, SUB, ___, ___, SL,
// 0    1    2    3    4    5    6    7    8    9    :    ;    <    =    >    ?
  ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, COL, USD, NC2, USD, NC2, QU,
// @    A    B    C    D    E    F    G    H    I    J    K    L    M    N    O
  AT,  ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___,
// P    Q    R    S    T    U    V    W    X    Y    Z    [    \    ]    ^    _
  ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, NC1, BS,  NC1, NC1, ___,
// `    a    b    c    d    e    f    g    h    i    j    k    l    m    n    o
  NC5, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___,
// p    q    r    s    t    u    v    w    x    y    z    {    |    }    ~   DEL
  ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, ___, NC3, NC1, NC3, ___, CTL,
// C1 Controls
  CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL,
  CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, CTL, ])

const specialcctable = new Uint8Array (cctable)
specialcctable['\\'.codePointAt(0)] = SL // Meh



// Validation and Error correction
// -------------------------------

// 'Encode sets'

const _userinfo     = 0
const _host         = 1
const _pathSegment  = 2
const _opaquePath   = 3
const _query        = 4
const _specialQuery = 5
const _fragment     = 6

const descriptiveNames = [
  'userinfo',
  'host',
  'path segment',
  'opaque path',
  'query',
  'special query',
  'fragment',
]

// Actions

const V = 0 // Valid ASCII; pass through
const E = 1 // Valid ASCII but escape anyway
const U = 2 // Valid Unicode
const T = 3 // Invalid; tolerate
const F = 4 // Invalid; fixup
const R = 5 // Invalid; reject

const _ = V
const actions = new Uint8Array ([
//0, 1, 2, 3, 4, 5, 6
//------------ gen-delims ----
  F, F, _, _, _, _, _,    // :
  F, R, _, _, _, _, _,    // @
  F, F, F, T, _, _, _,    // /
  F, R, T, T, T, T, T,    // \
  F, F, F, F, _, _, _,    // ?
  F, F, F, F, F, F, T,    // #
//-------------- percent -----
  E, E, E, E, E, E, E,    // % // Unless incremental=true
//------------ sub-delims ----
  _, _, _, _, _, E, _,    // '
  E, _, _, _, _, _, _,    // ; =
  _, _, _, _, _, _, _,    // ! $ & ( ) * + ,
//------------ unreserved ----
  _, _, _, _, _, _, _,    // alhpa digit - . _ ~
  U, U, U, U, U, U, U,    // other unicode
//--------- non-component ----
  F, R, F, F, F, F, F,    // nul
  F, F, F, F, F, F, F,    // control
  F, R, F, T, F, F, F,    // space
  F, R, T, T, T, T, T,    // [ ] | ^
  F, R, F, T, F, F, F,    // < >
  F, T, F, T, T, T, T,    // { }
  F, T, F, T, F, F, F,    // "
  F, T, F, T, T, T, F,    // `
// ---------------------------
//0, 1, 2, 3, 4, 5, 6
])



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


// Percent Coding
// --------------

// strict           // rejects erroneous, rejects invalid input
// non-strict       // rejects erroneous, tolerates other invalid
// non-strict fixup // fixes erroneous, tolerates invalid
// strict fixup     // fixes erroneous, fixes invalid input

const defaults = { fixup:false, strict:false, incremental:true, unicode:true }

function percentEncode (value, encodeSet=_pathSegment, { fixup=false, strict=false, incremental=true, unicode=true } = defaults) {
  // log ({fixup, strict, incremental, unicode })

  const out = []
  let anchor = 0
  let pos = 0
  let end = pos
  const rejections = []

  for (let c of value) {
    let cp = c.codePointAt (0)

    // JS specific - replace unmatched surrogates with u+FFFD

    if (0xD800 <= cp && cp <= 0xDFFF)
      cp = 0xFFFD

    // Determine the character class

    const cc
      = cp === 0x25 ? (incremental ? Unreserved : PCT)
      : cp  <  0xA0 ? cctable[cp] // Lookup table for ASCII-C1
      : 0xD800 <= cp && cp <= 0xDFFF // surrogate
        || 0xFDD0 <= cp && cp <= 0xFDEF // non-char
        || ((cp >> 1) & 0x7FFF) === 0x7FFF // non-char
        ? Control : OtherUnicode
    
    // BONUS: optimise the action representation,
    // so that I can do away with this action-remapping

    let action = actions[cc * 7 + encodeSet]
    switch (action) {
      case U:
        action = unicode ? _ : E;
      break
      case R:
        action = fixup ? F : R
      case T: case F:
        action = strict ? (fixup ? F : R) : action;
    }

    switch (action) {
      case R: {
        rejections.push (c)
        out.push (cp)
        continue
      }
      case _: case T: {
        out.push (cp)
        continue
      }
      case F: case E: {
        for (let byte of utf8.encode (cp)) {
          let h1 = byte >> 4
          let h2 = byte & 0b1111
          h1 = (h1 < 10 ? 48 : 55) + h1 // single hex digit
          h2 = (h2 < 10 ? 48 : 55) + h2 // single hex digit
          out.push (0x25, h1, h2) // %xx code
        }
      }
    }
  }

  if (rejections.length)
    throw new Error (`Invalid ${descriptiveNames[encodeSet]} component.\nRejected code points: ${rejections.join (' ')}\n`)
  
  return String.fromCodePoint (...out)
}


// Percent Coding
// --------------

const pct = {
  
  encodeUserinfo (input, settings={}) {
    const encodeSet = _userinfo
    return percentEncode (input, encodeSet, settings)
  },

  encodeOpaqueHost (input, settings={}) {
    const encodeSet = _host
    return percentEncode (input, encodeSet, settings)
  },

  encodePathSegment (input, settings={}) {
    const encodeSet = _pathSegment
    return percentEncode (input, encodeSet, settings)
  },

  encodeOpaquePath (input, settings={}) {
    const encodeSet = _opaquePath
    return percentEncode (input, encodeSet, settings)
  },

  encodeQuery (input, settings={}) {
    const encodeSet = _query
    return percentEncode (input, encodeSet, settings)
  },

  encodeSpecialQuery (input, settings={}) {
    const encodeSet = _specialQuery
    return percentEncode (input, encodeSet, settings)
  },

  encodeFragment (input, settings={}) {
    const encodeSet = _fragment
    return percentEncode (input, encodeSet, settings)
  },

  decode (input) {
    return input.replace (_pcts, _decode)
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


// Quick test
// ----------
// log (pct.encodeUserinfo ('foo@bar', { strict:true, fixup:false }))
// log (pct.decode ('foo%20bar'))
// log (pct.encodePathSegment ('foo%bar'}))
// log (pct.encodeFragment ('foo#barü', { unicode:false }))
// log (pct.encodePathSegment ('nonspecial/special\\slash', { winSlash:false }))
// log (pct.encodePathSegment ('fo/bar', { strict:false, fixup:false }))
// log (pct.encodeOpaqueHost ('fo@[bar]{bee}', { strict:false, fixup:true }))

// log (pct.encodeOpaqueHost ('fo@[bar]{bee}', { strict:false, fixup:false }))


// Exports
// -------

export { pct, utf8 }