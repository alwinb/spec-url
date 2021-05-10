
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
// TODO change API / encodeSet arg

const pct = {

  encode (input, encodeSet, { ascii = true, incremental = true } = { }) {
    let coded = ''
    for (let char of input) {
      let cp = char.codePointAt (0) // may be an unmatched surrogate
      if (0xD800 <= cp && cp <= 0xDBFF || 0xDC00 <= cp && cp <= 0xDFFF) cp = 0xFFFD
      const escapeAscii = ascii && (cp < 0x20 || cp > 0x7E)
      const escapePct = !incremental && cp === 0x25
      if (escapePct || escapeAscii || lookup (cp) & encodeSet) for (let byte of utf8.encode (cp)) {
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

// private

const _pcts = /(%[0-9A-Fa-f]{2})+/g
const _decode = input => {
  const bytes = []
  for (let i=0, l = input.length; i<l; i+=3)
    bytes[bytes.length] = parseInt (input.substr (i+1, 2), 16)
  return String.fromCodePoint (... utf8.decode (bytes))  
}


// Percent Encode Profiles
// -----------------------

let lookup, isInSet, getProfile; { 
  
// ### Percent Encode Sets

// There are nine percent encode sets in the spec.
// These are represented here by numbers 1<<8 to 1<<0, so that
// they can be used as bitmasks. 

const url = 1<<9,
  user    = 1<<8,
  host    = 1<<7,
  dir     = 1<<6,
  dir_s   = 1<<5,
  dir_ms  = 1<<4,
  dir_m   = 1<<3,
  query   = 1<<2,
  query_s = 1<<1,
  hash = 1<<0

// Lookup tables:
// The rightmost bits encode the hash-encode-set,
// The second-rightmost bits encode the special-query encode set,
// and so on and so forth. 

const u20_u27 = [
/* ( ) */ 0b1111100111,
/* (!) */ 0,
/* (") */ 0b1101100111,
/* (#) */ 0b1111111110,
/* ($) */ 0,
/* (%) */ 0b1000000000,
/* (&) */ 0,
/* (') */ 0b0000000010 ]

const u2f = [
/* (/) */ 0b0111111000, ]

const u3A_u40 = [
/* (:) */ 0b0110000000,
/* (;) */ 0b0100000000,
/* (<) */ 0b1111100111,
/* (=) */ 0b0100000000,
/* (>) */ 0b1111100111,
/* (?) */ 0b0111111000,
/* (@) */ 0b0110000000 ]

const u5B_u60 = [
/* ([) */ 0b1110000000,
/* (\) */ 0b1110110000,
/* (]) */ 0b1110000000,
/* (^) */ 0b1110000000,
/* (_) */ 0,
/* (`) */ 0b1101100001 ]

const u7B_u7E = [
/* ({) */ 0b1101100000,
/* (|) */ 0b1100000000,
/* (}) */ 0b1101100000,
/* (~) */ 0 ]

lookup = c => 
  // Escape C0 controls, DEL and C1 controls
  (c <= 31 || 127 <= c && c < 160) ? ~0 :
  // Lookup tables
  (0x20 <= c && c <= 0x27) ? u20_u27 [c - 0x20] :
  (c === 0x2f            ) ? u2f     [c - 0x2f] :
  (0x3a <= c && c <= 0x40) ? u3A_u40 [c - 0x3a] :
  (0x5b <= c && c <= 0x60) ? u5B_u60 [c - 0x5b] :
  (0x7b <= c && c <= 0x7e) ? u7B_u7E [c - 0x7b] : 
  // Escape surrogate halves and non-characters
  (0xD800 <= c && c <= 0xDFFF) ? ~0 :
  (0xFDD0 <= c && c <= 0xFDEF || ((c >> 1) & 0x7FFF) === 0x7FFF) ? ~0 : 0
  // NB 0x7FFF is 2**15-1, i.e. 0b111111111111111 (fifteen ones).


// ### Percent Encode Profiles
// There are four encode profiles. 
// TODO Add a new 'strict' profile

const [username, pass, password, file] = [user, user, user, dir]
const
  _generic = { url, user, pass, username, password, host, dir, file, query, hash },
  _minimal = { ..._generic, dir: dir_m,  file: dir_m },
  _special = { ..._generic, dir: dir_s,  file: dir_s,  query: query_s },
  _minspec = { ..._generic, dir: dir_ms, file: dir_ms, query: query_s }

getProfile = ({ minimal = false, special = false }) =>
  minimal && special ? _minspec
    : special ? _special
    : minimal ? _minimal
    : _generic
}

isInSet = (cp, { name, minimal, special }) =>
  lookup (cp) & getProfile ({ minimal, special }) [name]


// Exports
// =======

module.exports = { utf8, pct, getProfile, isInSet }