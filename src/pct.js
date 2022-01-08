
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


// Percent Encode Sets
// -------------------

// Bitflags used as IDs for percent encode sets

const sets = {
  special: 1, quot: 2, pct: 4,
  user: 8, pass: 16, host: 32,
  seg: 64, query: 128, hash:0,
  valid_userinfo: 256,
  valid_other: 512,
  norm_userinfo: 1024,
  norm_seg: 2048,
  norm_query: 4096,
  norm_hash: 8192
} 

// Lookup table for printable ascii codepoints,
// starting at U+20 (space)

const table = [
  16160, 0, 16128, 8184,  768,    4,     0,    2,     0,     0,    0,
      0, 0,     0,    0, 3448,    0,     0,    0,     0,     0,    0,
      0, 0,     0,    0, 1320, 1024, 16160, 1024, 16160,  3448, 1312,
      0, 0,     0,    0,    0,    0,     0,    0,     0,     0,    0,
      0, 0,     0,    0,    0,    0,     0,    0,     0,     0,    0,
      0, 0,     0,    0, 1824, 1825,  1824, 1824,     0, 12032,    0,
      0, 0,     0,    0,    0,    0,     0,    0,     0,     0,    0,
      0, 0,     0,    0,    0,    0,     0,    0,     0,     0,    0,
      0, 0,     0, 3840, 1824, 3840,     0,    0
]


// Percent Encode Profiles
// -----------------------

// Bare minimum, this should maintain
// print . parse = id, on preprocessed strings

const minimal = {
  user:  sets.user,
  pass:  sets.pass,
  host:  sets.host,
  dir:   sets.seg,
  file:  sets.seg,
  query: sets.query,
  hash:  sets.hash,
}

// Normal, this matches the WHATWG Standard.
// NB this may generate invalid URL strings

const normal = {
  user:  sets.user  | sets.norm_userinfo,
  pass:  sets.pass  | sets.norm_userinfo,
  host:  sets.host  | sets.host,
  dir:   sets.seg   | sets.norm_seg,
  file:  sets.seg   | sets.norm_seg,
  query: sets.query | sets.norm_query,
  hash:  sets.hash  | sets.norm_hash,
}

// Valid, this generates valid URLs,
// and valid URIs if in addition limited to ASCII. 

const valid = {
  user:  sets.user  | sets.valid_userinfo,
  pass:  sets.pass  | sets.valid_userinfo,
  host:  sets.host  | sets.valid_other,
  dir:   sets.seg   | sets.valid_other,
  file:  sets.seg   | sets.valid_other,
  query: sets.query | sets.valid_other,
  hash:  sets.hash  | sets.valid_other,
}

const encodeProfiles = { minimal, normal, valid }


// Percent Coding
// --------------
// TODO change API / encodeSet arg

const pct = {

  encode: (input, encodeSet = 0, { unicode = false, incremental = false }) => {
    let coded = ''
    if (!incremental) encodeSet |= sets.pct
    for (let char of input) {
      let cp = char.codePointAt (0)
    
      // JS specific - replace unmatched surrogates with u+FFFD
      if (0xD800 <= cp && cp <= 0xDBFF || 0xDC00 <= cp && cp <= 0xDFFF)
        cp = 0xFFFD

      const escapeAscii = !unicode && (cp < 0x20 || cp > 0x7E)
      if (escapeAscii || table [cp - 0x20] & encodeSet)
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

function PercentEncoder (options = { }) {
  this.encode = (input, encodeSet) => pct.encode (input, encodeSet, options)
  // this.decode = pct.decode
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
// =======

export { utf8, pct, sets as encodeSets, encodeProfiles, PercentEncoder }