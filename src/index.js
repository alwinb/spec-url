import punycode from 'punycode'
import { utf8, pct, encodeProfiles as profiles, PercentEncoder, encodeSets as sets } from './pct.js'
import { parseHost, ipv4, ipv6 } from './host.js'
const { setPrototypeOf:setProto, assign } = Object
const log = console.log.bind (console)

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

const modeFor = (url, fallback = modes.generic) =>
  ( url.scheme ? specials [low (url.scheme)] || modes.generic
  : url.drive ? modes.file
  : fallback )

const isFragment = url =>
  url.hash != null && ord (url) === ords.hash

const low = str =>
  str ? str.toLowerCase () : str


// Validation
// ----------

// ### URL - Structural invariants

const errors = url => {
  const mode = modeFor (url)
  const errs = authErrors (url, mode) || []

  // drive-letter constraint
  if (url.drive && mode !== modes.file)
    errs.push (`A non file-URL cannot have a drive`)

  // path-root constraint
  if (!url.root && (url.host != null || url.drive) && (url.dirs || url.file))
    errs.push (`A URL with a ${url.drive ? 'drive' : 'host'} must have an absolute path`)

  return errs.length ? errs : null
}

// ### Authority - Structural invariants

const authErrors = (auth, mode = modes.generic) => {
  const errs = []

  if (auth.port != null)
    if (mode & modes.file) errs.push (`A file-URL cannot have a port`)
    else if (!auth.host) errs.push (`A URL without a host cannot have a port`)

  if (auth.user != null || auth.pass != null)
    if (mode & modes.file) errs.push (`A file-URL cannot have credentials`)
    else if (!auth.host) errs.push (`A URL without a host cannot have credentials`)

  if (auth.pass != null && auth.user == null)
    errs.push (`A URL without a username cannot have a password`)
  
  // NB I do allow web-URLs to have an empty host
  // This is however is *not* allowed for *resolved* web-URLs.
  
  return errs.length ? errs : null
}


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


// Forcing
// -------

