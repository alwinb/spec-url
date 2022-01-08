import punycode from 'punycode'
import { utf8, pct, getProfile, isInSet } from './pct.js'
import { parseHost, ipv4, ipv6 } from './host.js'
const { setPrototypeOf:setProto, assign } = Object

// URL Core
// ========

// Model
// -----

const ords =
  { scheme:1, auth:2, drive:3, root:4, dir:5, file:6, query:7, hash:8 }

const modes =
  { generic:0, web:1, file:2, special:3 }

const specials =
  { http:1, https:1, ws:1, wss:1, ftp:1, file:2 }

const modeFor = ({ scheme }, fallback = modes.generic) =>
  specials [low (scheme)] || fallback

const isFragment = url =>
  url.hash != null && ord (url) === ords.hash

const low = str =>
  str ? str.toLowerCase () : str


// Order, Upto and Goto operations
// -------------------------------

const tags = {
  scheme:1, user:2, pass:2, host:2, port:2, drive:3,
  root:4, dirs:5, file:6, query:7, hash:8
}

const ord = url => {
  for (const k in tags)
    if (url[k] != null) return tags[k]
  return ords.hash
}

const upto = (url, ord) => {
  const r = { }
  for (const k in tags)
    if (url[k] == null) continue
    else if (tags[k] < ord) r[k] = url[k]
    else if (tags[k] === ord && k === 'dirs')
      r[k] = url[k] .slice (0)
  return r
}

const goto = (url1, url2) => {
  const r = upto (url1, ord (url2))
  for (const k in tags)
    if (url2[k] == null) continue
    else if (k === 'dirs')
      r.dirs = [...(r.dirs||[]), ...url2.dirs]
    else r[k] = url2[k]
  // Patch up root if needed
  if ((r.host != null || r.drive) && (r.dirs || r.file))
    r.root = '/'
  return r
}


// Base URLs
// ---------

const isBase = ({ scheme, host, drive, root }) => {
  const mode = specials [low (scheme)] || modes.generic
  return scheme &&
    ( mode & modes.file ? host != null && (drive || root)
    : mode & modes.web  ? host && root
    : host != null || root ) // last one is WHATWG specific
}

class ForceError extends TypeError {
  constructor (url) {
    super (`Cannot coerce ${print(url)} to a base-URL`)
  }
}

const forceAsFileUrl = url => {
  url = assign ({ }, url)
  if (url.host == null) url.host = ''
  if (url.drive == null) url.root = '/'
  return url
}

const forceAsWebUrl = url => {
  url = assign ({ }, url)
  if (!url.host) {
    let str = url.host
    const dirs = url.dirs ? url.dirs.slice () : []
    while (!str && dirs.length) str = dirs.shift ()
    if (!str) { str = url.file; delete url.file }
    if (str) {
      try { assign (url, parseAuth (str, modes.web)) }
      catch (e) { throw new ForceError (url) }
      if (dirs.length) url.dirs = dirs
      else delete url.dirs
    }
    else throw new ForceError (url)
  }
  url.root = '/'
  return url
}

const force = url => {
  const mode = specials [low (url.scheme)] || modes.generic
  if (mode === modes.file) return forceAsFileUrl (url)
  else if (mode === modes.web) return forceAsWebUrl (url)
  else if (url.scheme) return url
  else throw new ForceError (url)
}


// Reference Resolution
// --------------------

class ResolveError extends TypeError {
  constructor (url1, url2) {
    super (`Cannot resolve <${print(url1)}> against <${print(url2)}>`)
  }
}

// 'Strict' Reference Resolution according to RFC3986

const genericResolve = (url1, url2) => {
  if (url1.scheme || url2.scheme) return goto (url2, url1)
  else throw new ResolveError (url1, url2)
}

// 'Non-strict' Reference Resolution according to RFC3986

const legacyResolve = (url1, url2) => {
  if (url1.scheme && low (url1.scheme) === low (url2.scheme))
    ( url2 = setProto ({ scheme:url1.scheme }, url2)
    , url1 = setProto ({ scheme:null }, url1) )
  return genericResolve (url1, url2)
}

// WHATWG style reference resolution

const WHATWGResolve = (url1, url2) => {
  const mode = url1.scheme ? modeFor (url1) : modeFor (url2)
  if (mode & modes.special)
    return force (legacyResolve (url1, url2))
  if (isBase (url2))
    return genericResolve (url1, url2)
  if (url2.scheme && (url1.scheme || isFragment (url1))) // opaque-path-resolve
    return goto (url2, url1)
  else throw new ResolveError (url1, url2)
}


// Normalisation
// -------------

