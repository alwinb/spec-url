import { parseAuth } from './auth.js'
import { hostType, hostTypes, parseHost, validateOpaqueHost, printHost, domainToASCII, ipv6, ipv4 } from './host.js'
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

// ### Options

const opts = {
  hierPart:  1 << 0, // Resolved URL must have an authority and hierarchical path
  plainAuth: 1 << 1, // Resolved URL must not have credentials nor a port
  stealAuth: 1 << 2, // Resolved URL must have a non-empty authority
  parseHost: 1 << 3, // Resolved URL host must not be opaque
  nonStrict: 1 << 4, // Rebase and Resolve use non-strict reference transformation
  winDrive:  1 << 5, // Parse windows drive letters
  winSlash:  1 << 6, // Parse \ before query as /
  default:   0,
}

// ### Configurations

const modes = {
  file:     opts.hierPart | opts.winSlash | opts.nonStrict | opts.parseHost | opts.plainAuth | opts.winDrive,
  web:      opts.hierPart | opts.winSlash | opts.nonStrict | opts.parseHost | opts.stealAuth,
  noscheme: opts.hierPart | opts.winSlash | opts.winDrive,
  generic:  opts.default,
}

const specialSchemes = {
  http:  modes.web,
  https: modes.web,
  ws:    modes.web,
  wss:   modes.web,
  ftp:   modes.web,
  file:  modes.file,
}

// The `modeFor` function returns a configuration of options for a given
// URL object based on its scheme. The configuration to be used for
// schemeless URLs can be manually overridden by specifying a fallback mode.

const modeFor = (url, fallback = modes.noscheme) =>
  ( url.scheme ? specialSchemes [low (url.scheme)] ?? modes.generic
  : url.drive ? modes.file
  : fallback )

// isFragment and low are simple helper functions.

const isFragment = url =>
  url.hash != null && ord (url) === componentTypes.hash

const low = str =>
  str ? str.toLowerCase () : str


// Order and Upto
// --------------

// "The 'order of an URL' is the type of its first component, or
// fragment (here: hash) if the URL is the empty URL".

// The `ord` function returns the order of an URL.

const ords = componentTypes

