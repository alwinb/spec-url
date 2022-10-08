import { parseAuth } from './auth.js'
import { hostType, hostTypes, parseHost, parseWebHost, validateOpaqueHost, printHost, domainToASCII, ipv6, ipv4 } from './host.js'
import { utf8, pct, profiles, specialProfiles, PercentEncoder, encodeSets as sets } from './pct.js'
const { setPrototypeOf:setProto, assign } = Object
const log = console.log.bind (console)

// URL Core
// ========

// In the URL specification, URLs are modeled as ordered sequences
// of components, where the components are ordered by their
// component-type as follows.

const componentTypes =
  { scheme:1, auth:2, drive:3, root:4, dir:5, file:6, query:7, hash:8 }

// All components are optional, but if an URL has a host or a
// drive, and it also has one or more dir or file components,
// then it also has a root component.

// In this implementation however, URLs are modeled as javascript
// _objects_ with optional attributes. The dir components are collected
// into a nonempty `dirs`-_array_ instead and the authority subcomponents
// are assigned directly on the object itself as `user`, `pass`, `host` and
// `port`. The empty authority is represented by setting the `host` attribute
// to the empty string. 

// Otherwise the `host` is either an ipv6 address,
// a domain, an ipv4 address, or an opaque host. In this implementation
// these are modeled as an array of numbers, an array of strings, a number,
// or a string, respectively.

// ### Modes

// URLs have scheme-dependent behaviour that divides them into four
// categories, called `modes` here. The `noscheme` mode is used
// to select behaviour that is fine-tuned for schemeless URLs.
// In this implementation, each mode is associated with a bit-flag.
// All modes other than the `generic` mode are said to be `special`. 
// Thus, `special` here is not actually a mode, but a set of three modes.

const modes =
  { generic:1, noscheme:2, web:4, file:8, special:0b1110 }

const specialSchemes =
  { http:4, https:4, ws:4, wss:4, ftp:4, file:8 }

// The `modeFor` function returns the mode for a given URL object
// based on its scheme. The mode to be used for schemeless URLs can
// be manually overridden by specifying a fallback mode. It defaults
// to the `noscheme` mode.

const modeFor = (url, fallback = modes.noscheme) =>
  ( url.scheme ? specialSchemes [low (url.scheme)] || modes.generic
  : url.drive ? modes.file
  : fallback )

// isFragment and low are simple helper functions.

const isFragment = url =>
  url.hash != null && ord (url) === componentTypes.hash

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


// Order and Upto
// --------------

// "The 'order of an URL' is the type of its first component, or
// fragment (here: hash) if the URL is the empty URL".

// The `ord` function returns the order of an URL.

const attributeNames = {
  scheme:1, user:2, pass:2, host:2, port:2, drive:3,
  root:4, dirs:5, file:6, query:7, hash:8
}

const ord = url => {
  for (const k in attributeNames)
    if (url[k] != null) return attributeNames[k]
  return componentTypes.hash
}

// The `upto` function returns a prefix of an URL. Specifically,
// it returns an URL that consists of all components that have
// a component-type < ord, and all dir components if
// dir ≤ ord.

const upto = (url, ord) => {
  const r = { }
  for (const k in attributeNames)
    if (url[k] == null) continue
    else if (attributeNames[k] < ord) r[k] = url[k]
    else if (attributeNames[k] === ord && k === 'dirs')
      r[k] = url[k] .slice (0)
  return r
}

// Rebase
// ------
// The `rebase` function is the heart of the reference-resolution
// algorithm. It implements a generalised version of URL resolution
// that adds supports for schemeless URLs. It does however not implement
// the exceptional behaviour for special URLs as defined by the WHATWG,
// which will be added later.

const pureRebase = (url, base) => {
  const r = upto (base, ord (url))
  for (const k in attributeNames)
    if (url[k] == null) continue
    else if (k === 'dirs')
      r.dirs = (r.dirs ?? []) .concat (url.dirs)
    else r[k] = url[k]
  /* Patch up root if needed */
  if ((r.host != null || r.drive) && (r.dirs || r.file))
    r.root = '/'
  return r
}

// The `WHATWGRebase` function is a generalisation of the URL
// resolution behaviour that is implicitly specified by the WHATWG.
// It makes the same distinctions between file-, web- and opaque-path
// URLs as the WHATWG standard does, but it also supports schemeless URLs.

// It uses what RFC3986 calls the 'non-strict' transformation of
// references (section 5.2) for 'special' URLs: If the input has a scheme
// and the scheme is equivalent to the scheme of the base URL, then it is
// removed. It then continues with the 'strict' behaviour as implemented
// by the `pureRebase` function.

class RebaseError extends TypeError {
  constructor (url1, url2) {
    super (`Cannot rebase <${print(url1)}> onto <${print(url2)}>`)
  }
}

const WHATWGRebase = (url, base) => {
  if (url.scheme && modeFor (url) & modes.special && low (url.scheme) === low (base.scheme))
    url = setProto ({ scheme:null }, url)
  if (url.scheme || isFragment (url) || !hasOpaquePath (base))
    return pureRebase (url, base)
  else throw new RebaseError (url, base)
}

// Note: opaque-paths are currently not modeled, nor implemented
// by using a separate *opaque-path* component-type. Instead they are
// detected by looking at the shape of the URL as follows.

const hasOpaquePath = url =>
  url.root == null && url.host == null && modeFor (url) === modes.generic


// Forcing
// -------

// The WHATWG standard specifies URL resolution behaviour that deviates
// from RFC3986. This behaviour is implemented via an additional `force`
// operation.

