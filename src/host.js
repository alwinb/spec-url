const log = console.log.bind (console)
import { pct } from './characters.js'
import tr46 from 'tr46'


// Host Model
// ==========

// Host := 
//  IPv6Adddress | DomainName | IPv4Address | String

// The various Host objects are implemented as wrappers around an internal
// representation value. This internal value is stored under the property
// with a Symbol-key `valueKey`, abbreviated to $ for convenience.

const valueKey = Symbol ('$')
const $ = valueKey

// ### IPv6 Address

class URLIPv6Address {
  
  constructor (input) {
    this [$] = [0,0,0,0, 0,0,0,0]

    switch (typeof input) {
      case 'string':
        return (this[$] = ipv6.parse (input), this)
      case 'object':
        if (input && input instanceof URLIPv6Address)
          return (this[$] = [...input[$]], this)
      default:
        throw new Error (`Invalid IPv6 address ${String(input)}`)
    }
  }

  toString () {
    return `[${ipv6.print (this [$])}]`
  }

}

// ### URLDomainName

class URLDomainName {
  
  constructor (string) {
    this[$] = string
  }

  // TODO methods for mapping it into unicode / ASCII;
  // what about the percent encoding ? -- that'd be part of the OpaqueHost thing
  
  toString () {
    return this[$]
  }

}

// ### IPv4 Address

class URLIPv4Address {

  constructor (input) {
    this [$] = 0

    switch (typeof input) {

      case 'object': if (input && input instanceof URLIPv4Address)
        return (this[$] = input[$], this)

      case 'string':
        input = ipv4.parse (input) // fall through

      case 'number':
        if (input < 0 || input >= 256**4)
          throw new RangeError (`Invalid IPv4 address: <${input}>`)
        return (this [$] = input, this)

      default:
        input = String (input)
        throw new Error (`Invalid IPv4 address: <${input}>`)
    }
  }

  toString () {
    return ipv4.print (this [$])
  }

}


// Host Parsing
// ------------

function parseHost (input, { parseDomain = false, percentCoded = true } = { }) {
  return typeof input === 'string' && input.length && input[0] === '['
    ? new URLIPv6Address (input)
    : parseDomain && input.length
    ? parseDomainOrIPv4Address (input, percentCoded)
    : input
}

function printHost (h) {
  return String (h)
}

function isLocalHost (host) {
  // REVIEW should this also work with opaque hosts?
  return (typeof host === 'object' && host && host instanceof URLDomainName
    && _lc_equiv (host [$], 'localhost'))
}

function _lc_equiv (s1, s2) {
  const len = s1.length
  let r = len === s2.length
  for (let i=0; r && i<len; i++)
    r = (s1.charCodeAt(i) | 32) === (s2.charCodeAt(i) | 32)
  return r
}


// IPv6 Addresses
// --------------

// Regex literal
// whitespace insignificant for readability

const rx = (...args) => {
  const r = new RegExp (String.raw (...args) .replace (/\s/g, ''), 'y')
  r.captures = []
  return r
}

// Tokeniser states:
// { start, hex, decimal }

const _start = rx
  ` ([0-9]+)([.])
  | ([0-9A-Fa-f]+)(:)?
  | (::)`

const _hex = rx
  ` ([0-9]+)([.])
  | ([0-9A-Fa-f]+)(:)?
  | (:)`

const _dec = rx
  `([0-9]+)([.])?`