const attributeNames = {
  scheme: ords.scheme,
  user:   ords.auth,
  pass:   ords.auth,
  host:   ords.auth,
  port:   ords.auth,
  drive:  ords.drive,
  root:   ords.root,
  dirs:   ords.dir,
  file:   ords.file,
  query:  ords.query,
  hash:   ords.hash
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

// The `rebase` function is a generalisation of the URL resolution behaviour
// that is implicitly specified by the WHATWG. It makes the same distinctions
// between file-, web- and opaque-path URLs as the WHATWG standard does, but
// also supports schemeless URLs.

// It uses what RFC3986 calls the 'non-strict' transformation of
// references (section 5.2) for 'special' URLs: If the input has a scheme
// and the scheme is equivalent to the scheme of the base URL, then it is
// removed. It then continues with the 'strict' behaviour as implemented
// by the `pureRebase` function.

function rebase (url, base = {}) {

  if (typeof base === 'string')
    base = parse (base)

  if (typeof url === 'string')
    url = parse (url, modeFor (base))

  if (url.scheme && modeFor (url) & opts.nonStrict && low (url.scheme) === low (base.scheme))
    url = setProto ({ scheme:null }, url)

  // log (modeFor(base) & opts.hierPart.toString (2))
  if (url.scheme || isFragment (url) || !hasOpaquePath (base))
    return pureRebase (url, base)

  else
    throw new RebaseError (url, base)
}

function goto (base, url) {
  return rebase (url, base)
}

class RebaseError extends Error {
  constructor (url1, url2) {
    super (`Cannot rebase <${print(url1)}> onto <${print(url2)}>`)
  }
}


// Note: opaque-paths are currently not modeled by using a 
// separate *opaque-path* component-type. Instead they are
// detected by looking at the shape of the URL as follows.

const hasOpaquePath = url =>
  !(modeFor (url) & opts.hierPart) && url.root == null && url.host == null



// Reference Resolution
// --------------------

function resolve (input, base = {}) {

  const result =
    rebase (input, base)

  if (result.scheme == null)
    throw new ResolveError (input, base)

  const mode =
    modeFor (result)

  if (mode & opts.stealAuth) {
    if (result.host == null || result.host === '') {
      const match = _firstNonEmptySegment (result)
      if (!match) throw new ResolveError (result)
      _removePrecedingSegments (result, match)
      assign (result, parseAuth (match.value))
    }
  }

  if (mode & opts.plainAuth) {
    const { user, pass, port } = result
    if (user != null || pass != null || port != null)
      throw new Error (`Cannot resolve <${print(result)}>\n\t -A file URL must not have a username, password, or port\n`)
  }

  if (mode & opts.hierPart) { 
    if (result.host == null) result.host = ''
    if (result.drive == null) result.root = '/'
  }

  if (mode & (opts.parseHost))
    result.host = parseHost (result.host)

  return percentEncodeMut (normaliseMut (result), 'URL')
}


class ResolveError extends TypeError {
  constructor (url1, url2) {
    if (url2 != null)
      super (`Cannot resolve <${print(url1)}> against <${print(url2)}>`)
    else
      super (`Cannot resolve <${print(url1)}>`)
  }
}


// Forced resolve makes use of the following
// helper functions:

const _firstNonEmptySegment = url => {
  const dirs = url.dirs || []
  for (let i=0, l=dirs.length; i<l;i++) if (dirs[i])
    return { value:dirs[i], ord:componentTypes.dir, index:i }
  if (url.file)
    return { value:url.file, ord:componentTypes.file }
  return null
}

const _removePrecedingSegments = (url, match) => {
  if (match.ord === componentTypes.dir) {
    const dirs_ = url.dirs.slice (match.index + 1)
    if (dirs_.length) url.dirs = dirs_
    else delete url.dirs
  }
  else if (match.ord === componentTypes.file)
    delete url.file
  return url
}


function* iterate (url) {
  if (typeof url === 'string')
    url = parse (url)

  if (url.scheme)
    yield ['scheme', url.scheme]

  if (url.host != null)  {
    const { user = null, pass = null, host, port = null } = url
    yield ['auth', { user, pass, host, port } ]
  }

  if (url.root)
    yield ['root', url.root]

  if (url.dirs) for (const dir of url.dirs)
    yield ['dir', dir]

  if (url.file)
    yield ['file',  url.file]

  if (url.query)
    yield ['query', url.query]

  if (url.hash)
    yield ['hash',  url.hash]
}


// Normalisation
// -------------

const defaultPorts =
  { http: 80, ws: 80, https: 443, wss: 443, ftp: 21 }

const normalise = (url, coded = true) =>
  normaliseMut (assign ({}, url), coded)


function normaliseMut (r, coded = true) {

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

  if (hasOpaquePath (r) && r.dirs)
    r.dirs = r.dirs.slice ()

  else {
    const dirs = []
    for (const x of r.dirs ?? []) {
      const isDots = dots (x, coded)
      // TODO redo this, neatly
      if (isDots === 0) dirs.push (x)
      else if (isDots === 2) {
        if (dirs.length && dirs[dirs.length-1] !== '..') dirs.pop ()
        else if (!r.root) dirs.push ('..')
      } 
    }
    if (dirs.length) r.dirs = dirs
    else if (ord (r) === componentTypes.dir) r.dirs = ['.']
    else delete r.dirs
  }

  // ### Scheme-based authority normalisation

  if (scheme === 'file' && isLocalHost (r.host))
    r.host = ''

  else if (r.port === defaultPorts [scheme])
    delete r.port

  for (const k in attributeNames)
    if (r[k] == null) delete r[k]
  return r
}

// where

const dots = (seg, coded = true) =>
  seg === '.' ? 1 :
  seg === '..' ? 2 :
  coded && seg.length === 3 && low (seg) === '%2e' ? 1 :
  coded && seg.length <= 6
    && (low (seg) === '.%2e'
    || low (seg) === '%2e.'
    || low (seg) === '%2e%2e') ? 2 : 0


const isLocalHost = host =>
  host === 'localhost' ||
  hostType (host) === hostTypes.domain && host.length === 1 && host[0] === 'localhost'



// Percent Coding URLs
// -------------------
// NB uses punycoding rather than percent coding on domains

const percentEncode = (url, spec = 'WHATWG') =>
  percentEncodeMut (assign ({}, url), spec)


function percentEncodeMut (r, spec = 'WHATWG') {
  const config = modeFor (r)

  // I am planning to clean this up soon
  // TODO strictly speaking, IRI must encode more than URL
  // -- and in addition, URI and IRI should decode unreserved characters
  // -- and should not contain invalid percent encode sequences

  const unicode = spec in { minimal:1, URL:1, IRI:1 }
  const encode = new PercentEncoder ({ unicode, incremental:true }) .encode
  const profile = (config & opts.winSlash) 
    ? specialProfiles [spec] || specialProfiles.default
    : profiles [spec] || profiles.default

  if (r.user != null)
    r.user = encode (r.user, profile.user)

  if (r.pass != null)
    r.pass = encode (r.pass, profile.pass)

  if (r.host != null) {
    const t = hostType (r.host)    
    r.host
      = t === hostTypes.ipv6 ? [...r.host]
      : t === hostTypes.ipv4 ? r.host
      : t === hostTypes.domain ? (unicode ? [...r.host] : domainToASCII (r.host))
      : t === hostTypes.opaque ? encode (r.host, profile.host)
      : r.host
  }

  // ... opaque paths
  const seg_esc = hasOpaquePath (r)
    ? profiles.minimal.dir | sets.c0c1 : profile.dir

  if (r.dirs)
    r.dirs = r.dirs.map (x => encode (x, seg_esc))

  if (r.file != null)
    r.file = encode (r.file, seg_esc)

  if (r.query != null)
    r.query = encode (r.query, profile.query)

  if (r.hash != null)
    r.hash = encode (r.hash, profile.hash)

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
  /^[a-zA-Z][:|]$/

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

// ### Character Classes

// const CharClass = {
//   Other: 0,
//   Alpha: 1,
//   SchemeOther: 2,
//   Digit: 3,
//   Colon: 4,
//   Slash: 5,
//   QuestionMark: 6,
//   Hash: 7,
// }

const eqClasses = new Uint8Array ([
//NUL SOH STX ETX EOT ENQ ACK BEL BS  HT  LF  VT  FF  CR  SO  SI
   0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
//DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM  SUB ESC FS  GS  RS  US
   0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
// SP  !   "   #   $   %   &   '   (   )   *   +   ,   -   .   /                    
   0,  0,  0,  7,  0,  0,  0,  0,  0,  0,  0,  2,  0,  2,  2,  5,
// 0   1   2   2   4   5   6   7   8   9   :   ;   <   =   >   ?
   3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  4,  0,  0,  0,  0,  6,
// @   A   B   C   D   E   F   G   H   I   J   K   L   M   N   O
   0,  1,  1,  1,  1,  1,  1,  1,  1 , 1,  1,  1,  1,  1,  1,  1,
// P   Q   R   S   T   U   V   W   X   Y   Z   [   \   ]   ^   _
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  5,  0,  0,  0, 
// '   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o
   0,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1, 
// p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~  DEL
   1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  0,  0,  0,  0, 0 ])

const cc_other = 0
const cc_count = 8

// Alternative lookup table for parsePath; where ? and # are 
// not considered to be delimiters:

const pathEqClasses = new Uint8Array(eqClasses)
pathEqClasses['?'.charCodeAt(0)] = cc_other
pathEqClasses['#'.charCodeAt(0)] = cc_other

// Non-special URLs do not handle \ as /
const nonSpecialEqClasses = new Uint8Array(eqClasses)
nonSpecialEqClasses['\\'.charCodeAt(0)] = cc_other

const nonSpecialPathEqClasses = new Uint8Array(pathEqClasses)
nonSpecialEqClasses['\\'.charCodeAt(0)] = cc_other


// ### States and Tokens

const State = {
  Fail: 0,
  Start: 1,
  AfterScheme: 2,
  AfterSpecialScheme: 3,
  AfterAuth: 4,
  RelativePath: 5,
  AfterFile: 6,
  Scheme: 7,
  Auth: 8,
  Root: 9,
  Dir: 10,
  File: 11,
  Query: 12,
  Hash: 13,
  RootNoAuth: 14,
  FileSchemeLike: 15,
  OpaquePath: 16,
}

// A state is accepting if state >= min_accepts
const min_accepts = State.Scheme

// Create an inverse lookup table to convert
// states to their human readable name
const stateNames = []
for (const k in State)
  stateNames[State[k]] = k

// Abbreviate states
const T = State
const __ = State.Fail

// Transition table / DFA

const dfa = new Uint8Array ([
//oth alp +-. dig  :   /   ?   #  
  __, __, __, __, __, __, __, __, // 0: Fail
  11, 15, 11, 11, 11, 14, 12, 13, // 1: Start
  16, 16, 16, 16, 16, 14, 12, 13, // 2: AfterScheme
  11, 11, 11, 11, 11, 14, 12, 13, // 3: AfterSpecialScheme
  11, 11, 11, 11, 11,  9, 12, 13, // 4: AfterAuth
  11, 11, 11, 11, 11, 10, 12, 13, // 5: RelativePath
  __, __, __, __, __, __, 12, 13, // 6: AfterFile
  __, __, __, __, __, __, __, __, // 7: Scheme
   8,  8,  8,  8,  8, __, __, __, // 8: Auth
  __, __, __, __, __, __, __, __, // 9: Root
  __, __, __, __, __, __, __, __, // 10: Dir
  11, 11, 11, 11, 11, 10, __, __, // 11: File
  12, 12, 12, 12, 12, 12, 12, __, // 12: Query
  13, 13, 13, 13, 13, 13, 13, 13, // 13: Hash // NB does not verify presence of #
  __, __, __, __, __,  8, __, __, // 14: RootNoAuth
  11, 15, 15, 15,  7, 10, __, __, // 15: FileSchemeLike
  16, 16, 16, 16, 16, 16, __, __, // 16: OpaquePath
])


// Parser
// ------

function parse (input, conf = modes.noscheme) {
  const cctable = conf & opts.winSlash ? eqClasses : nonSpecialEqClasses
  return _parse (input, T.Start, cctable, conf)
}

function parsePath (input, conf = modes.noscheme) {
  const cctable = conf & opts.winSlash ? pathEqClasses : nonSpecialPathEqClasses
  return _parse (input, T.AfterAuth, cctable, conf)
}

function _preprocess (input) {
  // preprocess: remove leading and trailing C0-space
  let anchor = 0, end = input.length
  while (anchor < end && input.charCodeAt(anchor) <= 0x20) anchor++
  while (end > anchor && input.charCodeAt(end-1) <= 0x20) end--
  // Ehm optimise this; how slow is curring strings even,
  // compared to going the buffer way
  return input.substring (anchor, end) .replace (/[\x09\x0a\x0d]+/g, '')
}

function isDriveString (input) {
  return input.length === 2 &&
    (input[1] === ':' || input[1] === '|') &&
    eqClasses[input.charCodeAt(0)] === 1
}

function _parse (input, _entry = T.Start, cctable = eqClasses, conf = modes.noscheme) {
  input = _preprocess (input) // REVIEW should this be done higher up?
  let entry = _entry, anchor = 0
  let match = T.Fail, end = 0
  const length = input.length

  const url = { }
  outer: while (end < length) {

    inner: for (let state = entry, pos = anchor = end; state && pos < length;) {
      const c = input[pos++] .charCodeAt (0)
      const cc = c <= 127 ? cctable [c] : cc_other
      state = dfa [state * cc_count + cc]
      if (state >= min_accepts) (match = state, end = pos)
    }

    switch (match) {
      case T.Scheme:
        url.scheme = input.substring (anchor, end-1)
        conf = modeFor (url)
        if (conf & opts.winSlash) {
          cctable = eqClasses
          entry = T.AfterSpecialScheme
        }
        else {
          cctable = nonSpecialEqClasses
          entry = T.AfterSpecialScheme // T.AfterScheme Disable OpaquePath parsing for the moment
        }
        continue outer

      case T.OpaquePath:
        url.file = input.substring (anchor, end) // REVIEW!!
        // url.opaquePath = input.substring (anchor, end)
        entry = T.AfterFile
        continue outer;

      case T.Auth: {
        const value = input.substring (anchor+2, end)
        if (conf & opts.winDrive && isDriveString (value)) {
          url.host = ''
          url.drive = value
          continue outer
        }
        const auth = parseAuth (value)
        validateOpaqueHost (auth.host)
        assign (url, auth)
        entry = T.AfterAuth
        continue outer
      }

      case T.Root:
      case T.RootNoAuth:
        url.root = '/' // input[anchor]
        entry = T.RelativePath
        continue outer

      case T.Dir: {
        const value = input.substring (anchor, end-1)
        url.dirs = url.dirs ?? []
        url.dirs.push (value)
        entry = T.RelativePath
        continue outer
      }

      case T.File:
      case T.FileSchemeLike: {
        const value = input.substring (anchor, end)
        if (dots (value)) {
          url.dirs = url.dirs ?? []
          url.dirs.push (value)
          entry = T.AfterFile
        }
        else {
          url.file = value
          entry = T.AfterFile
        }
        continue outer
      }

      case T.Query:
        url.query = input.substring (anchor+1, end)
        entry = T.Hash
        continue outer

      case T.Hash:
        url.hash = input.substring (anchor+1, end)
        break outer
    }
  }
  
  // Drive letter detection
  if (url.drive == null && conf & opts.winDrive) {
    const match = _firstNonEmptySegment (url)
    if (match && isDriveString (match.value)) {
      _removePrecedingSegments (url, match)
      url.drive = match.value
      if (match.ord === componentTypes.file)
        delete url.root
      else url.root = '/'
    }
  }

  return url
}


// Exports
// =======

const version = '2.4.0-dev'
const unstable = { utf8, pct, PercentEncoder }

export {
  version,

  iterate,
  opts, modes, modeFor,
  componentTypes, componentTypes as ords,
  ord, upto, pureRebase,
  hasOpaquePath,

  rebase, rebase as parseRebase, goto,
  resolve, resolve as parseResolve, resolve as WHATWGResolve,
  normalise, normalise as normalize,
  percentEncode,
  percentDecode,

  parse,
  parsePath,
  parseAuth,
  parseHost,
  validateOpaqueHost,

  print,
  printHost,
  pathname,
  filePath,
  unsafePrint,

  ipv4,
  ipv6,
  unstable
}