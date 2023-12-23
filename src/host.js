import { pct } from './characters.js'
import tr46 from 'tr46'


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

const hostType = host => host == null ? null :
  typeof host === 'string' ? types.opaque :
  typeof host === 'number' ? types.ipv4 :
  typeof host[0] === 'number' ? types.ipv6 :
  typeof host[0] === 'string' ? types.domain : null


// ### Host parsing

const parseHost = (input, percentCoded = true) =>
  ( input === '' || typeof input !== 'string' ? input
  : parseDomain (input, percentCoded) )

// The difference with the above is that the host cannot be ''
const parseWebHost = (input, percentCoded = true) =>
  ( typeof input !== 'string' ? input
  : parseDomain (input, percentCoded) )

const validateOpaqueHost = (input, percentCoded = true) => {
  if (_opaqueHostCodes.test (input)) return input
  else throw new Error (`The hostname in //${input} contains forbidden host codepoints`)
}


// NB parseDomain returns a domain **or an ipv4 address**.

const toUniodeOptions = {
  checkBidi: true,
  checkHyphens:false,
  checkJoiners: true,
  useSTD3ASCIIRules: false,
  processingOption: "nontransitional",
}

const toASCIIOptions = {
  checkBidi: true,
  checkHyphens: false,
  checkJoiners: true,
  useSTD3ASCIIRules: false,
  processingOption: 'nontransitional',
  verifyDNSLength: false // REVIEW
}

function parseDomain (input, percentCoded = true) {
  let r = percentCoded ? pct.decode (input) : input
  const { domain, error } = tr46.toUnicode (r, toUniodeOptions)
  if (error)
    throw new Error (`The hostname in //${input} cannot be parsed as a domain name`)
  const address = ipv4.parse (domain)
  if (address != null) return address
  if (domain === '' || _endsInNumber.test (domain))
    throw new Error (`The hostname in //${input} cannot be parsed as a domain name`)
  if (_isDomainString.test (domain)) return domain.split ('.')
    throw new Error (`The hostname in //${input} cannot be parsed as a domain name`)
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

// Tokeniser states:
// { start, hex, decimal }

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

const domainToASCII = domain => {
  const domainString = domain.join ('.')
  const ASCIIString = tr46.toASCII (domainString, toASCIIOptions)
  if (ASCIIString != null)
    return tr46.toASCII (domainString, toASCIIOptions) .split ('.')
  else log (domain, ASCIIString)
}

const _isASCIIString =
  /^[\0-\x7E]*$/

const _opaqueHostCodes =
  /^[^\x00\x09\x0A\x0D\x20#/:<>?@[\\\]^|]*$/

const _isDomainString =
  /^[^\x00-\x20\x7F#%/:<>?@[\\\]^|]*$/

const _endsInNumber =
  /(^|[.])([0-9]+|0[xX][0-9A-Fa-f]*)[.]?$/



// Exports
// =======

export { ipv6, ipv4, types as hostTypes, hostType, parseHost, parseWebHost, validateOpaqueHost, printHost, parseDomain, domainToASCII }