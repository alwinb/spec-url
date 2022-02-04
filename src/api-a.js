import { parseRebase as parse, print, printHost, pathname, rebase, resolve, normalize, percentEncode } from './index.js'
import { parsePort } from './auth.js'
import { inspect } from 'util'
const { assign, defineProperty:define } = Object
const log = console.log.bind (console)


// URLReference
// ============

// The URLReference class is implemented by wrapping an URL object
// as used in spec-url core; stored under a private Symbol.

const store = Symbol ()

// Cast arbitrary input to a spec-url URL object

function toURL (input, base) {
  if (base != null) 
    base = base instanceof URLReference
    ? base [store] : parse (String (base))
  return input instanceof URLReference
    ? rebase (input [store], base) : parse (String (input), base)
}

// Keys for node.js custom inspect

const _inspectKeys = [
  'href', 'origin', 'protocol',
  'username', 'password', 'hostname', 'port',
  'pathname', 'search', 'hash' ]



// URLReference API
// ----------------

class URLReference {

  constructor (input = '', base = null) {
    const value = toURL (input, base)
    define (this, store, { value, writable:true })
  }

  toString () { return print (this[store], 'URL') }
  toJSON () { return print (this[store], 'WHATWG') }

  // ### Getters

  get href () { return print (this[store], 'WHATWG') }

  get origin () {
    const { scheme, host } = this[store]
    return scheme == null || host == null ? null
      : `${scheme}://${this.hostname}`
  }

  get scheme () { return this[store].scheme ?? null }
  get username () { return this[store].user ?? null }
  get password () { return this[store].pass ?? null }

  get hostname () {
    const { host } = this[store]
    return host == null ? host : printHost (host)
  }

  get port () { return this[store].port ?? null }
  get pathname () { return pathname (this[store]) }
  get query () { return this[store].scheme ?? null }
  get fragment () { return this[store].hash ?? null }
  
  // Additions

  get driveletter () { return this[store].drive ?? null } // REVIEW
  get pathroot () { return this[store].root ?? null } // REVIEW

  // ### Setters

  set href (value) {
    this[store] = parse (value)
  }

  set scheme (value) {
    // Uses the somewhat strange protocol setter // REVIEW
    this.protocol = value
  }
  
  set username (value) { 
    if (this[store].host != null)
      this[store].user = value
    else throw new Error (`Cannot set a username on an URL <${this.href}> that does not have an authority`)
  }
  
  set password (value) {
    const { host, user } = this[store]
    if (host != null && user != null)
      this[store].pass = value
    else throw new Error (`Cannot set a password on an URL <${this.href}> that does not have a username`)
  }

  set hostname (value) {
    // TODO
    // NB the WHATWG stops parsing at / ? #
    // And what to do with empty?
  }

  set port (value) {
    if (this[store].host != null) {
      value = parsePort (String (value))
      this[store].port = value
    }
    else throw new Error (`Cannot set a port on an URL <${this.href}> that does not have an authority`)
  }

  set pathname (value) {
    // TODO. Note that # and ? will be escaped;
    // slash conversion depends on the scheme,
  }

  set query (value) { // Allows setting a '' value
    if (value == null) delete this[store].query
    else this[store].query = String (value)
  }

  set fragment (input) { // Allows setting a '' value
    if (input == null) delete this[store].hash
    else this[store].hash = String (input)
  }

  // ### Methods
  
  rebase (other) {
    const r = new URLReference ('')
    r[store] = rebase (this[store], toURL (other))
    return r
  }
  
  resolve (other) {
    // REVIEW resolve also normalises. Should it?
    const r = new URLReference ('')
    r[store] = percentEncode (normalize (resolve (this[store], toURL (other))))
    return r
  }

  normalize () {
    // REVIEW should this return a new URL instead?
    this[store] = percentEncode (normalize (this [store]))
    return this
  }

  // ### Private

  [Symbol.toStringTag] ()
    { return 'URLReference' }

  [inspect.custom] () {
    const r = new (function URLReference () { }) // Ugh
    for (const k of _inspectKeys) {
      const v = this[k]
      if (v != null) r[k] = v
    }
    return r
  }

  // ### Included for compatibility with existing URL API

  get protocol () {
    const { scheme } = this[store]
    return scheme ? scheme + ':' : null
  }
  
  get host () {
    const { host, port } = this[store]
    if (host == null) return null
    return printHost (host) + (port != null ? ':' + port : '')
  }

  get search () {
    const { query } = this[store]
    return query != null ? ('?' + query) : null
  }

  get hash () {
    const { hash } = this[store]
    return hash != null ? ('#' + hash) : null
  }

  set protocol (input) { // Ignores anything after ':'
    // TODO be pedantic about drive letters
    let match
    if (input == null || (str = String (input)) === '')
      delete this[store].scheme
    else if ((match = /(^[a-zA-Z][a-zA-Z.+-]*)[:]?/.exec (input)))
      this[store].scheme = match[1]
  }

  set host (value) {
    // REVIEW avoid parsing the host, or do, but allow errors?
    const { user, pass, host, port } = parse ('//' + value)
    assign (this[store], { user, pass, host, port })
  }

  set search (input) { // Strips a leading '?'
    if (input == null || (str = String (input)) === '')
      delete this[store].query
    else this[store].query = str[0] === '?'
      ? str.substring (1) : str
  }

  set hash (input) { // Strips a leading '#'
    if (input == null || (str = String (input)) === '')
      delete this[store].hash
    else this[store].hash = str[0] === '#'
      ? str.substring (1) : str
  }

}


// Export
// ------

export default URLReference