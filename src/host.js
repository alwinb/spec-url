import { pct } from './pct.js'
import punycode from 'punycode'
const log = console.log.bind (console)


// Host Model
// ==========

// - IPv6 addresses are parsed to an array of integers
// - Domains are parsed to an array of domain-label-strings.
// - IPv4 addresses are parsed to a single integer
// - Opaque hosts are represented as non-empty strings
// - Note that the empty *authority* is signified by setting
//   the *host* property to the empty string. 

const types = 
  { opaque:1, domain:2, ipv4:4, ipv6:6 }

const hostType = host =>
  typeof host === 'string' ? types.opaque :
  typeof host === 'number' ? types.ipv4 :
  typeof host[0] === 'number' ? types.ipv6 :
  typeof host[0] === 'string' ? types.domain : null


// ### Host parsing

const parseFileHost = (input, percentCoded = true) =>
  ( input === '' || typeof input !== 'string' ? input
  : parseDomain (input, percentCoded) )

const parseWebHost = (input, percentCoded = true) =>
  ( typeof input !== 'string' ? input
  : parseDomain (input, percentCoded) )

const validateOpaqueHost = (input, percentCoded = true) => {
  if (_opaqueHostCodes.test (input)) return input
  else throw new Error (`Invalid opaque-host-string "${input}"`)
}


// NB parseDomain returns a domain **or an ipv4 address**.

function parseDomain (input, percentCoded = true) {
  if (percentCoded) input = pct.decode (input)
  let r = punycode.toUnicode (nameprep (input))
  const address = ipv4.parse (r)
  if (address != null) return address
  if (r === '') throw new Error ('Invalid domain-string')
  if (_endsInNumber.test (r)) throw new Error ('Invalid doimain-string')
  if (_isDomainString.test (r)) return r.split ('.')
  throw new Error ('Invalid doimain-string')
}


// ### Printing

function printHost (host) {
  const typ = hostType (host)
  const r
    = typ === types.ipv4 ? ipv4.print (host)
    : typ === types.ipv6 ? `[${ipv6.print (host)}]`
    : typ === types.domain ? host.join ('.')
    : host
  return r
}



// IPv4 Addresses
// --------------

const _ip4num =
  /(?:0[xX]([0-9A-Fa-f]*)|(0[0-7]*)|([1-9][0-9]*))([.]?)/y

const ipv4 = {

  parse (input) {
    _ip4num.lastIndex = 0
    let addr = 0, count = 0
    let match, err = false
    while ((match = _ip4num.exec (input))) {
      count++
      const num
        = match[1] != null ? parseInt (match[1]||'0', 16)
        : match[2] ? parseInt (match[2], 8)
        : parseInt (match[3], 10)

      if (_ip4num.lastIndex === input.length) {
        const rest = 5 - count
        if (err || (num >= 256**rest))
          throw new RangeError (`Invalid IPv4 address: <${input}>`)
        return ((addr << 8 * rest) + num) >>> 0 }

      else {
        if (count === 4 || !match[4]) return null
        err = err || (num > 255)
        addr = (addr << 8) + num }
    }
    return null
  },

  print (num) {
    let r = ''
    for (let i=3; i; i--) r += ((num >> 8*i) & 255) + '.'
    return r + (num & 255)
  },

  normalise (input) {
    return ipv4.print (ipv4.parse (input))
  }
}



// IPv6 Addresses
// --------------

const _start = 
  /([0-9]+)([.])|([0-9A-Fa-f]+)(:?)|(::)/y

const _hex = 
  /([0-9]+)([.])|([0-9A-Fa-f]+)(:?)|(:)/y

const _dec = 
  /([0-9]+)([.])?/y

const ipv6 = {
  parse (input) {
    const parts = [], ip4 = []
    let match, compress = null
    let rx = _start, p = rx.lastIndex = 0
  
    while (match = rx.exec (input)) {
      p = rx.lastIndex

      if (match[1]) {
        ip4.push (+match[1])
        if (!match[2]) break
        rx = _dec }

      else if (match[3]) {
        parts.push (parseInt (match[3], 16))
        if (!match[4]) break
        rx = _hex }

      else if (match[5]) {
        if (compress == null) compress = parts.length
        else throw new SyntaxError (`Invalid IPv6 address: [${input}]`)
        rx = _hex }
      
      rx.lastIndex = p
    }

    if (p !== input.length || ip4.length && ip4.length !== 4)
      throw new SyntaxError (`Invalid IPv6 address: [${input}]`)

    if (ip4.length) {
      const [n1, n2, n3, n4] = ip4
      parts.push (0x100 * n1 + n2, 0x100 * n3 + n4)
    }

    if (compress == null && parts.length !== 8)
      throw new SyntaxError (`Invalid IPv6 address: [${input}]`)

    const a = [], l = 8 - parts.length
    for (let i=0; i<l; i++) a.push (0)
    return (parts.splice (compress, 0, ...a), parts)
  },

  print (parts) {
    let [s0, l0] = [0, 0]
    let [s1, l1] = [0, 0]
    // Find the longest sequence of zeroes
    for (let i=0, l=parts.length; i<l; i++) {
      let num = parts[i]
      if (num === 0) [s1, l1] = [i, 0]
      while (num === 0 && i < l)
        [i, l1, num] = [i+1, l1+1, parts[i+1]]
      if (l1 > l0)
        [s0, l0] = [s1, l1]
    }
    parts = parts.map (n => n.toString (16))
    let c = s0 > 0 && s0 + l0 < 8 ? '' : s0 === 0 && l0 === 8 ? '::' : ':'
    if (l0 > 1) parts.splice (s0, l0, c)
    return parts.join (':')
  },

  normalise (input) {
    return ipv6.print (ipv6.parse (input))
  }
}



// Domains
// -------

// TODO clean this up, implement it properly.

const _isASCIIString =
  /^[\0-\x7E]*$/

const _opaqueHostCodes =
  /^[^\x00\x09\x0A\x0D\x20#/:<>?@[\\\]^|]*$/

const _isDomainString =
  /^[^\x00-\x20\x7F#%/:<>?@[\\\]^|]*$/

const _endsInNumber =
  /(^|[.])([0-9]+|0[xX][0-9A-Fa-f]*)[.]?$/

const punyEncode = domain => 
  domain.map (label => 
    _isASCIIString.test (label) ? label
      : 'xn--' + punycode.encode (label))

// 'IDNA/ Nameprep' - just a small part of it for now

const tableB1 =
  /[\u00AD\u034F\u1806\uFEFF\u2060\u180B-\u180D\u200B-\u200D\uFE00-\uFE0F]/g

const tableC6 =
  /[\uFFF9-\uFFFD]/g

function nameprep (input) {
  tableC6.lastIndex = tableB1.lastIndex = 0
  input = input
    .replace (tableB1, '')
    .normalize ('NFKC')
    .toLowerCase ()
  for (let c of input) {
    c = c.codePointAt (0)
    const nonchar = 0xFDD0 <= c && c <= 0xFDEF || 
      (c <= 0x10FFFF && ((c >> 1) & 0x7FFF) === 0x7FFF)
    if (nonchar)
      throw new Error ('Nameprep: Invalid code point')
  }
  if (tableC6 .test (input))
    throw new Error ('Nameprep: Invalid code point')
  return input
}



// Exports
// =======

export { ipv6, ipv4, types as hostTypes, hostType, parseWebHost, parseFileHost, validateOpaqueHost, printHost, parseDomain, punyEncode }