const ipv6 = {

  parse (input) {
    
    if ('[' === input[0] && input[input.length-1] === ']')
      input = input.substring (1, input.length-1)

    const parts = []
    const ip4 = []
    let match, compress = null
    let state = _start
    let p = state.lastIndex = 0
  
    while (match = state.exec (input)) {
      p = state.lastIndex

      if (match[1]) { // decimal number - ipv4 part
        ip4.push (+match[1])
        if (!match[2]) break // ipv4 dot separator `.`
        state = _dec }

      else if (match[3]) { // hex number - ipv6 part
        parts.push (parseInt (match[3], 16))
        if (!match[4]) break // ipv6 separator `:`
        state = _hex }

      else if (match[5]) { // ipv6 compress `::` or separator `:`
        if (compress == null) compress = parts.length
        else throw new SyntaxError (`Invalid IPv6 address: ${input}`)
        state = _hex }
      
      state.lastIndex = p
    }

    if (p !== input.length || ip4.length && ip4.length !== 4)
      throw new SyntaxError (`Invalid IPv6 address: ${input}`)

    if (ip4.length) {
      const [n1, n2, n3, n4] = ip4
      parts.push (0x100 * n1 + n2, 0x100 * n3 + n4)
    }

    if (compress == null && parts.length !== 8)
      throw new SyntaxError (`Invalid IPv6 address: ${input}`)

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

const _isDomainString =
  /^[^\x00-\x20\x7F#%/:<>?@[\\\]^|]+$/

const _endsInNumber =
  /(^|[.])([0-9]+|0[xX][0-9A-Fa-f]*)[.]?$/

function parseDomainOrIPv4Address (input, percentCoded = true) {
  let r = percentCoded ? pct.decode (input) : input

  const { domain, error } = tr46.toUnicode (r, toUniodeOptions)
  if (error)
    throw new Error (`parseDomainOrIPv4Address: The hostname <${input}> is not a valid encoded domain-name`)

  const address = ipv4.parse (domain)
  if (address != null) return new URLIPv4Address (address)

  if (_endsInNumber.test (domain))
    throw new Error (`parseDomainOrIPv4Address: The last domain-name--label in <${input}> must not be a numeric string`)

  if (_isDomainString.test (domain))
    return new URLDomainName (domain)

  throw new Error (`parseDomain: The hostname <${input}> cannot be parsed as a domain-name, nor as an IPv4 address`)
}

function domainToASCII (domain) {
  const domainString = domain [$]
  const ASCIIString = tr46.toASCII (domainString, toASCIIOptions)
  if (ASCIIString != null) return new URLDomainName (ASCIIString)
  else throw new Error (`domainToASCII: invalid domain ${domain}`)
}

// An alternative option is to piggy-back on the URL constructor
// so as to avoid having to include the rather large tr46.
// The disadvantage of that is that then we lose the ability to print
// the full unicode version of the domain. 

function domainToASCII_alt (domain) {
  const domainString = domain[$]
  if (domainString.length === 1 && domainString[0] === 'a')
    return new URLDomainName ('a')

  const u = new URL ('http://a/')
  u.hostname = domainString

  const ASCIIString = u.hostname
  if (ASCIIString === 'a') throw new Error (`domainToASCII: invalid domain ${domainString}`)
  else return new URLDomainName (ASCIIString)
}


// IPv4 Addresses
// --------------

const _ip4num = rx
  `(?: 0[xX]([0-9A-Fa-f]*)
     | (0[0-7]*)
     | ([1-9][0-9]*)
   )([.])?`

// match[1]: hex
// match[2]: octal
// match[3]: decimal
// match[4]: trailing dot

const ipv4 = {

  parse (input) {
    _ip4num.lastIndex = 0
    let addr = 0, count = 0
    let match, err = false
    while ((match = _ip4num.exec (input))) {
      count++
      const num
        = match[1] != null ? parseInt (match[1]||'0', 16)
        : match[2] != null ? parseInt (match[2], 8)
        : parseInt (match[3], 10)

      if (_ip4num.lastIndex === input.length) {
        const rest = 5 - count
        if (err || (num >= 256**rest))
          throw new RangeError (`Invalid IPv4 address: <${input}>`)
        return ((addr << 8 * rest) + num) >>> 0 }

      else {
        if (count === 4 || !match[4]) return null
        err = err || (num > 255)
        addr = (addr << 8) + num
      }
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


// Exports
// =======

export { 
  URLIPv6Address, URLDomainName, URLIPv4Address,
  parseHost, printHost, isLocalHost, 
  domainToASCII, ipv6, ipv4,
}