const normalise = (url, coded = true) => {

  const r = assign ({}, url)

  // ### Scheme normalisation

  const scheme = low (r.scheme)
  r.scheme = scheme

  // ### Authority normalisation

  if (r.pass === '') delete r.pass
  if (!r.pass && r.user === '') delete r.user
  if (r.port === '') delete r.port

  // ### Path segement normalisation

  if (!isBase (url) && url.dirs)
    r.dirs = r.dirs.slice ()

  else {
    const dirs = []
    for (const x of r.dirs||[]) {
      const isDots = dots (x, coded)
      if (isDots === 2) dirs.pop ()
      else if (!isDots) dirs.push (x)
    }
    if (r.file) {
      const isDots = dots (r.file, coded)
      if (isDots === 2) dirs.pop ()
      if (isDots) delete r.file
    }
    if (dirs.length) r.dirs = dirs
    else delete r.dirs
  }

  // ### Drive letter normalisation

  if (r.drive)
    r.drive = r.drive[0] + ':'

  // ### Scheme-based authority normalisation

  if (scheme === 'file' && r.host === 'localhost')
    r.host = ''

  else if (url.port === 80 && (scheme === 'http' || scheme === 'ws'))
    delete r.port

  else if (url.port === 443 && (scheme === 'https' || scheme === 'wss'))
    delete r.port

  else if (url.port === 21 && scheme === 'ftp')
    delete r.port

  for (const k in tags)
    if (r[k] == null) delete r[k]
  return r
}

// where

const dots = (seg, coded = true) =>
  seg.length <= 3
    && (seg === '.'
    || coded && low (seg) === '%2e') ? 1 :
  seg.length <= 6
    && (seg === '..'
    || coded && low (seg) === '.%2e'
    || coded && low (seg) === '%2e.'
    || coded && low (seg) === '%2e%2e') ? 2 : 0


// Percent Coding URLs
// -------------------

// NB uses punycoding rather than percent coding on domains

const percentEncode = (url, options = { ascii:true }) => {
  const r = {}, profile = profileFor (url)
  for (const k in tags) if (url[k] != null) {
    const v = url[k]
    if (k === 'dirs') {
      const _dirs = (r.dirs = [])
      for (const x of v)
        _dirs.push (pct.encode (x, profile.dir, options))
    }
    else if (k === 'host') {
      // TODO use type flags to distinguish domains rather than this..
      if (_isIp6 (v)) r[k] = v
      else if (modeFor (url) & modes.special)
        r[k] = options.ascii ? punycode.toASCII (v) : v
      else r[k] = pct.encode (v, profile[k], options)
    }
    else r[k] = k in profile ? pct.encode (v, profile[k], options) : v
  }
  return r
}

const _decode = getProfile ({})
const percentDecode = url => {
  const r = {}
  for (let k in tags) if (url[k] != null)
    r[k] = k === 'dirs' ? url[k] .map (pct.decode)
      : k in _decode ? pct.decode (url[k])
      : url[k]
  return r
}


// TODO design the ip4/ip6 host representation for the spec

const _isIp6 = str => 
  str != null && str[0] === '[' && str[str.length-1] === ']'

const profileFor = (url, fallback) => {
  const special = modeFor (url, fallback) & modes.special
  const minimal = special ? false : !isBase (url)
  return getProfile ({ minimal, special })
}

// TODO the WhatWG spec requires encoding all non-ASCII, but it makes sense to
// make that configurable also in the URL Standard. 
// It should be possible to create profiles that produce RFC 3986 URIs and
// RFC 3987 IRIs. 


// URL Printing
// ------------

const print = url => {
  const driveNorAuth = !url.drive && url.host == null
  const emptyFirstDir = url.dirs && url.dirs[0] === ''
  if (driveNorAuth && url.root && emptyFirstDir || !url.root && emptyFirstDir)
    url = setProto ({ dirs: ['.'] .concat (url.dirs) }, url)
  return _print (url)
}

const _print = url => {
  let result = ''
  const hasCreds = url.user != null
  for (const k in tags) if (url[k] != null) {
    const v = url[k]
    result +=
      k === 'scheme' ? ( v + ':') :
      k === 'user'   ? ('//' + v) :
      k === 'pass'   ? ( ':' + v) :
      k === 'host'   ? ((hasCreds ? '@' : '//') + v) :
      k === 'port'   ? (':' + v) :
      k === 'drive'  ? ('/' + v) :
      k === 'root'   ? ('/'    ) :
      k === 'dirs'   ? (v.join ('/') + '/') :
      k === 'file'   ? (v) :
      k === 'query'  ? ('?' + v) :
      k === 'hash'   ? ('#' + v) : ''
  }
  return result
}


// URL Parsing
// -----------

// Parser states
// Using bitflags, but also order

function* flags (a = 0, z = 30) {
  while (a <= z) yield 1<<a++ }

const [ START, SCHEME, SS, AUTH, PATH, QUERY, FRAG ]
  = flags ()

const [ CR, LF, TAB, SP, QUE, HASH, COL, PLUS, MIN, DOT, SL, SL2, BAR ] =
  [...'\r\n\t ?#:+-./\\|'] .map (_ => _.charCodeAt (0))

const isAlpha = c =>
  0x41 <= c && c <= 0x5A || 0x61 <= c && c <= 0x7A

// ### URL Parsing