class ForceError extends TypeError {
  constructor (url) {
    super (`Cannot coerce <${print(url)}> to an absolute URL`)
    this.url = url
  }
}

const forceAsFileUrl = url => {
  try {
    const { user, pass, port } = url
    if (user != null || pass != null || port != null) throw url
    const r = assign ({ }, url)
    r.host = url.host == null ? '' : parseHost (url.host)
    if (r.drive == null) r.root = '/'
    return r
  }
  catch (e) { throw new ForceError (url) }
}

const forceAsWebUrl = url => {
  try {
    const r = assign ({ }, url)
    if (url.host == null || url.host === '') {
      const match = _firstNonEmptySegment (url)
      assign (r, parseAuth (match.value))
      _removeSegments (r, match)
    }
    r.host = parseWebHost (r.host)
    r.root = '/'
    return r
  }
  catch (e) { throw new ForceError (url) }
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
    return { value:dirs[i], ord:componentTypes.dir, index:i }
  if (url.file)
    return { value:url.file, ord:componentTypes.file }
  throw null // not found
}

const _removeSegments = (url, match) => {
  if (match.ord === componentTypes.dir) {
    const dirs_ = url.dirs.slice (match.index + 1)
    if (dirs_.length) url.dirs = dirs_
    else delete url.dirs
  }
  else if (match.ord === componentTypes.file)
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

const WHATWGResolve = (url, base) =>
  base == null ? force (url)
  : force (WHATWGRebase (url, base))



// Normalisation
// -------------

const defaultPorts =
  { http: 80, ws: 80, https: 443, wss: 443, ftp: 21 }


const normalise = (url, coded = true) => {

  const r = assign ({}, url)

  // ### Scheme normalisation

  const scheme = low (r.scheme)
  r.scheme = scheme

  // ### Authority normalisation

  if (r.pass === '') delete r.pass
  if (!r.pass && r.user === '') delete r.user
  if (r.port === '') delete r.port

  // ### Drive letter normalisation

  if (r.drive) r.drive = r.drive[0] + ':'

  // ### Path segement normalisation

  if (hasOpaquePath (url) && url.dirs)
    r.dirs = r.dirs.slice ()

  else {
    const dirs = []
    for (const x of r.dirs||[]) {
      const isDots = dots (x, coded)
      // TODO redo this, neatly
      if (isDots === 0) dirs.push (x)
      else if (isDots === 2) {
        if (dirs.length && dirs[dirs.length-1] !== '..') dirs.pop ()
        else if (!url.root) dirs.push ('..')
      } 
    }
    if (dirs.length) r.dirs = dirs
    else if (ord (url) === componentTypes.dir) r.dirs = ['.']
    else delete r.dirs
  }

  // ### Scheme-based authority normalisation

  if (scheme === 'file' && isLocalHost (r.host))
    r.host = ''

  else if (url.port === defaultPorts [scheme])
    delete r.port

  for (const k in attributeNames)
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
  const mode = modeFor (url)

  // TODO strictly speaking, IRI must encode more than URL
  // -- and in addition, URI and IRI should decode unreserved characters
  // -- and should not contain invalid percent encode sequences

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
      : t === hostTypes.domain ? (unicode ? [...url.host] : domainToASCII (url.host))
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
  const seg_esc = hasOpaquePath (url)
    ? profiles.minimal.dir | sets.c0c1 : profile.dir

  if (url.dirs)
    r.dirs = url.dirs.map (x => encode (x, seg_esc))

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
  for (let k in attributeNames) if (url[k] != null)
    r[k] = _dont [k] ? url[k]
      : k === 'dirs' ? url[k] .map (pct.decode)
      : typeof url[k] === 'string' ? pct.decode (url[k])
      : url[k]
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
  if (ord (url) === componentTypes.dir && (match = isSchemeLike.exec (url.dirs[0])))
    url.dirs[0] = match[1] + '%3A' + match[2]

  if (ord (url) === componentTypes.file && (match = isSchemeLike.exec (url.file)))
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
  for (const k in attributeNames) if (url[k] != null) {
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

        url.host = mode & (modes.web | modes.file)
          ? parseHost (url.host) // NB empty hosts are allowed
          : validateOpaqueHost (url.host)

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

  // Disallow dotted file segments:
  // Convert `..` to `../` and `.` to `./`

  const fileDots = url.file && dots (url.file)
  if (!hasOpaquePath (url) && fileDots) {
    if (url.dirs) url.dirs.push (url.file)
    else url.dirs = [url.file]
    delete url.file
  }
  return url
}



// WHATWG Parse Resolve and Normalise
// ----------------------------------

const parseRebase = (input, base) => {
  if (base == null) return parse (input)
  if (typeof base === 'string') base = parse (base)
  const url = parse (input, modeFor (base))
  return WHATWGRebase (url, base)
}

const WHATWGParseResolve = (input, base) => {
  const resolved = force (parseRebase (input, base))
  return percentEncode (normalise (resolved), 'WHATWG')
}



// Exports
// =======

const version = '2.3.3-dev'
const unstable = { utf8, pct, PercentEncoder }

export {
  version,
  
  modes, modeFor, 
  componentTypes, ord, upto, pureRebase, WHATWGRebase,
  forceAsFileUrl, forceAsWebUrl, force, 
  hasOpaquePath, WHATWGResolve, WHATWGResolve as resolve,

  normalise, normalise as normalize,
  percentEncode, percentDecode,

  parse, parseAuth, parseHost, parseWebHost, validateOpaqueHost,
  parseRebase,
  WHATWGParseResolve, WHATWGParseResolve as parseResolve,

  ipv4, ipv6,
  unsafePrint, print, printHost,
  pathname, filePath,
  unstable
}