class ForceError extends TypeError {
  constructor (url) {
    super (`Cannot coerce <${print(url)}> to a base-URL`)
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
      const errs = authErrors (url)
      if (errs) throw new ForceError (url)
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

// Opaque paths - WHATWG specific

const hasOpaquePath = url =>
  url.root == null && url.host == null && modeFor (url) === modes.generic

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
  if (url1.scheme || isFragment (url1) || url2.host != null || url2.root)
    return genericResolve (url1, url2)
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

  if (hasOpaquePath (url) && url.dirs)
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

const percentEncode = (url, spec = 'normal') => {
  const r = { }
  const mode = modeFor (url, modes.generic)
  // TODO strictly speaking, IRI must encode more than URL
  const unicode = spec === 'minimal' || spec === 'URL' || spec === 'IRI'
  const encode = new PercentEncoder ({ unicode, incremental:true }) .encode
  const profile = spec === 'minimal' ? profiles.minimal
    : spec === 'normal' ? (mode & modes.special ? profiles.normal_special : profiles.normal)
    : profiles.valid

  if (url.scheme != null)
    r.scheme = url.scheme

  if (url.user != null)
    r.user = encode (url.user, profile.user)

  if (url.pass != null)
    r.pass = encode (url.pass, profile.pass)

  if (url.host != null) {
    if (_isIp6 (url.host))
      r.host = url.host
    else if (!unicode && mode & modes.special)
      r.host = punycode.toASCII (url.host)
    else
      r.host = encode (url.host, profile.host)
  }

  if (url.port != null)
    r.port = url.port

  if (url.drive != null)
    r.drive = url.drive

  if (url.root)
    r.root = '/'

  // ... opaque paths
  const seg_esc = mode === modes.generic && hasOpaquePath (url)
    ? profiles.minimal.dir | sets.c0c1 : profile.dir

  if (url.dirs) {
    r.dirs = []
    for (const x of url.dirs)
      r.dirs.push (encode (x, seg_esc))
  }

  if (url.file != null)
    r.file = encode (url.file, seg_esc)

  if (url.query != null)
    r.query = encode (url.query, profile.query)

  if (url.hash != null)
    r.hash = encode (url.hash, profile.hash)

  return r
}

// Percent decoding
// TODO consider doing puny decoding as well

const _dont = { scheme:1, port:1, drive:1, root:1 }
const percentDecode = url => {
  const r = { }
  for (let k in tags) if (url[k] != null)
    r[k] = _dont [k] ? url[k]
      : k === 'dirs' ? url[k] .map (pct.decode)
      : pct.decode (url[k])
  return r
}


// TODO design the ip4/ip6 host representation for the spec

const _isIp6 = str => 
  str != null && str[0] === '[' && str[str.length-1] === ']'


// URL Printing
// ------------

const isSchemeLike =
  /^([a-zA-Z][a-zA-Z+\-.]*):(.*)$/

const isDriveLike = 
  /^([a-zA-Z])(:||)$/

const print = (url, spec = 'minimal') => {
  url = percentEncode (url, spec)

  // prevent accidentally producing an authority or a path-root

  const authNorDrive = url.host == null && url.drive == null
  const emptyFirstDir = url.dirs && url.dirs[0] === ''

  if (authNorDrive && emptyFirstDir)
    url.dirs.unshift ('.')

  // prevent accidentally producing a scheme

  let match
  if (ord (url) === ords.dir && (match = isSchemeLike.exec (url.dirs[0])))
    url.dirs[0] = match[1] + '%3A' + match[2]

  if (ord (url) === ords.file && (match = isSchemeLike.exec (url.file)))
    url.file = match[1] + '%3A' + match[2]

  // TODO prevent accidentally producing a drive

  return unsafePrint (url)
}

// ### Printing the path of an URL

const pathname = ({ drive, root, dirs, file }, spec) =>
  print ({ drive, root, dirs, file }, spec)

const filePath = ({ drive, root, dirs, file }) =>
  unsafePrint (percentDecode ({ drive, root, dirs, file }))
  // TODO consider throwing an error if a dir or a file contains '/'

// ### Printing prepared URLs

const unsafePrint = url => {
  let result = ''
  const hasCredentials = url.user != null
  for (const k in tags) if (url[k] != null) {
    const v = url[k]
    result +=
      k === 'scheme' ? ( v + ':') :
      k === 'user'   ? ('//' + v) :
      k === 'pass'   ? ( ':' + v) :
      k === 'host'   ? ((hasCredentials ? '@' : '//') + v) :
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
        const errs = authErrors (url, mode)
        if (errs) {
          const message = '\n\t- ' + errs.join ('\n\t- ') + '\n'
          throw new Error (`Invalid URL-string <${input}> ${message}`)
        }
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
        throw new Error (`Authority parser: Port out of bounds <${input}>`)
    }
  }
  else throw new Error (`Authority parser: Illegal authority <${input}>`)
  host = parseHost (host, mode, percentCoded)
  const auth = { user, pass, host, port }
  for (const k in auth) if (auth[k] == null) delete auth[k]
  return auth
}


// WHATWG Parse Resolve and Normalise
// ----------------------------------

const WHATWGParseResolve = (input, base) => {
  let resolved;
  if (base != null) {
    const baseUrl = parse (base)
    const url = parse (input, modeFor (baseUrl))
    resolved = WHATWGResolve (url, baseUrl)
  }
  else resolved = force (parse (input))
  return percentEncode (normalise (resolved))
}


// Exports
// =======

const version = '2.2.0-dev'
const unstable = { utf8, pct, PercentEncoder }

export {
  version,
  
  errors,
  modes, modeFor, 

  ords, ord, upto, goto, 
  forceAsFileUrl, forceAsWebUrl, force, 
  hasOpaquePath, genericResolve, legacyResolve,
  WHATWGResolve, WHATWGResolve as resolve,

  normalise, normalise as normalize,
  percentEncode, percentDecode,

  parse, parseAuth, parseHost,
  WHATWGParseResolve, WHATWGParseResolve as parseResolve,

  ipv4, ipv6,
  unsafePrint, print,
  pathname, filePath,
  unstable
}