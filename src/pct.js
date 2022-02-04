
// UTF8 Coding
// -----------

const [h2, h3, h4, h5] = [ 0b10<<6, 0b110<<5, 0b1110<<4, 0b11110<<3  ]
const [t6, t5, t4, t3] = [ ~(-1<<6), ~(-1<<5),  ~(-1<<4),   ~(-1<<3) ]

const utf8 = {
  
  encode (code) { // encode! not decode :S
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

const pct = {

  encode: (input, encodeSet = 0, { unicode = false, incremental = false } = { }) => {
    let coded = ''
    if (!incremental)
      encodeSet |= sets.pct

    for (let char of input) {
      let cp = char.codePointAt (0)
    
      // JS specific - replace unmatched surrogates with u+FFFD
      if (0xD800 <= cp && cp <= 0xDBFF || 0xDC00 <= cp && cp <= 0xDFFF)
        cp = 0xFFFD

      const escape
        = cp < 0xA0 ? table [cp] & encodeSet // lookup table
        : unicode ? 0xD800 <= cp && cp <= 0xDFFF // surrogate
          || 0xFDD0 <= cp && cp <= 0xFDEF // non-char
          || ((cp >> 1) & 0x7FFF) === 0x7FFF // non-char
        : true

      if (escape)
        for (let byte of utf8.encode (cp)) {
          let h1 = byte >> 4, h2 = byte & 0b1111
          h1 = (h1 < 10 ? 48 : 55) + h1 // single hex digit
          h2 = (h2 < 10 ? 48 : 55) + h2 // single hex digit
          coded += String.fromCharCode (0x25, h1, h2) // %xx code
      }
      else coded += char
    }
    return coded
  },
  
  decode (input) {
    return input.replace (_pcts, _decode)
  }

}

// PercentEncoder
// TODO change API / encodeSet arg

function PercentEncoder (options = { }) {
  this.encode = (input, encodeSet) => pct.encode (input, encodeSet, options)
}

// private

const _pcts = /(%[0-9A-Fa-f]{2})+/g
const _decode = input => {
  const bytes = []
  for (let i=0, l = input.length; i<l; i+=3)
    bytes[bytes.length] = parseInt (input.substr (i+1, 2), 16)
  return String.fromCodePoint (... utf8.decode (bytes))  
}


// Percent Encode Sets
// -------------------

// Bitflags used as IDs for percent encode sets

const sets = {
  c0c1: 1, nl_tab: 2,
  special: 4, quot: 8, pct: 16,
  user: 32, pass: 64, host: 128,
  seg: 256, query: 512, hash: 0,
  valid_userinfo: 1024,
  valid_other: 2048,
  norm_userinfo: 4096,
  norm_seg: 8192,
  norm_query: 16384,
  norm_hash: 32768
} 

const table = [
  1,     1,     1,     1,     1,     1,    1,     1,     1,    3,     3,
  1,     1,     3,     1,     1,     1,    1,     1,     1,    1,     1,
  1,     1,     1,     1,     1,     1,    1,     1,     1,    1, 64640,
  0, 64512, 32736,  3072,    16,     0,    8,     0,     0,    0,     0,
  0,     0,     0, 13792,     0,     0,    0,     0,     0,    0,     0,
  0,     0,     0,  5280,  4096, 64640, 4096, 64640, 13792, 5248,     0,
  0,     0,     0,     0,     0,     0,    0,     0,     0,    0,     0,
  0,     0,     0,     0,     0,     0,    0,     0,     0,    0,     0,
  0,     0,     0,  7296,  7300,  7296, 7296,     0, 48128,    0,     0,
  0,     0,     0,     0,     0,     0,    0,     0,     0,    0,     0,
  0,     0,     0,     0,     0,     0,    0,     0,     0,    0,     0,
  0,     0, 15360,  7296, 15360,     0,    1,     1,     1,    1,     1,
  1,     1,     1,     1,     1,     1,    1,     1,     1,    1,     1,
  1,     1,     1,     1,     1,     1,    1,     1,     1,    1,     1,
  1,     1,     1,     1,     1,     1
]

/*
const charInfo // TODO
  = cp < 0xA0 ? table [cp]
  : (0xD800 <= cp && cp <= 0xDFFF) ? sets.surrogates
  : (0xFDD0 <= cp && cp <= 0xFDEF) ? sets.nonchars
  : ((cp >> 1) & 0x7FFF) === 0x7FFF) ? sets.nonchars
  : unicode && 0xFF < cp ? 0 : -1
//*/

// Percent Encode Profiles
// -----------------------

// NB These are different from my URL Specification,
// as I'm making changes both here and in the spec.

const { c0c1, nl_tab, special:s, quot:q } = sets

// Minimal. Encodes only code-points that would cause reparse-bugs.
// This may generate invalid - though parsable - URL strings.

const minimal = {
  user:  nl_tab | sets.user,  // { # ? / : }
  pass:  nl_tab | sets.pass,  // { # ? / }
  host:  nl_tab | sets.host,  // { # ? / : @ } and { u+0 u+20 < > [ \ ] ^ | }
  dir:   nl_tab | sets.seg,   // { # ? / }
  file:  nl_tab | sets.seg,   // { # ? / }
  query: nl_tab | sets.query, // { # }
  hash:  nl_tab | sets.hash,  // { }
}

// Minimal Special
// Likewise, but also encodes "\" before the query.

const minimal_special = {
  user:  nl_tab | sets.user  | s,
  pass:  nl_tab | sets.pass  | s,
  host:  nl_tab | sets.host  | s,
  dir:   nl_tab | sets.seg   | s,
  file:  nl_tab | sets.seg   | s,
  query: nl_tab | sets.query | q,
  hash:  nl_tab | sets.hash,
}

// Normal, this matches the WHATWG Standard.
// May generate invalid - though parsable - URL strings.

const normal = {
  user:  c0c1 | sets.user  | sets.norm_userinfo,
  pass:  c0c1 | sets.pass  | sets.norm_userinfo,
  host:  c0c1 | sets.host  ,
  dir:   c0c1 | sets.seg   | sets.norm_seg,
  file:  c0c1 | sets.seg   | sets.norm_seg,
  query: c0c1 | sets.query | sets.norm_query,
  hash:  c0c1 | sets.hash  | sets.norm_hash,
}

// Normal Special 
// Likewise, but also encodes "\" before the query
// and "'" in the query

const normal_special = {
  user:  normal.user  | s,
  pass:  normal.pass  | s,
  host:  normal.host  | s,
  dir:   normal.dir   | s,
  file:  normal.file  | s,
  query: normal.query | q,
  hash:  normal.hash,
}

// Valid, this generates valid URL-strings, and
// -- if limited to printable ASCII -- valid URIs. 

const valid = {
  user:  c0c1 | sets.user  | sets.valid_userinfo,
  pass:  c0c1 | sets.pass  | sets.valid_userinfo,
  host:  c0c1 | sets.host  | sets.valid_other,
  dir:   c0c1 | sets.seg   | sets.valid_other,
  file:  c0c1 | sets.seg   | sets.valid_other,
  query: c0c1 | sets.query | sets.valid_other,
  hash:  c0c1 | sets.hash  | sets.valid_other,
}

const profiles = {
  default: valid,
  WHATWG: normal,
  minimal,
}

const specialProfiles = {
  default: valid,
  WHATWG: normal_special,
  minimal: minimal_special,
}


// Exports
// =======

export { utf8, pct, sets as encodeSets, profiles, specialProfiles, PercentEncoder }