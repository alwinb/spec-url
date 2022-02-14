import punycode from 'punycode'
import { parseAuth } from './auth.js'
import { hostType, hostTypes, parseHost, printHost, punyEncode, ipv6, ipv4 } from './host.js'
import { utf8, pct, profiles, specialProfiles, PercentEncoder, encodeSets as sets } from './pct.js'
const { setPrototypeOf:setProto, assign } = Object
const log = console.log.bind (console)

// URL Core
// ========

// Model
// -----

const ords =
  { scheme:1, auth:2, drive:3, root:4, dir:5, file:6, query:7, hash:8 }

const modes =
  { generic:1, noscheme:2, web:4, file:8, special:0b1100 }

const specials =
  { http:4, https:4, ws:4, wss:4, ftp:4, file:8 }

const modeFor = (url, fallback = modes.noscheme) =>
  ( url.scheme ? specials [low (url.scheme)] || modes.generic
  : url.drive ? modes.file
  : fallback )

const isFragment = url =>
  url.hash != null && ord (url) === ords.hash

const low = str =>
  str ? str.toLowerCase () : str


// ### Authority - Structural invariants

// NB I do allow web-URLs to have an empty host.
// Instead, force will ensure that their host is not empty.

const authErrors = (auth, mode = modes.generic) => {
  const errs = []
  const hasNoHost = auth.host == null || auth.host === ''

  if (auth.port != null)
    if (mode & modes.file) errs.push (`A file-URL cannot have a port`)
    else if (hasNoHost) errs.push (`A URL without a host cannot have a port`)

  if (auth.user != null || auth.pass != null)
    if (mode & modes.file) errs.push (`A file-URL cannot have credentials`)
    else if (hasNoHost) errs.push (`A URL without a host cannot have credentials`)

  if (auth.pass != null && auth.user == null)
    errs.push (`A URL without a username cannot have a password`)
  
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

const rebase = (url, base) =>
  goto (base, url)


// Forcing
// -------

class ForceError extends TypeError {
  constructor (url) {
    super (`Cannot coerce <${print(url)}> to a base-URL`)
    this.url = url
  }
}

const forceAsFileUrl = url => {
  url = assign ({ }, url)
  if (url.host == null) url.host = ''
  if (url.drive == null) url.root = '/'
  if (url.user != null || url.pass != null || url.port != null)
    throw new ForceError (url)
  return url
}

const forceAsWebUrl = url => {
  url = assign ({ }, url)
  try { 

    if (url.host == null || url.host === '') {
      const match = _firstNonEmptySegment (url)
      const auth = parseAuth (match.value)
      if (auth.host === '') throw null
      assign (url, auth)
      _removeSegments (url, match)
    }

    if (typeof url.host === 'string') {
      const host = parseHost (url.host, modes.web)
      if (!host) throw null
      else url.host = host
    }

    url.root = '/'
    return url
  }
  catch (e) {
  throw new ForceError (url) }
}

const force = url => {
  const mode = modeFor (url)
  if (mode === modes.file) return forceAsFileUrl (url)
  else if (mode === modes.web) return forceAsWebUrl (url)
  else if (url.scheme) return url
  else throw new ForceError (url)
}

// Utils

const _firstNonEmptySegment = url => {
  const dirs = url.dirs || []
  for (let i=0, l=dirs.length; i<l;i++) if (dirs[i])
    return { value:dirs[i], ord:ords.dir, index:i }
  if (url.file)
    return { value:url.file, ord:ords.file }
  throw null // not found
}

const _removeSegments = (url, match) => {
  if (match.ord === ords.dir) {
    const dirs_ = url.dirs.slice (match.index + 1)
    if (dirs_.length) url.dirs = dirs_
    else delete url.dirs
  }
  else if (match.ord === ords.file)
    delete url.file
  return url
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

  if (scheme === 'file' && isLocalHost (r.host))
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


const isLocalHost = host =>
  host === 'localhost' ||
  hostType (host) === hostTypes.domain && host.length === 1 && host[0] === 'localhost'



// Percent Coding URLs
// -------------------
// NB uses punycoding rather than percent coding on domains

const percentEncode = (url, spec = 'WHATWG') => {
  const r = { }

  // TODO strictly speaking, IRI must encode more than URL
  // -- and in addition, URI and IRI should decode unreserved characters
  // -- and should not contain invalid percent encode sequences
  const mode = modeFor (url)

  const unicode = spec in { minimal:1, URL:1, IRI:1 }
  const encode = new PercentEncoder ({ unicode, incremental:true }) .encode
  const profile = (mode & modes.special) 
    ? specialProfiles [spec] || specialProfiles.default
    : profiles [spec] || profiles.default

  if (url.scheme != null)
    r.scheme = url.scheme

  if (url.user != null)
    r.user = encode (url.user, profile.user)

  if (url.pass != null)
    r.pass = encode (url.pass, profile.pass)

  if (url.host != null) {
    const t = hostType (url.host)    
    r.host
      = t === hostTypes.ipv6 ? [...url.host]
      : t === hostTypes.ipv4 ? url.host
      : t === hostTypes.domain ? (unicode ? [...url.host] : punyEncode (url.host))
      : t === hostTypes.opaque ? encode (url.host, profile.host)
      : url.host
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
      k === 'host'   ? ((hasCredentials ? '@' : '//') + printHost (v)) :
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

function parse (input, mode = modes.noscheme) {
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
        assign (url, parseAuth (buffer))
        const host = parseHost (url.host, mode)
        if (host == null) throw new Error (`Invalid host-string "${input}"`)
        else url.host = host

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
  return percentEncode (normalise (resolved), 'WHATWG')
}



// Exports
// =======

const version = '2.2.0-dev'
const unstable = { utf8, pct, PercentEncoder }

export {
  version,
  
  modes, modeFor, 
  ords, ord, upto, goto, rebase,
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