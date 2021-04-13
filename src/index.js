const punycode = require ('punycode')
const { pct, getProfile } = require ('./pct')
const { parseHost } = require ('./host')
const { setPrototypeOf:setProto, assign } = Object

// URL Core
// ========

// Model
// -----

const tags = { 
  scheme:1,
  user:2, pass:2,
  host:2, port:2,
  drive:3,
  root:4, dirs:5, file:6,
  query:7, hash:8
}

const modes =
  { generic:0, web:1, file:2, special:3 }

const specials =
  { http:1, https:1, ws:1, wss:1, ftp:1, file:2 }

const modeFor = ({ scheme }) =>
  specials [low (scheme)] || modes.generic

const isBase = ({ scheme, host, root }) =>
  scheme != null && (host != null || root != null)

const isResolved = url => {
  const o = ord (r)
  return o === tags.scheme || o === tags.hash && r.hash != null
}

const low = str =>
  str ? str.toLowerCase () : str


// Reference Resolution
// --------------------

const ord = url => {
  for (const k in tags)
    if (url[k] != null) return tags[k]
  return tags.hash
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

// ### The Goto operations

const goto = (url1, url2, { strict = false } = { }) => {
  const { scheme:s1 } = url1, { scheme:s2 } = url2
  if (!strict && s1 && s2 && low (s1) === low (s2)) {
    url1 = setProto ({ scheme:s2   }, url1)
    url2 = setProto ({ scheme:null }, url2)
  }
  return strictGoto (url1, url2)
}

// #### Strict Goto

const strictGoto = (url1, url2) => {
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

// ### Resolution Operations

const preResolve = (url1, url2) =>
  isBase (url2) || ord (url1) === tags.hash
    ? goto (url2, url1, { strict:false })
    : url1

const resolve = (url1, url2) => {
  const r = preResolve (url1, url2), o = ord (r)
  if (o === tags.scheme || o === tags.hash && r.hash != null) return r
  else throw new Error (`Failed to resolve <${print(url1)}> against <${print(url2)}>`)
}

// ### The Force operation

const forceFileUrl = url => {
  url = assign ({ }, url)
  if (url.host == null) url.host = ''
  if (url.drive == null) url.root = '/'
  return url
}

const forceWebUrl = url => {
  url = assign ({ }, url)
  if (!url.host) {
    let str = url.host
    const dirs = url.dirs ? url.dirs.slice () : []
    while (!str && dirs.length) str = dirs.shift ()
    if (!str) { str = url.file; delete url.file }
    if (str) {
      assign (url, parseAuth (str, modes.web))
      if (dirs.length) url.dirs = dirs
      else delete url.dirs
    }
    else throw new Error ('Cannot force <'+print(url)+'>')
  }
  url.root = '/'
  return url
}

const force = url => {
  const mode = specials [low (url.scheme)] || modes.generic
  if (mode === modes.file) return forceFileUrl (url)
  else if (mode === modes.web) return forceWebUrl (url)
  else return url
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
  const r = assign ({}, url)
  const profile = profileFor (url)
  for (const k in tags) {
    if (k === 'dirs' && url.dirs) {
      const _dirs = (r.dirs = [])
      for (const x of url.dirs)
        _dirs.push (pct.encode (x, profile.dir, options))
    }
    else if (k === 'host' && url[k] != null) {
      // TODO use type flags to distinguish domains rather than this..
      if (_isIp6 (url.host)) continue
      else if (options.ascii && modeFor (url) & modes.special) r[k] = punycode.toASCII (url[k])
      else r[k] = pct.encode (url[k], profile[k], options)
    }
    else if (k in profile && url[k] != null)
      r[k] = pct.encode (url[k], profile[k], options)
  }
  return r
}

// TODO design the ip4/ip6 host representation for the spec

const _isIp6 = str => 
  str != null && str[0] === '[' && str[str.length-1] === ']'

const profileFor = (url, fallback) => {
  const special = modeFor (url) & modes.special
  const minimal = special ? false : !isBase (url)
  return getProfile ({ minimal, special })
}

// TODO the WhatWG spec requires encoding all non-ASCII, but it makes sense to
// make that configurable also in the URL Standard. 
// It may even be possible to create profiles that produce RFC 3986 URIs and
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
      || (isSlash || c === QUE) && state < QUERY
      || c === HASH && state < FRAG
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

    const isAlpha =
      0x41 <= c && c <= 0x5A || 0x61 <= c && c <= 0x7A

    if (state & SCHEME && isAlpha)
      state = SCHEME

    else if (state === SCHEME && (c !== PLUS && c !== MIN && c !== DOT) && (c < 48 || 57 < c))
      state = PATH

    else if (state & (START|SS)) {
      if (slashes) url.root = '/'
      state = PATH
    }

    if (mode & modes.file && !url.drive && !url.dirs && state < QUERY) {
      isDrive = letter && (c === BAR || state &~ SCHEME && c === COL)
      letter = !buffer && isAlpha
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

  // Disabled, to allow force to take care of that
  // if (mode === modes.web && !host)
  //   throw new Error ('ERR_INVALID_WEB_HOST')

  host = parseHost (host, mode, percentCoded)
  const auth = { user, pass, host, port }
  for (const k in auth) if (auth[k] == null) delete auth[k]
  return auth
}


// Exports
// =======

module.exports = {
  isBase, isResolved,
  ord, upto, goto, preResolve, resolve, force,
  normalise, normalize:normalise,
  percentEncode,
  modes, modeFor, parse, parseAuth, parseHost,
  print,
}