function parse (input, mode = modes.web) {
  const url   = { }
  let state   = START|SCHEME
  let slashes = 0, letter = false, isDrive = false
  let buffer  = '', end = 0

  for (let i=0, l=input.length; i<=l; i++) { // includes NaN as an EOF code
    const c = input.charCodeAt (i)

    // Skip tabs, newlines, leading control-space and strip trailing control-space
    if (c === CR || c === LF || c === TAB || state & START && c <= SP) continue
    if (isNaN (c)) buffer = buffer.substr (0, end)

    // Handle the delimiters: (:), (/), (\), (?) and (#)

    const isSlash =
      c === SL || (mode & modes.special) && c === SL2

    if (isSlash && state & (START|SS)) {
      state = (++slashes === 2) ? AUTH : SS
      continue
    }

    const isDelim
      =  state === SCHEME && c === COL
      || state < QUERY && (isSlash || c === QUE)
      || state < FRAG  && c === HASH
      || isNaN (c) 

    if (isDelim) {

      if (state === SCHEME && c === COL) {
        url.scheme = buffer
        mode = modeFor (url)
      }
        
      else if (state === SS) {
        if (isSlash || slashes) url.root = '/'
      }

      else if (isDrive) {
        if (state & AUTH) url.host = ''
        url.drive = buffer
        delete url.root // keep the properties ordered
        if (isSlash) url.root = '/'
      }

      else if (state & AUTH) {
        assign (url, parseAuth (buffer, mode, true)) // TODO API
        if (isSlash) url.root = '/'
      }

      else if (state === QUERY)
        url.query = buffer

      else if (state === FRAG)
        url.hash = buffer

      else if (isSlash)
        (url.dirs = url.dirs || []) .push (buffer)

      else if (buffer)
        url.file = buffer

      state
        = c === COL ? SS
        : c === QUE ? QUERY
        : c === HASH ? FRAG : PATH

      letter = isDrive = false;
      [buffer, end] = ['', 0]
      continue
    }

    // Buffer characters otherwise;
    // Maintain state for scheme, path-root and drive

    if (state & SCHEME && isAlpha (c))
      state = SCHEME

    else if (state === SCHEME && (c !== PLUS && c !== MIN && c !== DOT) && (c < 0x30 || 0x39 < c))
      state = PATH

    else if (state & (START|SS)) {
      if (slashes) url.root = '/'
      state = PATH
    }

    if (mode & modes.file && !url.drive && !url.dirs && state < QUERY) {
      isDrive = letter && (c === BAR || state &~ SCHEME && c === COL)
      letter = !buffer && isAlpha (c)
    }
    else isDrive = false

    buffer += input[i]
    if (c > SP) end = buffer.length
  }

  return url
}

// ### Authority Parsing

const raw = String.raw
const group = _ => '(?:' + _ + ')'
const opt   = _ => '(?:' + _ + ')?'
const Rexp  = _ => new RegExp ('^' + _ + '$')

const
  port     = '[:]([0-9]*)',
  user     = '([^:]*)',
  pass     = '[:](.*)',
  host     = raw `(\[[^\]]*\]|[^\0\t\n\r #/:<>?@[\\\]^|]*)`,
  creds    = user + opt (pass) + '[@]',
  authExp  = Rexp (opt (creds) + host + opt (port))

function parseAuth (input, mode, percentCoded = true) {
  let match, user, pass, host, port, _
  if (input.length === 0) host = ''
  else if ((match = authExp.exec (input))) {
    [_, user, pass, host, port] = match
    if (port != null && port.length) {
      port = +port
      if (port >= 2**16)
        throw new Error ('ERR_INVALID_PORT') // 'Authority parser: Port out of bounds <'+input+'>')
    }
  }
  else throw new Error ('ERR_INVALID_AUTH') // 'Authority parser: Illegal authority <'+input+'>')

  // TODO move to enforceConstraints?
  if ((user != null || port != null) && !host)
    throw new Error ()

  if (mode === modes.file && (user != null || port != null))
    throw new Error ()

  host = parseHost (host, mode, percentCoded)
  const auth = { user, pass, host, port }
  for (const k in auth) if (auth[k] == null) delete auth[k]
  return auth
}


// WHATWG Parse Resolve and Normalise
// ----------------------------------

const WHATWGParseResolve = (input, base) => {
  if (base == null) {
    const resolved = force (parse (input))
    return percentEncode (normalise (resolved))
  }
  const baseUrl = parse (base)
  const baseMode = modeFor (baseUrl)
  const url = parse (input, baseMode)
  const resolved = WHATWGResolve (url, baseUrl)
  return percentEncode (normalise (resolved))
}


// Exports
// =======

const version = '2.0.0-dev.1'
const unstable = { utf8, pct, getProfile, isInSet }

export {
  version,
  ords, ord, upto, goto, 
  isBase, forceAsFileUrl, forceAsWebUrl, force, 
  genericResolve, legacyResolve, WHATWGResolve, WHATWGResolve as resolve,
  normalise, normalise as normalize,
  percentEncode, percentDecode,
  modes, modeFor, parse, parseAuth, parseHost,
  WHATWGParseResolve,
  ipv4, ipv6,
  print,
  unstable
}